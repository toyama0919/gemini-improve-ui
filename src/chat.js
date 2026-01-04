// Chat UI functionality (textarea, sidebar, scrolling, copy buttons)

// Sidebar toggle
let lastClickTime = 0;

// Toggle sidebar open/close
function toggleSidebar() {
  // Don't do anything if clicked within 1 second (wait for animation)
  const now = Date.now();
  if (now - lastClickTime < 1000) {
    return;
  }

  // Click menu button to toggle
  const menuButton = document.querySelector('button[data-test-id="side-nav-menu-button"]');

  if (menuButton) {
    menuButton.click();
    lastClickTime = now;
  }
}

// Chat area cache
let cachedChatArea = null;
let chatAreaCacheTime = 0;
const CHAT_AREA_CACHE_DURATION = 5000; // Cache for 5 seconds

// Get chat area
function getChatArea() {
  const now = Date.now();

  // Return cache if valid
  if (cachedChatArea && (now - chatAreaCacheTime) < CHAT_AREA_CACHE_DURATION) {
    return cachedChatArea;
  }

  // Look for Gemini's chat history scroll container
  const chatHistory = document.querySelector('infinite-scroller.chat-history');
  if (chatHistory && chatHistory.scrollHeight > chatHistory.clientHeight) {
    cachedChatArea = chatHistory;
    chatAreaCacheTime = now;
    return chatHistory;
  }

  // Check if window itself is scrollable
  if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
    cachedChatArea = document.documentElement;
    chatAreaCacheTime = now;
    return document.documentElement;
  }

  // Try other patterns for chat area
  const selectors = [
    'infinite-scroller',
    'main[class*="main"]',
    '.conversation-container',
    '[class*="chat-history"]',
    '[class*="messages"]',
    'main',
    '[class*="scroll"]',
    'div[class*="conversation"]'
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

// Scroll chat area
function scrollChatArea(direction) {
  const chatArea = getChatArea();
  const scrollAmount = window.innerHeight * 0.2;
  const scrollValue = direction === 'up' ? -scrollAmount : scrollAmount;

  // Always no animation for speed
  if (chatArea === document.documentElement || chatArea === document.body) {
    window.scrollBy({ top: scrollValue, behavior: 'auto' });
  } else {
    chatArea.scrollBy({ top: scrollValue, behavior: 'auto' });
  }
}

// Create new chat
function createNewChat() {
  const buttonContent = document.querySelector('[data-test-id="side-nav-action-button-content"]');

  if (buttonContent) {
    const button = buttonContent.closest('button') || buttonContent.closest('side-nav-action-button');
    if (button) {
      button.click();
      return;
    }
  }

  // Alternative method: search by text
  const buttons = Array.from(document.querySelectorAll('side-nav-action-button'));
  const newChatButton = buttons.find(btn =>
    btn.textContent.includes('新規') || btn.textContent.includes('New chat')
  );

  if (newChatButton) {
    newChatButton.click();
  }
}

// Focus textarea
function focusTextarea() {
  const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                   document.querySelector('[contenteditable="true"]');

  if (!textarea) return;

  textarea.focus();

  // Move cursor to end for contenteditable elements
  if (textarea.contentEditable === 'true') {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(textarea);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// Clear and focus textarea (wait for element after page navigation)
function clearAndFocusTextarea() {
  let attempts = 0;
  const maxAttempts = 10;

  const interval = setInterval(() => {
    attempts++;
    const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');

    if (textarea) {
      clearInterval(interval);

      // Clear content (safely with DOM operations)
      while (textarea.firstChild) {
        textarea.removeChild(textarea.firstChild);
      }

      // Recreate Gemini's empty state structure
      const p = document.createElement('p');
      const br = document.createElement('br');
      p.appendChild(br);
      textarea.appendChild(p);

      // Focus
      textarea.focus();

      // Dispatch input event
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 200);
}

// Get query from URL parameter and set to textarea
function setQueryFromUrl() {
  // Only process when URL path is /app only (don't process if there's existing conversation ID)
  const path = window.location.pathname;
  if (path !== '/app' && path !== '/app/') {
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q');

  if (!query) return;

  let attempts = 0;
  const maxAttempts = 20;

  const interval = setInterval(() => {
    attempts++;
    const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');

    if (textarea) {
      clearInterval(interval);

      // Clear content
      while (textarea.firstChild) {
        textarea.removeChild(textarea.firstChild);
      }

      // Set query text
      const p = document.createElement('p');
      p.textContent = query;
      textarea.appendChild(p);

      // Focus
      textarea.focus();

      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textarea);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      // Dispatch input event to update Gemini UI
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // Find and click send button
      setTimeout(() => {
        const sendButton = document.querySelector('button[aria-label*="送信"]') ||
                          document.querySelector('button[aria-label*="Send"]') ||
                          document.querySelector('button.send-button') ||
                          Array.from(document.querySelectorAll('button')).find(btn =>
                            btn.getAttribute('aria-label')?.includes('送信') ||
                            btn.getAttribute('aria-label')?.includes('Send')
                          );

        if (sendButton && !sendButton.disabled) {
          sendButton.click();
        }
      }, 500);
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 200);
}

// Get and focus copy button
function focusCopyButton(direction) {
  const copyButtons = Array.from(document.querySelectorAll('button[aria-label*="コピー"], button[aria-label*="Copy"], button.copy-button'));

  // Look for copy button from last output
  if (copyButtons.length === 0) return false;

  if (direction === 'up') {
    // Up key: focus on last copy button
    copyButtons[copyButtons.length - 1].focus();
  } else {
    // Down key: focus on first copy button
    copyButtons[0].focus();
  }

  return true;
}

// Move between copy buttons
function moveBetweenCopyButtons(direction) {
  const copyButtons = Array.from(document.querySelectorAll('button[aria-label*="コピー"], button[aria-label*="Copy"], button.copy-button'));
  const currentIndex = copyButtons.findIndex(btn => btn === document.activeElement);

  if (currentIndex === -1) return false;

  if (direction === 'up') {
    if (currentIndex > 0) {
      // Focus on previous copy button
      copyButtons[currentIndex - 1].focus();
      return true;
    } else {
      // First copy button, so return to textarea
      focusTextarea();
      return true;
    }
  } else {
    if (currentIndex < copyButtons.length - 1) {
      // Focus on next copy button
      copyButtons[currentIndex + 1].focus();
      return true;
    } else {
      // Last copy button, so return to textarea
      focusTextarea();
      return true;
    }
  }
}

// Initialize chat page
function initializeChatPage() {
  // Check query parameter on page load
  setTimeout(() => {
    setQueryFromUrl();
  }, 1000);
}
