using Volo.Abp.Settings;

namespace Vcl.FinHub.Settings;

public class FinHubSettingDefinitionProvider : SettingDefinitionProvider
{
    public override void Define(ISettingDefinitionContext context)
    {
        //Define your own settings here. Example:
        //context.Add(new SettingDefinition(FinHubSettings.MySetting1));
    }
}
