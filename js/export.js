// Exportação local dos lançamentos filtrados para backup e conferência fora da aplicação.

const escaparCsv = valor => `"${String(valor ?? '').replace(/"/g, '""')}"`;

// Inclui apenas campos persistíveis e marca simulações para que um backup não as confunda
// com dado gravado. Linhas sintéticas não moram em Estado.lancamentos e já ficam de fora.
function dadosExportaveis(linhas) {
    return linhas.map(linha => ({
        ...Object.fromEntries(CAMPOS_EXPORTACAO_LANCAMENTO.map(campo => [campo, linha[campo] ?? null])),
        simulado: !!linha._sim,
    }));
}

function montarCsvLancamentos(linhas) {
    const dados = dadosExportaveis(linhas);
    const colunas = [...CAMPOS_EXPORTACAO_LANCAMENTO, 'simulado'];
    return '\ufeff' + [colunas, ...dados.map(linha => colunas.map(coluna => escaparCsv(linha[coluna])))]
        .map(linha => linha.join(';')).join('\r\n');
}

function nomeArquivoExportacao(extensao) {
    return `fin-lancamentos-filtrados-${hojeISO()}.${extensao}`;
}

function baixarTexto(texto, tipo, nome) {
    const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url; link.download = nome; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportarLancamentos(formato) {
    const linhas = filtrarLancamentos();
    if (!linhas.length) { alert('Não há lançamentos no recorte atual para exportar.'); return; }
    const dados = dadosExportaveis(linhas);
    if (formato === 'json') {
        baixarTexto(JSON.stringify({ exportado_em: new Date().toISOString(), filtros: {
            ativo: el('fativo').value, pago: el('fpago').value, origem: el('origem').value,
            titular: el('titular').value, valor: el('fvalor').value,
        }, lancamentos: dados }, null, 2), 'application/json', nomeArquivoExportacao('json'));
    } else {
        baixarTexto(montarCsvLancamentos(linhas), 'text/csv', nomeArquivoExportacao('csv'));
    }
}

el('exportarCsv').onclick = () => exportarLancamentos('csv');
el('backupJson').onclick = () => exportarLancamentos('json');
