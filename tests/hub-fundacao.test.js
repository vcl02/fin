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

test('a fundação do Hub fixa .NET 10, home inicial e módulo Fin', () => {
    const projetoHost = ler('aspnet-core', 'src', 'Vcl.FinHub.HttpApi.Host', 'Vcl.FinHub.HttpApi.Host.csproj');
    const rotas = ler('angular', 'src', 'app', 'app.routes.ts');
    const index = ler('angular', 'src', 'index.html');
    const home = ler('angular', 'src', 'app', 'hub-home', 'hub-home.component.html');
    const fin = ler('angular', 'src', 'app', 'home', 'home.component.html');

    assert.match(projetoHost, /<TargetFramework>net10\.0<\/TargetFramework>/);
    assert.match(rotas, /title: 'Hub pessoal'/);
    assert.match(rotas, /path: 'fin'/);
    assert.match(rotas, /title: 'fin'/);
    assert.match(index, /<title>Hub pessoal<\/title>/);
    assert.match(home, /routerLink="\/fin"/);
    assert.match(fin, /class="icon-button home-button" routerLink="\/" title="Voltar ao Hub"/);
    assert.match(fin, /class="fin-home__header-side"/);
    assert.match(fin, /class="fin-home__actions" aria-label="Ações do Fin"/);
    assert.match(fin, /class="icon-button native-link" routerLink="\/fin"/);
    assert.match(fin, /fin-home__import[\s\S]*fin-home__actions/);
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
    assert.match(appService, /Crédito pertence ao ciclo que contém o vencimento da fatura/);
    assert.doesNotMatch(appService, /InsertAsync|UpdateAsync|DeleteAsync/);
    assert.match(clienteAngular, /api\/app\/legacy-fin-snapshot\/cycle/);
    assert.match(clienteAngular, /timeout\(\{ first: 8_000 \}\)/);
    assert.doesNotMatch(clienteAngular.replace(/^\/\/.*$/m, ''), /supabase/i);
});

test('a consulta local usa ciclos reais ancorados em Faturamento PJ, sem voltar a meses-calendário', () => {
    const ciclos = ler('aspnet-core', 'src', 'Vcl.FinHub.Domain', 'LegacyImports', 'LegacyFinCycles.cs');
    const appService = ler('aspnet-core', 'src', 'Vcl.FinHub.Application', 'LegacyImports', 'LegacyFinSnapshotAppService.cs');
    const clienteAngular = ler('angular', 'src', 'app', 'home', 'legacy-fin-snapshot.service.ts');

    assert.match(ciclos, /AnchorName = "Faturamento PJ"/);
    assert.match(ciclos, /DateOnly\.MaxValue/);
    assert.match(appService, /LegacyFinCycles\.FromSnapshots/);
    assert.match(appService, /LegacyFinCycles\.Contains\(creditPreview\.PreviewCycle, snapshot\.Fatura\)/);
    assert.match(appService, /AvailableCycles/);
    assert.match(clienteAngular, /availableCycles/);
    assert.doesNotMatch(appService, /AddMonths\(1\)\.AddDays\(-1\)/);
});

test('o retrato Hoje do Hub recebe a data local do navegador e não antecipa saldo futuro', () => {
    const calculadora = ler('aspnet-core', 'src', 'Vcl.FinHub.Domain', 'LegacyImports', 'LegacyFinDebitTodaySummary.cs');
    const appService = ler('aspnet-core', 'src', 'Vcl.FinHub.Application', 'LegacyImports', 'LegacyFinSnapshotAppService.cs');
    const clienteAngular = ler('angular', 'src', 'app', 'home', 'legacy-fin-snapshot.service.ts');
    const telaAngular = ler('angular', 'src', 'app', 'home', 'home.component.ts');

    assert.match(calculadora, /snapshot\.Pago == true/);
    assert.match(calculadora, /snapshot\.Cred != true/);
    assert.match(calculadora, /BalanceSince/);
    assert.match(appService, /LegacyFinDebitTodayCalculator\.Calculate/);
    assert.match(clienteAngular, /\.set\('asOf', asOf\)/);
    assert.match(telaAngular, /getCycle\(month, this\.currentDate\(\)\)/);
});

test('o Futuro do Hub calcula fatura líquida e ajuste de investimento sem persistir linhas sintéticas', () => {
    const calculadora = ler('aspnet-core', 'src', 'Vcl.FinHub.Domain', 'LegacyImports', 'LegacyFinFutureDebitCalculator.cs');
    const antecipacoes = ler('aspnet-core', 'src', 'Vcl.FinHub.Domain', 'LegacyImports', 'LegacyFinInvoicePrepaymentCalculator.cs');
    const appService = ler('aspnet-core', 'src', 'Vcl.FinHub.Application', 'LegacyImports', 'LegacyFinSnapshotAppService.cs');
    const contrato = ler('aspnet-core', 'src', 'Vcl.FinHub.Application.Contracts', 'LegacyImports', 'LegacyFinCycleDto.cs');

    assert.match(antecipacoes, /Allocate\(/);
    assert.match(calculadora, /InvestmentAdjustment/);
    assert.match(calculadora, /LegacyFinDebitTodayCalculator\.BalanceSince/);
    assert.match(appService, /LegacyFinFutureDebitCalculator\.Calculate/);
    assert.match(contrato, /DebitFutureBalance/);
    assert.doesNotMatch(calculadora, /InsertAsync|UpdateAsync|DeleteAsync/);
});

test('a prévia de Crédito do Hub usa o próximo ciclo e separa Hoje de Futuro', () => {
    const calculadora = ler('aspnet-core', 'src', 'Vcl.FinHub.Domain', 'LegacyImports', 'LegacyFinCreditPreviewCalculator.cs');
    const appService = ler('aspnet-core', 'src', 'Vcl.FinHub.Application', 'LegacyImports', 'LegacyFinSnapshotAppService.cs');
    const contrato = ler('aspnet-core', 'src', 'Vcl.FinHub.Application.Contracts', 'LegacyImports', 'LegacyFinCycleDto.cs');
    const tela = ler('angular', 'src', 'app', 'home', 'home.component.html');

    assert.match(calculadora, /previewIndex = selectedIndex \+ 1/);
    assert.match(calculadora, /snapshot\.Pago == true/);
    assert.match(calculadora, /LegacyFinInvoicePrepaymentCalculator\.Allocate/);
    assert.match(appService, /LegacyFinCreditPreviewCalculator\.Calculate/);
    assert.match(contrato, /CreditTodayTotal/);
    assert.match(contrato, /CreditFutureTotal/);
    assert.match(tela, /Hoje \{\{ formatMoney\(cycle\.creditTodayTotal\) \}\}/);
    assert.match(tela, /Futuro \{\{ formatMoney\(cycle\.creditFutureTotal\) \}\}/);
});
