import { addDeepDiveButtons } from './targets';
import { injectModeSelector } from './mode-selector';
import { addDeepDiveStyles } from './styles';

let deepDiveTimer: ReturnType<typeof setTimeout> | null = null;

export function initializeDeepDive(): void {
  addDeepDiveStyles();

  const tryInjectModeSelector = () => {
    const hasButtons = document.querySelector(
      'button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]'
    );
    if (
      hasButtons ||
      document.querySelector('div[contenteditable="true"][role="textbox"]')
    ) {
      injectModeSelector();
    } else {
      setTimeout(tryInjectModeSelector, 500);
    }
  };
  tryInjectModeSelector();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (
      namespace === 'sync' &&
      changes.deepDiveModes &&
      location.href.includes('gemini.google.com') &&
      document.querySelector(
        'button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]'
      )
    ) {
      injectModeSelector();
    }
  });

  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const el = node as Element;
            if (
              el.matches?.('[data-path-to-node]') ||
              el.querySelector?.('[data-path-to-node]')
            ) {
              shouldUpdate = true;
              break;
            }
          }
        }
      }
      if (shouldUpdate) break;
    }

    if (shouldUpdate) {
      if (deepDiveTimer) clearTimeout(deepDiveTimer);
      deepDiveTimer = setTimeout(() => addDeepDiveButtons(), 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => addDeepDiveButtons(), 1000);
}
