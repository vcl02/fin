using Vcl.FinHub.Localization;
using Volo.Abp.AspNetCore.Mvc;

namespace Vcl.FinHub.Controllers;

/* Inherit your controllers from this class.
 */
public abstract class FinHubController : AbpControllerBase
{
    protected FinHubController()
    {
        LocalizationResource = typeof(FinHubResource);
    }
}
