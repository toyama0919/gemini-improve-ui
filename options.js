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

// Load shortcuts from storage
function loadShortcuts() {
  chrome.storage.sync.get(['shortcuts'], (result) => {
    if (result.shortcuts) {
      currentShortcuts = result.shortcuts;
    }
    displayShortcuts();
  });
}

// Display shortcuts in UI
function displayShortcuts() {
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

// Save shortcuts to storage
function saveShortcuts() {
  chrome.storage.sync.set({ shortcuts: currentShortcuts }, () => {
    showMessage('Settings saved successfully!');
  });
}

// Reset to default shortcuts
function resetShortcuts() {
  currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  displayShortcuts();
  chrome.storage.sync.set({ shortcuts: currentShortcuts }, () => {
    showMessage('Settings reset to default!');
  });
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
  loadShortcuts();

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
    saveShortcuts();
  });

  // Reset button
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Reset all shortcuts to default values?')) {
      resetShortcuts();
    }
  });
});
