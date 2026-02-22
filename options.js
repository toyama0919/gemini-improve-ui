// Options page script

// Default shortcuts (same as settings.js)
const DEFAULT_SHORTCUTS = {
  chat: {
    navigateToSearch: 'Insert',
    toggleSidebar: 'Delete',
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

// Default deep dive modes
const DEFAULT_DEEP_DIVE_MODES = [
  { id: 'default', name: '標準', prompt: 'これについて詳しく' }
];

// Current deep dive modes
let currentDeepDiveModes = JSON.parse(JSON.stringify(DEFAULT_DEEP_DIVE_MODES));

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(['shortcuts', 'chatWidth', 'deepDiveModes', 'currentDeepDiveModeId'], (result) => {
    if (result.shortcuts) {
      currentShortcuts = result.shortcuts;
    }
    if (result.chatWidth) {
      currentChatWidth = result.chatWidth;
    }
    if (result.deepDiveModes && result.deepDiveModes.length > 0) {
      currentDeepDiveModes = result.deepDiveModes;
    }
    displaySettings();
  });
}

// Load shortcuts from storage (backward compatibility)
function loadShortcuts() {
  loadSettings();
}

// Display deep dive modes
function displayDeepDiveModes() {
  const container = document.getElementById('deepDiveModes');
  if (!container) return;

  container.innerHTML = '';
  currentDeepDiveModes.forEach((mode, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = 'border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; margin-bottom: 8px; background: #fafafa; display: grid; grid-template-columns: 120px 1fr auto; gap: 12px; align-items: center;';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.dataset.modeIndex = index;
    nameInput.dataset.modeField = 'name';
    nameInput.value = mode.name || '';
    nameInput.placeholder = '表示名';
    nameInput.style.cssText = 'padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px;';

    const promptInput = document.createElement('input');
    promptInput.type = 'text';
    promptInput.dataset.modeIndex = index;
    promptInput.dataset.modeField = 'prompt';
    promptInput.value = mode.prompt || '';
    promptInput.placeholder = 'プロンプト';
    promptInput.style.cssText = 'padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px;';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-secondary btn-delete-mode';
    deleteBtn.dataset.modeIndex = index;
    deleteBtn.textContent = '削除';
    deleteBtn.style.cssText = 'padding: 6px 12px;';

    itemDiv.appendChild(nameInput);
    itemDiv.appendChild(promptInput);
    itemDiv.appendChild(deleteBtn);
    container.appendChild(itemDiv);

    nameInput.addEventListener('input', (e) => {
      currentDeepDiveModes[index].name = e.target.value;
    });
    promptInput.addEventListener('input', (e) => {
      currentDeepDiveModes[index].prompt = e.target.value;
    });
    deleteBtn.addEventListener('click', () => {
      if (currentDeepDiveModes.length > 1) {
        currentDeepDiveModes.splice(index, 1);
        displayDeepDiveModes();
      } else {
        alert('少なくとも1つのモードが必要です');
      }
    });
  });

  const addButton = document.createElement('button');
  addButton.className = 'btn-primary';
  addButton.textContent = '+ モードを追加';
  addButton.style.cssText = 'width: 100%; margin-top: 8px;';
  addButton.addEventListener('click', () => {
    const newId = 'custom-' + Date.now();
    currentDeepDiveModes.push({ id: newId, name: '新規', prompt: '' });
    displayDeepDiveModes();
  });
  container.appendChild(addButton);
}

// Display settings in UI
function displaySettings() {
  // Deep dive modes
  displayDeepDiveModes();

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
  // Ensure each mode has id
  currentDeepDiveModes.forEach((mode, i) => {
    if (!mode.id) mode.id = 'mode-' + i + '-' + Date.now();
  });

  chrome.storage.sync.set({
    shortcuts: currentShortcuts,
    chatWidth: currentChatWidth,
    deepDiveModes: currentDeepDiveModes
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
  currentDeepDiveModes = JSON.parse(JSON.stringify(DEFAULT_DEEP_DIVE_MODES));
  displaySettings();
  chrome.storage.sync.set({
    shortcuts: currentShortcuts,
    chatWidth: currentChatWidth,
    deepDiveModes: currentDeepDiveModes,
    currentDeepDiveModeId: 'default'
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
