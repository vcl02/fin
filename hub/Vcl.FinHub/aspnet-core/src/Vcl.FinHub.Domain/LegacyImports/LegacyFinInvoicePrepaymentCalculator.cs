// Rateio de antecipações de fatura: compartilha a mesma regra entre a projeção de Débito e a prévia de Crédito.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Vcl.FinHub.LegacyImports;

public static class LegacyFinInvoicePrepaymentCalculator
{
    private const decimal Tolerance = 0.005m;

    public static decimal[] Allocate(
        IEnumerable<LegacyFinSnapshot> snapshots,
        IReadOnlyList<LegacyFinCycleRange> cycles)
    {
        var entries = snapshots.Select(snapshot => new LegacyEntry(snapshot, CycleIndex(cycles, snapshot))).ToList();
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

    private static int CycleIndex(IReadOnlyList<LegacyFinCycleRange> cycles, LegacyFinSnapshot snapshot)
    {
        var competence = snapshot.Cred == true ? snapshot.Fatura : snapshot.Data;
        return competence.HasValue
            ? Enumerable.Range(0, cycles.Count).FirstOrDefault(index => LegacyFinCycles.Contains(cycles[index], competence.Value), -1)
            : -1;
    }

    private static decimal Allocate(InvoiceBalance invoice, decimal amount, decimal[] allocated)
    {
        var used = decimal.Min(amount, invoice.Remaining);
        invoice.Remaining -= used;
        allocated[invoice.CycleIndex] += used;
        return used;
    }

    private static bool IsInvoicePrepayment(LegacyFinSnapshot snapshot) =>
        ContainsNormalized(snapshot.Categ, "antecipacao") && ContainsNormalized(snapshot.Categ, "fatura")
        || ContainsNormalized(snapshot.Nome, "antecipacao") && ContainsNormalized(snapshot.Nome, "fatura");

    private static bool ContainsNormalized(string? value, string text) => Normalize(value ?? string.Empty)
        .Contains(text.ToUpperInvariant(), StringComparison.Ordinal);

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
