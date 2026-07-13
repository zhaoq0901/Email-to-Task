// background.js (Handling Step 4 via Google Tasks REST API)

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "parseEmail") {
    try {
      // (Step 3 AI Parsing occurs here as established previously)
      let systemPrompt = `
        You are an AI assistant that extracts task details from email content.
        Respond ONLY with a raw JSON object matching the schema.
      - If the email includes a specific appointment or event time, use that exact window.
      - If no year is provided, use the current year ${new Date().getFullYear()}.
      - If the email only contains a deadline or sign-up requirement, use the deadline date and set dueDate to the same day at 23:59:59 local time.
      - Include important action items, links, and special instructions in the description.
      - The description should be a concise task-ready note with key details and any deadlines extracted from the email.
      - In the description text block, use a line break (\n) before every sentence so it does not stick to the previous text.
      - Use the email URL in the description for reference.
      - Keep the title concise and action-oriented.`
    
      // Issue: the global LanguageModel object will ignore the responseSchema
      // const responseSchema = {
      //     type: "object",
      //     properties: {
      //       title: { type: "string" },
      //       dueDate: { type: "string", description: "Format: YYYY-MM-DD" }, 
      //       summary: { type: "string" }
      //     },
      //     required: ["title", "dueDate", "summary"]
      //   }

      const session = await LanguageModel.create({
          temperature: 0,
          topK: 1.0
        });

      let promptText = `${systemPrompt}\n\nExtract "title", "dueDate" (Format: YYYY-MM-DD), and "summary" from the following text. Return only JSON as result:\n${message.emailBody}`;
      

      let rawAiResponse = await session.prompt(promptText);
      session.destroy();

      // ADAPTED: Clean the raw response using the reference code's precise cleaning pipeline
      const cleanedJsonResponse = fixCommonJSONMistakes(rawAiResponse);

      if (!cleanedJsonResponse) {
        throw new Error("Could not find a valid JSON object block within the AI's text response.");
      }
      
      //This parse operation will succeed if the structure is guaranteed
      const eventData = JSON.parse(cleanedJsonResponse);

      // ==========================================
      // UPDATED STEP 4: GOOGLE TASKS API INTEGRATION
      // ==========================================

      await new Promise((resolve) => {
        // 1. Authenticate user silently using Chrome's Identity Framework
        chrome.identity.getAuthToken({ interactive: true }, async function(token) {
          if (chrome.runtime.lastError || !token) {
            console.error("Authentication failed:", chrome.runtime.lastError);
            resolve(); // Close the promise wrapper safely
            return; 
          }

          // 2. Format the Task Payload according to Google's API Specifications
          const taskPayload = {
            title: eventData.title,
            notes: `Original Email: ${message.emailUrl}\n\n
            AI Summary:\n${eventData.summary}`,
            due: `${eventData.dueDate}T00:00:00.000Z` // Google Tasks accepts RFC 3339 timestamp strings
          };

          // 3. Make the API Write call directly to the user's Default Task List
          const response = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskPayload)
          });

          if (response.ok) {
            console.log("Task saved directly to Google Tasks!");
            
            // 4. Notify content script to display a sleek confirmation notification to the user
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "showSuccessToast",
              taskTitle: eventData.title,
              dueDate: eventData.dueDate // Pass the due date for potential calendar integration
            });
          } else {
            const errData = await response.json();
            console.error("API error returned:", errData);
          }
          // Resolve the wrapping promise to mark workflow completion
          resolve();
        });
      });

    } catch (error) {
      console.error("Error processing request:", error);
    } finally {
      // FIX: Explicitly call sendResponse() to close the message channel gracefully.
      // FIXED: Send success: true so content.js knows processing worked smoothly
      // This stops Chrome from showing the channel dropped warning.
      sendResponse({ success: true, status: "processing_complete" });
    }
}});

// ============================================================================
// ADAPTED UTILITY UTILS FROM REFERENCE IMPLEMENTATION
// ============================================================================
function fixCommonJSONMistakes(str) {
  str = str.trim();
  str = extractTextBetweenCurlyBraces(str);
  if (!str) return null;
  str = addCommaBetweenQuotes(str);
  return str;
}

function extractTextBetweenCurlyBraces(str) {
  if (str[0] === '[') return str;
  const firstBraceIndex = str.indexOf('{');
  const lastBraceIndex = str.lastIndexOf('}');
  if (firstBraceIndex === -1 || lastBraceIndex === -1) {
    return null; 
  }
  return str.substring(firstBraceIndex, lastBraceIndex + 1);
}

function addCommaBetweenQuotes(str) {
  return str.replace(/"([^"]*)"\s+"([^"]*)"/g, '"$1", "$2"');
}