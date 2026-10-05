using Vcl.FinHub.EntityFrameworkCore;
using Volo.Abp.Autofac;
using Volo.Abp.Modularity;

namespace Vcl.FinHub.DbMigrator;

[DependsOn(
    typeof(AbpAutofacModule),
    typeof(FinHubEntityFrameworkCoreModule),
    typeof(FinHubApplicationContractsModule)
    )]
public class FinHubDbMigratorModule : AbpModule
{
}
