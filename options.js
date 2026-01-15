// Options page script

// Default shortcuts (same as settings.js)
const DEFAULT_SHORTCUTS = {
  chat: {
    navigateToSearch: 'Insert',
    toggleSidebar: 'Delete',
    newChat: 'Home',
    toggleHistoryMode: 'End',
    scrollUp: 'PageUp',
    scrollDown: 'PageDown',
    historyUp: 'ArrowUp',
    historyDown: 'ArrowDown',
    historyOpen: 'Enter',
    historyExit: 'Escape'
  },
  search: {
    moveUp: 'ArrowUp',
    moveDown: 'ArrowDown',
    openResult: 'Enter',
    scrollUp: 'PageUp',
    scrollDown: 'PageDown'
  }
};

// Current shortcuts
let currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

// Current chat width
let currentChatWidth = 900;

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(['shortcuts', 'chatWidth'], (result) => {
    if (result.shortcuts) {
      currentShortcuts = result.shortcuts;
    }
    if (result.chatWidth) {
      currentChatWidth = result.chatWidth;
    }
    displaySettings();
  });
}

// Load shortcuts from storage (backward compatibility)
function loadShortcuts() {
  loadSettings();
}

// Display settings in UI
function displaySettings() {
  // Chat width
  const chatWidthSlider = document.getElementById('chatWidth');
  const chatWidthValue = document.getElementById('chatWidthValue');
  if (chatWidthSlider && chatWidthValue) {
    chatWidthSlider.value = currentChatWidth;
    chatWidthValue.textContent = `${currentChatWidth}px`;
  }

  // Chat shortcuts
  for (const key in currentShortcuts.chat) {
    const input = document.getElementById(`chat.${key}`);
    if (input) {
      input.value = currentShortcuts.chat[key];
    }
  }

  // Search shortcuts
  for (const key in currentShortcuts.search) {
    const input = document.getElementById(`search.${key}`);
    if (input) {
      input.value = currentShortcuts.search[key];
    }
  }
}

// Display shortcuts in UI (backward compatibility)
function displayShortcuts() {
  displaySettings();
}

// Save settings to storage
function saveSettings() {
  chrome.storage.sync.set({ 
    shortcuts: currentShortcuts,
    chatWidth: currentChatWidth
  }, () => {
    showMessage('Settings saved successfully!');
  });
}

// Save shortcuts to storage (backward compatibility)
function saveShortcuts() {
  saveSettings();
}

// Reset to default settings
function resetSettings() {
  currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  currentChatWidth = 900;
  displaySettings();
  chrome.storage.sync.set({ 
    shortcuts: currentShortcuts,
    chatWidth: currentChatWidth
  }, () => {
    showMessage('Settings reset to default!');
  });
}

// Reset to default shortcuts (backward compatibility)
function resetShortcuts() {
  resetSettings();
}

// Show message
function showMessage(text) {
  const message = document.getElementById('message');
  message.textContent = text;
  message.classList.add('show');

  setTimeout(() => {
    message.classList.remove('show');
  }, 2000);
}

// Handle key input
function handleKeyInput(event, inputId) {
  event.preventDefault();

  // Ignore modifier keys alone
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
    return;
  }

  const [section, key] = inputId.split('.');

  // Update current shortcuts
  currentShortcuts[section][key] = event.code;

  // Update display
  event.target.value = event.code;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Chat width slider
  const chatWidthSlider = document.getElementById('chatWidth');
  const chatWidthValue = document.getElementById('chatWidthValue');
  
  if (chatWidthSlider && chatWidthValue) {
    chatWidthSlider.addEventListener('input', (event) => {
      currentChatWidth = parseInt(event.target.value);
      chatWidthValue.textContent = `${currentChatWidth}px`;
    });
  }

  // Add key listeners to all input fields
  const inputs = document.querySelectorAll('input[type="text"]');
  inputs.forEach(input => {
    input.addEventListener('keydown', (event) => {
      handleKeyInput(event, input.id);
    });

    // Prevent typing
    input.addEventListener('keypress', (event) => {
      event.preventDefault();
    });
  });

  // Save button
  document.getElementById('saveBtn').addEventListener('click', () => {
    saveSettings();
  });

  // Reset button
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      resetSettings();
    }
  });
});
