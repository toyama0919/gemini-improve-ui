// Chat UI functionality (textarea, sidebar, scrolling, copy buttons)

import { initializeAutocomplete } from './autocomplete';
import { SURFACE_REINIT_DELAY_MS } from './surface-reinit-delay';

let cachedChatArea: Element | null = null;
let chatAreaCacheTime = 0;
const CHAT_AREA_CACHE_DURATION = 5000;

export function getChatArea(): Element {
  const now = Date.now();

  if (cachedChatArea && now - chatAreaCacheTime < CHAT_AREA_CACHE_DURATION) {
    return cachedChatArea;
  }

  const chatHistory = document.querySelector('infinite-scroller.chat-history');
  if (chatHistory && chatHistory.scrollHeight > chatHistory.clientHeight) {
    cachedChatArea = chatHistory;
    chatAreaCacheTime = now;
    return chatHistory;
  }

  if (
    document.documentElement.scrollHeight >
    document.documentElement.clientHeight
  ) {
    cachedChatArea = document.documentElement;
    chatAreaCacheTime = now;
    return document.documentElement;
  }

  const selectors = [
    'infinite-scroller',
    'main[class*="main"]',
    '.conversation-container',
    '[class*="chat-history"]',
    '[class*="messages"]',
    'main',
    '[class*="scroll"]',
    'div[class*="conversation"]',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.scrollHeight > element.clientHeight) {
      cachedChatArea = element;
      chatAreaCacheTime = now;
      return element;
    }
  }

  cachedChatArea = document.documentElement;
  chatAreaCacheTime = now;
  return document.documentElement;
}

export function scrollChatArea(direction: 'up' | 'down'): void {
  const chatArea = getChatArea();
  const scrollAmount = window.innerHeight * 0.1;
  const scrollValue = direction === 'up' ? -scrollAmount : scrollAmount;

  if (chatArea === document.documentElement || chatArea === document.body) {
    window.scrollBy({ top: scrollValue, behavior: 'auto' });
  } else {
    (chatArea as HTMLElement).scrollBy({ top: scrollValue, behavior: 'auto' });
  }
}

export function createNewChat(): void {
  const newChatLink =
    document.querySelector<HTMLAnchorElement>(
      'a[href="https://gemini.google.com/app"]'
    ) ||
    document.querySelector<HTMLAnchorElement>('a[aria-label*="新規作成"]') ||
    document.querySelector<HTMLAnchorElement>('a[aria-label*="New chat"]');

  if (newChatLink) {
    newChatLink.click();
    reinitializeAfterNavigation();
    return;
  }

  const newChatButton = document.querySelector('[data-test-id="new-chat-button"]');
  if (newChatButton) {
    const clickable =
      newChatButton.querySelector<HTMLElement>('a, button') ||
      (newChatButton as HTMLElement);
    clickable.click();
    reinitializeAfterNavigation();
    return;
  }

  const links = Array.from(document.querySelectorAll<HTMLElement>('a, button'));
  const newChatBtn = links.find(
    (el) =>
      el.textContent?.includes('新規作成') ||
      el.textContent?.includes('New chat') ||
      el.textContent?.includes('新規')
  );
  if (newChatBtn) {
    newChatBtn.click();
    reinitializeAfterNavigation();
  }
}

export function reinitializeAfterNavigation(): void {
  setTimeout(() => {
    initializeAutocomplete();
  }, SURFACE_REINIT_DELAY_MS);
}

export function focusTextarea(): void {
  const textarea =
    document.querySelector<HTMLElement>(
      'div[contenteditable="true"][role="textbox"]'
    ) || document.querySelector<HTMLElement>('[contenteditable="true"]');

  if (!textarea) return;
  textarea.focus();

  if (textarea.contentEditable === 'true') {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(textarea);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}

const CLIPBOARD_HANDLED_SEARCH_KEY = 'gemini-improve-ui-clipboard-handled-search';
const CLIPBOARD_FALLBACK_HOST_ID = 'gemini-improve-ui-clipboard-fallback';

function isClipboardParamTruthy(raw: string | null): boolean {
  if (raw === null) return false;
  const v = raw.trim().toLowerCase();
  return v === '' || v === '1' || v === 'true';
}

function stripClipboardParamFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('clipboard')) return;
  url.searchParams.delete('clipboard');
  const search = url.searchParams.toString();
  const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  history.replaceState(null, '', next);
}

function mergeInstructionAndClipboard(instruction: string, clipboardBody: string): string {
  const head = instruction.replace(/\s+$/u, '');
  const body = clipboardBody;
  if (!head) return body;
  if (!body) return head;
  return `${head}\n\n${body}`;
}

function fillComposeTextarea(textarea: HTMLElement, text: string): void {
  while (textarea.firstChild) {
    textarea.removeChild(textarea.firstChild);
  }
  const p = document.createElement('p');
  if (text.length === 0) {
    p.appendChild(document.createElement('br'));
  } else {
    p.textContent = text;
  }
  textarea.appendChild(p);
  textarea.focus();

  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(textarea);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function scheduleSendIfNeeded(shouldSend: boolean): void {
  if (!shouldSend) return;
  setTimeout(() => {
    const sendButton =
      document.querySelector<HTMLButtonElement>('button[aria-label*="送信"]') ||
      document.querySelector<HTMLButtonElement>('button[aria-label*="Send"]') ||
      document.querySelector<HTMLButtonElement>('button.send-button') ||
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (btn) =>
          btn.getAttribute('aria-label')?.includes('送信') ||
          btn.getAttribute('aria-label')?.includes('Send')
      );
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
    }
  }, 500);
}

function removeClipboardFallbackUi(): void {
  document.getElementById(CLIPBOARD_FALLBACK_HOST_ID)?.remove();
}

function showClipboardPasteFallback(options: {
  instruction: string;
  shouldSend: boolean;
  initialSearch: string;
  getTextarea: () => HTMLElement | null;
}): void {
  removeClipboardFallbackUi();

  const host = document.createElement('div');
  host.id = CLIPBOARD_FALLBACK_HOST_ID;
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Clipboard paste helper');
  host.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:2147483646',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:10px 12px',
    'border-radius:8px',
    'background:rgba(32,33,36,0.95)',
    'color:#e8eaed',
    'font:13px/1.4 system-ui,sans-serif',
    'box-shadow:0 2px 12px rgba(0,0,0,0.35)',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = 'Clipboard could not be read automatically.';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Paste from clipboard';
  btn.style.cssText = [
    'cursor:pointer',
    'border:none',
    'border-radius:6px',
    'padding:6px 12px',
    'background:#8ab4f8',
    'color:#202124',
    'font:inherit',
    'font-weight:600',
  ].join(';');

  btn.addEventListener('click', () => {
    void (async () => {
      let clipboardBody: string;
      try {
        clipboardBody = await navigator.clipboard.readText();
      } catch {
        return;
      }
      const textarea = options.getTextarea();
      if (!textarea) return;
      const merged = mergeInstructionAndClipboard(options.instruction, clipboardBody);
      fillComposeTextarea(textarea, merged);
      removeClipboardFallbackUi();
      stripClipboardParamFromUrl();
      sessionStorage.setItem(CLIPBOARD_HANDLED_SEARCH_KEY, options.initialSearch);
      scheduleSendIfNeeded(options.shouldSend);
    })();
  });

  host.append(label, btn);
  document.body.appendChild(host);
}

export function clearAndFocusTextarea(): void {
  let attempts = 0;
  const maxAttempts = 10;

  const interval = setInterval(() => {
    attempts++;
    const textarea = document.querySelector<HTMLElement>(
      'div[contenteditable="true"][role="textbox"]'
    );

    if (textarea) {
      clearInterval(interval);
      while (textarea.firstChild) {
        textarea.removeChild(textarea.firstChild);
      }
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      textarea.appendChild(p);
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 200);
}

export function setQueryFromUrl(): void {
  const initialSearch = window.location.search;
  const urlParams = new URLSearchParams(initialSearch);
  const path = window.location.pathname;

  const isNewChat = path === '/app' || path === '/app/';
  const query = isNewChat ? urlParams.get('q') : null;
  const queryThread = urlParams.get('qt');
  const instructionText = query || queryThread || '';
  const clipboardWanted = isNewChat && isClipboardParamTruthy(urlParams.get('clipboard'));

  if (clipboardWanted) {
    if (sessionStorage.getItem(CLIPBOARD_HANDLED_SEARCH_KEY) === initialSearch) {
      return;
    }
  }

  if (!instructionText && !clipboardWanted) return;

  const send = urlParams.get('send');
  const shouldSend = send === null || send === 'true' || send === '1';

  let attempts = 0;
  const maxAttempts = 20;

  const interval = setInterval(() => {
    attempts++;
    const textarea = document.querySelector<HTMLElement>(
      'div[contenteditable="true"][role="textbox"]'
    );

    if (textarea) {
      clearInterval(interval);

      if (clipboardWanted) {
        void (async () => {
          let clipboardBody: string;
          try {
            clipboardBody = await navigator.clipboard.readText();
          } catch {
            if (instructionText.length > 0) {
              fillComposeTextarea(textarea, instructionText);
            }
            showClipboardPasteFallback({
              instruction: instructionText,
              shouldSend,
              initialSearch,
              getTextarea: () =>
                document.querySelector<HTMLElement>(
                  'div[contenteditable="true"][role="textbox"]'
                ),
            });
            return;
          }

          const merged = mergeInstructionAndClipboard(instructionText, clipboardBody);
          fillComposeTextarea(textarea, merged);
          removeClipboardFallbackUi();
          stripClipboardParamFromUrl();
          sessionStorage.setItem(CLIPBOARD_HANDLED_SEARCH_KEY, initialSearch);
          scheduleSendIfNeeded(shouldSend);
        })();
        return;
      }

      fillComposeTextarea(textarea, instructionText);
      scheduleSendIfNeeded(shouldSend);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 200);
}

export function focusActionButton(direction: 'up' | 'down'): boolean {
  const actionButtons = getAllActionButtons();
  if (actionButtons.length === 0) return false;

  if (direction === 'up') {
    actionButtons[actionButtons.length - 1].focus();
  } else {
    actionButtons[0].focus();
  }
  return true;
}

export function moveBetweenActionButtons(direction: 'up' | 'down'): boolean {
  const actionButtons = getAllActionButtons();
  const currentIndex = actionButtons.findIndex(
    (btn) => btn === document.activeElement
  );
  if (currentIndex === -1) return false;

  if (direction === 'up') {
    if (currentIndex > 0) {
      actionButtons[currentIndex - 1].focus();
      window.rememberActionButtonPosition?.(currentIndex - 1);
      return true;
    }
    return true;
  } else {
    if (currentIndex < actionButtons.length - 1) {
      actionButtons[currentIndex + 1].focus();
      window.rememberActionButtonPosition?.(currentIndex + 1);
      return true;
    }
    return true;
  }
}

export function getAllActionButtons(): HTMLElement[] {
  const allButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button.deep-dive-button-inline, button[data-action="deep-dive"]'
    )
  );

  return allButtons.filter((btn) => {
    const container =
      btn.closest('[data-test-id*="user"]') ||
      btn.closest('[data-test-id*="prompt"]') ||
      btn.closest('[class*="user"]');
    return !container;
  });
}

const SIDEBAR_CLOSE_SELECTORS = [
  'button[aria-label="サイドバーを閉じる"]',
  'button[aria-label="Close sidebar"]',
] as const;

const SIDEBAR_OPEN_SELECTORS = [
  '[data-test-id="side-nav-sparkle-button"]',
  '[data-test-id="side-nav-toggle"]',
  '[data-test-id="side-nav-menu-button"]',
  'button[aria-label="サイドバーを開く"]',
  'button[aria-label="Open sidebar"]',
  'button[aria-label*="Main menu"]',
  'button[aria-label*="メインメニュー"]',
] as const;

function queryFirstVisible(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && el.offsetParent !== null) return el;
  }
  return null;
}

export function findSidebarToggleButton(): HTMLElement | null {
  // Prefer close when the drawer is open (Gemini shows both open + close in some layouts).
  return (
    queryFirstVisible(SIDEBAR_CLOSE_SELECTORS) ||
    queryFirstVisible(SIDEBAR_OPEN_SELECTORS)
  );
}

export function isSidebarOpen(): boolean {
  if (queryFirstVisible(SIDEBAR_CLOSE_SELECTORS)) return true;

  const bardSidenav = document.querySelector('bard-sidenav');
  if (bardSidenav) {
    return bardSidenav.getBoundingClientRect().width > 100;
  }

  const matSidenav = document.querySelector('mat-sidenav, mat-drawer');
  if (matSidenav) {
    return matSidenav.classList.contains('mat-drawer-opened');
  }

  return false;
}

export function toggleSidebar(): void {
  const toggle = findSidebarToggleButton();
  if (toggle) toggle.click();
}

export function initializeChatPage(): void {
  setTimeout(() => {
    setQueryFromUrl();
  }, 1000);

  setTimeout(() => {
    initializeAutocomplete();
  }, SURFACE_REINIT_DELAY_MS);

  const observer = new MutationObserver(() => {
    const isStreaming = document.querySelector('[aria-busy="true"]');
    if (isStreaming) {
      window.rememberActionButtonPosition?.(-1);
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['aria-busy'],
    subtree: true,
  });
}
