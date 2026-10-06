// Caso de uso local: apresenta um mês do staging legado sem alterar dados ou recalcular regras financeiras.
using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Vcl.FinHub.LegacyImports;
using Volo.Abp.Domain.Repositories;

namespace Vcl.FinHub;

[AllowAnonymous]
public class LegacyFinSnapshotAppService : FinHubAppService, ILegacyFinSnapshotAppService
{
    private readonly IRepository<LegacyFinSnapshot, long> _snapshotRepository;
    private readonly IRepository<LegacyFinSnapshotRun, Guid> _runRepository;

    public LegacyFinSnapshotAppService(
        IRepository<LegacyFinSnapshot, long> snapshotRepository,
        IRepository<LegacyFinSnapshotRun, Guid> runRepository)
    {
        _snapshotRepository = snapshotRepository;
        _runRepository = runRepository;
    }

    public async Task<LegacyFinCycleDto> GetCycleAsync(DateOnly cycleStart)
    {
        var normalizedStart = new DateOnly(cycleStart.Year, cycleStart.Month, 1);
        var normalizedEnd = normalizedStart.AddMonths(1).AddDays(-1);
        var snapshots = await _snapshotRepository.GetListAsync();
        var lastRun = (await _runRepository.GetListAsync())
            .OrderByDescending(run => run.ImportedAtUtc)
            .FirstOrDefault();

        // Crédito pertence à competência da fatura; Débito, à data que movimentou a conta.
        // A tela não adiciona faturas sintéticas, antecipações, saldo ou qualquer regra do Fin legado.
        var rows = snapshots.Select(snapshot => new { Snapshot = snapshot, Competence = CompetenceOf(snapshot) }).ToList();
        var months = rows
            .Where(row => row.Competence.HasValue)
            .Select(row => new DateOnly(row.Competence!.Value.Year, row.Competence.Value.Month, 1))
            .Distinct()
            .OrderBy(month => month)
            .ToList();
        var selected = rows.Where(row => row.Competence >= normalizedStart && row.Competence <= normalizedEnd).ToList();
        var debit = selected.Where(row => row.Snapshot.Cred != true).Select(row => ToItem(row.Snapshot, row.Competence)).ToList();
        var credit = selected.Where(row => row.Snapshot.Cred == true).Select(row => ToItem(row.Snapshot, row.Competence)).ToList();

        return new LegacyFinCycleDto
        {
            CycleStart = normalizedStart,
            CycleEnd = normalizedEnd,
            AvailableMonths = months,
            LastImportAtUtc = lastRun?.ImportedAtUtc,
            SourceRowCount = lastRun?.SourceRowCount ?? 0,
            DebitTotal = debit.Sum(item => item.Valor ?? 0m),
            CreditTotal = credit.Sum(item => item.Valor ?? 0m),
            DebitItems = debit,
            CreditItems = credit,
        };
    }

    private static DateOnly? CompetenceOf(LegacyFinSnapshot snapshot) => snapshot.Cred == true
        ? snapshot.Fatura ?? snapshot.Data
        : snapshot.Data;

    private static LegacyFinSnapshotItemDto ToItem(LegacyFinSnapshot snapshot, DateOnly? competence) => new()
    {
        Id = snapshot.Id,
        CompetenceDate = competence,
        Nome = snapshot.Nome,
        Valor = snapshot.Valor,
        Categ = snapshot.Categ,
        Freq = snapshot.Freq,
        Pago = snapshot.Pago,
    };
}
