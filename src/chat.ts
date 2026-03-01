// Chat UI functionality (textarea, sidebar, scrolling, copy buttons)

import { initializeAutocomplete } from './autocomplete';

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
  }, 1500);
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
  const path = window.location.pathname;
  if (path !== '/app' && path !== '/app/') return;

  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');
  if (!query) return;

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

      while (textarea.firstChild) {
        textarea.removeChild(textarea.firstChild);
      }
      const p = document.createElement('p');
      p.textContent = query;
      textarea.appendChild(p);
      textarea.focus();

      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textarea);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);

      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      if (shouldSend) {
        setTimeout(() => {
          const sendButton =
            document.querySelector<HTMLButtonElement>('button[aria-label*="送信"]') ||
            document.querySelector<HTMLButtonElement>('button[aria-label*="Send"]') ||
            document.querySelector<HTMLButtonElement>('button.send-button') ||
            Array.from(
              document.querySelectorAll<HTMLButtonElement>('button')
            ).find(
              (btn) =>
                btn.getAttribute('aria-label')?.includes('送信') ||
                btn.getAttribute('aria-label')?.includes('Send')
            );
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
          }
        }, 500);
      }
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

export function findSidebarToggleButton(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-test-id="side-nav-toggle"]') ||
    document.querySelector<HTMLElement>('button[aria-label*="メニュー"]') ||
    document.querySelector<HTMLElement>('button[aria-label*="menu"]') ||
    document.querySelector<HTMLElement>('button[aria-label*="Menu"]')
  );
}

export function isSidebarOpen(): boolean {
  const sidenav = document.querySelector('mat-sidenav');
  if (!sidenav) return true;
  return sidenav.classList.contains('mat-drawer-opened');
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
  }, 1500);

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
