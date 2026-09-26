// Contrato PWA: instalação com manifest e cache limitado à interface, sem dados financeiros offline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const bootstrap = fs.readFileSync('js/bootstrap.js', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');

test('declara manifest instalável e cores coerentes com a interface', () => {
    assert.match(html, /<link rel=manifest href="\.\/manifest\.webmanifest">/);
    assert.match(html, /<link rel=icon type="image\/svg\+xml" href="\.\/icons\/fin-192\.svg">/);
    assert.match(html, /<meta name=theme-color content="#1B1E21">/);
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.theme_color, '#1B1E21');
    assert.deepEqual(manifest.icons.map(icone => icone.sizes), ['192x192', '512x512']);
    manifest.icons.forEach(icone => assert.ok(fs.existsSync(icone.src.replace('./', ''))));
});

test('ícones mantêm o conjunto F e gráfico centralizado no viewBox', () => {
    ['icons/fin-192.svg', 'icons/fin-512.svg'].forEach(arquivo => {
        const svg = fs.readFileSync(arquivo, 'utf8');
        assert.match(svg, /viewBox="0 0 192 192"/);
        // Caixa total: x 41–151 e y 50–142; ambos os centros são exatamente 96.
        assert.match(svg, /M41 142V58h63/);
        assert.match(svg, /M115 112h8v30h-8zm14-22h8v52h-8zm14-40h8v92h-8z/);
    });
});

test('registra service worker que atualiza a interface pela rede e cacheia só arquivos próprios', () => {
    assert.match(bootstrap, /navigator\.serviceWorker\.register\('\.\/service-worker\.js', \{ updateViaCache: 'none' \}\)/);
    assert.match(serviceWorker, /const ARQUIVOS_ESTATICOS = \[/);
    assert.match(serviceWorker, /if \(url\.origin !== self\.location\.origin\) return;/);
    assert.match(serviceWorker, /fetch\(evento\.request\)\.then/);
    assert.match(serviceWorker, /fetch\(arquivo, \{ cache: 'reload' \}\)/);
    assert.match(serviceWorker, /self\.skipWaiting\(\)/);
    assert.match(serviceWorker, /self\.clients\.claim\(\)/);
    assert.doesNotMatch(serviceWorker, /supabase\.co|rest\/v1|Authorization/);
});
