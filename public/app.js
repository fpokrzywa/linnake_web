'use strict';

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() { navigation.classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); }
menuButton.addEventListener('click', () => { const open = menuButton.getAttribute('aria-expanded') !== 'true'; menuButton.setAttribute('aria-expanded', String(open)); navigation.classList.toggle('is-open', open); });
navigation.querySelectorAll('a, button').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); } });
window.matchMedia('(min-width: 851px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab, focus = false) {
  tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; document.getElementById(item.getAttribute('aria-controls')).hidden = !selected; });
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); activateTab(tabs[next], true); }
  });
});

const inquiryDialog = document.getElementById('inquiry-dialog');
const privacyDialog = document.getElementById('privacy-dialog');
const form = document.getElementById('inquiry-form');
const status = document.getElementById('inquiry-status');
const submitButton = document.getElementById('submit-inquiry');
let submitting = false;
let submitted = false;
let retryPayload = null;
function setFormDisabled(disabled) { form.querySelectorAll('input,select,textarea,button').forEach(field => { field.disabled = disabled; }); }
let lastTrigger;
function openDialog(dialog, trigger) { lastTrigger = trigger; dialog.showModal(); document.body.classList.add('modal-open'); }
document.querySelectorAll('[data-inquiry]').forEach(button => button.addEventListener('click', () => {
  if (!submitting) {
    if (submitted) { form.reset(); submitted = false; retryPayload = null; setFormDisabled(false); delete form.dataset.submitted; }
    form.elements.interest.value = button.dataset.inquiry;
    document.getElementById('inquiry-title').textContent = button.dataset.inquiry === 'enterprise' ? 'AI for your organization.' : 'Let’s build on your idea.';
    status.textContent = '';
    status.removeAttribute('data-state');
    submitButton.textContent = 'Send inquiry';
  }
  openDialog(inquiryDialog, button);
}));
document.getElementById('privacy-button').addEventListener('click', event => openDialog(privacyDialog, event.currentTarget));
[inquiryDialog, privacyDialog].forEach(dialog => {
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); if (lastTrigger) lastTrigger.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || submitted || !form.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  const fingerprint = JSON.stringify(fields);
  if (!retryPayload || retryPayload.fingerprint !== fingerprint) retryPayload = { fingerprint, requestId: crypto.randomUUID() };
  const payload = { ...fields, requestId: retryPayload.requestId };
  submitting = true;
  setFormDisabled(true);
  form.setAttribute('aria-busy', 'true');
  submitButton.textContent = 'Sending…';
  status.dataset.state = 'pending';
  status.textContent = 'Submitting your inquiry…';
  try {
    const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result.reference) throw new Error(result?.error || 'We couldn’t confirm your submission. Please try again.');
    submitted = true;
    form.reset();
    form.dataset.submitted = 'true';
    submitButton.textContent = 'Inquiry received';
    status.dataset.state = 'success';
    status.textContent = `Thank you. Your inquiry has been received. Reference: ${result.reference}. You can close this window.`;
  } catch (error) {
    status.dataset.state = 'error';
    status.textContent = error.name === 'TimeoutError' || error.name === 'TypeError' ? 'The connection was interrupted. Your text is still here. Please try again; retrying will not create a duplicate.' : error.message;
    submitButton.textContent = 'Try again';
  } finally {
    submitting = false;
    form.removeAttribute('aria-busy');
    if (!submitted) setFormDisabled(false);
    status.scrollIntoView({ block: 'nearest' });
  }
});
