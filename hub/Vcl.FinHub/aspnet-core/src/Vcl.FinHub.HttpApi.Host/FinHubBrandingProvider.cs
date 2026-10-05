using Microsoft.Extensions.Localization;
using Vcl.FinHub.Localization;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Ui.Branding;

namespace Vcl.FinHub;

[Dependency(ReplaceServices = true)]
public class FinHubBrandingProvider : DefaultBrandingProvider
{
    private IStringLocalizer<FinHubResource> _localizer;

    public FinHubBrandingProvider(IStringLocalizer<FinHubResource> localizer)
    {
        _localizer = localizer;
    }

    public override string AppName => _localizer["AppName"];
}
