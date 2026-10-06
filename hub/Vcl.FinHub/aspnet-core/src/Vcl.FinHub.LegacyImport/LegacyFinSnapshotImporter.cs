// Le o Fin legado por REST e substitui atomicamente apenas o espelho local do Hub.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Vcl.FinHub.EntityFrameworkCore;
using Vcl.FinHub.LegacyImports;

namespace Vcl.FinHub.LegacyImport;

public sealed class LegacyFinSnapshotImporter
{
    private const int PageSize = 1000;
    private readonly IConfiguration _configuration;
    private readonly FinHubDbContext _dbContext;

    public LegacyFinSnapshotImporter(
        IConfiguration configuration,
        FinHubDbContext dbContext)
    {
        _configuration = configuration;
        _dbContext = dbContext;
    }

    public async Task<LegacyImportSummary> ImportAsync(CancellationToken cancellationToken = default)
    {
        var options = LegacyImportOptions.FromConfiguration(_configuration);
        var pendingMigrations = await _dbContext.Database.GetPendingMigrationsAsync(cancellationToken);
        if (pendingMigrations.Any())
        {
            throw new InvalidOperationException(
                "O PostgreSQL local ainda possui migrations pendentes. Execute Vcl.FinHub.DbMigrator antes de importar o snapshot.");
        }

        var sourceRows = await ReadAllRowsAsync(options, cancellationToken);
        if (sourceRows.Count == 0)
        {
            // A tabela de producao possui historico. Uma lista vazia tende a indicar RLS/token incorreto,
            // portanto nunca pode apagar um snapshot local valido silenciosamente.
            throw new InvalidOperationException(
                "A origem retornou zero registros. O snapshot local foi preservado; revise a permissao SELECT de fin para o token informado.");
        }

        var snapshots = sourceRows.Select(row => row.ToEntity()).ToList();

        ValidateSnapshot(snapshots);

        var signedTotal = snapshots.Sum(row => row.Valor ?? 0m);
        var maxId = snapshots.Count == 0 ? 0 : snapshots.Max(row => row.Id);
        var contentHash = ComputeHash(snapshots);

        // Primeiro termina toda a leitura e validacao remota. Assim uma falha no Supabase nao toca no snapshot local atual.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        await _dbContext.LegacyFinSnapshots.ExecuteDeleteAsync(cancellationToken);
        await _dbContext.LegacyFinSnapshots.AddRangeAsync(snapshots, cancellationToken);
        await _dbContext.LegacyFinSnapshotRuns.AddAsync(
            new LegacyFinSnapshotRun(Guid.NewGuid(), DateTime.UtcNow, snapshots.Count, maxId, signedTotal, contentHash),
            cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new LegacyImportSummary(snapshots.Count, signedTotal, maxId);
    }

    // Equivale a uma consulta local para conferir a copia sem precisar de Supabase ou de qualquer escrita.
    public async Task<LegacySnapshotStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.LegacyFinSnapshots
            .AsNoTracking()
            .Select(snapshot => new { snapshot.Id, snapshot.Valor })
            .ToListAsync(cancellationToken);
        var lastRun = await _dbContext.LegacyFinSnapshotRuns
            .AsNoTracking()
            .OrderByDescending(run => run.ImportedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return new LegacySnapshotStatus(
            rows.Count,
            rows.Sum(row => row.Valor ?? 0m),
            rows.Count == 0 ? 0 : rows.Max(row => row.Id),
            lastRun?.ImportedAtUtc,
            lastRun?.SourceRowCount);
    }

    private async Task<List<LegacyFinSnapshotRow>> ReadAllRowsAsync(LegacyImportOptions options, CancellationToken cancellationToken)
    {
        // O cliente existe apenas durante esta execucao manual; nao ha polling ou job residente.
        using var client = new HttpClient();
        client.DefaultRequestHeaders.Add("apikey", options.SupabasePublishableKey);
        client.DefaultRequestHeaders.Authorization = new("Bearer", options.SupabaseAccessToken);

        var result = new List<LegacyFinSnapshotRow>();
        long? lastId = null;

        while (true)
        {
            var uri = BuildRequestUri(options.SupabaseUrl, lastId);
            using var response = await client.GetAsync(uri, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            response.EnsureSuccessStatusCode();

            using var document = JsonDocument.Parse(body);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidOperationException("A resposta da tabela fin precisa ser uma lista JSON.");
            }

            var page = document.RootElement.EnumerateArray()
                .Select(LegacyFinSnapshotRow.FromJson)
                .OrderBy(row => row.Id)
                .ToList();

            result.AddRange(page);
            if (page.Count < PageSize)
            {
                return result;
            }

            lastId = page[^1].Id;
        }
    }

    private static Uri BuildRequestUri(Uri baseUri, long? lastId)
    {
        var query = $"rest/v1/fin?select=*&order=id.asc&limit={PageSize}";
        if (lastId.HasValue)
        {
            query += $"&id=gt.{lastId.Value}";
        }

        return new Uri(baseUri, query);
    }

    private static void ValidateSnapshot(IReadOnlyCollection<LegacyFinSnapshot> snapshots)
    {
        var duplicateIds = snapshots.GroupBy(snapshot => snapshot.Id).Where(group => group.Count() > 1).Select(group => group.Key).ToList();
        if (duplicateIds.Count > 0)
        {
            throw new InvalidOperationException($"O Supabase retornou IDs duplicados: {string.Join(", ", duplicateIds.Take(5))}.");
        }

        if (snapshots.Any(snapshot => snapshot.Id <= 0))
        {
            throw new InvalidOperationException("O snapshot legado contem um ID nao positivo.");
        }

        // O staging é cópia fiel do legado, não um relatório financeiro. Há linhas históricas incompletas,
        // por exemplo uma intenção de compra ainda sem valor ou data; os campos tipados são anuláveis e o
        // RegistroOriginal conserva a linha integral. Apenas a identidade é necessária para a cópia segura.
    }

    private static string ComputeHash(IEnumerable<LegacyFinSnapshot> snapshots)
    {
        var content = string.Join("\n", snapshots.OrderBy(snapshot => snapshot.Id).Select(snapshot => snapshot.RegistroOriginal));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
    }

    private sealed record LegacyImportOptions(Uri SupabaseUrl, string SupabasePublishableKey, string SupabaseAccessToken)
    {
        public static LegacyImportOptions FromConfiguration(IConfiguration configuration)
        {
            var urlText = configuration["LegacyImport:SupabaseUrl"];
            var publishableKey = configuration["LegacyImport:SupabasePublishableKey"];
            var accessToken = configuration["LegacyImport:SupabaseAccessToken"];

            if (!Uri.TryCreate(urlText, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps || !url.Host.EndsWith(".supabase.co", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Configure LegacyImport:SupabaseUrl com a URL HTTPS do projeto Supabase.");
            }

            if (string.IsNullOrWhiteSpace(publishableKey) || string.IsNullOrWhiteSpace(accessToken))
            {
                throw new InvalidOperationException("Configure LegacyImport:SupabasePublishableKey e LegacyImport:SupabaseAccessToken em appsettings.local.json ou nas variaveis FIN_HUB_IMPORT_.");
            }

            // A policy de leitura da tabela fin pertence ao papel authenticated. Uma chave publicável
            // carrega o papel anon e faria o PostgREST devolver uma lista vazia, sem erro HTTP.
            if (!IsAuthenticatedSessionToken(accessToken))
            {
                throw new InvalidOperationException("LegacyImport:SupabaseAccessToken deve ser um JWT de sessão com papel authenticated; a chave publicável/anon não pode ler fin sob RLS.");
            }

            return new LegacyImportOptions(url, publishableKey, accessToken);
        }

        private static bool IsAuthenticatedSessionToken(string token)
        {
            var parts = token.Split('.');
            if (parts.Length != 3)
            {
                return false;
            }

            try
            {
                var payload = parts[1].Replace('-', '+').Replace('_', '/');
                payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                using var document = JsonDocument.Parse(Convert.FromBase64String(payload));
                return document.RootElement.TryGetProperty("role", out var role)
                    && string.Equals(role.GetString(), "authenticated", StringComparison.Ordinal);
            }
            catch (FormatException)
            {
                return false;
            }
            catch (JsonException)
            {
                return false;
            }
        }
    }

    private sealed record LegacyFinSnapshotRow(
        long Id,
        DateOnly? Data,
        string? Nome,
        decimal? Valor,
        string? Categ,
        string? Freq,
        bool? Pago,
        bool? Cred,
        DateOnly? Fatura,
        long? RecorrenciaId,
        string RegistroOriginal)
    {
        public static LegacyFinSnapshotRow FromJson(JsonElement row)
        {
            var id = ReadRequiredLong(row, "id");
            return new LegacyFinSnapshotRow(
                id,
                ReadDate(row, "data"),
                ReadString(row, "nome"),
                ReadDecimal(row, "valor"),
                ReadString(row, "categ"),
                ReadString(row, "freq"),
                ReadBoolean(row, "pago"),
                ReadBoolean(row, "cred"),
                ReadDate(row, "fatura"),
                ReadLong(row, "recorrencia_id"),
                row.GetRawText());
        }

        public LegacyFinSnapshot ToEntity() => new(
            Id, Data, Nome, Valor, Categ, Freq, Pago, Cred, Fatura, RecorrenciaId, RegistroOriginal);

        private static JsonElement? Find(JsonElement row, string property) =>
            row.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null ? value : null;

        private static long ReadRequiredLong(JsonElement row, string property) =>
            ReadLong(row, property) ?? throw new InvalidOperationException($"O registro legado nao possui {property} valido.");

        private static long? ReadLong(JsonElement row, string property) =>
            Find(row, property) is { } value && value.TryGetInt64(out var parsed) ? parsed : null;

        private static bool? ReadBoolean(JsonElement row, string property) =>
            Find(row, property) is { } value && (value.ValueKind is JsonValueKind.True or JsonValueKind.False) ? value.GetBoolean() : null;

        private static string? ReadString(JsonElement row, string property) =>
            Find(row, property) is { } value && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

        private static DateOnly? ReadDate(JsonElement row, string property)
        {
            var text = ReadString(row, property);
            if (text is null)
            {
                return null;
            }

            return DateOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
                ? parsed
                : throw new InvalidOperationException($"O registro legado possui {property} invalido.");
        }

        private static decimal? ReadDecimal(JsonElement row, string property)
        {
            var value = Find(row, property);
            if (value is null)
            {
                return null;
            }

            return decimal.TryParse(value.Value.GetRawText().Trim('"'), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : throw new InvalidOperationException($"O registro legado possui {property} invalido.");
        }
    }
}

public sealed record LegacyImportSummary(int RowCount, decimal SignedTotal, long MaxId);
public sealed record LegacySnapshotStatus(
    int RowCount,
    decimal SignedTotal,
    long MaxId,
    DateTime? LastImportedAtUtc,
    int? LastImportedRowCount);
