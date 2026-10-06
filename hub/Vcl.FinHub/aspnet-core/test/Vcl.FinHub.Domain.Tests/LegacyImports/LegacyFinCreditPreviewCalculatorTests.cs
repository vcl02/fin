// Regressões da prévia de Crédito: ciclo N aponta para N+1 e separa confirmação de projeção completa.
using System;
using Shouldly;
using Vcl.FinHub.LegacyImports;
using Xunit;

namespace Vcl.FinHub.LegacyImports;

public class LegacyFinCreditPreviewCalculatorTests
{
    [Fact]
    public void Uses_The_Next_Cycle_And_Applies_Only_Paid_Prepayments_To_Today()
    {
        var snapshots = new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), "Faturamento PJ", 1_000m),
            Snapshot(2, new DateOnly(2026, 8, 20), "Compra confirmada", -250m, pago: true, cred: true, fatura: new DateOnly(2026, 9, 10)),
            Snapshot(3, new DateOnly(2026, 8, 21), "Compra aberta", -150m, pago: false, cred: true, fatura: new DateOnly(2026, 9, 10)),
            Snapshot(4, new DateOnly(2026, 8, 22), "Fatura Nu", -70m, categ: "Antecipação Fatura", pago: true, fatura: new DateOnly(2026, 9, 10)),
            Snapshot(5, new DateOnly(2026, 8, 23), "Fatura Nu", -30m, categ: "Antecipação Fatura", pago: false, fatura: new DateOnly(2026, 9, 10)),
            Snapshot(6, new DateOnly(2026, 9, 7), "Faturamento PJ", 1m),
            Snapshot(7, new DateOnly(2026, 10, 7), "Faturamento PJ", 1m),
        };
        var cycles = LegacyFinCycles.FromSnapshots(snapshots);

        var result = LegacyFinCreditPreviewCalculator.Calculate(snapshots, cycles, cycles[0], new DateOnly(2026, 8, 22));

        result.PreviewCycle.ShouldBe(cycles[1]);
        result.TodayTotal.ShouldBe(-180m);
        result.FutureTotal.ShouldBe(-300m);
    }

    [Fact]
    public void Returns_An_Empty_Preview_When_There_Is_No_Next_Cycle()
    {
        var snapshots = new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), "Faturamento PJ", 1_000m),
        };
        var cycles = LegacyFinCycles.FromSnapshots(snapshots);

        var result = LegacyFinCreditPreviewCalculator.Calculate(snapshots, cycles, cycles[0], new DateOnly(2026, 8, 7));

        result.PreviewCycle.ShouldBeNull();
        result.TodayTotal.ShouldBe(0m);
        result.FutureTotal.ShouldBe(0m);
    }

    private static LegacyFinSnapshot Snapshot(long id, DateOnly data, string nome, decimal valor, string? categ = null,
        bool? pago = false, bool? cred = false, DateOnly? fatura = null) =>
        new(id, data, nome, valor, categ, null, pago, cred, fatura, null, "{}");
}
