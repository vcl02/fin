using System;
using System.Collections.Generic;
using System.Text;
using Vcl.FinHub.Localization;
using Volo.Abp.Application.Services;

namespace Vcl.FinHub;

/* Inherit your application services from this class.
 */
public abstract class FinHubAppService : ApplicationService
{
    protected FinHubAppService()
    {
        LocalizationResource = typeof(FinHubResource);
    }
}
