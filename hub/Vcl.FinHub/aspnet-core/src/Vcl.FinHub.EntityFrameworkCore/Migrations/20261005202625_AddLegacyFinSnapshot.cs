using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Vcl.FinHub.Migrations
{
    /// <inheritdoc />
    public partial class AddLegacyFinSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LegacyFinSnapshotRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportedAtUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    SourceRowCount = table.Column<int>(type: "integer", nullable: false),
                    SourceMaxId = table.Column<long>(type: "bigint", nullable: false),
                    SignedTotal = table.Column<decimal>(type: "numeric", nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LegacyFinSnapshotRuns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LegacyFinSnapshots",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Data = table.Column<DateOnly>(type: "date", nullable: true),
                    Nome = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Valor = table.Column<decimal>(type: "numeric", nullable: true),
                    Categ = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Freq = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Pago = table.Column<bool>(type: "boolean", nullable: true),
                    Cred = table.Column<bool>(type: "boolean", nullable: true),
                    Fatura = table.Column<DateOnly>(type: "date", nullable: true),
                    RecorrenciaId = table.Column<long>(type: "bigint", nullable: true),
                    RegistroOriginal = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LegacyFinSnapshots", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LegacyFinSnapshotRuns");

            migrationBuilder.DropTable(
                name: "LegacyFinSnapshots");
        }
    }
}
