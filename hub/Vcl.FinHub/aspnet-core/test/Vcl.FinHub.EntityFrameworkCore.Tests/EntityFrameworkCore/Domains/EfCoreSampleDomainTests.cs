using Vcl.FinHub.Samples;
using Xunit;

namespace Vcl.FinHub.EntityFrameworkCore.Domains;

[Collection(FinHubTestConsts.CollectionDefinitionName)]
public class EfCoreSampleDomainTests : SampleDomainTests<FinHubEntityFrameworkCoreTestModule>
{

}
