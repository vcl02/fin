// Composicao do adaptador manual de importacao; nao expoe endpoint HTTP nem agenda execucao.
using Microsoft.Extensions.DependencyInjection;
using Vcl.FinHub.EntityFrameworkCore;
using Volo.Abp.Castle;
using Volo.Abp.Modularity;
using Volo.Abp.Uow;

namespace Vcl.FinHub.LegacyImport;

[DependsOn(
    typeof(FinHubEntityFrameworkCoreModule),
    typeof(AbpCastleCoreModule),
    typeof(AbpUnitOfWorkModule))]
public class LegacyImportModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        context.Services.AddTransient<LegacyFinSnapshotImporter>();
    }
}
