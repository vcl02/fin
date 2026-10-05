using Volo.Abp.Modularity;

namespace Vcl.FinHub;

[DependsOn(
    typeof(FinHubDomainModule),
    typeof(FinHubTestBaseModule)
)]
public class FinHubDomainTestModule : AbpModule
{

}
