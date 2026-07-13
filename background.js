const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const AI_MODEL = 'gpt-4o-mini';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'generateCalendarLink') {
    return;
  }

  processEmailForCalendar(message.payload)
    .then(url => {
      chrome.tabs.create({ url });
      sendResponse({ success: true });
    })
    .catch(error => {
      console.error('Calendar link generation failed', error);
      sendResponse({ error: error.message || 'Unknown error' });
    });

  return true;
});

async function processEmailForCalendar(email) {
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Open the extension options and add your key.');
  }

  const eventData = await extractEventData(email, apiKey);
  const calendarUrl = buildGoogleCalendarUrl(eventData, email.url);
  return calendarUrl;
}

function getOpenAIApiKey() {
  return new Promise(resolve => {
    chrome.storage.local.get(['openaiApiKey'], result => {
      resolve(result.openaiApiKey || '');
    });
  });
}

async function extractEventData(email, apiKey) {
  const prompt = `Extract calendar event details from the email text.
Return ONLY a JSON object with these keys: title, start_time, end_time, location, summary.
- title: short event title
- start_time: ISO 8601 or YYYYMMDDTHHMMSS
- end_time: ISO 8601 or YYYYMMDDTHHMMSS
- location: event location or empty string
- summary: short AI summary of the email body
If the email has no explicit end time, choose a reasonable default end time 1 hour after the start time.
Use the email body below as the source.

Email Subject: ${email.subject}
Email Link: ${email.url}
Email Body:
${email.body}`;

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'You are an assistant that extracts calendar event details from email text. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 350
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('No response text returned from AI.');
  }

  const parsed = parseJsonText(text);
  validateEventData(parsed);
  return parsed;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('AI response is not valid JSON.');
    }
    const jsonText = text.slice(start, end + 1);
    return JSON.parse(jsonText);
  }
}

function validateEventData(eventData) {
  if (!eventData || typeof eventData !== 'object') {
    throw new Error('AI response did not return an object.');
  }
  if (!eventData.title || !eventData.start_time) {
    throw new Error('AI response is missing required title or start_time.');
  }
  if (!eventData.end_time) {
    eventData.end_time = eventData.start_time;
  }
}

function buildGoogleCalendarUrl(eventData, emailUrl) {
  const title = encodeURIComponent(eventData.title);
  const location = eventData.location ? encodeURIComponent(eventData.location) : '';
  const summaryText = [`Original Email: ${emailUrl}`, '', eventData.summary || ''].join('\n');
  const details = encodeURIComponent(summaryText);
  const dates = formatGoogleCalendarDates(eventData.start_time, eventData.end_time);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    location,
    details
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function formatGoogleCalendarDates(startValue, endValue) {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue || startValue);
  return `${start}/${end}`;
}

function parseDateValue(value) {
  const normalized = value.trim();
  if (/^\d{8}T\d{6}$/.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date/time from AI value: ${value}`);
  }

  return formatAsCalendarDate(parsed);
}

function formatAsCalendarDate(date) {
  const pad = num => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}
