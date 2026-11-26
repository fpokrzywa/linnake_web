import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/index.mjs';
import { localDb } from '../scripts/local-db.mjs';

const worker = createWorker();
const origin = 'https://linnake.example';
const payload = (changes = {}) => ({
  requestId: crypto.randomUUID(),
  firstName: 'Test',
  email: 'Test@example.com',
  companySize: '51–250',
  useCase: 'Review incoming invoices for missing details.',
  hardware: 'yes',
  website: '',
  ...changes,
});
const request = (body, changes = {}) => new Request(`${origin}/api/readiness`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  ...changes,
});

test('computes a bounded score and persists each answer and its points before returning', async t => {
  const { DB, sqlite } = localDb();
  t.after(() => sqlite.close());
  const full = payload({ score: 7 });
  const cases = [
    [full, 100, { size: 20, task: 45, hardware: 35 }],
    [payload({ companySize: '1,000+', useCase: 'Automation', hardware: 'no' }), 0, { size: 0, task: 0, hardware: 0 }],
    [payload({ companySize: '1–10', useCase: 'Invoice handling', hardware: 'unsure' }), 45, { size: 10, task: 20, hardware: 15 }],
  ];
  for (const [body, score, points] of cases) {
    const response = await worker.fetch(request(body), { DB });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.score, score);
    assert.deepEqual(result.points, points);
    assert.ok(result.meaning);
    const row = sqlite.prepare('SELECT * FROM readiness_leads WHERE id = ?').get(body.requestId);
    assert.equal(row.score, score);
    assert.equal(row.email, 'test@example.com');
    assert.equal(row.status, 'new');
    assert.equal(row.use_case, body.useCase);
    assert.equal(row.hardware, body.hardware);
  }
});

test('rejects invalid or automated submissions and fails safely when the database is unavailable', async t => {
  const { DB, sqlite } = localDb();
  t.after(() => sqlite.close());
  for (const change of [{ firstName: ' ' }, { email: 'invalid' }, { companySize: 'bad' }, { useCase: 'x'.repeat(281) }, { hardware: 'bad' }, { website: 'bot' }]) {
    assert.equal((await worker.fetch(request(payload(change)), { DB })).status, 400);
  }
  assert.equal((await worker.fetch(request(payload(), { headers: { Origin: 'https://other.example' } }), { DB })).status, 403);
  assert.equal((await worker.fetch(request(payload()), {})).status, 503);
  assert.equal((await worker.fetch(new Request(`${origin}/api/readiness`), { DB })).status, 405);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM readiness_leads').get().count, 0);
});

test('rate limits a single email and returns the original score for concurrent retries', async t => {
  const { DB, sqlite } = localDb();
  t.after(() => sqlite.close());
  const body = payload();
  const [first, duplicate] = await Promise.all([
    worker.fetch(request(body), { DB }),
    worker.fetch(request(body), { DB }),
  ]);
  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 201);
  assert.deepEqual(await first.json(), await duplicate.json());
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM readiness_leads').get().count, 1);
  assert.equal((await worker.fetch(request({ ...body, hardware: 'no' }), { DB })).status, 409);
  for (let i = 0; i < 4; i++) assert.equal((await worker.fetch(request(payload()), { DB })).status, 201);
  assert.equal((await worker.fetch(request(payload()), { DB })).status, 429);
  assert.equal((await worker.fetch(request(body), { DB })).status, 201);
});
