/* global LanguageModel */

const TASKS_API_BASE = 'https://www.googleapis.com/tasks/v1';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'emailToTask',
    title: 'Create Email Task',
    contexts: ['selection'],
    documentUrlPatterns: ['https://mail.google.com/*']
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== 'emailToTask') return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  try {
    const taskData = await parseTaskDetails(selectedText, info.pageUrl);
    await createGoogleTask(taskData);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Email to Task',
      message: 'Google Task created successfully.'
    });
  } catch (error) {
    console.error('Email to Task failed:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Email to Task',
      message: String(error)
    });
  }
});

async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const lastError = chrome.runtime.lastError;
      if (lastError || !token) {
        reject(lastError || new Error('Failed to obtain OAuth token.'));
        return;
      }
      resolve(token);
    });
  });
}

async function createGoogleTask(task) {
  const token = await getAuthToken(true);
  const body = {
    title: task.task_title,
    notes: task.description,
    due: normalizeDeadline(task.deadline)
  };

  const response = await fetch(`${TASKS_API_BASE}/lists/@default/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    if (response.status === 401) {
      chrome.identity.removeCachedAuthToken({ token }, () => {});
    }
    const errorText = await response.text();
    throw new Error(`Tasks API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

function normalizeDeadline(deadline) {
  const parsed = new Date(deadline);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.exec(deadline);
  if (dateOnlyMatch) {
    return `${deadline}T00:00:00.000Z`;
  }

  return new Date().toISOString();
}

async function parseTaskDetails(text, pageUrl) {
  const session = await LanguageModel.create({
    temperature: 0,
    topK: 1.0
  });

  const prompt = `The following selected Gmail text is from an email. Extract the task details and return only valid JSON with the keys: task_title, deadline, description.` +
    `\n\n- task_title: a one-sentence task title` +
    `\n- deadline: a due date or date-time in ISO 8601 format` +
    `\n- description: the important details of the email and include the original email link at the end.` +
    `\n\nIf no explicit deadline is present, choose a reasonable deadline within the next business day.` +
    `\n\nEmail URL: ${pageUrl || 'unknown'}` +
    `\nSelected text:\n${text}`;

  const raw = await session.prompt(prompt);
  const task = parseJsonText(raw);
  validateTaskData(task);
  if (!task.description.includes(pageUrl || 'unknown')) {
    task.description = `${task.description}\nOriginal Email: ${pageUrl || 'unknown'}`.trim();
  }
  return task;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error(`Unable to parse AI output as JSON: ${error.message}`);
  }
}

function validateTaskData(task) {
  if (!task || typeof task !== 'object') {
    throw new Error('AI response did not return a JSON object.');
  }
  if (!task.task_title || !task.deadline || !task.description) {
    throw new Error('AI response is missing required task_title, deadline, or description.');
  }
}
