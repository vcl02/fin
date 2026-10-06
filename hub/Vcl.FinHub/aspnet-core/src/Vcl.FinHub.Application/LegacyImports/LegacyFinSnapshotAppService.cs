// Caso de uso local: apresenta um ciclo do staging legado sem alterar dados ou recalcular regras financeiras.
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

    public async Task<LegacyFinCycleDto> GetCycleAsync(DateOnly cycleStart, DateOnly? asOf = null)
    {
        var snapshots = await _snapshotRepository.GetListAsync();
        var lastRun = (await _runRepository.GetListAsync())
            .OrderByDescending(run => run.ImportedAtUtc)
            .FirstOrDefault();

        var cycles = LegacyFinCycles.FromSnapshots(snapshots);
        var selectedCycle = LegacyFinCycles.FindContaining(cycles, cycleStart);
        var debitToday = LegacyFinDebitTodayCalculator.Calculate(snapshots, asOf ?? DateOnly.FromDateTime(DateTime.Today));
        // Sem âncora não existe ciclo financeiro. Mantemos a resposta vazia, em vez de inventar um mês-calendário.
        var cycle = selectedCycle ?? new LegacyFinCycleRange(cycleStart, cycleStart);

        // Crédito pertence ao ciclo que contém o vencimento da fatura; sem fatura ele fica fora,
        // como ocorre no Fin. Débito entra pela data que movimentou a conta.
        // A tela não cria faturas sintéticas, antecipações, saldo, limite ou outras regras legadas.
        var debit = snapshots
            .Where(snapshot => snapshot.Cred != true && LegacyFinCycles.Contains(cycle, snapshot.Data))
            .Select(snapshot => ToItem(snapshot, snapshot.Data))
            .ToList();
        var credit = snapshots
            .Where(snapshot => snapshot.Cred == true && LegacyFinCycles.Contains(cycle, snapshot.Fatura))
            .Select(snapshot => ToItem(snapshot, snapshot.Fatura))
            .ToList();

        return new LegacyFinCycleDto
        {
            CycleStart = cycle.Start,
            CycleEnd = cycle.End,
            AvailableCycles = cycles.Select(item => item.Start).ToList(),
            LastImportAtUtc = lastRun?.ImportedAtUtc,
            SourceRowCount = lastRun?.SourceRowCount ?? 0,
            DebitTotal = debit.Sum(item => item.Valor ?? 0m),
            CreditTotal = credit.Sum(item => item.Valor ?? 0m),
            DebitTodayBalance = debitToday.Balance,
            DebitTodaySaved = debitToday.Saved,
            DebitItems = debit,
            CreditItems = credit,
        };
    }

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
