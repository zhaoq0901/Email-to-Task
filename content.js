const BUTTON_ID = 'gmail-ai-calendar-task-btn';
console.log('Gmail AI Calendar Task content script loaded');

// ============================================================================
// ADDED: Listen for successful completion events sent from background.js
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showSuccessToast") {
    displaySleekToast(message.taskTitle);
    sendResponse({ received: true });
  }
});

function displaySleekToast(taskTitle) {
  // Check if a toast container already exists to prevent duplicate windows
  let toast = document.querySelector('#gmail-ai-success-toast');
  if (toast) toast.remove();

  toast = document.createElement('div');
  toast.id = 'gmail-ai-success-toast';
  toast.textContent = `✓ Task Created: "${taskTitle}"`;
  
  // Custom design style layout targeting the standard Gmail UI interface theme
  toast.style.cssText = [
    'position: fixed',
    'bottom: 32px',
    'left: 32px',
    'background: #323232',
    'color: #ffffff',
    'padding: 12px 24px',
    'border-radius: 4px',
    'font-family: Roboto, RobotoDraft, Helvetica, Arial, sans-serif',
    'font-size: 14px',
    'box-shadow: 0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14)',
    'z-index: 2147483647',
    'transition: opacity 0.3s ease',
    'pointer-events: none'
  ].join(';');

  document.body.appendChild(toast);

  // Automatically remove toast element view after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createButton() {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Create Task on Calendar';
  button.title = 'Click to summarize this email and open a calendar event draft';
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

    const emailSubject = getEmailSubject();
    const emailFrom = getEmailFrom();
    const emailBody = getEmailBody();
    const emailUrl = window.location.href;

    if (!emailBody) {
      alert('Could not find the email body. Please open a single email and try again.');
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    chrome.runtime.sendMessage(
      {
        action: 'parseEmail',
        emailSubject,
        emailFrom,
        emailBody,
        emailUrl,
      },
      (response) => {
        button.disabled = false;
        button.textContent = originalText;

        if (chrome.runtime.lastError) {
          alert('Extension error: ' + chrome.runtime.lastError.message);
          return;
        }

        if (!response || !response.success) {
          alert('Unable to create calendar task. ' + (response?.error || 'Please try again.'));
        }
      }
    );
  });

  return button;
}

function findToolbar() {
  const selectors = [
    'div[gh="mtb"]',
    'div[role="toolbar"][aria-label*="Toolbar"]',
    'div[role="toolbar"]',
    'div[aria-label*="Toolbar"]',
    'div[role="button"] + div[role="toolbar"]',
    'div[role="main"] div[role="toolbar"]',
  ];

  for (const selector of selectors) {
    const toolbar = document.querySelector(selector);
    if (toolbar) {
      console.log('Gmail AI button: toolbar found with selector', selector, toolbar);
      return toolbar;
    }
  }

  console.log('Gmail AI button: toolbar not found yet');
  return null;
}

function insertFloatingButton() {
  if (document.querySelector(`#${BUTTON_ID}`) || document.querySelector(`#${BUTTON_ID}-wrapper`)) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = `${BUTTON_ID}-wrapper`;
  wrapper.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'right: 24px',
    'z-index: 2147483647',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'pointer-events: auto',
  ].join(';');

  const button = createButton();
  wrapper.appendChild(button);
  document.body.appendChild(wrapper);
  console.log('Gmail AI button: floating fallback button inserted');
}

function removeFallbackButton() {
  const wrapper = document.querySelector(`#${BUTTON_ID}-wrapper`);
  if (wrapper) {
    wrapper.remove();
    console.log('Gmail AI button: removed fallback floating button');
  }
}

function insertButton() {
  const toolbar = findToolbar();
  if (toolbar) {
    removeFallbackButton();

    if (!toolbar.querySelector(`#${BUTTON_ID}`)) {
      const button = createButton();
      toolbar.appendChild(button);
      console.log('Gmail AI button inserted into toolbar');
    }
    return;
  }

  insertFloatingButton();
}

function getEmailSubject() {
  const subjectElement = document.querySelector('h2.hP') || document.querySelector('.hP') || document.querySelector('h2');
  return subjectElement ? subjectElement.innerText.trim() : '';
}

function getEmailFrom() {
  const fromElement = document.querySelector('.gD') || document.querySelector('span[email]') || document.querySelector('.go');
  return fromElement ? fromElement.innerText.trim() : '';
}

function getEmailBody() {
  const bodyElement = document.querySelector('div.a3s') || document.querySelector('.ii.gt') || document.querySelector('div[role="listitem"] .a3s');
  if (!bodyElement) {
    return '';
  }

  const clone = bodyElement.cloneNode(true);
  clone.querySelectorAll('.gmail_quote, blockquote, .quoted').forEach((node) => node.remove());
  return clone.innerText.trim();
}

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

  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('locationchange'));
  });
}

watchForLocationChange();
window.addEventListener('locationchange', insertButton);
insertButton();

const observer = new MutationObserver(() => {
  insertButton();
});
observer.observe(document.body, { childList: true, subtree: true });
