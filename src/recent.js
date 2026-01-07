// Recent chats management

const RECENT_CHATS_KEY = 'gemini-recent-chats';
const MAX_RECENT_CHATS = 5;

// Get recent chats from localStorage
function getRecentChats() {
  try {
    const stored = localStorage.getItem(RECENT_CHATS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to get recent chats:', e);
    return [];
  }
}

// Save recent chat
function saveRecentChat(chatId, title = '') {
  if (!chatId) return;

  try {
    let recentChats = getRecentChats();

    // Remove duplicate if exists
    recentChats = recentChats.filter(chat => chat.id !== chatId);

    // Add to beginning
    recentChats.unshift({
      id: chatId,
      title: title,
      timestamp: Date.now()
    });

    // Keep only MAX_RECENT_CHATS items
    recentChats = recentChats.slice(0, MAX_RECENT_CHATS);

    localStorage.setItem(RECENT_CHATS_KEY, JSON.stringify(recentChats));
  } catch (e) {
    console.error('Failed to save recent chat:', e);
  }
}

// Get current chat ID from URL
function getCurrentChatId() {
  const match = window.location.pathname.match(/\/app\/([a-f0-9]+)/);
  return match ? match[1] : null;
}

// Get current chat title
function getCurrentChatTitle() {
  // Try multiple selectors for different Gemini versions
  const titleElement =
    document.querySelector('conversation-actions .conversation-title') ||
    document.querySelector('.conversation-title') ||
    document.querySelector('[data-test-id="conversation-title"]');

  if (titleElement) {
    const title = titleElement.textContent.trim();
    // Don't return empty or default titles
    if (title && title !== 'New chat' && title !== '新規チャット') {
      return title;
    }
  }

  // Try to get title from first user query
  const firstQuery = document.querySelector('.query-text');
  if (firstQuery) {
    const queryText = firstQuery.textContent.trim();
    // Use first 50 characters as title
    return queryText.length > 50 ? queryText.substring(0, 50) + '...' : queryText;
  }

  return '';
}

// Save current chat as recent
function saveCurrentChatAsRecent() {
  const chatId = getCurrentChatId();
  if (chatId) {
    const title = getCurrentChatTitle();
    saveRecentChat(chatId, title);
  }
}

// Create recent chats section in sidebar
function createRecentChatsSection() {
  // Check if already exists
  if (document.querySelector('.recent-chats-section')) {
    return;
  }

  const recentChats = getRecentChats();
  if (recentChats.length === 0) {
    return;
  }

  // Find conversation items container
  const container = document.querySelector('.conversation-items-container');
  if (!container) {
    return;
  }

  // Create recent section
  const recentSection = document.createElement('div');
  recentSection.className = 'recent-chats-section';
  recentSection.style.cssText = `
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    padding-bottom: 8px;
  `;

  // Create title
  const titleDiv = document.createElement('div');
  titleDiv.textContent = 'Recent';
  titleDiv.style.cssText = `
    padding: 8px 16px;
    font-weight: 500;
    font-size: 11px;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;
  recentSection.appendChild(titleDiv);

  // Create recent chat items
  recentChats.forEach(chat => {
    const chatItem = document.createElement('div');
    chatItem.className = 'conversation recent-chat-item';
    chatItem.setAttribute('data-test-id', 'conversation');
    chatItem.style.cssText = `
      padding: 4px 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      min-height: 28px;
    `;

    chatItem.addEventListener('mouseenter', () => {
      chatItem.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
    });

    chatItem.addEventListener('mouseleave', () => {
      chatItem.style.backgroundColor = '';
    });

    chatItem.addEventListener('click', () => {
      window.location.href = `/app/${chat.id}`;
    });

    const titleSpan = document.createElement('span');
    titleSpan.textContent = chat.title || 'Untitled Chat';
    titleSpan.style.cssText = `
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    `;

    chatItem.appendChild(titleSpan);
    recentSection.appendChild(chatItem);
  });

  // Insert at the beginning
  container.insertBefore(recentSection, container.firstChild);
}

// Update recent chats section
function updateRecentChatsSection() {
  // Remove existing section
  const existing = document.querySelector('.recent-chats-section');
  if (existing) {
    existing.remove();
  }

  // Create new section
  createRecentChatsSection();
}

// Initialize recent chats functionality
function initializeRecentChats() {
  // Save current chat when navigating to a chat page
  if (getCurrentChatId()) {
    // Wait for title to load
    setTimeout(() => {
      saveCurrentChatAsRecent();
    }, 1000);
  }

  // Watch for URL changes (SPA navigation)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      if (getCurrentChatId()) {
        setTimeout(() => {
          saveCurrentChatAsRecent();
          updateRecentChatsSection();
        }, 1000);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Watch for sidebar to appear and add recent section
  const sidebarObserver = new MutationObserver(() => {
    if (document.querySelector('.conversation-items-container') &&
        !document.querySelector('.recent-chats-section')) {
      createRecentChatsSection();
    }
  });

  sidebarObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Initial creation
  setTimeout(() => {
    createRecentChatsSection();
  }, 1500);
}
