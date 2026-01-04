// Gemini Chat UI improvements with keyboard shortcuts
// Main entry point

// Initialize the extension
function initialize() {
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
