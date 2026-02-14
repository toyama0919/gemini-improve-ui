// Background script for context menu

// Default preset menu items (used on first install)
const DEFAULT_PRESET_ITEMS = [
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

// Get menu items from storage
function getMenuItems(callback) {
  chrome.storage.sync.get(['contextMenuSettings'], (result) => {
    let settings = result.contextMenuSettings;
    
    // Initialize with default presets on first run
    if (!settings || !settings.items) {
      settings = {
        enabled: true,
        items: DEFAULT_PRESET_ITEMS
      };
      chrome.storage.sync.set({ contextMenuSettings: settings });
    }
    
    // Filter only enabled items
    const enabledItems = settings.items.filter(item => item.enabled !== false);
    callback(enabledItems);
  });
}

// Create context menus
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    getMenuItems((menuItems) => {
      if (menuItems.length === 0) return;

      // Create parent menu
      chrome.contextMenus.create({
        id: 'gemini-parent',
        title: 'Gemini',
        contexts: ['selection']
      });

      // Create menu items
      menuItems.forEach(item => {
        chrome.contextMenus.create({
          id: item.id,
          title: item.title,
          contexts: ['selection'],
          type: 'normal',
          parentId: 'gemini-parent'
        });
      });
    });
  });
}

// Remove context menus
function removeContextMenus() {
  chrome.contextMenus.removeAll();
}

// Load settings and create menus on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['contextMenuSettings'], (result) => {
    const settings = result.contextMenuSettings || { enabled: true };
    if (settings.enabled) {
      createContextMenus();
    }
  });
});

// Load settings and create menus on startup (when browser starts)
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['contextMenuSettings'], (result) => {
    const settings = result.contextMenuSettings || { enabled: true };
    if (settings.enabled) {
      createContextMenus();
    }
  });
});

// Also create menus when service worker wakes up
chrome.storage.sync.get(['contextMenuSettings'], (result) => {
  const settings = result.contextMenuSettings || { enabled: true };
  if (settings.enabled) {
    createContextMenus();
  }
});

// Listen for messages from options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateContextMenu') {
    if (message.enabled) {
      createContextMenus();
    } else {
      removeContextMenus();
    }
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const selectedText = info.selectionText;
  if (!selectedText) return;

  // Get all menu items (not just enabled ones) to find the clicked item
  chrome.storage.sync.get(['contextMenuSettings'], (result) => {
    const settings = result.contextMenuSettings;
    if (!settings || !settings.items) return;
    
    const menuItem = settings.items.find(item => item.id === info.menuItemId);
    if (!menuItem || !menuItem.prompt) return;

    // Replace {{text}} placeholder with selected text
    const query = menuItem.prompt.replace(/\{\{text\}\}/g, selectedText);

    // Build URL (without send parameter, uses default behavior)
    const encodedQuery = encodeURIComponent(query);
    const url = `https://gemini.google.com/app?q=${encodedQuery}`;

    // Open in new tab
    chrome.tabs.create({ url });
  });
});
