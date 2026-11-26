import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const files = { '/index.html': 'text/html; charset=utf-8', '/styles.css': 'text/css; charset=utf-8', '/app.js': 'text/javascript; charset=utf-8', '/assets/linnake-crest.jpg': 'image/jpeg', '/assets/linnake-header-logo.png': 'image/png' };
for (const page of ['security', 'pricing', 'product', 'privacy', 'terms']) {
  files[`/${page}.html`] = files['/index.html'];
}
files['/readiness.js'] = files['/app.js'];
const assets = Object.fromEntries(Object.entries(files).map(([url, type]) => [url, { type, data: readFileSync(resolve('public', `.${url}`)).toString('base64') }]));
const manifest = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (manifest.static || manifest.d1 !== 'DB') throw new Error('Worker manifest must use DB and omit static.');
mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });
const source = readFileSync('worker/index.mjs', 'utf8').replace('export default createWorker();', `export default createWorker(${JSON.stringify(assets)});`);
writeFileSync('dist/server/index.js', source);
writeFileSync('dist/.openai/hosting.json', JSON.stringify(manifest, null, 2));
console.log('Built single-module Worker with embedded site assets and D1 form endpoints.');
