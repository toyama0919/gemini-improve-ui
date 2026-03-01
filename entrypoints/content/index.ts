import { initializeKeyboardHandlers, rememberActionButtonPosition } from '../../src/keyboard';
import { initializeChatPage } from '../../src/chat';
import { initializeAutocomplete, initializeSearchAutocomplete } from '../../src/autocomplete';
import { initializeDeepDive } from '../../src/deep-dive';
import { initializeExport } from '../../src/export';
import { showMap, resetMapMode } from '../../src/map';
import { initializeSearchPage, isSearchPage } from '../../src/search';
import { exitHistorySelectionMode } from '../../src/history';
import { initializeDOMAnalyzer } from '../../src/dom-analyzer';

export default defineContentScript({
  matches: [
    'https://gemini.google.com/app*',
    'https://gemini.google.com/search*',
  ],
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
    chat-window {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
    .conversation-container {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
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
