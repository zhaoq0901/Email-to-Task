const STORAGE_KEY = 'emailToTaskLatest';
const BANNER_ID = 'email-to-task-banner';

function normalizeText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function findElementByText(root, selector, text, exact = false) {
  const normalizedText = normalizeText(text);
  const elements = root.querySelectorAll(selector);
  for (const element of elements) {
    if (!element || !element.textContent) continue;
    const content = normalizeText(element.textContent);
    if (exact ? content === normalizedText : content.includes(normalizedText)) {
      return element;
    }
  }
  return null;
}

function traverseRoots(root, callback) {
  if (!root) return null;
  const result = callback(root);
  if (result) return result;
  const children = root.children || [];
  for (const child of children) {
    const found = traverseRoots(child, callback);
    if (found) return found;
  }
  const shadowRoot = root.shadowRoot;
  if (shadowRoot) {
    const found = traverseRoots(shadowRoot, callback);
    if (found) return found;
  }
  return null;
}

function deepQuerySelector(selector, root = document) {
  return traverseRoots(root, (node) => {
    if (!(node instanceof Element)) return null;
    const found = node.querySelector(selector);
    return found;
  });
}

function deepQuerySelectorByText(root, selector, text, exact = false) {
  return traverseRoots(root, (node) => {
    if (!(node instanceof Element)) return null;
    return findElementByText(node, selector, text, exact);
  });
}

async function waitForElement(fn, timeout = 10000, interval = 200) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) {
    const element = fn();
    if (element) return element;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

function clickElement(element) {
  if (!element) return false;
  element.click();
  return true;
}

function findTaskAddButton() {
  const buttonPhrases = ['add a task', 'add task', 'create task', 'new task'];
  const elements = Array.from(document.querySelectorAll('button,div,a,span,[role="button"],*[tabindex="0"]'));

  for (const element of elements) {
    const ariaLabel = normalizeText(element.getAttribute('aria-label'));
    const title = normalizeText(element.getAttribute('title'));
    const text = normalizeText(element.textContent || element.innerText);
    const combined = `${ariaLabel} ${title} ${text}`;
    if (buttonPhrases.some((phrase) => combined.includes(phrase))) {
      return element;
    }
  }

  for (const phrase of buttonPhrases) {
    const textButton = deepQuerySelectorByText(document, 'button,div,a,span', phrase);
    if (textButton) return textButton;
  }

  return null;
}

function setInputValue(input, value) {
  if (!input) return false;
  input.focus();
  if (input.isContentEditable) {
    input.textContent = value;
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function createBanner(task, message) {
  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.style.position = 'fixed';
  banner.style.top = '12px';
  banner.style.right = '12px';
  banner.style.zIndex = '999999';
  banner.style.maxWidth = '380px';
  banner.style.padding = '14px 16px';
  banner.style.background = '#1a73e8';
  banner.style.color = '#fff';
  banner.style.borderRadius = '12px';
  banner.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)';
  banner.style.fontFamily = 'Arial, sans-serif';
  banner.style.fontSize = '13px';
  banner.style.lineHeight = '1.4';
  banner.style.display = 'flex';
  banner.style.flexDirection = 'column';
  banner.style.gap = '10px';

  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.textContent = 'Email to Task';

  const info = document.createElement('div');
  info.textContent = `Task: ${task.task_title}`;

  const deadline = document.createElement('div');
  deadline.textContent = `Deadline: ${task.deadline}`;

  const messageNode = document.createElement('div');
  messageNode.textContent = message;
  messageNode.style.fontSize = '12px';
  messageNode.style.opacity = '0.9';

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.gap = '8px';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Dismiss';
  closeButton.style.border = 'none';
  closeButton.style.padding = '8px 10px';
  closeButton.style.borderRadius = '8px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.background = 'rgba(255,255,255,0.18)';
  closeButton.style.color = '#fff';

  closeButton.addEventListener('click', () => {
    banner.remove();
  });

  buttonRow.appendChild(closeButton);

  banner.appendChild(title);
  banner.appendChild(info);
  banner.appendChild(deadline);
  if (message) banner.appendChild(messageNode);
  banner.appendChild(buttonRow);

  return banner;
}

function injectBanner(task, message) {
  if (document.getElementById(BANNER_ID)) return;
  const banner = createBanner(task, message);
  document.body.appendChild(banner);
}

async function autoFillTask(task) {
  const addTaskButton = await waitForElement(() => findTaskAddButton(), 15000, 300);

  if (!addTaskButton) {
    throw new Error('Add task button not found');
  }

  clickElement(addTaskButton);

  await new Promise((resolve) => setTimeout(resolve, 800));

  const titleInput = await waitForElement(() =>
    document.querySelector(
      'input[aria-label*="task title"], input[aria-label*="task name"], input[placeholder*="Add a task"], textarea[aria-label*="task title"], div[contenteditable="true"]'
    )
  );
  if (!titleInput) {
    throw new Error('Task title input not found');
  }
  setInputValue(titleInput, task.task_title);

  const detailsButton =
    document.querySelector('button[aria-label*="Add details"], button[aria-label*="Add description"], div[aria-label*="Add details"], div[aria-label*="Add description"]') ||
    findElementByText(document, 'button,div', 'add details') ||
    findElementByText(document, 'button,div', 'add description');

  if (detailsButton) {
    clickElement(detailsButton);
  }

  const descriptionInput = await waitForElement(() =>
    document.querySelector(
      'textarea[aria-label*="Description"], textarea[placeholder*="Add details"], textarea[aria-label*="Notes"], div[contenteditable="true"]'
    )
  );
  if (descriptionInput) {
    setInputValue(descriptionInput, task.description);
  }

  const dueDateButton =
    document.querySelector('button[aria-label*="Due date"], button[aria-label*="Add date"], div[aria-label*="Due date"], div[aria-label*="Add date"]') ||
    findElementByText(document, 'button,div', 'due date');

  if (dueDateButton) {
    clickElement(dueDateButton);
    const dateInput = await waitForElement(() =>
      document.querySelector('input[type="date"], input[aria-label*="Due date"], input[placeholder*="Date"]')
    );
    if (dateInput) {
      const isoDate = task.deadline.split('T')[0] || task.deadline;
      setInputValue(dateInput, isoDate);
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const saveButton =
      document.querySelector('button[aria-label*="Save"], button[aria-label*="Done"], button[aria-label*="Close"], div[role="button"][aria-label*="Save"]') ||
      findElementByText(document, 'button,div', 'save') ||
      findElementByText(document, 'button,div', 'done');
    if (saveButton) clickElement(saveButton);
  }

  const closeButton =
    document.querySelector('button[aria-label*="Close"], button[aria-label*="Done"], div[role="button"][aria-label*="Close"]') ||
    findElementByText(document, 'button,div', 'done');
  if (closeButton) clickElement(closeButton);
}

chrome.storage.local.get(STORAGE_KEY, async (result) => {
  const task = result[STORAGE_KEY];
  if (!task) return;
  chrome.storage.local.remove(STORAGE_KEY);

  try {
    await autoFillTask(task);
    injectBanner(task, 'Task fields automatically populated. Confirm and save within the Tasks UI.');
  } catch (error) {
    injectBanner(task, 'Unable to auto-fill the Tasks UI. Please copy the task data manually.');
    console.warn('Email to Task auto-fill failed:', error);
  }
});
