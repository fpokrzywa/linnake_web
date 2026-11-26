import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDb } from '../scripts/local-db.mjs';
import { deliverScorecard, renderScorecard } from '../worker/mail.mjs';

const row = { first_name: 'Casey', email: 'lead@example.org', company_size: '11–50', use_case: ' Review   invoices & reports. ', hardware: 'yes', score: 100 };
function fixture(t) {
  const { DB, sqlite } = localDb();
  t.after(()=>sqlite.close());
  const id = crypto.randomUUID();
  sqlite.prepare('INSERT INTO readiness_leads (id,request_hash,first_name,email,company_size,use_case,hardware,score,size_points,task_points,hardware_points,created_at,mail_due_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,'hash',...Object.values(row),20,45,35,Date.now(),Date.now());
  const env = { DB, EMAIL_API_KEY:'test', SENDER_EMAIL:'scores@example.org', OWNER_EMAIL:'owner@example.org' };
  return { env, sqlite, id };
}

test('templates select the size and hardware copy, escape HTML and omit blank booking URLs', () => {
  for (const [hardware, expected] of [['yes','on your own hardware'],['no','No hardware yet?'],['unsure',"machine's GPU"]]) {
    const card = renderScorecard({...row,hardware});
    assert.ok(card.text.includes(expected));
    assert.ok(card.text.includes('Drafting customer replies'));
    assert.ok(card.html.includes('Review invoices &amp; reports.'));
    assert.ok(!card.text.includes('walk through it:'));
  }
  const card = renderScorecard({...row,company_size:'1,000+'},{BOOKING_URL:'https://example.org/booking'});
  assert.ok(card.text.includes('First-pass review'));
  assert.ok(card.text.includes('https://example.org/booking'));
});

test('concurrent deliveries send one copy per role, and test mode routes both to the owner',async t=>{
  const { env,sqlite,id }=fixture(t);
  env.EMAIL_TEST_MODE='true';
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push(init);return Response.json({id:'ok'});});
  await Promise.all([deliverScorecard(env,id),deliverScorecard(env,id)]);
  await deliverScorecard(env,id);
  assert.equal(calls.length,2);
  assert.equal(new Set(calls.map(x=>x.headers['Idempotency-Key'])).size,2);
  for(const call of calls) assert.deepEqual(JSON.parse(call.body).to,['owner@example.org']);
  const saved=sqlite.prepare('SELECT * FROM readiness_leads WHERE id=?').get(id);
  assert.equal(saved.scorecard_status,'sent');
  assert.ok(saved.scorecard_sent_at && saved.owner_sent_at);
  assert.equal(saved.mail_due_at,null);
});

test('three retries after the first failure end in a failed lead record and one owner notification',async t=>{
  const { env,sqlite,id }=fixture(t);
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    const body=JSON.parse(init.body);
    requests.push(body);
    return body.to[0]==='owner@example.org' ? Response.json({id:'owner'}) : new Response('',{status:503});
  });
  for(let attempt=0;attempt<4;attempt++){
    await deliverScorecard(env,id);
    if(attempt<3) sqlite.prepare('UPDATE readiness_leads SET mail_due_at=0 WHERE id=?').run(id);
  }
  const saved=sqlite.prepare('SELECT * FROM readiness_leads WHERE id=?').get(id);
  assert.equal(saved.scorecard_status,'failed');
  assert.equal(saved.mail_attempts,4);
  assert.equal(saved.scorecard_sent_at,null);
  assert.equal(requests.length,5);
  assert.ok(requests.at(-1).text.includes('Scorecard: failed'));
  assert.ok(requests.at(-1).text.includes('Delivery error: Resend HTTP 503'));
});
