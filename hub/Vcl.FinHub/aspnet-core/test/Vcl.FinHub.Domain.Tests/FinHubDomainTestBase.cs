using Volo.Abp.Modularity;

namespace Vcl.FinHub;

/* Inherit from this class for your domain layer tests. */
public abstract class FinHubDomainTestBase<TStartupModule> : FinHubTestBase<TStartupModule>
    where TStartupModule : IAbpModule
{

}
