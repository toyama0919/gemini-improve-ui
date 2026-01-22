// Autocomplete functionality for Gemini chat textarea

// Constants
const RETRY_DELAY = 500; // ms to wait before retrying textarea detection
const DROPDOWN_MARGIN = 10; // px margin for dropdown positioning
const ITEM_HEIGHT = 40; // px approximate height per item
const MIN_DROPDOWN_HEIGHT = 100; // px minimum dropdown height

// State
let autocompleteList = null;
let selectedIndex = -1;
let currentSuggestions = [];

// Helper: Check if autocomplete is currently visible
function isAutocompleteVisible() {
  return autocompleteList &&
         autocompleteList.style.display === 'block' &&
         currentSuggestions.length > 0;
}

// Helper: Prevent event propagation
function preventEventPropagation(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

// Helper: Move selection in autocomplete list
function moveSelection(direction) {
  if (direction === 'next') {
    selectedIndex = selectedIndex < 0 ? 0 : (selectedIndex + 1) % currentSuggestions.length;
  } else if (direction === 'prev') {
    selectedIndex = selectedIndex < 0 ? currentSuggestions.length - 1 :
                    selectedIndex <= 0 ? currentSuggestions.length - 1 : selectedIndex - 1;
  }
  updateSelectedItem();
}

// Fetch suggestions from Google
async function fetchGoogleSuggestions(query) {
  if (!query || query.trim().length === 0) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const response = await fetch(
      `https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${encodedQuery}`
    );
    const data = await response.json();
    return data[1] || [];
  } catch (error) {
    return [];
  }
}

// Create autocomplete dropdown
function createAutocompleteDropdown() {
  if (autocompleteList) {
    return autocompleteList;
  }

  const list = document.createElement('div');
  list.className = 'gemini-autocomplete-list';
  list.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `;
  document.body.appendChild(list);
  autocompleteList = list;
  return list;
}

// Position dropdown relative to textarea
function positionDropdown(textarea, list, suggestions) {
  const rect = textarea.getBoundingClientRect();
  list.style.left = `${rect.left}px`;
  list.style.width = `${rect.width}px`;
  list.style.display = 'block';

  // Calculate available space above and below textarea
  const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;
  const spaceAbove = rect.top - DROPDOWN_MARGIN;
  const maxItemsBelow = Math.floor(spaceBelow / ITEM_HEIGHT);
  const maxItemsAbove = Math.floor(spaceAbove / ITEM_HEIGHT);

  // Show above if not enough space below and more space above
  if (maxItemsBelow < suggestions.length && maxItemsAbove > maxItemsBelow) {
    // Show above
    list.style.bottom = `${window.innerHeight - rect.top}px`;
    list.style.top = 'auto';
    list.style.maxHeight = `${Math.max(spaceAbove, MIN_DROPDOWN_HEIGHT)}px`;
  } else {
    // Show below
    list.style.top = `${rect.bottom}px`;
    list.style.bottom = 'auto';
    list.style.maxHeight = `${Math.max(spaceBelow, MIN_DROPDOWN_HEIGHT)}px`;
  }
}

// Show autocomplete suggestions
function showAutocompleteSuggestions(textarea, suggestions) {
  if (!suggestions || suggestions.length === 0) {
    hideAutocompleteSuggestions();
    return;
  }

  const list = createAutocompleteDropdown();
  list.innerHTML = '';
  currentSuggestions = suggestions;
  selectedIndex = -1;

  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'gemini-autocomplete-item';
    item.textContent = suggestion;
    item.style.cssText = `
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `;

    item.addEventListener('mouseenter', () => {
      selectedIndex = index;
      updateSelectedItem();
    });

    item.addEventListener('click', () => {
      selectSuggestion(textarea, suggestion);
    });

    list.appendChild(item);
  });

  positionDropdown(textarea, list, suggestions);
}

// Hide autocomplete suggestions
function hideAutocompleteSuggestions() {
  if (autocompleteList) {
    autocompleteList.style.display = 'none';
  }
  currentSuggestions = [];
  selectedIndex = -1;
}

// Update selected item highlight
function updateSelectedItem() {
  if (!autocompleteList) return;

  const items = autocompleteList.querySelectorAll('.gemini-autocomplete-item');
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.style.backgroundColor = '#e8f0fe';
    } else {
      item.style.backgroundColor = 'transparent';
    }
  });
}

// Select a suggestion
function selectSuggestion(textarea, suggestion) {
  // Clear content
  while (textarea.firstChild) {
    textarea.removeChild(textarea.firstChild);
  }

  // Set suggestion text
  const p = document.createElement('p');
  p.textContent = suggestion;
  textarea.appendChild(p);

  // Focus and move cursor to end
  textarea.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(textarea);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  // Dispatch input event
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  hideAutocompleteSuggestions();
}

// Initialize autocomplete
function initializeAutocomplete() {
  const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');
  if (!textarea) {
    setTimeout(initializeAutocomplete, RETRY_DELAY);
    return;
  }

  // Keydown event handler for autocomplete trigger and navigation
  textarea.addEventListener('keydown', async (e) => {
    // Only handle user input
    if (!e.isTrusted || e.isComposing) return;

    // Cmd+Space to trigger autocomplete
    if (e.metaKey && e.code === 'Space') {
      preventEventPropagation(e);

      const text = textarea.textContent || '';
      const trimmedText = text.trim();

      // If text is empty, don't fetch suggestions
      if (trimmedText.length === 0) {
        hideAutocompleteSuggestions();
        return;
      }

      // Fetch and show suggestions
      const suggestions = await fetchGoogleSuggestions(trimmedText);
      showAutocompleteSuggestions(textarea, suggestions);
      return;
    }

    // Handle navigation keys only if autocomplete is visible
    if (!isAutocompleteVisible()) {
      return;
    }

    // Handle autocomplete keyboard shortcuts
    if (e.key === 'Tab' || e.key === 'ArrowDown') {
      preventEventPropagation(e);
      moveSelection('next');
    } else if (e.key === 'ArrowUp') {
      preventEventPropagation(e);
      moveSelection('prev');
    } else if (e.key === 'Enter') {
      preventEventPropagation(e);
      const indexToSelect = selectedIndex >= 0 ? selectedIndex : 0;
      selectSuggestion(textarea, currentSuggestions[indexToSelect]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideAutocompleteSuggestions();
    }
  }, true); // Use capture phase to handle event before other handlers

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (autocompleteList &&
        !autocompleteList.contains(e.target) &&
        e.target !== textarea) {
      hideAutocompleteSuggestions();
    }
  });
}
