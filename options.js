const apiKeyInput = document.getElementById('api-key');
const saveButton = document.getElementById('save-btn');
const statusText = document.getElementById('status');

function showStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#d93025' : '#137333';
}

chrome.storage.local.get(['openaiApiKey'], result => {
  if (result.openaiApiKey) {
    apiKeyInput.value = result.openaiApiKey;
  }
});

saveButton.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus('Enter a valid API key before saving.', true);
    return;
  }

  chrome.storage.local.set({ openaiApiKey: key }, () => {
    showStatus('API key saved successfully. Close the tab and refresh Gmail.');
  });
});
