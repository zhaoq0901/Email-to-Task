const BUTTON_ID = 'gmail-ai-calendar-task-btn';
console.log('Gmail AI Calendar Task content script loaded');

// MESSAGE LISTENER & NOTIFICATION HANDLING
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showSuccessToast") {
    // 1. Alert the user with an obvious modal notification
    alert(`✓ Task Created Successfully:\n\n"${message.taskTitle}"`);
    
    // 2. Format the date (YYYY-MM-DD) into Google Calendar's URL syntax (YYYYMMDD)
    if (message.dueDate) {
      const cleanDate = message.dueDate.replace(/-/g, '/'); // Converts '2026-07-17' to '2026/07/17'
      
      // 3. Open Google Calendar in day-view mode matching the specific target date
      // Week view
      window.open(`https://calendar.google.com/calendar/u/0/r/week/${cleanDate}`, '_blank');
    } else {
      // Fallback to standard calendar dashboard if due date is missing
      window.open('https://google.com', '_blank');
    }
    
    sendResponse({ received: true });
  }
});

// ACTION BUTTON INITIALIZATION
function createButton() {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Create a Task on Google Tasks';
  button.title = 'Click to summarize this email and save it to Google Tasks';
  
  button.style.cssText = [
    'margin-left: 8px',
    'background: #1a73e8',
    'color: white',
    'border: none',
    'border-radius: 18px',
    'padding: 0 14px',
    'height: 32px',
    'min-width: 170px',
    'display: inline-flex',
    'align-items: center',
    'justify-content: center',
    'font-size: 12px',
    'font-weight: 500',
    'cursor: pointer',
    'box-shadow: 0 1px 1px rgba(0,0,0,.15)',
    'position: relative',
    'z-index: 999999',
    'white-space: nowrap',
  ].join(';');

  button.addEventListener('click', async () => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = 'Creating task...';

    const emailBody = getEmailBody();
    if (!emailBody) {
      alert('Could not find the email body. Please open a single email and try again.');
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    chrome.runtime.sendMessage({
      action: 'parseEmail',
      emailSubject: getEmailSubject(),
      emailFrom: getEmailFrom(),
      emailBody: getEmailBody(),
      emailUrl: window.location.href,
    }, (response) => {
      button.disabled = false;
      button.textContent = originalText;

      if (chrome.runtime.lastError) {
        alert('Extension error: ' + chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.success) {
        alert('Unable to create google task. ' + (response?.error || 'Please try again.'));
      }
    });
  });

  return button;
}

// DOM INJECTION & INBOX OBSERVATION MANAGEMENT
function findPrintAllButton() {
  const candidates = document.querySelectorAll('button, [role="button"], div[role="button"]');

  for (const el of candidates) {
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text === 'print all' || text.includes('print all')) {
      return el;
    }
  }

  return null;
}

function insertButton() {
  const printAllButton = findPrintAllButton();
  if (!printAllButton) {
    const existingButton = document.querySelector(`#${BUTTON_ID}`);
    if (existingButton) existingButton.remove();
    return;
  }

  const row = printAllButton.closest('[role="toolbar"], [gh="mtb"], [aria-label*="toolbar"], .gH') || printAllButton.parentElement;
  if (!row) return;

  let button = row.querySelector(`#${BUTTON_ID}`);
  if (!button) {
    button = createButton();
  }

  button.style.marginLeft = '8px';
  if (button.parentElement !== row) {
    row.insertBefore(button, printAllButton);
  } else if (button !== printAllButton && button.nextElementSibling !== printAllButton) {
    row.insertBefore(button, printAllButton);
  }
}

// GMAIL DOM SCRAPING EXTRACTORS
function getEmailSubject() {
  const el = document.querySelector('h2.hP') || document.querySelector('.hP') || document.querySelector('h2');
  return el ? el.innerText.trim() : '';
}

function getEmailFrom() {
  const el = document.querySelector('.gD') || document.querySelector('span[email]') || document.querySelector('.go');
  return el ? el.innerText.trim() : '';
}

function getEmailBody() {
  const bodyElement = document.querySelector('div.a3s') || document.querySelector('.ii.gt');
  if (!bodyElement) return '';

  const clone = bodyElement.cloneNode(true);
  clone.querySelectorAll('.gmail_quote, blockquote, .quoted').forEach((node) => node.remove());
  return clone.innerText.trim();
}

// NAVIGATION & LIFECYCLE LISTENERS
function watchForLocationChange() {
  const pushState = history.pushState;
  const replaceState = history.replaceState;
  
  history.pushState = function () {
    const result = pushState.apply(this, arguments);
    window.dispatchEvent(new Event('locationchange'));
    return result;
  };
  history.replaceState = function () {
    const result = replaceState.apply(this, arguments);
    window.dispatchEvent(new Event('locationchange'));
    return result;
  };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
}

watchForLocationChange();
window.addEventListener('locationchange', insertButton);

let insertScheduled = false;

const observer = new MutationObserver(() => {
  if (insertScheduled) return;

  insertScheduled = true;
  requestAnimationFrame(() => {
    insertScheduled = false;
    insertButton();
  });
});

observer.observe(document.body, { childList: true, subtree: true });