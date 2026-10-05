using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Vcl.FinHub.Data;
using Volo.Abp.DependencyInjection;

namespace Vcl.FinHub.EntityFrameworkCore;

public class EntityFrameworkCoreFinHubDbSchemaMigrator
    : IFinHubDbSchemaMigrator, ITransientDependency
{
    private readonly IServiceProvider _serviceProvider;

    public EntityFrameworkCoreFinHubDbSchemaMigrator(
        IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public async Task MigrateAsync()
    {
        /* We intentionally resolve the FinHubDbContext
         * from IServiceProvider (instead of directly injecting it)
         * to properly get the connection string of the current tenant in the
         * current scope.
         */

        await _serviceProvider
            .GetRequiredService<FinHubDbContext>()
            .Database
            .MigrateAsync();
    }
}
