'use strict';

// Verified existing team contact. Replace when a dedicated Linnake destination is supplied.
const CONTACT_EMAIL = 'contact@modelforge.studio';
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
let lastTrigger;
function openDialog(dialog, trigger) { lastTrigger = trigger; dialog.showModal(); document.body.classList.add('modal-open'); }
document.querySelectorAll('[data-inquiry]').forEach(button => button.addEventListener('click', () => {
  form.elements.interest.value = button.dataset.inquiry;
  document.getElementById('inquiry-title').textContent = button.dataset.inquiry === 'enterprise' ? 'AI for your organization.' : 'Let’s build on your idea.';
  status.textContent = '';
  openDialog(inquiryDialog, button);
}));
document.getElementById('privacy-button').addEventListener('click', event => openDialog(privacyDialog, event.currentTarget));
[inquiryDialog, privacyDialog].forEach(dialog => {
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); if (lastTrigger) lastTrigger.focus(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
});
function inquiryText() {
  const values = new FormData(form);
  const interest = form.elements.interest.selectedOptions[0].textContent;
  return { subject: `Linnake inquiry: ${interest}`, body: `Hello Linnake team,\n\nI would like to discuss: ${interest}.\n\nName: ${values.get('name').trim()}\nEmail: ${values.get('email').trim()}\nCompany or project: ${values.get('company').trim() || 'Not provided'}\n\n${values.get('message').trim()}\n\nThank you.` };
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const { subject, body } = inquiryText();
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  status.textContent = 'Email draft requested. Send it from your email app to contact the team. If no app opened, use Copy inquiry and email the address above.';
});
document.getElementById('copy-inquiry').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  const { subject, body } = inquiryText();
  try { await navigator.clipboard.writeText(`To: ${CONTACT_EMAIL}\nSubject: ${subject}\n\n${body}`); status.textContent = 'Inquiry copied. Paste it into your email app and send it to the team.'; }
  catch { status.textContent = 'Clipboard access is unavailable. Use Open email draft, or select and copy your message manually.'; }
});
