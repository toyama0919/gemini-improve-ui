// Keyboard event handlers

// Handle search page keyboard events
function handleSearchPageKeydown(event) {
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

  // Cmd+Shift+P: Toggle pin/unpin (disable only in history selection mode)
  if (isShortcut(event, 'chat.togglePin')) {
    // Disable only in history selection mode
    if (isHistorySelectionMode()) {
      return false;
    }

    event.preventDefault();
    toggleChatPin();
    return true;
  }

  // Cmd+Shift+C: Copy all chat history (disable only in history selection mode)
  if (isShortcut(event, 'chat.copyAllHistory')) {
    // Disable only in history selection mode
    if (isHistorySelectionMode()) {
      return false;
    }

    event.preventDefault();
    copyAllChatHistory();
    return true;
  }

  // Insert: Navigate to search page
  if (isShortcut(event, 'chat.navigateToSearch')) {
    event.preventDefault();
    navigateToSearchPage();
    return true;
  }

  // Delete: Toggle sidebar open/close
  if (isShortcut(event, 'chat.toggleSidebar')) {
    event.preventDefault();
    toggleSidebar();
    return true;
  }

  // Home: Create new chat
  if (isShortcut(event, 'chat.newChat')) {
    event.preventDefault();
    createNewChat();
    return true;
  }

  // End: Toggle between textarea ⇔ history selection mode
  if (isShortcut(event, 'chat.toggleHistoryMode')) {
    event.preventDefault();

    if (isHistorySelectionMode()) {
      // If in history selection mode, focus on input field
      exitHistorySelectionMode();
      focusTextarea();
    } else if (isInInput) {
      // If in textarea, enter history selection mode
      enterHistorySelectionMode();
    } else {
      // Otherwise, first focus on textarea
      focusTextarea();
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

  // Focus on copy button when up/down keys are pressed with empty textarea
  if (!isHistorySelectionMode() && isInInput &&
      (isShortcut(event, 'chat.historyUp') || isShortcut(event, 'chat.historyDown'))) {
    const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');

    if (textarea && textarea.textContent.trim() === '') {
      event.preventDefault();
      const direction = isShortcut(event, 'chat.historyUp') ? 'up' : 'down';
      focusCopyButton(direction);
      return true;
    }
  }

  // Arrow key operations outside history selection mode and when not in input field
  if (!isHistorySelectionMode() && !isInInput) {
    // Processing when copy button has focus
    const focusedElement = document.activeElement;
    const isCopyButton = focusedElement &&
                        (focusedElement.getAttribute('aria-label')?.includes('コピー') ||
                         focusedElement.getAttribute('aria-label')?.includes('Copy') ||
                         focusedElement.classList?.contains('copy-button'));

    if (isCopyButton) {
      if (isShortcut(event, 'chat.historyUp') || isShortcut(event, 'chat.historyDown')) {
        event.preventDefault();
        const direction = isShortcut(event, 'chat.historyUp') ? 'up' : 'down';
        moveBetweenCopyButtons(direction);
        return true;
      } else if (isShortcut(event, 'chat.historyOpen')) {
        // Explicitly click copy button with Enter key
        event.preventDefault();
        focusedElement.click();
        return true;
      }
    }

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
