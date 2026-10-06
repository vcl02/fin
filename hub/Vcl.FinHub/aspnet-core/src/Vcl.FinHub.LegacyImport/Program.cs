// Ponto de entrada manual para copiar o snapshot do Fin legado ao PostgreSQL local do Hub.
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Vcl.FinHub.Data;
using Volo.Abp;
using Volo.Abp.Autofac;
using Volo.Abp.Data;

namespace Vcl.FinHub.LegacyImport;

internal static class Program
{
    public static async Task Main(string[] args)
    {
        using var host = Host.CreateDefaultBuilder(args)
            .ConfigureAppConfiguration(configuration =>
            {
                // Credenciais ficam neste arquivo ignorado pelo Git ou em variaveis de ambiente.
                configuration.AddJsonFile("appsettings.local.json", optional: true);
                configuration.AddEnvironmentVariables(prefix: "FIN_HUB_IMPORT_");
            })
            .Build();

        using var application = await AbpApplicationFactory.CreateAsync<LegacyImportModule>(options =>
        {
            options.UseAutofac();
            options.Services.ReplaceConfiguration(host.Services.GetRequiredService<IConfiguration>());
            // O contexto EF do template ABP depende deste ambiente para registrar o interceptor de UoW.
            options.AddDataMigrationEnvironment();
        });

        await application.InitializeAsync();

        using var scope = application.ServiceProvider.CreateScope();
        var importer = scope.ServiceProvider.GetRequiredService<LegacyFinSnapshotImporter>();
        if (args.SequenceEqual(["--status"], StringComparer.OrdinalIgnoreCase))
        {
            var status = await importer.GetStatusAsync();
            Console.WriteLine($"Snapshot local: {status.RowCount} registros, total assinado {status.SignedTotal:N2}, maior id {status.MaxId}.");
            Console.WriteLine(status.LastImportedAtUtc is null
                ? "Nenhuma importacao concluida foi registrada."
                : $"Ultima importacao: {status.LastImportedAtUtc:O} ({status.LastImportedRowCount} registros na origem).");
        }
        else
        {
            var summary = await importer.ImportAsync();
            Console.WriteLine($"Snapshot local atualizado: {summary.RowCount} registros, total assinado {summary.SignedTotal:N2}, maior id {summary.MaxId}.");
        }

        await application.ShutdownAsync();
    }
}
