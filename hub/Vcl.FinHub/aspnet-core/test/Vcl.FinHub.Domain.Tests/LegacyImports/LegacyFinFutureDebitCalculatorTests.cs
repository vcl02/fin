// Regressões da projeção: fatura é líquida de antecipação e ajustes não resgatam mais do que está guardado.
using System;
using Shouldly;
using Vcl.FinHub.LegacyImports;
using Xunit;

namespace Vcl.FinHub.LegacyImports;

public class LegacyFinFutureDebitCalculatorTests
{
    [Fact]
    public void Settles_An_Invoice_Only_Once_When_A_Prepayment_Exists()
    {
        var snapshots = new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), "Faturamento PJ", 1_000m),
            Snapshot(2, new DateOnly(2026, 8, 8), "Casa", -100m),
            Snapshot(3, new DateOnly(2026, 8, 9), "Cartão", -400m, cred: true, fatura: new DateOnly(2026, 8, 12)),
            Snapshot(4, new DateOnly(2026, 8, 10), "Fatura Nu", -150m, categ: "Antecipação Fatura", fatura: new DateOnly(2026, 8, 12)),
            Snapshot(5, new DateOnly(2026, 9, 7), "Faturamento PJ", 1m),
        };
        var cycles = LegacyFinCycles.FromSnapshots(snapshots);

        var result = LegacyFinFutureDebitCalculator.Calculate(snapshots, cycles, cycles[0]);

        result.InvoicePayment.ShouldBe(150m);
        result.Adjustment.ShouldBe(-500m);
        result.Balance.ShouldBe(0m);
        result.Saved.ShouldBe(500m);
    }

    [Fact]
    public void Limits_Withdrawal_To_What_Is_Actually_Saved()
    {
        var snapshots = new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), "Faturamento PJ", 1_000m),
            Snapshot(2, new DateOnly(2026, 8, 8), "Aplicação", -200m, "Investimento"),
            Snapshot(3, new DateOnly(2026, 8, 9), "Conta", -550m),
            Snapshot(4, new DateOnly(2026, 9, 7), "Faturamento PJ", 100m),
            Snapshot(5, new DateOnly(2026, 9, 8), "Conta", -800m),
            Snapshot(6, new DateOnly(2026, 10, 7), "Faturamento PJ", 1m),
        };
        var cycles = LegacyFinCycles.FromSnapshots(snapshots);

        var result = LegacyFinFutureDebitCalculator.Calculate(snapshots, cycles, cycles[1]);

        result.Adjustment.ShouldBe(450m);
        result.Balance.ShouldBe(-250m);
        result.Saved.ShouldBe(0m);
    }

    private static LegacyFinSnapshot Snapshot(long id, DateOnly data, string nome, decimal valor, string? categ = null, bool? cred = false, DateOnly? fatura = null) =>
        new(id, data, nome, valor, categ, null, false, cred, fatura, null, "{}");
}
