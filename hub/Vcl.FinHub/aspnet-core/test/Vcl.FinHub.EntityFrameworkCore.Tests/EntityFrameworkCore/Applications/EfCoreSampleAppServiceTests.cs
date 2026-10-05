using Vcl.FinHub.Samples;
using Xunit;

namespace Vcl.FinHub.EntityFrameworkCore.Applications;

[Collection(FinHubTestConsts.CollectionDefinitionName)]
public class EfCoreSampleAppServiceTests : SampleAppServiceTests<FinHubEntityFrameworkCoreTestModule>
{

}
