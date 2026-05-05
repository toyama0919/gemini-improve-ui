import { initializeKeyboardHandlers, rememberActionButtonPosition } from '../../src/keyboard';
import { initializeChatPage } from '../../src/chat';
import { initializeAutocomplete, initializeSearchAutocomplete } from '../../src/autocomplete';
import { initializeDeepDive } from '../../src/deep-dive';
import { initializeExport } from '../../src/export';
import { showMap, resetMapMode } from '../../src/map';
import { initializeSearchPage, isSearchPage } from '../../src/search';
import { exitHistorySelectionMode } from '../../src/history';
import { initializeDOMAnalyzer } from '../../src/dom-analyzer';
import { initializeQuickPrompts } from '../../src/quick-prompts';

export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  runAt: 'document_end',

  main() {
    // Expose window globals used across modules
    window.rememberActionButtonPosition = rememberActionButtonPosition;

    initializeDOMAnalyzer();
    initialize();
  },
});

function applyCustomStyles(): void {
  const styleId = 'gemini-improve-ui-custom-styles';
  document.getElementById(styleId)?.remove();

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .gems-list-container {
      display: none !important;
    }
    .side-nav-entry-container {
      display: none !important;
    }
    /* Notebook sidebar list (any column; scoped selectors missed real DOM) */
    project-sidenav-list {
      display: none !important;
    }
    mat-drawer-content,
    .mat-drawer-inner-container,
    bard-sidenav-content {
      min-width: 0 !important;
    }
    main.main {
      min-width: 0 !important;
      box-sizing: border-box !important;
    }
    chat-window {
      box-sizing: border-box !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: min(var(--chat-max-width, 900px), 100%) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .conversation-container {
      box-sizing: border-box !important;
      min-width: 0 !important;
      max-width: min(var(--chat-max-width, 900px), 100%) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
    chat-window .markdown-main-panel,
    .conversation-container .markdown-main-panel,
    chat-window .markdown,
    .conversation-container .markdown {
      min-width: 0 !important;
      max-width: 100% !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .conversation-container .markdown-main-panel table-block,
    .conversation-container .markdown-main-panel .table-block-component,
    .conversation-container .markdown-main-panel .table-block,
    chat-window .markdown-main-panel table-block,
    chat-window .markdown-main-panel .table-block-component,
    chat-window .markdown-main-panel .table-block {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel .table-content,
    chat-window .markdown-main-panel .table-content {
      width: 100% !important;
      max-width: none !important;
      overflow-x: visible !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel table[data-path-to-node],
    chat-window .markdown-main-panel table[data-path-to-node] {
      width: 100% !important;
      max-width: none !important;
      table-layout: fixed !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel table[data-path-to-node] th,
    .conversation-container .markdown-main-panel table[data-path-to-node] td,
    chat-window .markdown-main-panel table[data-path-to-node] th,
    chat-window .markdown-main-panel table[data-path-to-node] td {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `;
  document.head.appendChild(style);
}

function updateChatWidth(width: number): void {
  document.documentElement.style.setProperty('--chat-max-width', `${width}px`);
}

function loadChatWidth(): void {
  chrome.storage.sync.get(['chatWidth'], (result) => {
    updateChatWidth(result.chatWidth || 900);
  });
}

function initialize(): void {
  loadChatWidth();
  applyCustomStyles();

  window.addEventListener('popstate', () => {
    exitHistorySelectionMode();
  });

  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;

      window.rememberActionButtonPosition?.(-1);
      resetMapMode();

      setTimeout(() => {
        initializeAutocomplete();
        initializeSearchAutocomplete();
        if (!isSearchPage()) {
          showMap();
          initializeQuickPrompts();
        }
        document.getElementById('gemini-export-note-button')?.remove();
        initializeExport();
      }, 1500);
    }
  }).observe(document, { subtree: true, childList: true });

  initializeKeyboardHandlers();

  if (isSearchPage()) {
    initializeSearchPage();
    initializeSearchAutocomplete();
  } else {
    initializeChatPage();
    initializeDeepDive();
    initializeQuickPrompts();
    setTimeout(() => {
      initializeExport();
    }, 1500);
    setTimeout(() => {
      showMap();
    }, 1500);
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.chatWidth) {
      updateChatWidth(changes.chatWidth.newValue);
      applyCustomStyles();
    }
  });
}
