// Gemini Chat UI improvements with keyboard shortcuts
// Main entry point

// Apply custom styles to hide unnecessary elements
function applyCustomStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Hide Gem list in sidebar */
    .gems-list-container {
      display: none !important;
    }

    /* Hide "My Stuff" section in sidebar */
    .side-nav-entry-container {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

// Initialize the extension
function initialize() {
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

  // Initialize based on current page
  if (isSearchPage()) {
    initializeSearchPage();
  } else {
    initializeChatPage();
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
