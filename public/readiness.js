// Fill these only with the approved quote and the founder's actual booking URL.
const settings = {
  founderBio: '',
  hostedRate: '',
  approvedClientQuote: '', // [BETA_CLIENT_QUOTE] — [NAME, TITLE, COMPANY]
  bookingUrl: '', // [BOOKING_LINK]
};

const usable = value => value.trim() && !/[\[\]]/.test(value);
const price = document.getElementById('hosted-price');
if (price && usable(settings.hostedRate)) price.textContent = 'No hardware yet? Hosted GPU, billed per second of use: ' + settings.hostedRate;
if (document.getElementById('readiness-form')) initializeForm();

function initializeForm() {
const founder = document.getElementById('founder');
if (usable(settings.founderBio)) {
  founder.textContent = settings.founderBio;
  founder.hidden = false;
}
const form = document.getElementById('readiness-form');
const contact = document.getElementById('lead-step');
const business = document.getElementById('business-step');
const errorMessage = document.getElementById('readiness-error');
const result = document.getElementById('readiness-result');
const scoreHeading = document.getElementById('score-heading');
let previousPayload;
let requestId;

if (usable(settings.approvedClientQuote)) {
  document.getElementById('readiness-proof').textContent = settings.approvedClientQuote.trim();
}
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
    scoreHeading.focus();
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
