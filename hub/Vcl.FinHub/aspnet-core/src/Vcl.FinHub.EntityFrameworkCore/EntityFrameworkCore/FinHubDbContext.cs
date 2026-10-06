using Microsoft.EntityFrameworkCore;
using Volo.Abp.AuditLogging.EntityFrameworkCore;
using Volo.Abp.BackgroundJobs.EntityFrameworkCore;
using Volo.Abp.Data;
using Volo.Abp.DependencyInjection;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.EntityFrameworkCore.Modeling;
using Volo.Abp.FeatureManagement.EntityFrameworkCore;
using Volo.Abp.Identity;
using Volo.Abp.Identity.EntityFrameworkCore;
using Volo.Abp.OpenIddict.EntityFrameworkCore;
using Volo.Abp.PermissionManagement.EntityFrameworkCore;
using Volo.Abp.SettingManagement.EntityFrameworkCore;
using Volo.Abp.TenantManagement;
using Volo.Abp.TenantManagement.EntityFrameworkCore;
using Vcl.FinHub.Finance;
using Vcl.FinHub.LegacyImports;

namespace Vcl.FinHub.EntityFrameworkCore;

[ReplaceDbContext(typeof(IIdentityDbContext))]
[ReplaceDbContext(typeof(ITenantManagementDbContext))]
[ConnectionStringName("Default")]
public class FinHubDbContext :
    AbpDbContext<FinHubDbContext>,
    IIdentityDbContext,
    ITenantManagementDbContext
{
    // Este staging e a fronteira entre o Fin legado e o Hub; nao e ainda o modelo financeiro do Hub.
    public DbSet<LegacyFinSnapshot> LegacyFinSnapshots { get; set; }
    public DbSet<LegacyFinSnapshotRun> LegacyFinSnapshotRuns { get; set; }
    // Modelo nativo, inicialmente vazio e paralelo ao snapshot: nenhuma importação o alimenta.
    public DbSet<FinancialTransaction> FinancialTransactions { get; set; }
    // Fronteiras explícitas para futuros ciclos nativos; lançamentos não carregam uma cópia desta chave.
    public DbSet<FinancialCycle> FinancialCycles { get; set; }

    #region Entities from the modules

    /* Notice: We only implemented IIdentityDbContext and ITenantManagementDbContext
     * and replaced them for this DbContext. This allows you to perform JOIN
     * queries for the entities of these modules over the repositories easily. You
     * typically don't need that for other modules. But, if you need, you can
     * implement the DbContext interface of the needed module and use ReplaceDbContext
     * attribute just like IIdentityDbContext and ITenantManagementDbContext.
     *
     * More info: Replacing a DbContext of a module ensures that the related module
     * uses this DbContext on runtime. Otherwise, it will use its own DbContext class.
     */

    //Identity
    public DbSet<IdentityUser> Users { get; set; }
    public DbSet<IdentityRole> Roles { get; set; }
    public DbSet<IdentityClaimType> ClaimTypes { get; set; }
    public DbSet<OrganizationUnit> OrganizationUnits { get; set; }
    public DbSet<IdentitySecurityLog> SecurityLogs { get; set; }
    public DbSet<IdentityLinkUser> LinkUsers { get; set; }
    public DbSet<IdentityUserDelegation> UserDelegations { get; set; }
    public DbSet<IdentitySession> Sessions { get; set; }
    // Tenant Management
    public DbSet<Tenant> Tenants { get; set; }
    public DbSet<TenantConnectionString> TenantConnectionStrings { get; set; }

    #endregion

    public FinHubDbContext(DbContextOptions<FinHubDbContext> options)
        : base(options)
    {

    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        /* Include modules to your migration db context */

        builder.ConfigurePermissionManagement();
        builder.ConfigureSettingManagement();
        builder.ConfigureBackgroundJobs();
        builder.ConfigureAuditLogging();
        builder.ConfigureIdentity();
        builder.ConfigureOpenIddict();
        builder.ConfigureFeatureManagement();
        builder.ConfigureTenantManagement();

        /* Configure your own tables/entities inside here */

        builder.Entity<LegacyFinSnapshot>(b =>
        {
            b.ToTable("LegacyFinSnapshots", FinHubConsts.DbSchema);
            b.ConfigureByConvention();
            b.Property(x => x.Nome).HasMaxLength(255);
            b.Property(x => x.Categ).HasMaxLength(500);
            b.Property(x => x.Freq).HasMaxLength(100);
            // Preserva futuras colunas do legado sem fazer delas parte do contrato do Hub ainda.
            b.Property(x => x.RegistroOriginal).HasColumnType("jsonb");
        });

        builder.Entity<LegacyFinSnapshotRun>(b =>
        {
            b.ToTable("LegacyFinSnapshotRuns", FinHubConsts.DbSchema);
            b.ConfigureByConvention();
            b.Property(x => x.ContentHash).HasMaxLength(64);
        });

        builder.Entity<FinancialTransaction>(b =>
        {
            b.ToTable("FinancialTransactions", FinHubConsts.DbSchema, table =>
            {
                // As mesmas invariantes vivem no banco para que SQL direto não crie um movimento impossível.
                table.HasCheckConstraint("CK_FinancialTransactions_AmountNonZero", "\"Amount\" <> 0");
                table.HasCheckConstraint("CK_FinancialTransactions_Kind", "\"Kind\" IN ('Debit', 'Credit')");
                table.HasCheckConstraint("CK_FinancialTransactions_Status", "\"Status\" IN ('Open', 'Paid')");
            });
            b.ConfigureByConvention();
            b.Property(x => x.OccurredOn).HasColumnType("date").IsRequired(false);
            b.Property(x => x.Amount).HasPrecision(14, 2);
            b.Property(x => x.Name).HasMaxLength(FinancialTransactionRules.MaxNameLength).IsRequired();
            b.Property(x => x.Categories).HasMaxLength(FinancialTransactionRules.MaxCategoriesLength).IsRequired();
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
            b.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            b.HasIndex(x => x.OccurredOn);
        });

        builder.Entity<FinancialCycle>(b =>
        {
            b.ToTable("FinancialCycles", FinHubConsts.DbSchema);
            b.ConfigureByConvention();
            b.Property(x => x.StartsOn).HasColumnType("date").IsRequired();
            // Uma única fronteira por dia impede ciclos ambíguos; o fim vem da próxima fronteira cronológica.
            b.HasIndex(x => x.StartsOn).IsUnique();
        });

        //builder.Entity<YourEntity>(b =>
        //{
        //    b.ToTable(FinHubConsts.DbTablePrefix + "YourEntities", FinHubConsts.DbSchema);
        //    b.ConfigureByConvention(); //auto configure for the base class props
        //    //...
        //});
    }
}
