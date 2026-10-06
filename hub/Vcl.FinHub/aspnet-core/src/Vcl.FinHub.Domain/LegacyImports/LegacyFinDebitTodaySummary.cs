// Retrato de caixa do snapshot: replica o resumo Hoje do Débito sem introduzir linhas sintéticas.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Vcl.FinHub.LegacyImports;

public sealed record LegacyFinDebitTodaySummary(decimal Balance, decimal Saved);

public static class LegacyFinDebitTodayCalculator
{
    // O legado só possui saldo inicial confiável a partir deste marco; mantê-lo explícito evita somar histórico incompleto.
    public static readonly DateOnly BalanceSince = new(2026, 8, 7);
    private const string InvestmentCategory = "Investimento";

    public static LegacyFinDebitTodaySummary Calculate(IEnumerable<LegacyFinSnapshot> snapshots, DateOnly asOf)
    {
        var paidDebits = snapshots
            .Where(snapshot => snapshot.Pago == true
                && snapshot.Cred != true
                && snapshot.Data.HasValue
                && snapshot.Data.Value >= BalanceSince
                && snapshot.Data.Value <= asOf)
            .ToList();

        return new LegacyFinDebitTodaySummary(
            paidDebits.Sum(snapshot => snapshot.Valor ?? 0m),
            paidDebits
                .Where(snapshot => HasCategory(snapshot.Categ, InvestmentCategory))
                .Sum(snapshot => -(snapshot.Valor ?? 0m))
        );
    }

    private static bool HasCategory(string? categories, string wanted) =>
        (categories ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(category => string.Equals(Normalize(category), Normalize(wanted), StringComparison.Ordinal));

    private static string Normalize(string value) => string.Concat(value
        .Normalize(NormalizationForm.FormD)
        .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark))
        .ToUpperInvariant();
}
