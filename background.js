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
      - If the email only contains a deadline, use the deadline date and set dueDate accordingly.
      - Include important action items, links, and special instructions in the summary. The summary should be in bullet points and be concise and relevant.
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

// // FALLBACK PARSER - EXTRACT TASK DETAILS WITHOUT AI
// function parseEmailWithFallback(emailBody) {
//   try {
//     const title = extractTitle(emailBody);
//     const dueDate = extractDueDate(emailBody);
//     const summary = extractSummary(emailBody);

//     return {
//       title: title || "Task from email",
//       dueDate: dueDate || getDefaultDueDate(),
//       summary: summary || "Task details extracted from email content.",
//     };
//   } catch (error) {
//     console.error("Fallback parser error:", error);
//     throw new Error(`Fallback parser failed: ${error.message}`);
//   }
// }

// // Extract task title from email body
// function extractTitle(body) {
//   // Look for action-oriented keywords at start of email
//   const actionLines = body.match(/^\s*(?:please|urgent|reminder|sign[- ]?up|submit|download|deadline|action required)[^\n]*/im);
//   if (actionLines) {
//     return actionLines[0].trim().substring(0, 100);
//   }

//   // Fall back to first non-empty line
//   const lines = body.split(/\n/).filter(line => line.trim().length > 0);
//   if (lines.length > 0) {
//     return lines[0].trim().substring(0, 100);
//   }

//   return null;
// }

// // Extract due date from email body
// function extractDueDate(body) {
//   // Pattern 1: "by [Month] [Day][th/st/nd/rd][, Year]"
//   const byPattern = /by\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,\s*|\s+)(\d{4}\b)?/i;
//   const byMatch = body.match(byPattern);
//   if (byMatch) {
//     const month = byMatch[1];
//     const day = byMatch[2];
//     const year = byMatch[3] || new Date().getFullYear();
//     const dateStr = `${month} ${day}, ${year}`;
//     const parsedDate = new Date(dateStr);
//     if (!isNaN(parsedDate.getTime())) {
//       return formatDateAsYYYYMMDD(parsedDate);
//     }
//   }

//   // Pattern 2: "[Month] [Day][-/][Month] [Day], [Year]" (date range, use first date)
//   const rangePattern = /([A-Za-z]+)\s+(\d{1,2})[-/]([A-Za-z]+)?\s+(\d{1,2}),?\s*(\d{4})/i;
//   const rangeMatch = body.match(rangePattern);
//   if (rangeMatch) {
//     const month = rangeMatch[1];
//     const day = rangeMatch[2];
//     const year = rangeMatch[5] || new Date().getFullYear();
//     const dateStr = `${month} ${day}, ${year}`;
//     const parsedDate = new Date(dateStr);
//     if (!isNaN(parsedDate.getTime())) {
//       return formatDateAsYYYYMMDD(parsedDate);
//     }
//   }

//   // Pattern 3: "Deadline: [date]" or "Due: [date]"
//   const deadlinePattern = /(?:deadline|due):\s*([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/i;
//   const deadlineMatch = body.match(deadlinePattern);
//   if (deadlineMatch) {
//     const month = deadlineMatch[1];
//     const day = deadlineMatch[2];
//     const year = deadlineMatch[3] || new Date().getFullYear();
//     const dateStr = `${month} ${day}, ${year}`;
//     const parsedDate = new Date(dateStr);
//     if (!isNaN(parsedDate.getTime())) {
//       return formatDateAsYYYYMMDD(parsedDate);
//     }
//   }

//   return null;
// }

// // Extract summary/description from email body
// function extractSummary(body) {
//   // Remove common footers and quoted text
//   let cleaned = body
//     .replace(/^>.*$/gm, "") // Remove quoted lines (start with >)
//     .replace(/--+\n.*$/s, "") // Remove signature separator and below
//     .replace(/Best regards.*$/i, "") // Remove common closings
//     .replace(/\s+/g, " ") // Normalize whitespace
//     .trim();

//   // Extract key action items and links
//   const lines = cleaned.split(/[.!?]\s+/).filter(line => line.trim().length > 0);
//   const importantLines = lines
//     .filter(line => /(?:please|must|important|deadline|submit|download|click|sign|appointment|meeting|reminder)/i.test(line))
//     .slice(0, 3);

//   // Extract URLs
//   const urls = body.match(/https?:\/\/[^\s]+/g) || [];
//   const uniqueUrls = [...new Set(urls)].slice(0, 2);

//   // Build summary
//   let summary = importantLines.join(" ").substring(0, 200);
//   if (uniqueUrls.length > 0) {
//     summary += ` Links: ${uniqueUrls.join(" | ")}`;
//   }

//   return summary.substring(0, 500).trim() || null;
// }

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
