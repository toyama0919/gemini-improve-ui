// Settings management

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
    historyExit: 'Escape',
    togglePin: { key: 'KeyP', meta: true, shift: true },
    copyAllHistory: { key: 'KeyC', meta: true, shift: true }
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
