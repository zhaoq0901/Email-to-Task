const BUTTON_ID = 'create-calendar-task-button';
const POLL_INTERVAL_MS = 1200;
let watcherInterval;
let observer;

function createButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.textContent = 'Create a Task on Calendar';
  btn.style.cssText = [
    'position: fixed',
    'top: 100px',
    'right: 24px',
    'z-index: 999999',
    'padding: 12px 16px',
    'background: #1a73e8',
    'color: white',
    'border: none',
    'border-radius: 24px',
    'font-size: 14px',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.18)',
    'cursor: pointer',
    'font-family: Roboto, Arial, sans-serif'
  ].join(';');
  btn.addEventListener('click', handleButtonClick);
  document.body.appendChild(btn);
}

function removeButton() {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) btn.remove();
}

function emailViewDetected() {
  const subject = document.querySelector('h2.hP, .hP');
  const body = document.querySelector('div.a3s, div[role="listitem"]');
  return !!(subject && body);
}

function checkForEmailView() {
  if (emailViewDetected()) {
    createButton();
  } else {
    removeButton();
  }
}

function getEmailContent() {
  const subject = document.querySelector('h2.hP, .hP')?.innerText?.trim() || '';
  const bodyEl = document.querySelector('div.a3s, div[role="listitem"]');
  const body = bodyEl ? bodyEl.innerText.trim() : '';
  return {
    subject,
    body,
    url: window.location.href
  };
}

function handleButtonClick() {
  const email = getEmailContent();
  if (!email.subject && !email.body) {
    alert('Cannot read the open email. Please open a single email thread and try again.');
    return;
  }

  chrome.runtime.sendMessage({
    type: 'generateCalendarLink',
    payload: email
  }, response => {
    if (chrome.runtime.lastError) {
      alert('Extension error: ' + chrome.runtime.lastError.message);
      return;
    }
    if (response?.error) {
      alert('AI processing error: ' + response.error);
      return;
    }
  });
}

function attachObserver() {
  if (observer) return;
  observer = new MutationObserver(checkForEmailView);
  observer.observe(document.body, { childList: true, subtree: true });
}

checkForEmailView();
attachObserver();
watcherInterval = setInterval(checkForEmailView, POLL_INTERVAL_MS);
