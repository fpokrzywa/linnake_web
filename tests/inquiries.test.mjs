import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/index.mjs';
import { localDb } from '../scripts/local-db.mjs';
const worker = createWorker();
const origin = 'https://linnake.example';
const payload = (changes = {}) => ({ requestId: crypto.randomUUID(), name: 'Test Builder', email: 'builder@example.com', company: 'Test team', interest: 'demo', message: 'Discuss a local model for our workflow.', website: '', ...changes });
const request = (body, changes = {}) => new Request(`${origin}/api/inquiries`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...changes });

test('demo and enterprise inquiries persist; retries return one record and a stable receipt', async () => {
  const { DB, sqlite } = localDb();
  try {
    for (const interest of ['demo', 'enterprise']) {
      const body = payload({ interest, email: ` ${interest.toUpperCase()}@example.com ` });
      const first = await worker.fetch(request(body), { DB });
      assert.equal(first.status, 201); assert.equal((await first.json()).reference, body.requestId);
      const again = await worker.fetch(request(body), { DB }); assert.equal(again.status, 201);
      const saved = sqlite.prepare('SELECT * FROM inquiries WHERE id = ?').get(body.requestId);
      assert.equal(saved.interest, interest); assert.equal(saved.email, `${interest}@example.com`); assert.equal(saved.status, 'new');
      assert.equal(saved.message, body.message);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n, 2);
  } finally { sqlite.close(); }
});
test('reject invalid fields, oversize bodies, cross-site requests, and honeypots without storing them', async () => {
  const { DB, sqlite } = localDb();
  try {
    for (const patch of [{ name: ' ' }, { email: 'invalid' }, { interest: 'admin' }, { company: 123 }, { message: 'a'.repeat(3001) }, { website: 'bot.example' }, { requestId: 'bad' }]) assert.equal((await worker.fetch(request(payload(patch)), { DB })).status, 400);
    assert.equal((await worker.fetch(request(payload(), { headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' } }), { DB })).status, 403);
    assert.equal((await worker.fetch(request(payload(), { body: '{broken' }), { DB })).status, 400);
    assert.equal((await worker.fetch(request(payload({ message: 'x'.repeat(20000) })), { DB })).status, 413);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n, 0);
  } finally { sqlite.close(); }
});
test('throttles new submissions while allowing safe retries; rejects key reuse with changed content', async () => {
  const { DB, sqlite } = localDb();
  try {
    const first = payload();
    assert.equal((await worker.fetch(request(first), { DB })).status, 201);
    for (let i = 0; i < 4; i++) assert.equal((await worker.fetch(request(payload()), { DB })).status, 201);
    assert.equal((await worker.fetch(request(payload()), { DB })).status, 429);
    assert.equal((await worker.fetch(request(first), { DB })).status, 201);
    assert.equal((await worker.fetch(request({ ...first, message: 'Changed request' }), { DB })).status, 409);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n, 5);
  } finally { sqlite.close(); }
});
test('database errors never return success or leak internals, and no endpoint lists submissions', async () => {
  assert.equal((await worker.fetch(request(payload()), {})).status, 503);
  const response = await worker.fetch(request(payload()), { DB: { prepare() { throw new Error('private database detail'); } } });
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private database detail'));
  assert.equal((await worker.fetch(new Request(`${origin}/api/inquiries`), {})).status, 405);
  assert.equal((await worker.fetch(new Request(`${origin}/api/inquiries/anything`), {})).status, 404);
});
