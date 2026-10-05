using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;

namespace Vcl.FinHub.Data;

/* This is used if database provider does't define
 * IFinHubDbSchemaMigrator implementation.
 */
public class NullFinHubDbSchemaMigrator : IFinHubDbSchemaMigrator, ITransientDependency
{
    public Task MigrateAsync()
    {
        return Task.CompletedTask;
    }
}
