import { handleRetryTick } from './retry-scheduler.mjs';
import { deliverScorecard, scoreMeaning, retryDue } from './mail.mjs';
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

const companyPoints = new Map([
  ['1–10', 10], ['11–50', 20], ['51–250', 20], ['251–1,000', 15], ['1,000+', 0],
]);
const hardwarePoints = new Map([['yes', 35], ['no', 0], ['unsure', 15]]);
const workVerbs = /\b(?:answer|automate|categorize|check|classify|compare|draft|extract|find|flag|forecast|generate|identify|match|monitor|predict|process|read|reconcile|review|route|schedule|search|sort|summarize|track|translate|update|validate|write)(?:s|d|ed|ing)?\b/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function scoreTask(useCase) {
  const words = new Set(useCase.toLowerCase().match(/\p{L}[\p{L}\p{N}]*/gu) ?? []);
  if (words.size < 2) return 0;
  return words.size >= 5 && workVerbs.test(useCase) ? 45 : 20;
}

async function handleReadiness(request, env) {
  if (request.method !== 'POST') return json({ error: 'Submit the readiness form to get your score.' }, 405, { Allow: 'POST' });
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({ error: 'Please submit from the Linnake website.' }, 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ error: 'Reload the page and try again.' }, 415);
  }
  const tooLarge = () => json({ error: 'Your answers are too long. Shorten the task and try again.' }, 413);
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return tooLarge();
  let data;
  try { data = await readJson(request); }
  catch (error) { return error.message === 'too_large' ? tooLarge() : json({ error: 'We couldn’t read your answers. Try again.' }, 400); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.website) {
    return json({ error: 'We couldn’t accept this submission. Reload the page and try again.' }, 400);
  }
  if (typeof data.requestId !== 'string' || !uuid.test(data.requestId)) return json({ error: 'Reload the page and try again.' }, 400);
  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const useCase = typeof data.useCase === 'string' ? data.useCase.trim() : '';
  if (!firstName || firstName.length > 100 || firstName.includes('\0')) return json({ error: 'Enter a first name of 100 characters or fewer.' }, 400);
  if (email.length > 200 || !/^[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+\.[^\s@\x00-\x1f]+$/.test(email)) return json({ error: 'Enter a valid work email.' }, 400);
  if (!companyPoints.has(data.companySize)) return json({ error: 'Select your company size.' }, 400);
  if (!useCase || useCase.length > 280 || useCase.includes('\0')) return json({ error: 'Describe one task in 280 characters or fewer.' }, 400);
  if (!hardwarePoints.has(data.hardware)) return json({ error: 'Select an answer for your hardware.' }, 400);
  if (!env.DB) return json({ error: 'Your score is temporarily unavailable. Try again shortly.' }, 503);

  const { requestId, companySize, hardware } = data;
  const points = { size: companyPoints.get(companySize), task: scoreTask(useCase), hardware: hardwarePoints.get(hardware) };
  const score = points.size + points.task + points.hardware;
  const fingerprint = JSON.stringify([firstName, email, companySize, useCase, hardware]);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const receipt = (score, points) => json({ score, points, meaning: scoreMeaning(score, hardware) }, 201);
  const find = () => env.DB.prepare('SELECT request_hash, score, size_points, task_points, hardware_points FROM readiness_leads WHERE id = ?').bind(requestId).first();
  const retry = row => row.request_hash === hash
    ? receipt(row.score, { size: row.size_points, task: row.task_points, hardware: row.hardware_points })
    : json({ error: 'This submission reference is already in use. Reload the page and try again.' }, 409);

  try {
    const existing = await find();
    if (existing) return retry(existing);
    const now = Date.now();
    const insert = await env.DB.prepare(`INSERT INTO readiness_leads
      (id, request_hash, first_name, email, company_size, use_case, hardware, score, size_points, task_points, hardware_points, created_at, mail_due_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM readiness_leads WHERE email = ? AND created_at > ?) < 5
      ON CONFLICT(id) DO NOTHING`).bind(requestId, hash, firstName, email, companySize, useCase, hardware, score, points.size, points.task, points.hardware, now, now, email, now - 3600000).run();
    if (!insert.success) throw new Error('storage_failed');
    if (insert.meta.changes === 1) {
      try { await deliverScorecard(env, requestId); }
      catch { console.error('Scorecard delivery pending.'); }
      return receipt(score, points);
    }
    const concurrent = await find();
    if (concurrent) return retry(concurrent);
    return json({ error: 'Too many submissions from this email. Try again in an hour.' }, 429, { 'Retry-After': '3600' });
  } catch {
    return json({ error: 'We couldn’t save your answers. They’re still here. Try again.' }, 503);
  }
}

function deliveryCopy(html, env) {
  if (env.EMAIL_API_KEY && env.SENDER_EMAIL && env.OWNER_EMAIL && !/^(true|1)$/i.test(env.EMAIL_TEST_MODE || '')) return html;
  return html.replaceAll('Your full scorecard hits your inbox in minutes.', 'Scorecard email is currently unavailable.');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
}

async function scorePage(request, env, asset) {
  const body = new TextDecoder().decode(Uint8Array.from(atob(asset.data), ch => ch.charCodeAt(0)));
  const booking = /^https:\/\//.test(env.BOOKING_URL || '') ? escapeHtml(env.BOOKING_URL) : '';
  const page = body.replace('id="readiness-form"', 'id="readiness-form" data-booking="' + booking + '"');
  function html(content, status = 200) {
    return new Response(request.method === 'HEAD' ? null : deliveryCopy(content, env), {status, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin'}});
  }
  if (request.method === 'GET' || request.method === 'HEAD') return html(page.replace('REQUEST_ID',crypto.randomUUID()));
  if (request.method !== 'POST') return html('Method not allowed',405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return html('Please submit from the Linnake website.',403);
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return html('Invalid form submission.',415);
  const reader = request.body?.getReader();
  if (!reader) return html('Empty form.',400);
  const decoder = new TextDecoder();
  let input = '', size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); return html('Your answers are too long.',413); }
    input += decoder.decode(chunk.value,{stream:true});
  }
  const fields = Object.fromEntries(new URLSearchParams(input + decoder.decode()));
  const replaceForm = content => page.replace(/<form id="readiness-form"[\s\S]*?<\/form>/, () => content);
  const fail = (message,status) => html(replaceForm('<p role="alert">' + escapeHtml(message) + '</p><a class="text-link" href="/score">Return to the form</a>'),status);
  if (!uuid.test(fields.requestId) || fields.website) return fail('Please start the form again.',400);
  if (!fields.companySize && !('hardware' in fields)) {
    if (!fields.firstName?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return fail('Enter your first name and a valid work email.',400);
    const hidden = ['firstName','email','requestId','website'].map(key => '<input type="hidden" name="' + key + '" value="' + escapeHtml(fields[key]) + '">').join('');
    const step = page.match(/<fieldset id="business-step"[\s\S]*?<\/fieldset>/)[0].replace(' hidden disabled','').replace(/<button[^>]*id="back-to-contact"[^>]*>Back<\/button>/,'');
    return html(replaceForm('<form method="post" action="/score">' + hidden + step + '</form>'));
  }
  const response = await handleReadiness(new Request(request.url,{method:'POST',headers:{Origin:request.headers.get('Origin'),'Content-Type':'application/json'},body:JSON.stringify(fields)}),env);
  const data = await response.json();
  if (!response.ok) return fail(data.error,response.status);
  const p = data.points;
  const hosted = fields.hardware === 'no' ? '<p>No hardware yet? Hosted GPU is an option. Billed by the second.</p>' : '';
  const next = booking ? ' Want it walked through live? <a class="text-link" href="' + booking + '">Grab 20 minutes.</a>' : '';
  return html(replaceForm('<h2>' + data.score + '/100</h2><p>' + escapeHtml(data.meaning) + '</p>' + hosted + '<details><summary>How we scored it</summary><p>Company size: ' + p.size + '/20. Task: ' + p.task + '/45. Hardware: ' + p.hardware + '/35.</p></details><p>Your full scorecard hits your inbox in minutes.' + next + '</p>'));
}

const pageRoutes = {
  '/': '/index.html',
  '/score': '/score.html',
  '/security': '/security.html',
  '/pricing': '/pricing.html',
  '/product': '/product.html',
  '/privacy': '/privacy.html',
  '/terms': '/terms.html',
};

export function createWorker(assets = {}) {
  return {
    async fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (path === '/api/internal/retry-scorecards') return handleRetryTick(request, env, retryDue);
      if (['/score','/score.html'].includes(path.replace(/\/$/, '')) && assets['/score.html']) return scorePage(request, env, assets['/score.html']);
      if (path === '/api/readiness') return handleReadiness(request, env);
      if (path === '/api/inquiries') return handleInquiry(request, env);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      const asset = assets[pageRoutes[path.replace(/(.+)\/$/, '$1')] ?? path];
      if (!asset) return new Response('Not found', { status: 404 });
      const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), char => char.charCodeAt(0));
      const output = body && (path === '/' || path === '/index.html') ? deliveryCopy(new TextDecoder().decode(body), env) : body;
      return new Response(output, { headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' } });
    }
  };
}
export default createWorker();
