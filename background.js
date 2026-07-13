async function formatCalendarDate(value) {
  const trimmed = String(value).trim();
  if (/^\d{8}T\d{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    let normalized = trimmed.replace(/[-:]/g, '');
    if (/^\d{8}T\d{4}$/.test(normalized)) {
      normalized += '00';
    }
    return normalized;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  throw new Error('Unable to parse calendar date: ' + value);
}

function formatDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function buildCalendarUrl(eventData, emailUrl) {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const dates = `${eventData.startTime}/${eventData.endTime}`;
  const details = [
    `Original Email: ${emailUrl}`,
    '',
    `Summary: ${eventData.summary}`,
    '',
    `${eventData.description}`,
  ].join('\n');

  const params = new URLSearchParams({
    text: eventData.title,
    dates,
    location: eventData.location,
    details,
  });
  return `${baseUrl}&${params.toString()}`;
}

function extractLinks(body) {
  const regex = /https?:\/\/[\w\-\./?=&%#]+/g;
  return Array.from(new Set(body.match(regex) || []));
}

function normalizeDateText(text) {
  return text
    .replace(/(\d)(st|nd|rd|th)/gi, '$1')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/\s+\/\s+/g, '/')
    .replace(/\s+AM/gi, ' AM')
    .replace(/\s+PM/gi, ' PM')
    .replace(/\s+am/gi, ' am')
    .replace(/\s+pm/gi, ' pm');
}

function parseDateTime(dateText, timeText) {
  const normalizedDate = normalizeDateText(dateText);
  const normalizedTime = normalizeDateText(timeText);
  const yearPresent = /\d{4}/.test(normalizedDate);
  let dateValue = normalizedDate;

  if (/\d{1,2}\/\d{1,2}\/\d{2}(?:\d{2})?/.test(normalizedDate)) {
    dateValue = normalizedDate.replace(/\/(\d{2})$/g, '/20$1');
  }

  if (!yearPresent && /[A-Za-z]+/.test(normalizedDate)) {
    const year = new Date().getFullYear();
    dateValue = `${normalizedDate} ${year}`;
  }

  const candidate = new Date(`${dateValue} ${normalizedTime}`);
  if (!Number.isNaN(candidate.getTime())) {
    return candidate;
  }

  const fallback = new Date(`${normalizedDate} ${normalizedTime}`);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback;
  }

  throw new Error(`Unable to parse date/time: ${dateText} ${timeText}`);
}

function findDateWindow(body) {
  const appointmentPatterns = [
    /([A-Z][a-z]+,\s*[A-Za-z]+\s*\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\s*from\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?)\s*(?:to|[-–])\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?)/i,
    /([A-Z][a-z]+,\s*\d{1,2}\/\d{1,2}\/\d{2,4})\s*,\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm))\s*[-–]\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm))/,
  ];

  for (const pattern of appointmentPatterns) {
    const match = body.match(pattern);
    if (match) {
      try {
        const start = parseDateTime(match[1], match[2]);
        const end = parseDateTime(match[1], match[3]);
        return { start, end };
      } catch (err) {
        continue;
      }
    }
  }

  const deadlineMatch = body.match(/by\s+([A-Z][a-z]+\s*\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)(?:\s+at\s+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm)))?/i);
  if (deadlineMatch) {
    const dateText = deadlineMatch[1];
    const timeText = deadlineMatch[2] || '11:59 PM';
    const deadline = parseDateTime(dateText, timeText);
    const end = new Date(deadline);
    return { start: new Date(deadline.setHours(0, 0, 0, 0)), end };
  }

  return null;
}

function extractLocation(body) {
  const locationMatch = body.match(/where:\s*([^\n\r]+)/i) || body.match(/location:\s*([^\n\r]+)/i);
  if (locationMatch) {
    return locationMatch[1].trim();
  }

  const genericMatch = body.match(/at\s+([A-Z][^\n\r]{5,80})/i);
  return genericMatch ? genericMatch[1].trim() : '';
}

function cleanSummary(body) {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const important = lines.filter((line) => /reminder|deadline|appointment|sign[- ]?up|must|please|download|submit|by|when|where|location|form|template|link/i.test(line));
  return important.slice(0, 4).join(' ').replace(/\s+/g, ' ').trim();
}

function parseEmailWithFallback(message) {
  const body = message.emailBody || '';
  const subject = message.emailSubject || '';
  const links = extractLinks(body);
  const dateWindow = findDateWindow(body) || findDateWindow(subject);
  const now = new Date();
  const start = dateWindow ? dateWindow.start : new Date(now.setHours(now.getHours() + 1, 0, 0, 0));
  const end = dateWindow ? dateWindow.end : new Date(start.getTime() + 60 * 60 * 1000);

  const title = subject
    ? subject.replace(/\s*\|\s*Gmail.*$/i, '').trim()
    : 'Create calendar task from email';
  const location = extractLocation(body) || 'No specific location provided';
  const summary = cleanSummary(body) || 'Summary generated from the email content.';
  const description = [
    summary,
    '',
    links.length ? `Links: ${links.join(' | ')}` : '',
    '',
    'Original email content extracted from Gmail.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title,
    startTime: formatDate(start),
    endTime: formatDate(end),
    location,
    summary,
    description,
  };
}

async function parseEmailWithAi(message) {
  if (!chrome.aiLanguageModel) {
    console.warn('Chrome AI Language Model API unavailable, using fallback parser.');
    return parseEmailWithFallback(message);
  }

  try {
    const capabilities = await chrome.aiLanguageModel.capabilities();
    if (!capabilities || capabilities.available !== 'yes') {
      console.warn('Local Gemini AI model unavailable, using fallback parser.');
      return parseEmailWithFallback(message);
    }

    const calendarSchema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startTime: { type: 'string', description: 'YYYYMMDDTHHMMSS' },
        endTime: { type: 'string', description: 'YYYYMMDDTHHMMSS' },
        location: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'startTime', 'endTime', 'location', 'summary', 'description'],
    };

    const systemPrompt = `You are a precise event parser. Extract calendar event details from a Gmail message and return only JSON matching the schema.`;
    const session = await chrome.aiLanguageModel.create({
      systemPrompt,
      jsonSchema: calendarSchema,
    });

    const prompt = `Extract a calendar event from the email below. Return only valid JSON.

Email subject: ${message.emailSubject}
Email from: ${message.emailFrom}
Email URL: ${message.emailUrl}

Email body:
${message.emailBody}

Instructions:
- Provide title, startTime, endTime, location, summary, and description.
- If the email includes a specific appointment or event time, use that exact window.
- If the email only contains a deadline or sign-up requirement, use the deadline date and set endTime to the same day at 23:59:59 local time.
- Include important action items, deadlines, links, and special instructions in the description.
- The description should be a concise task-ready note with key details and any deadlines extracted from the email.
- startTime and endTime must use YYYYMMDDTHHMMSS format in local time.
- Use the email URL in the description and include a short clear summary of what the calendar event represents.
- Keep the title concise and action-oriented. Do not return any text outside the JSON object.`;

    const rawResponse = await session.prompt(prompt);
    session.destroy();

    let responseText = '';
    if (typeof rawResponse === 'string') {
      responseText = rawResponse;
    } else if (rawResponse?.content) {
      responseText = rawResponse.content;
    } else {
      responseText = JSON.stringify(rawResponse);
    }

    const eventData = JSON.parse(responseText.trim());
    eventData.startTime = await formatCalendarDate(eventData.startTime);
    eventData.endTime = await formatCalendarDate(eventData.endTime);

    return eventData;
  } catch (error) {
    console.warn('AI parsing failed, using fallback parser.', error);
    return parseEmailWithFallback(message);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'parseEmail') {
    return false;
  }

  parseEmailWithAi(message)
    .then((eventData) => {
      const calendarUrl = buildCalendarUrl(eventData, message.emailUrl);
      chrome.tabs.create({ url: calendarUrl });
      sendResponse({ success: true });
    })
    .catch((error) => {
      console.error('Error processing email:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true;
});
