// Keyboard event handlers

// Handle search page keyboard events
function handleSearchPageKeydown(event) {
  // Select search results with up/down keys (works even when focus is on input field)
  if (event.code === "ArrowUp" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    moveSearchResultUp();
    return true;
  }

  if (event.code === "ArrowDown" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    moveSearchResultDown();
    return true;
  }

  // Open selected search result with Enter key
  if (event.code === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
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
  if (event.code === "PageUp") {
    event.preventDefault();
    window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'auto' });
    return true;
  }

  if (event.code === "PageDown") {
    event.preventDefault();
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'auto' });
    return true;
  }

  // Disable other shortcut keys (Home, End, Delete)
  if (['Home', 'End', 'Delete'].includes(event.code)) {
    return true;
  }

  // Normal operation for other keys (input, etc.)
  return false;
}

// Handle chat page keyboard events
function handleChatPageKeydown(event) {
  const isInInput = event.target.matches('input, textarea, [contenteditable="true"]');

  // Insert: Navigate to search page
  if (event.code === "Insert" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    navigateToSearchPage();
    return true;
  }

  // Delete: Toggle sidebar open/close
  if (event.code === "Delete" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    toggleSidebar();
    return true;
  }

  // Home: Create new chat
  if (event.code === "Home" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    createNewChat();
    return true;
  }

  // End: Toggle between textarea ⇔ history selection mode
  if (event.code === "End" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
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
  if (isHistorySelectionMode() && event.code === "Escape") {
    event.preventDefault();
    exitHistorySelectionMode();
    return true;
  }

  // PageUp: Scroll chat area up
  if (event.code === "PageUp") {
    event.preventDefault();
    scrollChatArea('up');
    return true;
  }

  // PageDown: Scroll chat area down
  if (event.code === "PageDown") {
    event.preventDefault();
    scrollChatArea('down');
    return true;
  }

  // Always process arrow keys and Enter in history selection mode
  if (isHistorySelectionMode()) {
    if (event.code === "ArrowUp") {
      event.preventDefault();
      moveHistoryUp();
      return true;
    } else if (event.code === "ArrowDown") {
      event.preventDefault();
      moveHistoryDown();
      return true;
    } else if (event.code === "Enter") {
      event.preventDefault();
      openSelectedHistory();
      return true;
    }
  }

  // Focus on copy button when up/down keys are pressed with empty textarea
  if (!isHistorySelectionMode() && isInInput && (event.code === "ArrowUp" || event.code === "ArrowDown") && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');

    if (textarea && textarea.textContent.trim() === '') {
      event.preventDefault();
      const direction = event.code === "ArrowUp" ? 'up' : 'down';
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
      if (event.code === "ArrowUp" || event.code === "ArrowDown") {
        event.preventDefault();
        const direction = event.code === "ArrowUp" ? 'up' : 'down';
        moveBetweenCopyButtons(direction);
        return true;
      } else if (event.code === "Enter") {
        // Explicitly click copy button with Enter key
        event.preventDefault();
        focusedElement.click();
        return true;
      }
    }

    if (event.code === "ArrowUp") {
      event.preventDefault();
      moveHistoryUp();
      return true;
    } else if (event.code === "ArrowDown") {
      event.preventDefault();
      moveHistoryDown();
      return true;
    } else if (event.code === "Enter") {
      event.preventDefault();
      openSelectedHistory();
      return true;
    }
  }

  return false;
}

// Initialize keyboard event listeners
function initializeKeyboardHandlers() {
  document.addEventListener("keydown", function(event) {
    // Dedicated processing for search page
    if (isSearchPage()) {
      handleSearchPageKeydown(event);
      return;
    }

    // Chat page processing
    handleChatPageKeydown(event);
  }, true); // Capture event in capture phase
}
