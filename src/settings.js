// Settings management

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

// Default deep dive prompt (appended when clicking deep dive button without Ctrl)
const DEFAULT_DEEP_DIVE_PROMPT = 'これについて詳しく';

// Deep dive prompt (loaded from storage)
let deepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;

// Load deep dive prompt from Chrome storage
function loadDeepDivePrompt() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['deepDivePrompt'], (result) => {
      if (result.deepDivePrompt !== undefined) {
        deepDivePrompt = result.deepDivePrompt;
      } else {
        deepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;
      }
      resolve(deepDivePrompt);
    });
  });
}

// Get deep dive prompt (synchronous, use after load)
function getDeepDivePrompt() {
  return deepDivePrompt || DEFAULT_DEEP_DIVE_PROMPT;
}

// Default keyboard shortcuts
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

// Current shortcuts (will be loaded from storage)
let currentShortcuts = null;
let contextMenuSettings = null;

// Load shortcuts from Chrome storage
async function loadShortcuts() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['shortcuts'], (result) => {
      if (result.shortcuts) {
        currentShortcuts = result.shortcuts;
      } else {
        currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
      }
      resolve(currentShortcuts);
    });
  });
}

// Load context menu settings
async function loadContextMenuSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['contextMenuSettings'], (result) => {
      if (result.contextMenuSettings) {
        contextMenuSettings = result.contextMenuSettings;
      } else {
        contextMenuSettings = JSON.parse(JSON.stringify(DEFAULT_CONTEXT_MENU_SETTINGS));
      }
      resolve(contextMenuSettings);
    });
  });
}

// Save context menu settings
function saveContextMenuSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ contextMenuSettings: settings }, () => {
      contextMenuSettings = settings;
      // Notify background script to update menus
      chrome.runtime.sendMessage({
        type: 'updateContextMenu',
        enabled: settings.enabled
      });
      resolve();
    });
  });
}

// Get context menu settings
function getContextMenuSettings() {
  return contextMenuSettings || DEFAULT_CONTEXT_MENU_SETTINGS;
}

// Save shortcuts to Chrome storage
function saveShortcuts(shortcuts) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ shortcuts }, () => {
      currentShortcuts = shortcuts;
      resolve();
    });
  });
}

// Get current shortcuts (synchronous, must be loaded first)
function getShortcuts() {
  return currentShortcuts || DEFAULT_SHORTCUTS;
}

// Reset shortcuts to default
function resetShortcuts() {
  return saveShortcuts(JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS)));
}

// Check if key matches shortcut
function isShortcut(event, shortcutKey) {
  const shortcuts = getShortcuts();

  // Get shortcut from nested object (e.g., 'chat.toggleSidebar')
  const keys = shortcutKey.split('.');
  let shortcut = shortcuts;
  for (const key of keys) {
    shortcut = shortcut[key];
    if (!shortcut) return false;
  }

  // Support for shortcut objects with modifier keys
  if (typeof shortcut === 'object') {
    const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
    const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
    const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

    return event.code === shortcut.key &&
           metaMatch &&
           ctrlMatch &&
           shiftMatch;
  }

  // Check if event matches shortcut (simple key)
  return event.code === shortcut &&
         !event.ctrlKey &&
         !event.metaKey &&
         !event.shiftKey;
}
