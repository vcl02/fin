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

test('o Hub permanece isolado do Supabase até uma migração aprovada', () => {
    const documentos = [
        lerRaiz('README.md'),
        lerRaiz('AGENTS.md'),
        ler('angular', 'src', 'app', 'home', 'home.component.html'),
    ].join('\n');

    assert.match(documentos, /não acessa Supabase|Nenhum dado financeiro, Supabase/i);
    assert.doesNotMatch(ler('angular', 'package.json'), /@supabase\//i);
});
