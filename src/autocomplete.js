// Autocomplete functionality for Gemini chat textarea

let autocompleteList = null;
let selectedIndex = -1;
let currentSuggestions = [];
let autocompleteTimeout = null;

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
    console.error('Failed to fetch suggestions:', error);
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

  // Position the dropdown
  const rect = textarea.getBoundingClientRect();
  list.style.left = `${rect.left}px`;
  list.style.width = `${rect.width}px`;
  list.style.display = 'block';

  // Calculate available space above and below textarea
  const spaceBelow = window.innerHeight - rect.bottom - 10; // 10px margin
  const spaceAbove = rect.top - 10; // 10px margin
  const itemHeight = 40; // Approximate height per item
  const maxItemsBelow = Math.floor(spaceBelow / itemHeight);
  const maxItemsAbove = Math.floor(spaceAbove / itemHeight);

  // Show above if not enough space below and more space above
  if (maxItemsBelow < suggestions.length && maxItemsAbove > maxItemsBelow) {
    // Show above
    list.style.bottom = `${window.innerHeight - rect.top}px`;
    list.style.top = 'auto';
    list.style.maxHeight = `${Math.max(spaceAbove, 100)}px`;
  } else {
    // Show below
    list.style.top = `${rect.bottom}px`;
    list.style.bottom = 'auto';
    list.style.maxHeight = `${Math.max(spaceBelow, 100)}px`;
  }
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
    setTimeout(initializeAutocomplete, 500);
    return;
  }

  // Input event handler
  textarea.addEventListener('input', (e) => {
    // Only trigger autocomplete for user input (not programmatic input)
    if (!e.isTrusted) {
      return;
    }

    // Clear previous timeout
    if (autocompleteTimeout) {
      clearTimeout(autocompleteTimeout);
    }

    const text = textarea.textContent || '';
    const trimmedText = text.trim();

    // If text is empty or only whitespace, hide autocomplete immediately
    if (trimmedText.length === 0) {
      hideAutocompleteSuggestions();
      return;
    }

    // If textarea contains newline, hide autocomplete
    if (text.includes('\n')) {
      hideAutocompleteSuggestions();
      return;
    }

    // Wait for user to stop typing
    autocompleteTimeout = setTimeout(async () => {
      // Re-check text content before fetching (user might have deleted everything)
      const currentText = textarea.textContent || '';
      const currentTrimmed = currentText.trim();

      // If text is now empty, don't fetch
      if (currentTrimmed.length === 0) {
        hideAutocompleteSuggestions();
        return;
      }

      const suggestions = await fetchGoogleSuggestions(currentTrimmed);
      showAutocompleteSuggestions(textarea, suggestions);
    }, 300);
  });

  // Keydown event handler for Tab and arrow keys
  textarea.addEventListener('keydown', (e) => {
    // Only handle user input
    if (!e.isTrusted) return;

    // Skip if IME is composing (Japanese input)
    if (e.isComposing) {
      return;
    }

    // If textarea contains newline, don't handle autocomplete
    const text = textarea.textContent;
    if (text.includes('\n')) {
      hideAutocompleteSuggestions();
      return;
    }

    // Check if autocomplete is visible
    const isAutocompleteVisible = autocompleteList &&
                                   autocompleteList.style.display === 'block' &&
                                   currentSuggestions.length > 0;

    if (!isAutocompleteVisible) {
      // Allow normal behavior when autocomplete is not visible
      return;
    }

    // Handle autocomplete keyboard shortcuts
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // If nothing selected, select first item
      if (selectedIndex < 0) {
        selectedIndex = 0;
      } else {
        selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
      }
      updateSelectedItem();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (selectedIndex < 0) {
        selectedIndex = 0;
      } else {
        selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
      }
      updateSelectedItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (selectedIndex < 0) {
        selectedIndex = currentSuggestions.length - 1;
      } else {
        selectedIndex = selectedIndex <= 0 ? currentSuggestions.length - 1 : selectedIndex - 1;
      }
      updateSelectedItem();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      // If nothing selected, select first suggestion
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
