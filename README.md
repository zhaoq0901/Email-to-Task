# Gmail AI Calendar Task

This Chrome extension injects a button into Gmail to summarize the current email and load a Google Calendar event draft.

## How it works

1. A button appears inside Gmail when viewing an email.
2. Clicking the button sends the email subject, sender, body, and link to the extension background.
3. The background uses Chrome AI to parse the email and build a Google Calendar template URL.
4. A new tab opens with the event pre-filled for review and saving.

## Install

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked` and select this folder.
4. Open Gmail and refresh the page.
5. Open an email and click `Create Task on Calendar`.

## Notes

- This extension assumes Chrome supports the `chrome.aiLanguageModel` API and has a local AI model available.
- If the model is unavailable, the extension will show an error.
