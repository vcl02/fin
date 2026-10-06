// Contrato somente leitura da primeira consulta do snapshot local importado do Fin legado.
using System;
using System.Threading.Tasks;
using Volo.Abp.Application.Services;

namespace Vcl.FinHub.LegacyImports;

public interface ILegacyFinSnapshotAppService : IApplicationService
{
    Task<LegacyFinCycleDto> GetCycleAsync(DateOnly cycleStart, DateOnly? asOf = null);
}
