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

// Default context menu items (presets)
const DEFAULT_CONTEXT_MENU_ITEMS = [
  {
    id: 'preset-1',
    title: 'Geminiに質問: "%s"',
    prompt: '{{text}}',
    enabled: true
  },
  {
    id: 'preset-2',
    title: 'Geminiで説明',
    prompt: '次のテキストを説明してください：\n\n{{text}}',
    enabled: true
  },
  {
    id: 'preset-3',
    title: 'コードレビュー',
    prompt: '次のコードをレビューして、改善点を指摘してください：\n\n```\n{{text}}\n```',
    enabled: true
  }
];

// Default context menu settings
const DEFAULT_CONTEXT_MENU_SETTINGS = {
  enabled: true,
  items: DEFAULT_CONTEXT_MENU_ITEMS
};

// Current shortcuts
let currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));

// Current chat width
let currentChatWidth = 900;

// Default deep dive prompt
const DEFAULT_DEEP_DIVE_PROMPT = 'これについて詳しく';

// Current deep dive prompt
let currentDeepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;

// Current context menu settings
let currentContextMenuSettings = JSON.parse(JSON.stringify(DEFAULT_CONTEXT_MENU_SETTINGS));

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(['shortcuts', 'chatWidth', 'contextMenuSettings', 'deepDivePrompt'], (result) => {
    if (result.shortcuts) {
      currentShortcuts = result.shortcuts;
    }
    if (result.chatWidth) {
      currentChatWidth = result.chatWidth;
    }
    if (result.contextMenuSettings) {
      currentContextMenuSettings = result.contextMenuSettings;
    }
    if (result.deepDivePrompt !== undefined) {
      currentDeepDivePrompt = result.deepDivePrompt;
    } else {
      currentDeepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;
    }
    displaySettings();
  });
}

// Load shortcuts from storage (backward compatibility)
function loadShortcuts() {
  loadSettings();
}

// Display context menu items
function displayContextMenuItems() {
  const container = document.getElementById('contextMenuItems');
  if (!container) return;

  container.innerHTML = '';
  const items = currentContextMenuSettings.items || [];

  items.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText = 'border: 1px solid #e0e0e0; border-radius: 4px; padding: 16px; margin-bottom: 12px; background: #fafafa;';

    itemDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <input type="checkbox" id="item-enabled-${index}" ${item.enabled !== false ? 'checked' : ''} style="width: auto; margin: 0;">
        <input type="text" id="item-title-${index}" value="${item.title || ''}" placeholder="Menu title" style="flex: 1; padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px;">
        <button class="btn-secondary" id="item-delete-${index}" style="padding: 6px 12px;">Delete</button>
      </div>
      <textarea id="item-prompt-${index}" placeholder="Prompt template (use {{text}} for selected text)" style="width: 100%; min-height: 80px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 13px; resize: vertical;">${item.prompt || ''}</textarea>
    `;

    container.appendChild(itemDiv);

    // Add event listeners
    document.getElementById(`item-enabled-${index}`).addEventListener('change', (e) => {
      currentContextMenuSettings.items[index].enabled = e.target.checked;
    });

    document.getElementById(`item-title-${index}`).addEventListener('input', (e) => {
      currentContextMenuSettings.items[index].title = e.target.value;
    });

    document.getElementById(`item-prompt-${index}`).addEventListener('input', (e) => {
      currentContextMenuSettings.items[index].prompt = e.target.value;
    });

    document.getElementById(`item-delete-${index}`).addEventListener('click', () => {
      if (confirm('Delete this menu item?')) {
        currentContextMenuSettings.items.splice(index, 1);
        displayContextMenuItems();
      }
    });
  });

  // Add "New Item" button
  const addButton = document.createElement('button');
  addButton.className = 'btn-primary';
  addButton.textContent = '+ Add Menu Item';
  addButton.style.cssText = 'width: 100%; margin-top: 8px;';
  addButton.addEventListener('click', () => {
    const newId = `custom-${Date.now()}`;
    currentContextMenuSettings.items.push({
      id: newId,
      title: 'New Menu Item',
      prompt: '{{text}}',
      enabled: true
    });
    displayContextMenuItems();
  });
  container.appendChild(addButton);
}

// Display settings in UI
function displaySettings() {
  // Context menu
  const contextMenuCheckbox = document.getElementById('contextMenuEnabled');
  if (contextMenuCheckbox) {
    contextMenuCheckbox.checked = currentContextMenuSettings.enabled;
  }

  // Context menu items
  displayContextMenuItems();

  // Deep dive prompt
  const deepDivePromptInput = document.getElementById('deepDivePrompt');
  if (deepDivePromptInput) {
    deepDivePromptInput.value = currentDeepDivePrompt;
  }

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
  // Gather current values from UI
  const deepDivePromptInput = document.getElementById('deepDivePrompt');
  if (deepDivePromptInput) {
    currentDeepDivePrompt = deepDivePromptInput.value;
  }

  chrome.storage.sync.set({
    shortcuts: currentShortcuts,
    chatWidth: currentChatWidth,
    contextMenuSettings: currentContextMenuSettings,
    deepDivePrompt: currentDeepDivePrompt
  }, () => {
    // Notify background script to update context menu
    chrome.runtime.sendMessage({
      type: 'updateContextMenu',
      enabled: currentContextMenuSettings.enabled
    });
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
  currentDeepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;
  currentContextMenuSettings = JSON.parse(JSON.stringify(DEFAULT_CONTEXT_MENU_SETTINGS));
  displaySettings();
  chrome.storage.sync.set({
    shortcuts: currentShortcuts,
    chatWidth: currentChatWidth,
    contextMenuSettings: currentContextMenuSettings,
    deepDivePrompt: currentDeepDivePrompt
  }, () => {
    // Notify background script to update context menu
    chrome.runtime.sendMessage({
      type: 'updateContextMenu',
      enabled: currentContextMenuSettings.enabled
    });
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

  // Context menu checkbox
  const contextMenuCheckbox = document.getElementById('contextMenuEnabled');
  if (contextMenuCheckbox) {
    contextMenuCheckbox.addEventListener('change', (event) => {
      currentContextMenuSettings.enabled = event.target.checked;
    });
  }

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
