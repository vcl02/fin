// Regra de classificação dos ciclos do snapshot: replica somente as âncoras de Faturamento PJ do Fin legado.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Vcl.FinHub.LegacyImports;

public sealed record LegacyFinCycleRange(DateOnly Start, DateOnly End);

public static class LegacyFinCycles
{
    public const string AnchorName = "Faturamento PJ";

    public static IReadOnlyList<LegacyFinCycleRange> FromSnapshots(IEnumerable<LegacyFinSnapshot> snapshots)
    {
        var anchors = snapshots
            // A comparação exata, após trim, mantém o mesmo contrato da aplicação estática.
            .Where(snapshot => snapshot.Cred != true
                && snapshot.Data.HasValue
                && string.Equals(snapshot.Nome?.Trim(), AnchorName, StringComparison.Ordinal))
            .OrderBy(snapshot => snapshot.Data)
            .ToList();

        return anchors.Select((anchor, index) => new LegacyFinCycleRange(
            anchor.Data!.Value,
            index + 1 < anchors.Count ? anchors[index + 1].Data!.Value.AddDays(-1) : DateOnly.MaxValue
        )).ToList();
    }

    public static LegacyFinCycleRange? FindContaining(
        IReadOnlyList<LegacyFinCycleRange> cycles,
        DateOnly date) => cycles.FirstOrDefault(cycle => date >= cycle.Start && date <= cycle.End);

    public static bool Contains(LegacyFinCycleRange cycle, DateOnly? date) =>
        date.HasValue && date.Value >= cycle.Start && date.Value <= cycle.End;
}
