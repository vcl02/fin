// Prévia de Crédito: no ciclo N, calcula a fatura do ciclo N+1 sem criar linhas ou alterar o snapshot local.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Vcl.FinHub.LegacyImports;

public sealed record LegacyFinCreditPreviewSummary(
    LegacyFinCycleRange? PreviewCycle,
    decimal TodayTotal,
    decimal FutureTotal);

public static class LegacyFinCreditPreviewCalculator
{
    public static LegacyFinCreditPreviewSummary Calculate(
        IReadOnlyList<LegacyFinSnapshot> snapshots,
        IReadOnlyList<LegacyFinCycleRange> cycles,
        LegacyFinCycleRange selectedCycle,
        DateOnly asOf)
    {
        var selectedIndex = Enumerable.Range(0, cycles.Count).FirstOrDefault(index => cycles[index] == selectedCycle, -1);
        var previewIndex = selectedIndex + 1;
        if (selectedIndex < 0 || previewIndex >= cycles.Count)
            return new LegacyFinCreditPreviewSummary(null, 0m, 0m);

        var previewCycle = cycles[previewIndex];
        var futurePayments = LegacyFinInvoicePrepaymentCalculator.Allocate(snapshots, cycles);
        var paidThroughToday = snapshots
            // "Hoje" reproduz o Fin: uma confirmação só conta quando foi paga e já ocorreu na conta.
            .Where(snapshot => snapshot.Pago == true && snapshot.Data.HasValue && snapshot.Data.Value <= asOf)
            .ToList();
        var todayPayments = LegacyFinInvoicePrepaymentCalculator.Allocate(paidThroughToday, cycles);

        var futureCredits = CreditsInCycle(snapshots, previewCycle);
        var todayCredits = CreditsInCycle(paidThroughToday, previewCycle);

        return new LegacyFinCreditPreviewSummary(
            previewCycle,
            futureCredits.Sum(snapshot => snapshot.Valor ?? 0m) + futurePayments[previewIndex],
            todayCredits.Sum(snapshot => snapshot.Valor ?? 0m) + todayPayments[previewIndex]);
    }

    private static IEnumerable<LegacyFinSnapshot> CreditsInCycle(
        IEnumerable<LegacyFinSnapshot> snapshots,
        LegacyFinCycleRange cycle) => snapshots.Where(snapshot => snapshot.Cred == true && LegacyFinCycles.Contains(cycle, snapshot.Fatura));
}
