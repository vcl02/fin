// DTOs de consulta: representam dados brutos do snapshot, sem reproduzir cálculos financeiros do Fin atual.
using System;
using System.Collections.Generic;

namespace Vcl.FinHub.LegacyImports;

public sealed class LegacyFinCycleDto
{
    public DateOnly CycleStart { get; init; }
    public DateOnly CycleEnd { get; init; }
    public IReadOnlyList<DateOnly> AvailableCycles { get; init; } = Array.Empty<DateOnly>();
    public DateTime? LastImportAtUtc { get; init; }
    public int SourceRowCount { get; init; }
    public decimal DebitTotal { get; init; }
    public decimal CreditTotal { get; init; }
    public decimal DebitTodayBalance { get; init; }
    public decimal DebitTodaySaved { get; init; }
    public IReadOnlyList<LegacyFinSnapshotItemDto> DebitItems { get; init; } = Array.Empty<LegacyFinSnapshotItemDto>();
    public IReadOnlyList<LegacyFinSnapshotItemDto> CreditItems { get; init; } = Array.Empty<LegacyFinSnapshotItemDto>();
}

public sealed class LegacyFinSnapshotItemDto
{
    public long Id { get; init; }
    public DateOnly? CompetenceDate { get; init; }
    public string? Nome { get; init; }
    public decimal? Valor { get; init; }
    public string? Categ { get; init; }
    public string? Freq { get; init; }
    public bool? Pago { get; init; }
}
