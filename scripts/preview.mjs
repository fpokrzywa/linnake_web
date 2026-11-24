import http from 'node:http';
import { mkdirSync } from 'node:fs';
import worker from '../dist/server/index.js';
import { localDb } from './local-db.mjs';
mkdirSync('.local', { recursive: true });
const { DB } = localDb('.local/preview.sqlite');
http.createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://127.0.0.1:4173${incoming.url}`, { method: incoming.method, headers: incoming.headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: incoming, duplex: 'half' } : {}) });
    const response = await worker.fetch(request, { DB });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end('Preview error'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
