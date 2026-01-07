// Chat history selection functionality

// Chat history selection management
let selectedHistoryIndex = 0;
let historySelectionMode = false;

// Get list of chat history items
function getHistoryItems() {
  return Array.from(document.querySelectorAll('.conversation-items-container .conversation[data-test-id="conversation"]'));
}

// Highlight history item (visual highlight)
function highlightHistory(index) {
  const items = getHistoryItems();
  if (items.length === 0) return;

  // Keep index within bounds
  selectedHistoryIndex = Math.max(0, Math.min(index, items.length - 1));

  // Remove all highlights
  items.forEach(item => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });

  // Highlight selected item
  const selectedItem = items[selectedHistoryIndex];
  if (selectedItem) {
    selectedItem.style.outline = '2px solid #1a73e8';
    selectedItem.style.outlineOffset = '-2px';

    // Scroll into view (immediately)
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

// Move history up
function moveHistoryUp() {
  highlightHistory(selectedHistoryIndex - 1);
}

// Move history down
function moveHistoryDown() {
  highlightHistory(selectedHistoryIndex + 1);
}

// Open history item
function openSelectedHistory() {
  const items = getHistoryItems();
  if (items.length === 0 || !items[selectedHistoryIndex]) return;

  items[selectedHistoryIndex].click();
  historySelectionMode = false;

  // Clear highlight
  items.forEach(item => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });

  // Save as recent chat after navigation
  setTimeout(() => {
    if (typeof saveCurrentChatAsRecent === 'function') {
      saveCurrentChatAsRecent();
    }
  }, 1000);

  // Clear and focus textarea after page navigation
  clearAndFocusTextarea();
}

// Exit history selection mode
function exitHistorySelectionMode() {
  historySelectionMode = false;
  const items = getHistoryItems();
  items.forEach(item => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });
}

// Enter history selection mode
function enterHistorySelectionMode() {
  historySelectionMode = true;
  // Keep previous position (set to 0 only on first time)
  if (selectedHistoryIndex === undefined) {
    selectedHistoryIndex = 0;
  }
  // Remove focus from textarea
  if (document.activeElement) {
    document.activeElement.blur();
  }
  highlightHistory(selectedHistoryIndex);
}

// Check if in history selection mode
function isHistorySelectionMode() {
  return historySelectionMode;
}
