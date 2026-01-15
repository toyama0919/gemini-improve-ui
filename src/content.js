// Gemini Chat UI improvements with keyboard shortcuts
// Main entry point

// Apply custom styles to hide unnecessary elements and adjust chat width
function applyCustomStyles() {
  const styleId = 'gemini-improve-ui-custom-styles';

  // Remove existing style if present
  const existingStyle = document.getElementById(styleId);
  if (existingStyle) {
    existingStyle.remove();
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Hide Gem list in sidebar */
    .gems-list-container {
      display: none !important;
    }

    /* Hide "My Stuff" section in sidebar */
    .side-nav-entry-container {
      display: none !important;
    }

    /* Adjust chat content area width (not main layout) */
    chat-window {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    .conversation-container {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
  `;
  document.head.appendChild(style);
}

// Update chat width from settings
function updateChatWidth(width) {
  document.documentElement.style.setProperty('--chat-max-width', `${width}px`);
}

// Load and apply chat width setting
function loadChatWidth() {
  chrome.storage.sync.get(['chatWidth'], (result) => {
    const width = result.chatWidth || 900; // Default: 900px
    updateChatWidth(width);
  });
}

// Initialize the extension
function initialize() {
  // Load and apply chat width setting
  loadChatWidth();

  // Apply custom styles
  applyCustomStyles();

  // Reset history selection mode on page navigation
  window.addEventListener('popstate', () => {
    if (typeof exitHistorySelectionMode === 'function') {
      exitHistorySelectionMode();
    }
  });

  // Initialize keyboard handlers
  initializeKeyboardHandlers();

  // Initialize recent chats
  if (typeof initializeRecentChats === 'function') {
    initializeRecentChats();
  }

  // Initialize based on current page
  if (isSearchPage()) {
    initializeSearchPage();
  } else {
    initializeChatPage();
  }

  // Listen for storage changes to update width dynamically
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.chatWidth) {
      updateChatWidth(changes.chatWidth.newValue);
      applyCustomStyles();
    }
  });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
