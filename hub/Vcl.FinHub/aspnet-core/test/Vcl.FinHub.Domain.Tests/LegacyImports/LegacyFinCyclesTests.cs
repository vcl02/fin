// Regressões da única regra financeira migrada ao Hub: os limites dos ciclos vêm das âncoras do Fin legado.
using System;
using Shouldly;
using Vcl.FinHub.LegacyImports;
using Xunit;

namespace Vcl.FinHub.LegacyImports;

public class LegacyFinCyclesTests
{
    [Fact]
    public void Builds_Cycles_From_Exact_Debit_Anchors_Only()
    {
        var cycles = LegacyFinCycles.FromSnapshots(new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), "Faturamento PJ"),
            Snapshot(2, new DateOnly(2026, 9, 8), "Faturamento PJ"),
            Snapshot(3, new DateOnly(2026, 9, 10), "Faturamento PJ", cred: true),
            Snapshot(4, new DateOnly(2026, 10, 1), "Faturamento PJ extra"),
        });

        cycles.Count.ShouldBe(2);
        cycles[0].Start.ShouldBe(new DateOnly(2026, 8, 7));
        cycles[0].End.ShouldBe(new DateOnly(2026, 9, 7));
        cycles[1].Start.ShouldBe(new DateOnly(2026, 9, 8));
        cycles[1].End.ShouldBe(DateOnly.MaxValue);
    }

    [Fact]
    public void Locates_The_Cycle_That_Contains_A_Debit_Or_Invoice_Due_Date()
    {
        var cycles = LegacyFinCycles.FromSnapshots(new[]
        {
            Snapshot(1, new DateOnly(2026, 8, 7), "Faturamento PJ"),
            Snapshot(2, new DateOnly(2026, 9, 8), "Faturamento PJ"),
        });

        LegacyFinCycles.FindContaining(cycles, new DateOnly(2026, 9, 7))!.Start.ShouldBe(new DateOnly(2026, 8, 7));
        LegacyFinCycles.FindContaining(cycles, new DateOnly(2026, 9, 8))!.Start.ShouldBe(new DateOnly(2026, 9, 8));
        LegacyFinCycles.Contains(cycles[0], new DateOnly(2026, 9, 7)).ShouldBeTrue();
        LegacyFinCycles.Contains(cycles[0], new DateOnly(2026, 9, 8)).ShouldBeFalse();
    }

    private static LegacyFinSnapshot Snapshot(long id, DateOnly date, string name, bool? cred = false) =>
        new(id, date, name, 1m, null, null, null, cred, null, null, "{}");
}
