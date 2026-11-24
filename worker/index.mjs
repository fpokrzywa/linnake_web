const MAX_BODY_BYTES = 16384;
const allowedInterests = new Set(['demo', 'enterprise', 'local']);
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('invalid_json'); }
}

async function handleInquiry(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST to submit an inquiry.' }, 405, { Allow: 'POST' });
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({ error: 'Please submit your inquiry from the Linnake website.' }, 403);
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send a JSON inquiry.' }, 415);
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return json({ error: 'Your inquiry is too large. Please shorten it.' }, 413);
  let data;
  try { data = await readJson(request); }
  catch (error) { return json({ error: error.message === 'too_large' ? 'Your inquiry is too large. Please shorten it.' : 'The request could not be read. Please try again.' }, error.message === 'too_large' ? 413 : 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Please complete the inquiry form.' }, 400);
  if (data.website) return json({ error: 'Unable to accept this inquiry.' }, 400);
  if (typeof data.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId)) return json({ error: 'Please refresh the page and try again.' }, 400);
  const limits = { name: 100, email: 200, company: 150, message: 3000 };
  const fields = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof data[key] !== 'string') return json({ error: `Please enter a valid ${key}.` }, 400);
    fields[key] = data[key].trim();
    if ((key !== 'company' && !fields[key]) || fields[key].length > limit || fields[key].includes('\0')) return json({ error: `Please check the ${key} field (maximum ${limit} characters).` }, 400);
  }
  fields.email = fields.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (!allowedInterests.has(data.interest)) return json({ error: 'Please choose a valid inquiry topic.' }, 400);
  if (!env.DB) return json({ error: 'Submissions are temporarily unavailable. Your message has not been confirmed. Please try again shortly.' }, 503);
  const fingerprint = JSON.stringify([fields.name, fields.email, fields.company, data.interest, fields.message]);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const receipt = () => json({ ok: true, reference: data.requestId }, 201);
  try {
    const existing = await env.DB.prepare('SELECT request_hash FROM inquiries WHERE id = ?').bind(data.requestId).first();
    if (existing) return existing.request_hash === hash ? receipt() : json({ error: 'This submission reference is already in use. Please refresh the page before submitting a new inquiry.' }, 409);
    const now = Date.now();
    // The cap and insert execute in one statement, so concurrent requests cannot bypass the limit.
    const result = await env.DB.prepare(`INSERT INTO inquiries (id, request_hash, name, email, company, interest, message, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM inquiries WHERE email = ? AND created_at > ?) < 5
      ON CONFLICT(id) DO NOTHING`).bind(data.requestId, hash, fields.name, fields.email, fields.company, data.interest, fields.message, now, fields.email, now - 3600000).run();
    if (!result.success) throw new Error('storage_failed');
    if (result.meta.changes === 1) return receipt();
    const concurrent = await env.DB.prepare('SELECT request_hash FROM inquiries WHERE id = ?').bind(data.requestId).first();
    if (concurrent) return concurrent.request_hash === hash ? receipt() : json({ error: 'This submission reference is already in use. Please refresh and try again.' }, 409);
    return json({ error: 'Too many inquiries from this email address. Please try again in an hour.' }, 429, { 'Retry-After': '3600' });
  } catch {
    // Never log inquiry contents or return database internals.
    return json({ error: 'We couldn’t confirm your submission. Your text is still here; please try again.' }, 503);
  }
}

export function createWorker(assets = {}) {
  return {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (path === '/api/inquiries') return handleInquiry(request, env);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      const asset = assets[path === '/' ? '/index.html' : path];
      if (!asset) return new Response('Not found', { status: 404 });
      const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), char => char.charCodeAt(0));
      return new Response(body, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
    }
  };
}
export default createWorker();
