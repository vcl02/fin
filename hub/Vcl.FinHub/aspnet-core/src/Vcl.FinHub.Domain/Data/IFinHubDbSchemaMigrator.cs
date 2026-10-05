using System.Threading.Tasks;

namespace Vcl.FinHub.Data;

public interface IFinHubDbSchemaMigrator
{
    Task MigrateAsync();
}
