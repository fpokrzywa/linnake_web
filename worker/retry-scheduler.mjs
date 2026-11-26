// The queue carries a wake-up signal only. Answers and email addresses stay in the Site.
const retryOrigin = 'https://linnake-ai-platform.fpokrzywa.chatgpt.site';
const retryPath = '/api/internal/retry-scorecards';
const retryMinutes = [5, 10, 15];
const encoder = new TextEncoder();

async function retrySignature(token, body) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('linnake-scorecard-wakeup:' + body));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function scheduleRetries(env, requestId, publish = fetch) {
  if (!env.QSTASH_TOKEN) throw new Error('Retry queue is not configured.');
  const queue = new URL(env.QSTASH_URL || 'https://qstash.upstash.io');
  if (queue.protocol !== 'https:' || !/^qstash(?:-[a-z0-9-]+)?\.upstash\.io$/.test(queue.hostname)) {
    throw new Error('Invalid retry queue URL.');
  }
  const created = Date.now();
  await Promise.all(retryMinutes.map(async minutes => {
    const body = JSON.stringify({ requestId, due: created + minutes * 60_000 });
    const signature = await retrySignature(env.QSTASH_TOKEN, body);
    const response = await publish(queue.origin + '/v2/publish/' + retryOrigin + retryPath, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.QSTASH_TOKEN,
        'Content-Type': 'application/json',
        'Upstash-Delay': minutes + 'm',
        'Upstash-Deduplication-Id': 'scorecard-' + requestId + '-' + minutes,
        'Upstash-Forward-X-Linnake-Retry': signature,
      },
      body,
    });
    if (!response.ok) throw new Error('Retry queue returned HTTP ' + response.status);
  }));
}

export async function handleRetryTick(request, env, retryDue) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const supplied = request.headers.get('X-Linnake-Retry');
  if (!env.QSTASH_TOKEN || !/^[\da-f]{64}$/.test(supplied || '')) return new Response(null, { status: 403 });
  const body = await request.text();
  if (body.length > 256) return new Response(null, { status: 413 });
  const expected = await retrySignature(env.QSTASH_TOKEN, body);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch) return new Response(null, { status: 403 });
  const { due } = JSON.parse(body);
  if (!Number.isFinite(due) || Date.now() < due - 5000 || Date.now() > due + 86_400_000) return new Response(null, { status: 403 });
  await retryDue(env);
  return new Response(null, { status: 204 });
}
