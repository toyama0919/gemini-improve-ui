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

  // Detect URL changes in SPA and reinitialize autocomplete
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;

      // Reset action button position on URL change
      if (typeof window.rememberActionButtonPosition === 'function') {
        window.rememberActionButtonPosition(-1);
      }

      // Reset map mode on navigation
      if (typeof resetMapMode === 'function') {
        resetMapMode();
      }

      // Wait for new page to load
      setTimeout(() => {
        if (typeof initializeAutocomplete === 'function') {
          initializeAutocomplete();
        }
        if (typeof initializeSearchAutocomplete === 'function') {
          initializeSearchAutocomplete();
        }
        // Re-show map after navigation
        if (!isSearchPage() && typeof showMap === 'function') {
          showMap();
        }
      }, 1500);
    }
  }).observe(document, { subtree: true, childList: true });

  // Initialize keyboard handlers
  initializeKeyboardHandlers();

  // Initialize based on current page
  if (isSearchPage()) {
    initializeSearchPage();
    if (typeof initializeSearchAutocomplete === 'function') {
      initializeSearchAutocomplete();
    }
  } else {
    initializeChatPage();
    // Initialize deep dive functionality
    if (typeof initializeDeepDive === 'function') {
      initializeDeepDive();
    }
    // Show map panel on load
    setTimeout(() => {
      if (typeof showMap === 'function') showMap();
    }, 1500);
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
