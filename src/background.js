// Background script for context menu

// Context menu templates
const MENU_ITEMS = [
  {
    id: 'gemini-ask',
    title: 'Geminiに質問: "%s"',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'gemini-explain',
    title: 'Geminiで説明',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'gemini-translate',
    title: 'Geminiで翻訳',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'gemini-summarize',
    title: 'Geminiで要約',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'separator-1',
    type: 'separator',
    contexts: ['selection']
  },
  {
    id: 'gemini-review-code',
    title: 'コードレビュー',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'gemini-find-bugs',
    title: 'バグを探す',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'gemini-optimize',
    title: 'コードを最適化',
    contexts: ['selection'],
    type: 'normal'
  },
  {
    id: 'gemini-write-tests',
    title: 'テストコードを生成',
    contexts: ['selection'],
    type: 'normal'
  }
];

// Create context menus
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Create parent menu
    chrome.contextMenus.create({
      id: 'gemini-parent',
      title: 'Gemini',
      contexts: ['selection']
    });

    // Create menu items
    MENU_ITEMS.forEach(item => {
      chrome.contextMenus.create({
        ...item,
        parentId: 'gemini-parent'
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

  let query = '';

  switch (info.menuItemId) {
    case 'gemini-ask':
      // Direct question
      query = selectedText;
      break;

    case 'gemini-explain':
      query = `次のテキストを説明してください：\n\n${selectedText}`;
      break;

    case 'gemini-translate':
      query = `次のテキストを英語に翻訳してください（英語の場合は日本語に翻訳）：\n\n${selectedText}`;
      break;

    case 'gemini-summarize':
      query = `次のテキストを要約してください：\n\n${selectedText}`;
      break;

    case 'gemini-review-code':
      query = `次のコードをレビューして、改善点を指摘してください：\n\n\`\`\`\n${selectedText}\n\`\`\``;
      break;

    case 'gemini-find-bugs':
      query = `次のコードのバグや潜在的な問題を見つけてください：\n\n\`\`\`\n${selectedText}\n\`\`\``;
      break;

    case 'gemini-optimize':
      query = `次のコードを最適化してください：\n\n\`\`\`\n${selectedText}\n\`\`\``;
      break;

    case 'gemini-write-tests':
      query = `次のコードのユニットテストを書いてください：\n\n\`\`\`\n${selectedText}\n\`\`\``;
      break;

    default:
      return;
  }

  // Build URL (without send parameter, uses default behavior)
  const encodedQuery = encodeURIComponent(query);
  const url = `https://gemini.google.com/app?q=${encodedQuery}`;

  // Open in new tab
  chrome.tabs.create({ url });
});
