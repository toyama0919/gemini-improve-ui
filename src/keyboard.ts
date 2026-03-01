// Keyboard event handlers

import { isShortcut, loadShortcuts, getShortcuts } from './settings';
import { isAutocompleteVisible } from './autocomplete';
import {
  scrollChatArea,
  focusTextarea,
  toggleSidebar,
  getAllActionButtons,
  focusActionButton,
  moveBetweenActionButtons,
} from './chat';
import {
  isHistorySelectionMode,
  exitHistorySelectionMode,
  enterHistorySelectionMode,
  moveHistoryUp,
  moveHistoryDown,
  openSelectedHistory,
} from './history';
import {
  isSearchPage,
  toggleSearchPage,
  moveSearchResultUp,
  moveSearchResultDown,
  openSelectedSearchResult,
} from './search';
import { saveNote } from './export';

let lastFocusedActionButtonIndex = -1;

export function rememberActionButtonPosition(index: number): void {
  lastFocusedActionButtonIndex = index;
}

function handleSearchPageKeydown(event: KeyboardEvent): boolean {
  if (isAutocompleteVisible()) {
    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === 'Tab' ||
      event.key === 'Escape'
    ) {
      return false;
    }
  }

  if (isShortcut(event, 'chat.navigateToSearch')) {
    event.preventDefault();
    toggleSearchPage();
    return true;
  }

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

  if (isShortcut(event, 'search.openResult')) {
    if (event.isComposing) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSelectedSearchResult();
    return true;
  }

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

  const shortcuts = getShortcuts();
  const chatKeys = Object.values(shortcuts.chat);
  if (chatKeys.includes(event.code)) return true;

  return false;
}

function handleChatPageKeydown(event: KeyboardEvent): boolean {
  const isInInput = (event.target as Element).matches(
    'input, textarea, [contenteditable="true"]'
  );

  if (isAutocompleteVisible()) {
    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === 'Tab' ||
      event.key === 'Escape'
    ) {
      return false;
    }
  }

  if (event.code === 'Home' && !event.metaKey && !event.ctrlKey && !isInInput) {
    event.preventDefault();
    saveNote(event.shiftKey);
    return true;
  }

  if (event.ctrlKey && event.shiftKey && event.code === 'KeyD') {
    event.preventDefault();
    window.domAnalyzer?.copyToClipboard();
    return true;
  }

  if (isShortcut(event, 'chat.navigateToSearch')) {
    event.preventDefault();
    toggleSearchPage();
    return true;
  }

  if (isShortcut(event, 'chat.toggleSidebar')) {
    event.preventDefault();
    toggleSidebar();
    return true;
  }

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
      const focusedElement = document.activeElement as HTMLElement | null;
      const isActionButton =
        focusedElement &&
        (focusedElement.classList?.contains('deep-dive-button-inline') ||
          focusedElement.getAttribute('data-action') === 'deep-dive');
      if (isActionButton) {
        const currentIndex = actionButtons.findIndex(
          (btn) => btn === focusedElement
        );
        if (currentIndex !== -1) lastFocusedActionButtonIndex = currentIndex;
        enterHistorySelectionMode();
      } else {
        focusTextarea();
      }
    }
    return true;
  }

  if (isHistorySelectionMode() && isShortcut(event, 'chat.historyExit')) {
    event.preventDefault();
    exitHistorySelectionMode();
    return true;
  }

  if (isShortcut(event, 'chat.scrollUp')) {
    event.preventDefault();
    scrollChatArea('up');
    return true;
  }

  if (isShortcut(event, 'chat.scrollDown')) {
    event.preventDefault();
    scrollChatArea('down');
    return true;
  }

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

  if (
    !isHistorySelectionMode() &&
    isInInput &&
    (isShortcut(event, 'chat.historyUp') || isShortcut(event, 'chat.historyDown'))
  ) {
    const textarea = document.querySelector<HTMLElement>(
      'div[contenteditable="true"][role="textbox"]'
    );
    if (textarea && textarea.textContent?.trim() === '') {
      event.preventDefault();
      const direction = isShortcut(event, 'chat.historyUp') ? 'up' : 'down';
      focusActionButton(direction);
      return true;
    }
  }

  if (!isHistorySelectionMode() && !isInInput) {
    const focusedElement = document.activeElement as HTMLElement | null;
    const isActionButton =
      focusedElement &&
      (focusedElement.classList?.contains('deep-dive-button-inline') ||
        focusedElement.getAttribute('data-action') === 'deep-dive');

    if (isActionButton) {
      if (
        isShortcut(event, 'chat.historyUp') ||
        isShortcut(event, 'chat.historyDown')
      ) {
        event.preventDefault();
        const direction = isShortcut(event, 'chat.historyUp') ? 'up' : 'down';
        moveBetweenActionButtons(direction);
        return true;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expandButton = (focusedElement as any)._expandButton as HTMLElement | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const target = (focusedElement as any)._deepDiveTarget;
        if (expandButton && target) {
          const isExpanded =
            expandButton.getAttribute('data-action') === 'collapse';
          if (event.key === 'ArrowRight' && !isExpanded) {
            expandButton.click();
          } else if (event.key === 'ArrowLeft' && isExpanded) {
            expandButton.click();
          }
        }
        return true;
      }

      if (isShortcut(event, 'chat.historyOpen')) {
        event.preventDefault();
        focusedElement.click();
        return true;
      }
    }
  }

  return false;
}

export function initializeKeyboardHandlers(): void {
  loadShortcuts().then(() => {
    document.addEventListener(
      'keydown',
      (event) => {
        if (isSearchPage()) {
          handleSearchPageKeydown(event);
          return;
        }
        handleChatPageKeydown(event);
      },
      true
    );
  });
}
