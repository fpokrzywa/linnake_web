import { scheduleRetries } from './retry-scheduler.mjs';

export const SCORECARD_CONFIG = {
  starterTasks: {
    small: ['Drafting customer replies from your past emails.', 'Turning internal docs into instant answers for your team.'],
    larger: ['First-pass review of contracts, tickets or reports.', 'Answering staff questions from your policies and procedures.'],
  },
  costRangeText: { yes: '', no: '', unsure: '' },
};

const hardwareAdvice = {
  yes: "You can likely fine-tune and run it on your own hardware. We'll confirm on a call.",
  unsure: "Send us your machine's GPU and memory specs. We'll tell you if it can fine-tune and run a model.",
  no: "No hardware yet? Start on a hosted GPU, billed per second of use, and move to your own hardware later.",
};
const hardwareLabel = { yes: 'Yes', no: 'No', unsure: 'Not sure' };
const deletion = "To request deletion, reply to any email we've sent you.";
const clean = value => String(value).replace(/[\u0000-\u0020\u007f]+/g, ' ').trim();
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export function scoreMeaning(score, hardware) {
  if (hardware === 'yes' && score >= 70) return 'You’re ready to scope a pilot on your own hardware.';
  if (score >= 70) return 'You’re ready to scope a pilot.';
  if (score >= 40) return 'You have a starting point. Confirm the task or hardware first.';
  return 'Define one task and check what it would take to run it.';
}

export function renderScorecard(row, env = {}) {
  const group = ['1–10', '11–50'].includes(row.company_size) ? 'small' : 'larger';
  const tasks = [clean(row.use_case), ...SCORECARD_CONFIG.starterTasks[group]];
  const score = row.score + '/100';
  const meaning = scoreMeaning(row.score, row.hardware);
  const advice = hardwareAdvice[row.hardware];
  const cost = SCORECARD_CONFIG.costRangeText[row.hardware] || "We'll give you a cost range on a 20-minute call.";
  const booking = /^https:\/\/[^\s<>\[\]]+$/i.test(env.BOOKING_URL || '') ? env.BOOKING_URL : '';
  const heading = 'Your first 3 tasks for a fine-tuned model';
  const next = 'Book 20 minutes to walk through it: ';
  const text = [score + ': ' + meaning, heading + '\n' + tasks.map((t,i) => (i+1) + '. ' + t).join('\n'), 'Hardware\n' + advice, 'Rough cost range\n' + cost, booking && next + booking, '© 3C Publications LLC\n' + deletion].filter(Boolean).join('\n\n');
  const html = '<div style="background:#060b12;color:#eef3f9;padding:28px;font:16px/1.5 Segoe UI,Arial,sans-serif"><img src="https://linnake-ai-platform.fpokrzywa.chatgpt.site/assets/linnake-crest.jpg" alt="Linnake" width="72" height="72"><h1 style="color:#9ddaff">' + score + '</h1><p>' + escape(meaning) + '</p><h2>' + heading + '</h2><ol>' + tasks.map(t=>'<li>'+escape(t)+'</li>').join('') + '</ol><h2>Hardware</h2><p>' + escape(advice) + '</p><h2>Rough cost range</h2><p>' + escape(cost) + '</p>' + (booking ? '<p>' + next + '<a style="color:#9ddaff" href="' + escape(booking) + '">' + escape(booking) + '</a></p>' : '') + '<p style="color:#a4b3c5">© 3C Publications LLC<br>' + escape(deletion) + '</p></div>';
  return { subject: 'Your Private AI Readiness Score: ' + score, text, html };
}

function ownerCopy(row, card) {
  const answers = ['First name: ' + clean(row.first_name), 'Work email: ' + row.email, 'Company size: ' + row.company_size, 'Task: ' + clean(row.use_case), 'Hardware: ' + hardwareLabel[row.hardware], 'Scorecard: ' + row.scorecard_status, row.scorecard_error && 'Delivery error: ' + row.scorecard_error].filter(Boolean);
  return {
    subject: 'New lead: ' + clean(row.first_name) + ', ' + row.company_size + ', ' + row.score + '/100',
    text: answers.join('\n') + '\n\n' + card.text,
    html: '<p>' + answers.map(escape).join('<br>') + '</p>' + card.html,
  };
}

async function send(env, row, kind, message) {
  const testMode = /^(true|1)$/i.test(String(env.EMAIL_TEST_MODE || ''));
  const to = testMode || kind === 'owner' ? env.OWNER_EMAIL : row.email;
  if (!env.EMAIL_API_KEY || !env.SENDER_EMAIL || !to) throw Error('Email settings are incomplete');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.EMAIL_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'readiness/' + row.id + '/' + kind },
    body: JSON.stringify({ from: env.SENDER_EMAIL, to: [to], ...message }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error('Resend HTTP ' + response.status);
  if (!(await response.json()).id) throw Error('Resend did not confirm acceptance');
}

const fiveMinutes = 300000;
const leaseDuration = 60000;

export async function deliverScorecard(env, id) {
  const db = env.DB;
  const now = Date.now();
  const lease = crypto.randomUUID();
  const claim = await db.prepare('UPDATE readiness_leads SET mail_due_at=?, mail_lease=? WHERE id=? AND mail_due_at<=?').bind(now + leaseDuration, lease, id, now).run();
  if (!claim.meta.changes) return;
  const row = await db.prepare('SELECT * FROM readiness_leads WHERE id=? AND mail_lease=?').bind(id,lease).first();
  if (!row) return;
  const card = renderScorecard(row, env);
  // Resend retains its idempotency keys for 24 hours. Stop ambiguous replays before then.
  const expired = now - row.created_at >= 23 * 3600000;
  if (!row.scorecard_status) {
    const attempt = row.mail_attempts + 1;
    let error = null;
    try {
      if (expired) throw Error('Delivery window expired');
      await send(env, row, 'lead', card);
    } catch (cause) { error = clean(cause.message).slice(0,160); }
    row.scorecard_status = error ? (attempt >= 4 || expired ? 'failed' : null) : 'sent';
    row.scorecard_error = error;
    const pending = !row.scorecard_status;
    const result = await db.prepare('UPDATE readiness_leads SET scorecard_status=?, scorecard_error=?, scorecard_sent_at=?, mail_attempts=?, mail_due_at=?, mail_lease=? WHERE id=? AND mail_lease=?')
      .bind(row.scorecard_status,error,error ? null : Date.now(),attempt,pending ? row.created_at + attempt * fiveMinutes : now + leaseDuration,pending ? null : lease,id,lease).run();
    if (!result.meta.changes) return;
    if (pending) {
      if (attempt === 1 && env.QSTASH_TOKEN) await scheduleRetries(env, id);
      return;
    }
  }
  const attempt = row.owner_attempts + 1;
  let error = null;
  try {
    if (expired) throw Error('Owner notification window expired');
    await send(env, row, 'owner', ownerCopy(row,card));
  } catch (cause) { error = clean(cause.message).slice(0,160); }
  await db.prepare('UPDATE readiness_leads SET owner_sent_at=?, owner_error=?, owner_attempts=?, mail_due_at=?, mail_lease=NULL WHERE id=? AND mail_lease=?')
    .bind(error ? null : Date.now(),error,attempt,error && attempt < 4 && !expired ? Math.min(now + fiveMinutes, (row.scorecard_sent_at || now) + attempt * fiveMinutes) : null,id,lease).run();
  if (error && attempt === 1 && !expired && env.QSTASH_TOKEN) await scheduleRetries(env, id + '-owner');
}

export async function retryDue(env) {
  const due = await env.DB.prepare('SELECT id FROM readiness_leads WHERE mail_due_at<=? ORDER BY mail_due_at LIMIT 32').bind(Date.now()).all();
  for (let i = 0; i < due.results.length; i += 4) {
    await Promise.all(due.results.slice(i,i+4).map(row => deliverScorecard(env,row.id)));
  }
  return due.results.length;
}
