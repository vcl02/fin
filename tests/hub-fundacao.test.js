// Contrato da fundação paralela: mantém o Hub em .NET 10, Angular e sem acoplamento prematuro ao Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const raizHub = 'hub';
const solucaoHub = path.join(raizHub, 'Vcl.FinHub');

function ler(...partes) {
    return fs.readFileSync(path.join(solucaoHub, ...partes), 'utf8');
}

function lerRaiz(...partes) {
    return fs.readFileSync(path.join(raizHub, ...partes), 'utf8');
}

test('a fundação do Hub fixa .NET 10 e a rota inicial do Fin', () => {
    const projetoHost = ler('aspnet-core', 'src', 'Vcl.FinHub.HttpApi.Host', 'Vcl.FinHub.HttpApi.Host.csproj');
    const rotas = ler('angular', 'src', 'app', 'app.routes.ts');

    assert.match(projetoHost, /<TargetFramework>net10\.0<\/TargetFramework>/);
    assert.match(rotas, /path: 'fin'/);
    assert.match(rotas, /redirectTo: 'fin'/);
});

test('o Hub não expõe Supabase ao Angular e limita a ponte legada ao importador manual', () => {
    const documentos = [
        lerRaiz('README.md'),
        lerRaiz('AGENTS.md'),
        ler('angular', 'src', 'app', 'home', 'home.component.html'),
    ].join('\n');

    assert.match(documentos, /não acessa Supabase|Nenhum dado financeiro ou Supabase/i);
    const packageAngular = ler('angular', 'package.json');
    const importer = ler('aspnet-core', 'src', 'Vcl.FinHub.LegacyImport', 'LegacyFinSnapshotImporter.cs');
    const configExemplo = ler('aspnet-core', 'src', 'Vcl.FinHub.LegacyImport', 'appsettings.local.example.json');
    assert.doesNotMatch(packageAngular, /@supabase\//i);
    assert.doesNotMatch(packageAngular, /@abp\/ng\.theme/i);
    assert.match(importer, /GetAsync/);
    assert.doesNotMatch(importer, /client\.(Post|Put|Patch|Delete)Async/);
    assert.match(importer, /BeginTransactionAsync/);
    assert.match(importer, /ExecuteDeleteAsync/);
    assert.match(importer, /GetStatusAsync/);
    assert.match(importer, /IsAuthenticatedSessionToken/);
    assert.match(importer, /papel authenticated/);
    assert.match(importer, /linhas hist.ricas incompletas/);
    assert.doesNotMatch(importer, /string\.IsNullOrWhiteSpace\(snapshot\.Nome\)/);
    assert.match(configExemplo, /SupabaseAccessToken/);
    assert.doesNotMatch(configExemplo, /sb_publishable_|eyJ/);
});

test('o banco do Hub é um PostgreSQL local isolado e nunca aponta para a produção', () => {
    const compose = ler('docker-compose.yml');
    const configuracoes = [
        ler('aspnet-core', 'src', 'Vcl.FinHub.HttpApi.Host', 'appsettings.json'),
        ler('aspnet-core', 'src', 'Vcl.FinHub.DbMigrator', 'appsettings.json'),
    ].join('\n');

    assert.match(compose, /postgres:16-alpine/);
    assert.match(compose, /127\.0\.0\.1:54329:5432/);
    assert.match(configuracoes, /Host=localhost;Port=54329;Database=finhub/);
    assert.doesNotMatch(configuracoes, /supabase\.co|postgres\.supabase/i);
});

test('a consulta do Hub elimina a margem e a fonte serifada herdadas do template', () => {
    const estilosGlobais = ler('angular', 'src', 'styles.scss');

    assert.match(estilosGlobais, /font-family: "Segoe UI", system-ui/);
    assert.match(estilosGlobais, /body[\s\S]*margin: 0/);
    assert.match(estilosGlobais, /background: #1a1d20/);
});

test('a infraestrutura técnica local tem uma migration inicial sem modelo financeiro prematuro', () => {
    const pastaMigrations = path.join(solucaoHub, 'aspnet-core', 'src', 'Vcl.FinHub.EntityFrameworkCore', 'Migrations');
    const arquivos = fs.readdirSync(pastaMigrations);
    const migrationInicial = arquivos.find(arquivo => /_Initial\.cs$/.test(arquivo));

    assert.ok(migrationInicial, 'a migration inicial do ABP deve ser versionada');
    assert.doesNotMatch(fs.readFileSync(path.join(pastaMigrations, migrationInicial), 'utf8'), /FinLancamento|Supabase/i);
});

test('o staging legado é uma migration local versionada e possui somente consulta HTTP local', () => {
    const pastaMigrations = path.join(solucaoHub, 'aspnet-core', 'src', 'Vcl.FinHub.EntityFrameworkCore', 'Migrations');
    const arquivos = fs.readdirSync(pastaMigrations);
    const migrationSnapshot = arquivos.find(arquivo => /_AddLegacyFinSnapshot\.cs$/.test(arquivo));
    const appService = ler('aspnet-core', 'src', 'Vcl.FinHub.Application', 'LegacyImports', 'LegacyFinSnapshotAppService.cs');
    const contrato = ler('aspnet-core', 'src', 'Vcl.FinHub.Application.Contracts', 'LegacyImports', 'ILegacyFinSnapshotAppService.cs');
    const clienteAngular = ler('angular', 'src', 'app', 'home', 'legacy-fin-snapshot.service.ts');

    assert.ok(migrationSnapshot, 'o staging local precisa de migration versionada');
    const migration = fs.readFileSync(path.join(pastaMigrations, migrationSnapshot), 'utf8');
    assert.match(migration, /LegacyFinSnapshots/);
    assert.match(migration, /LegacyFinSnapshotRuns/);
    assert.match(contrato, /GetCycleAsync/);
    assert.match(appService, /\[AllowAnonymous\]/);
    assert.match(appService, /public class LegacyFinSnapshotAppService/);
    assert.doesNotMatch(appService, /sealed class LegacyFinSnapshotAppService/);
    assert.match(appService, /Crédito pertence à competência da fatura/);
    assert.doesNotMatch(appService, /InsertAsync|UpdateAsync|DeleteAsync/);
    assert.match(clienteAngular, /api\/app\/legacy-fin-snapshot\/cycle/);
    assert.match(clienteAngular, /timeout\(\{ first: 8_000 \}\)/);
    assert.doesNotMatch(clienteAngular.replace(/^\/\/.*$/m, ''), /supabase/i);
});
