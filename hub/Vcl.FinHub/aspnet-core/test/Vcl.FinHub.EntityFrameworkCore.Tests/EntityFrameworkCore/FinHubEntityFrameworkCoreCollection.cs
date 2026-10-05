using Xunit;

namespace Vcl.FinHub.EntityFrameworkCore;

[CollectionDefinition(FinHubTestConsts.CollectionDefinitionName)]
public class FinHubEntityFrameworkCoreCollection : ICollectionFixture<FinHubEntityFrameworkCoreFixture>
{

}
