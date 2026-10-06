// Regressões do retrato Hoje: saldo e Guardado usam somente movimentos reais de Débito pagos no marco confiável.
using System;
using Shouldly;
using Vcl.FinHub.LegacyImports;
using Xunit;

namespace Vcl.FinHub.LegacyImports;

public class LegacyFinDebitTodayCalculatorTests
{
    [Fact]
    public void Includes_Only_Paid_Debits_From_The_Trusted_Balance_Milestone()
    {
        var result = LegacyFinDebitTodayCalculator.Calculate(new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 6), -500m, pago: true),
            Snapshot(2, new DateOnly(2026, 8, 7), 1_000m, pago: true),
            Snapshot(3, new DateOnly(2026, 8, 8), -200m, pago: true),
            Snapshot(4, new DateOnly(2026, 8, 9), -300m, pago: false),
            Snapshot(5, new DateOnly(2026, 8, 9), -400m, pago: true, cred: true),
            Snapshot(6, new DateOnly(2026, 8, 10), -50m, pago: true),
        }, new DateOnly(2026, 8, 9));

        result.Balance.ShouldBe(800m);
        result.Saved.ShouldBe(0m);
    }

    [Fact]
    public void Separates_Investment_As_Saved_Without_Removing_Its_Cash_Effect()
    {
        var result = LegacyFinDebitTodayCalculator.Calculate(new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), -500m, "Casa, investimento", pago: true),
            Snapshot(2, new DateOnly(2026, 8, 8), -250m, "INVESTIMENTO", pago: true),
            Snapshot(3, new DateOnly(2026, 8, 9), 100m, "Investimento", pago: true),
        }, new DateOnly(2026, 8, 9));

        result.Balance.ShouldBe(-650m);
        result.Saved.ShouldBe(150m);
    }

    private static LegacyFinSnapshot Snapshot(long id, DateOnly date, decimal value, string? category = null, bool? pago = null, bool? cred = false) =>
        new(id, date, "Movimento", value, category, null, pago, cred, null, null, "{}");
}
