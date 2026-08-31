// BACKGROUND SERVICE WORKER - EMAIL TO GOOGLE TASKS
// Handles: AI parsing of email content, Google Tasks API integration, auth

// MESSAGE LISTENER - MAIN ENTRY POINT
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "parseEmail") {
    handleParseEmailRequest(message, sender, sendResponse);
    return true; // Keep the message channel open for async response
  }
});

// REQUEST HANDLER - AI PARSING & TASK SUBMISSION
async function handleParseEmailRequest(message, sender, sendResponse) {
  try {
    // STEP 1: Parse email with AI to extract task details
    const eventData = await parseEmailWithAI(message.emailBody);

    // STEP 2: Validate parsed data before proceeding
    validateTaskData(eventData);

    // STEP 3: Authenticate user with Google
    const token = await authenticateWithGoogle(true);

    // STEP 4: Submit task to Google Tasks API
    const response = await submitTaskToGoogle(eventData, token, message.emailUrl);

    // STEP 5: Notify content script of success
    chrome.tabs.sendMessage(sender.tab.id, {
      action: "showSuccessToast",
      taskTitle: eventData.title,
      dueDate: eventData.dueDate,
    });

    console.log('Task created successfully:', response.id);
    sendResponse({ success: true, status: "Task created successfully", data: response });
  } catch (error) {
    console.error('Error in handleParseEmailRequest:', error);
    const errorMessage = error.message || 'An unknown error occurred while creating the task.';
    sendResponse({ success: false, error: errorMessage });
  }
}

// AI PARSING - EXTRACT TASK DETAILS FROM EMAIL
async function parseEmailWithAI(emailBody) {
  try {
    const systemPrompt = `
      You are an AI assistant that extracts task details from email content.
      Respond ONLY with a raw JSON object matching the schema:
      {
        "title": "task title",
        "dueDate": "YYYY-MM-DD",
        "summary": "task description"
      }

      Rules:
      - If the email includes a specific appointment or event time, use that exact window.
      - If no year is provided, use the current year ${new Date().getFullYear()}.
      - If no date is found, set dueDate to tomorrow's date (${getDefaultDueDate()}).
      - If the email only contains a deadline, use the deadline date and set dueDate accordingly.
      - Include important action items, links, and special instructions in the summary.
      - Keep the title concise and action-oriented.
      - Return ONLY the JSON object, no additional text.`;

    const session = await LanguageModel.create({
      temperature: 0,
      topK: 1.0,
    });

    const promptText = `${systemPrompt}\n
                        Email Content:\n${emailBody}\n\nReturn the JSON object now.`;
    const rawAiResponse = await session.prompt(promptText);
    session.destroy();

    // Clean and parse the response
    const cleanedJson = fixCommonJSONMistakes(rawAiResponse);
    if (!cleanedJson) {
      throw new Error("Could not extract valid JSON from AI response.");
    }

    return JSON.parse(cleanedJson);
  } catch (error) {
    console.warn("AI parsing failed, attempting fallback parser:", error.message);
    // Fall back to non-AI parsing
    // return parseEmailWithFallback(emailBody);
    return null;
  }
}

// Helper: format date as YYYY-MM-DD
function formatDateAsYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper: get default due date (tomorrow)
function getDefaultDueDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateAsYYYYMMDD(tomorrow);
}

// AUTHENTICATION - GOOGLE IDENTITY API
function authenticateWithGoogle(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Authentication failed: ${chrome.runtime.lastError.message}`));
      } else if (!token) {
        reject(new Error("No authentication token received from Google. Please try again."));
      } else {
        resolve(token);
      }
    });
  });
}

// GOOGLE TASKS API - SUBMIT TASK
async function submitTaskToGoogle(eventData, token, emailUrl) {
  try {
    // Construct the task payload
    const taskPayload = {
      title: eventData.title,
      notes: `Original Email: ${emailUrl}\nAI Summary:\n${eventData.summary}`,
      due: `${eventData.dueDate}T00:00:00.000Z` // Google Tasks accepts RFC 3339 timestamp strings
    };

    // Use the Google Tasks API to create a new task in the default task list
    const response = await fetch(
      "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskPayload),
      }
    );

    // Check if API response is successful
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(`Google Tasks API error: ${errData.error?.message || "Unknown error"}`);
    }

    console.log("Task saved to Google Tasks successfully");
    return await response.json();
  } catch (error) {
    console.error("submitTaskToGoogle error:", error);
    throw error; // Re-throw so handleParseEmailRequest can catch and respond
  }
}

// VALIDATION - CHECK TASK DATA BEFORE API SUBMISSION
function validateTaskData(eventData) {
  if (!eventData) {
    throw new Error("Task data is missing.");
  }

  if (!eventData.title || typeof eventData.title !== "string" || eventData.title.trim().length === 0) {
    throw new Error("Task title is missing or invalid.");
  }

  if (!eventData.dueDate || typeof eventData.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(eventData.dueDate)) {
    throw new Error(`Task due date is missing or invalid (expected YYYY-MM-DD format, got: ${eventData.dueDate}).`);
  }

  if (!eventData.summary || typeof eventData.summary !== "string" || eventData.summary.trim().length === 0) {
    throw new Error("Task summary is missing or invalid.");
  }
}

function fixCommonJSONMistakes(str) {
  str = str.trim();
  str = extractTextBetweenCurlyBraces(str);
  if (!str) return null;
  str = addCommaBetweenQuotes(str);
  return str;
}

function extractTextBetweenCurlyBraces(str) {
  if (str[0] === "[") return str;
  const firstBraceIndex = str.indexOf("{");
  const lastBraceIndex = str.lastIndexOf("}");
  if (firstBraceIndex === -1 || lastBraceIndex === -1) {
    return null;
  }
  return str.substring(firstBraceIndex, lastBraceIndex + 1);
}

function addCommaBetweenQuotes(str) {
  return str.replace(/"([^"]*)"\s+"([^"]*)"/g, '"$1", "$2"');
}
