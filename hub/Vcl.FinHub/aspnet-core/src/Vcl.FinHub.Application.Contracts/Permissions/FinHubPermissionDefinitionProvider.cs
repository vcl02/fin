using Vcl.FinHub.Localization;
using Volo.Abp.Authorization.Permissions;
using Volo.Abp.Localization;

namespace Vcl.FinHub.Permissions;

public class FinHubPermissionDefinitionProvider : PermissionDefinitionProvider
{
    public override void Define(IPermissionDefinitionContext context)
    {
        var myGroup = context.AddGroup(FinHubPermissions.GroupName);
        //Define your own permissions here. Example:
        //myGroup.AddPermission(FinHubPermissions.MyPermission1, L("Permission:MyPermission1"));
    }

    private static LocalizableString L(string name)
    {
        return LocalizableString.Create<FinHubResource>(name);
    }
}
