// Fill these only with the approved quote and the founder's actual booking URL.
const settings = {
  founderBio: '',
  hostedRate: '',
  approvedClientQuote: '', // [BETA_CLIENT_QUOTE] — [NAME, TITLE, COMPANY]
  bookingUrl: '', // [BOOKING_LINK]
};

const usable = value => value.trim() && !/[\[\]]/.test(value);
const founder = document.getElementById('founder');
if (founder && usable(settings.founderBio)) {
  founder.textContent = settings.founderBio;
  founder.hidden = false;
}
if (document.getElementById('readiness-proof') && usable(settings.approvedClientQuote)) {
  document.getElementById('readiness-proof').textContent = settings.approvedClientQuote.trim();
}
const directForm = document.getElementById('readiness-form');
if (directForm) initializeForm();
let modal;
let opener;
let loading;
async function openScore(trigger) {
  opener = trigger;
  if (!modal) {
    loading ??= fetch('/score').then(async response => {
      if (!response.ok) throw Error();
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const card = page.querySelector('.readiness-card');
      if (!card) throw Error();
      const dialog = document.createElement('dialog');
      dialog.className = 'score-dialog';
      dialog.setAttribute('aria-label','Get your Private AI Readiness Score');
      const close = document.createElement('button');
      close.className = 'close-dialog';
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label','Close');
      dialog.append(close, card);
      document.body.append(dialog);
      close.onclick = () => dialog.close();
      dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
      dialog.onkeydown = event => {
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button, input, select, a[href], summary')].filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      dialog.onclose = () => { document.body.classList.remove('modal-open'); opener?.focus(); };
      initializeForm();
      modal = dialog;
    });
    try { await loading; } catch { location.assign('/score'); return; }
  }
  if (typeof modal.showModal !== 'function') { location.assign('/score'); return; }
  if (!modal.open) modal.showModal();
  document.body.classList.add('modal-open');
  modal.querySelector('#readiness-result:not([hidden]) h2, fieldset:not([hidden]) input, fieldset:not([hidden]) select')?.focus();
}
document.querySelectorAll('a[href="/score"]').forEach(link => link.addEventListener('click',event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !window.HTMLDialogElement) return;
  event.preventDefault();
  openScore(link);
}));
if (!directForm && location.hash === '#readiness') openScore(document.querySelector('a[href="/score"]'));

function initializeForm() {
const form = document.getElementById('readiness-form');
const contact = document.getElementById('lead-step');
const business = document.getElementById('business-step');
const errorMessage = document.getElementById('readiness-error');
const result = document.getElementById('readiness-result');
const scoreHeading = document.getElementById('score-heading');
let previousPayload;
let requestId;

settings.bookingUrl = form.dataset.booking || settings.bookingUrl;
if (settings.bookingUrl.startsWith('https://')) {
  document.getElementById('booking-link').href = settings.bookingUrl;
  document.getElementById('booking-invite').hidden = false;
}

function showBusinessStep(show) {
  contact.hidden = show;
  business.hidden = !show;
  business.disabled = !show;
  contact.disabled = show;
  errorMessage.textContent = '';
  const nextInput = show ? form.elements.companySize : form.elements.firstName;
  nextInput.focus({ preventScroll: true });
  const card = form.parentElement;
  if (card.getBoundingClientRect().bottom > window.innerHeight) {
    card.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}

document.getElementById('back-to-contact').addEventListener('click', () => showBusinessStep(false));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!contact.hidden) {
    if (!form.elements.firstName.value.trim()) {
      errorMessage.textContent = 'Enter your first name.';
      form.elements.firstName.focus();
      return;
    }
    showBusinessStep(true);
    return;
  }

  const fields = form.elements;
  const payload = {
    firstName: fields.firstName.value.trim(),
    email: fields.email.value.trim(),
    companySize: fields.companySize.value,
    useCase: fields.useCase.value.trim(),
    hardware: fields.hardware.value,
    website: fields.website.value,
  };
  if (!payload.useCase) {
    errorMessage.textContent = 'Enter the task you want AI to handle.';
    fields.useCase.focus();
    return;
  }
  const fingerprint = JSON.stringify(payload);
  if (fingerprint !== previousPayload) {
    previousPayload = fingerprint;
    requestId = crypto.randomUUID();
  }
  errorMessage.textContent = '';
  business.disabled = true;
  form.setAttribute('aria-busy', 'true');
  const submit = event.submitter ?? business.querySelector('[type="submit"]');
  submit.textContent = 'Getting your score…';

  try {
    const response = await fetch('/api/readiness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, requestId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (!Number.isInteger(data.score) || !data.points) throw new Error();
    scoreHeading.textContent = `${data.score}/100`;
    document.getElementById('score-meaning').textContent = data.meaning;
    document.getElementById('hosted-result').hidden = payload.hardware !== 'no';
    document.getElementById('score-breakdown').textContent = `Company size: ${data.points.size}/20. Task: ${data.points.task}/45. Hardware: ${data.points.hardware}/35.`;
    form.hidden = true;
    result.hidden = false;
    if (!form.closest('dialog') || form.closest('dialog').open) scoreHeading.focus();
  } catch (error) {
    errorMessage.textContent = error instanceof SyntaxError || !error.message
      ? 'Your score couldn’t load. Your answers are still here. Try again.'
      : error instanceof TypeError
        ? 'Check your connection and try again. Your answers are still here.'
        : error.message;
  } finally {
    business.disabled = false;
    form.removeAttribute('aria-busy');
    submit.textContent = 'Get My Readiness Score';
  }
});

}
