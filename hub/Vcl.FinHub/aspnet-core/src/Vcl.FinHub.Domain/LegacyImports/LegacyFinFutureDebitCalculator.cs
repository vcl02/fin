// Projeção do Débito por ciclo: mantém fatura líquida, saldo herdado e ajuste de investimento como no Fin legado.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Vcl.FinHub.LegacyImports;

public sealed record LegacyFinFutureDebitSummary(decimal Balance, decimal Saved, decimal InvoicePayment, decimal Adjustment);

public static class LegacyFinFutureDebitCalculator
{
    private const decimal Tolerance = 0.005m;

    public static LegacyFinFutureDebitSummary Calculate(
        IEnumerable<LegacyFinSnapshot> snapshots,
        IReadOnlyList<LegacyFinCycleRange> cycles,
        LegacyFinCycleRange selectedCycle)
    {
        var entries = snapshots.Select(snapshot => new LegacyEntry(snapshot, CycleIndex(cycles, snapshot))).ToList();
        var payments = AllocateInvoicePrepayments(entries, cycles);
        var balances = new decimal[cycles.Count];
        var adjustments = new decimal[cycles.Count];
        var eligible = cycles.Select(cycle => cycle.End >= LegacyFinDebitTodayCalculator.BalanceSince).ToArray();

        for (var index = 0; index < cycles.Count; index++)
        {
            if (!eligible[index]) continue;

            var previous = index > 0 && eligible[index - 1] ? balances[index - 1] : 0m;
            var debits = entries.Where(entry => entry.CycleIndex == index && entry.Snapshot.Cred != true)
                .Sum(entry => entry.Snapshot.Valor ?? 0m);
            var invoice = entries.Where(entry => entry.CycleIndex == index && entry.Snapshot.Cred == true)
                .Sum(entry => entry.Snapshot.Valor ?? 0m);
            var netInvoice = invoice == 0m ? 0m : invoice + payments[index];
            var baseBalance = previous + debits + netInvoice;
            var savedAvailable = SavedThrough(entries, adjustments, index - 1)
                + RealInvestmentInCycle(entries, index);
            adjustments[index] = InvestmentAdjustment(baseBalance, savedAvailable);
            balances[index] = baseBalance + adjustments[index];
        }

        var selectedIndex = IndexOf(cycles, selectedCycle);
        if (selectedIndex < 0) return new LegacyFinFutureDebitSummary(0m, 0m, 0m, 0m);

        return new LegacyFinFutureDebitSummary(
            balances[selectedIndex],
            SavedThrough(entries, adjustments, selectedIndex),
            payments[selectedIndex],
            adjustments[selectedIndex]
        );
    }

    private static int CycleIndex(IReadOnlyList<LegacyFinCycleRange> cycles, LegacyFinSnapshot snapshot)
    {
        var competence = snapshot.Cred == true ? snapshot.Fatura : snapshot.Data;
        return competence.HasValue ? IndexOfContaining(cycles, competence.Value) : -1;
    }

    private static int IndexOf(IReadOnlyList<LegacyFinCycleRange> cycles, LegacyFinCycleRange target) =>
        Enumerable.Range(0, cycles.Count).FirstOrDefault(index => cycles[index] == target, -1);

    private static int IndexOfContaining(IReadOnlyList<LegacyFinCycleRange> cycles, DateOnly date) =>
        Enumerable.Range(0, cycles.Count).FirstOrDefault(index => LegacyFinCycles.Contains(cycles[index], date), -1);

    private static decimal[] AllocateInvoicePrepayments(IReadOnlyList<LegacyEntry> entries, IReadOnlyList<LegacyFinCycleRange> cycles)
    {
        var invoices = new List<InvoiceBalance>();
        for (var index = 0; index < cycles.Count; index++)
        {
            var creditEntries = entries.Where(entry => entry.CycleIndex == index && entry.Snapshot.Cred == true).ToList();
            var gross = creditEntries.Sum(entry => entry.Snapshot.Valor ?? 0m);
            if (gross >= 0m) continue;
            var dueDates = creditEntries.Where(entry => entry.Snapshot.Fatura.HasValue)
                .Select(entry => entry.Snapshot.Fatura!.Value).Distinct().ToList();
            invoices.Add(new InvoiceBalance(index, -gross, dueDates.Count == 1 ? dueDates[0] : null));
        }

        var allocated = new decimal[cycles.Count];
        var pointer = 0;
        var prepayments = entries
            .Where(entry => entry.Snapshot.Cred != true && entry.Snapshot.Data.HasValue
                && (entry.Snapshot.Valor ?? 0m) < 0m && IsInvoicePrepayment(entry.Snapshot))
            .OrderBy(entry => entry.Snapshot.Data)
            .ToList();

        foreach (var prepayment in prepayments)
        {
            var remaining = -(prepayment.Snapshot.Valor ?? 0m);
            if (prepayment.Snapshot.Fatura.HasValue)
            {
                var explicitInvoice = invoices.FirstOrDefault(invoice => invoice.DueDate == prepayment.Snapshot.Fatura);
                if (explicitInvoice is not null) Allocate(explicitInvoice, remaining, allocated);
                continue;
            }

            while (remaining > Tolerance && pointer < invoices.Count)
            {
                var invoice = invoices[pointer];
                var used = Allocate(invoice, remaining, allocated);
                remaining -= used;
                if (invoice.Remaining <= Tolerance) pointer++;
                else break;
            }
        }

        return allocated;
    }

    private static decimal Allocate(InvoiceBalance invoice, decimal amount, decimal[] allocated)
    {
        var used = decimal.Min(amount, invoice.Remaining);
        invoice.Remaining -= used;
        allocated[invoice.CycleIndex] += used;
        return used;
    }

    private static decimal SavedThrough(IReadOnlyList<LegacyEntry> entries, IReadOnlyList<decimal> adjustments, int index)
    {
        if (index < 0) return 0m;
        var real = entries.Where(entry => entry.CycleIndex >= 0 && entry.CycleIndex <= index && IsInvestment(entry.Snapshot))
            .Sum(entry => -(entry.Snapshot.Valor ?? 0m));
        var synthetic = adjustments.Take(index + 1).Sum(adjustment => -adjustment);
        return real + synthetic;
    }

    private static decimal RealInvestmentInCycle(IReadOnlyList<LegacyEntry> entries, int index) =>
        entries.Where(entry => entry.CycleIndex == index && IsInvestment(entry.Snapshot))
            .Sum(entry => -(entry.Snapshot.Valor ?? 0m));

    private static decimal InvestmentAdjustment(decimal baseBalance, decimal savedAvailable)
    {
        if (baseBalance < -Tolerance)
        {
            var withdrawal = decimal.Min(-baseBalance, decimal.Max(0m, savedAvailable));
            return withdrawal <= Tolerance ? 0m : withdrawal;
        }

        return baseBalance > Tolerance ? -baseBalance : 0m;
    }

    private static bool IsInvestment(LegacyFinSnapshot snapshot) => HasCategory(snapshot.Categ, "Investimento");

    private static bool IsInvoicePrepayment(LegacyFinSnapshot snapshot) =>
        ContainsNormalized(snapshot.Categ, "antecipacao") && ContainsNormalized(snapshot.Categ, "fatura")
        || ContainsNormalized(snapshot.Nome, "antecipacao") && ContainsNormalized(snapshot.Nome, "fatura");

    private static bool HasCategory(string? categories, string wanted) => (categories ?? string.Empty)
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Any(category => string.Equals(Normalize(category), Normalize(wanted), StringComparison.Ordinal));

    private static bool ContainsNormalized(string? value, string text) => Normalize(value ?? string.Empty).Contains(text.ToUpperInvariant(), StringComparison.Ordinal);

    private static string Normalize(string value) => string.Concat(value.Normalize(NormalizationForm.FormD)
        .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)).ToUpperInvariant();

    private sealed record LegacyEntry(LegacyFinSnapshot Snapshot, int CycleIndex);

    private sealed class InvoiceBalance
    {
        public InvoiceBalance(int cycleIndex, decimal remaining, DateOnly? dueDate)
        {
            CycleIndex = cycleIndex;
            Remaining = remaining;
            DueDate = dueDate;
        }

        public int CycleIndex { get; }
        public decimal Remaining { get; set; }
        public DateOnly? DueDate { get; }
    }
}
