using Volo.Abp.Modularity;

namespace Vcl.FinHub;

[DependsOn(
    typeof(FinHubApplicationModule),
    typeof(FinHubDomainTestModule)
)]
public class FinHubApplicationTestModule : AbpModule
{

}
