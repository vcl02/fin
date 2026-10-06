// Auditoria resumida de cada importacao local do espelho do Fin legado.
using System;
using Volo.Abp.Domain.Entities;

namespace Vcl.FinHub.LegacyImports;

public class LegacyFinSnapshotRun : Entity<Guid>
{
    public DateTime ImportedAtUtc { get; private set; }
    public int SourceRowCount { get; private set; }
    public long SourceMaxId { get; private set; }
    public decimal SignedTotal { get; private set; }
    public string ContentHash { get; private set; } = string.Empty;

    // O construtor vazio e necessario para materializacao pelo Entity Framework.
    protected LegacyFinSnapshotRun()
    {
    }

    public LegacyFinSnapshotRun(
        Guid id,
        DateTime importedAtUtc,
        int sourceRowCount,
        long sourceMaxId,
        decimal signedTotal,
        string contentHash)
        : base(id)
    {
        ImportedAtUtc = importedAtUtc;
        SourceRowCount = sourceRowCount;
        SourceMaxId = sourceMaxId;
        SignedTotal = signedTotal;
        ContentHash = contentHash;
    }
}
