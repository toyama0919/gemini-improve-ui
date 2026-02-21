// Keyboard event handlers

// Remember last focused action button index
let lastFocusedActionButtonIndex = -1;

// Reset last focused button index (called on new question or reload)
function resetLastFocusedActionButton() {
  lastFocusedActionButtonIndex = -1;
}

// Remember action button position (called from chat.js)
window.rememberActionButtonPosition = function(index) {
  lastFocusedActionButtonIndex = index;
};

// Handle search page keyboard events
function handleSearchPageKeydown(event) {
  // If autocomplete is visible, don't handle navigation keys
  if (typeof isAutocompleteVisible === 'function' && isAutocompleteVisible()) {
    // Let autocomplete handle these keys
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
        event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
      return false;
    }
  }

  // Insert: Toggle between search page and chat page
  if (isShortcut(event, 'chat.navigateToSearch')) {
    event.preventDefault();
    toggleSearchPage();
    return true;
  }

  // Select search results with up/down keys (works even when focus is on input field)
  if (isShortcut(event, 'search.moveUp')) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    moveSearchResultUp();
    return true;
  }

  if (isShortcut(event, 'search.moveDown')) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    moveSearchResultDown();
    return true;
  }

  // Open selected search result with Enter key
  if (isShortcut(event, 'search.openResult')) {
    // Skip if IME is composing (Japanese input)
    if (event.isComposing) {
      return false;
    }

    // Open search result when Enter is pressed in textarea (without Shift)
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSelectedSearchResult();
    return true;
  }

  // Normal scroll processing for PageUp/PageDown only
  if (isShortcut(event, 'search.scrollUp')) {
    event.preventDefault();
    window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'auto' });
    return true;
  }

  if (isShortcut(event, 'search.scrollDown')) {
    event.preventDefault();
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'auto' });
    return true;
  }

  // Disable other shortcut keys (Home, End, Delete)
  const shortcuts = getShortcuts();
  const chatKeys = Object.values(shortcuts.chat);
  if (chatKeys.includes(event.code)) {
    return true;
  }

  // Normal operation for other keys (input, etc.)
  return false;
}

// Handle chat page keyboard events
function handleChatPageKeydown(event) {
  const isInInput = event.target.matches('input, textarea, [contenteditable="true"]');

  // If autocomplete is visible, don't handle navigation keys
  if (typeof isAutocompleteVisible === 'function' && isAutocompleteVisible()) {
    // Let autocomplete handle these keys
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' ||
        event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
      return false;
    }
  }

  // Ctrl+Shift+D: Copy DOM structure for AI analysis
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
    event.preventDefault();
    if (window.domAnalyzer) {
      window.domAnalyzer.copyToClipboard();
    } else {
      console.error('[Keyboard] DOMAnalyzer not loaded');
    }
    return true;
  }

  // Insert: Toggle between search page and chat page
  if (isShortcut(event, 'chat.navigateToSearch')) {
    event.preventDefault();
    toggleSearchPage();
    return true;
  }

  // Delete: Toggle sidebar
  if (isShortcut(event, 'chat.toggleSidebar')) {
    event.preventDefault();
    toggleSidebar();
    return true;
  }

  // End: Cycle textarea → action buttons → チャット一覧 → textarea
  if (isShortcut(event, 'chat.toggleHistoryMode')) {
    event.preventDefault();

    const actionButtons = getAllActionButtons();
    const hasResponses = actionButtons.length > 0;

    if (isHistorySelectionMode()) {
      exitHistorySelectionMode();
      focusTextarea();
    } else if (isInInput) {
      if (hasResponses) {
        let targetIndex = lastFocusedActionButtonIndex;
        if (targetIndex < 0 || targetIndex >= actionButtons.length) {
          targetIndex = actionButtons.length - 1;
        }
        actionButtons[targetIndex].focus();
      } else {
        enterHistorySelectionMode();
      }
    } else {
      const focusedElement = document.activeElement;
      const isActionButton = focusedElement &&
                            (focusedElement.classList?.contains('deep-dive-button-inline') ||
                             focusedElement.getAttribute('data-action') === 'deep-dive');
      if (isActionButton) {
        const currentIndex = actionButtons.findIndex(btn => btn === focusedElement);
        if (currentIndex !== -1) lastFocusedActionButtonIndex = currentIndex;
        enterHistorySelectionMode();
      } else {
        focusTextarea();
      }
    }
    return true;
  }

  // Esc: Exit history selection mode
  if (isHistorySelectionMode() && isShortcut(event, 'chat.historyExit')) {
    event.preventDefault();
    exitHistorySelectionMode();
    return true;
  }

  // PageUp: Scroll chat area up
  if (isShortcut(event, 'chat.scrollUp')) {
    event.preventDefault();
    scrollChatArea('up');
    return true;
  }

  // PageDown: Scroll chat area down
  if (isShortcut(event, 'chat.scrollDown')) {
    event.preventDefault();
    scrollChatArea('down');
    return true;
  }

  // Always process arrow keys and Enter in history selection mode
  if (isHistorySelectionMode()) {
    if (isShortcut(event, 'chat.historyUp')) {
      event.preventDefault();
      moveHistoryUp();
      return true;
    } else if (isShortcut(event, 'chat.historyDown')) {
      event.preventDefault();
      moveHistoryDown();
      return true;
    } else if (isShortcut(event, 'chat.historyOpen')) {
      event.preventDefault();
      openSelectedHistory();
      return true;
    }
  }

  // Focus on action button when up/down keys are pressed with empty textarea
  if (!isHistorySelectionMode() && isInInput &&
      (isShortcut(event, 'chat.historyUp') || isShortcut(event, 'chat.historyDown'))) {
    const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');

    if (textarea && textarea.textContent.trim() === '') {
      event.preventDefault();
      const direction = isShortcut(event, 'chat.historyUp') ? 'up' : 'down';
      focusActionButton(direction);
      return true;
    }
  }

  // Arrow key operations outside history selection and not in input field
  if (!isHistorySelectionMode() && !isInInput) {
    // Processing when action button (deep-dive) has focus
    const focusedElement = document.activeElement;
    const isActionButton = focusedElement &&
                          (focusedElement.classList?.contains('deep-dive-button-inline') ||
                           focusedElement.getAttribute('data-action') === 'deep-dive');

    // Only process keys when deep-dive button is focused
    // This ensures no conflict with textarea or sidebar navigation
    if (isActionButton) {
      // Up/Down: Move between action buttons
      if (isShortcut(event, 'chat.historyUp') || isShortcut(event, 'chat.historyDown')) {
        event.preventDefault();
        const direction = isShortcut(event, 'chat.historyUp') ? 'up' : 'down';
        moveBetweenActionButtons(direction);
        return true;
      }
      
      // Left/Right: Expand/collapse if expand button exists
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        
        const expandButton = focusedElement._expandButton;
        const target = focusedElement._deepDiveTarget;
        
        if (expandButton && target) {
          const isExpanded = expandButton.getAttribute('data-action') === 'collapse';
          
          if (event.key === 'ArrowRight' && !isExpanded) {
            // Right: Expand
            expandButton.click();
          } else if (event.key === 'ArrowLeft' && isExpanded) {
            // Left: Collapse
            expandButton.click();
          }
        }
        return true;
      }
      
      // Enter: Click the focused button
      if (isShortcut(event, 'chat.historyOpen')) {
        event.preventDefault();
        focusedElement.click();
        return true;
      }
    }

  }

  return false;
}

// Initialize keyboard event listeners
function initializeKeyboardHandlers() {
  // Load shortcuts first
  loadShortcuts().then(() => {
    document.addEventListener("keydown", function(event) {
      // Dedicated processing for search page
      if (isSearchPage()) {
        handleSearchPageKeydown(event);
        return;
      }

      // Chat page processing
      handleChatPageKeydown(event);
    }, true); // Capture event in capture phase
  });
}
