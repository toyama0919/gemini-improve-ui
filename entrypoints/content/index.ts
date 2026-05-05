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
import { CHAT_LAYOUT_CUSTOM_CSS } from '../../src/styles/chatLayout';
import { SURFACE_REINIT_DELAY_MS } from '../../src/surface-reinit-delay';

export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  runAt: 'document_end',

  main() {
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
  style.textContent = CHAT_LAYOUT_CUSTOM_CSS;
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

/** After SPA navigation: autocomplete, export, map, quick prompts on chat routes */
function scheduleSurfaceReinit(): void {
  setTimeout(() => {
    initializeAutocomplete();
    initializeSearchAutocomplete();
    document.getElementById('gemini-export-note-button')?.remove();
    initializeExport();
    if (!isSearchPage()) {
      showMap();
      initializeQuickPrompts();
    }
  }, SURFACE_REINIT_DELAY_MS);
}

/** First chat load: DOM settled before export hook + map panel */
function scheduleInitialChatDeferredSurface(): void {
  setTimeout(() => {
    document.getElementById('gemini-export-note-button')?.remove();
    initializeExport();
    showMap();
  }, SURFACE_REINIT_DELAY_MS);
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

      scheduleSurfaceReinit();
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
    scheduleInitialChatDeferredSurface();
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.chatWidth) {
      updateChatWidth(changes.chatWidth.newValue);
      applyCustomStyles();
    }
  });
}
