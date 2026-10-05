using Volo.Abp.Modularity;

namespace Vcl.FinHub;

public abstract class FinHubApplicationTestBase<TStartupModule> : FinHubTestBase<TStartupModule>
    where TStartupModule : IAbpModule
{

}
