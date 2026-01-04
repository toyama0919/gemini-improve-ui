// Search page functionality

// Search result selection management
let selectedSearchIndex = 0;

// Check if current page is search page
function isSearchPage() {
  return window.location.pathname.startsWith('/search');
}

// Get list of search results
function getSearchResults() {
  // Search results in search page (search-snippet elements)
  let results = Array.from(document.querySelectorAll('search-snippet[tabindex="0"]'));

  // Try alternative pattern if not found
  if (results.length === 0) {
    results = Array.from(document.querySelectorAll('search-snippet'));
  }

  // Try original pattern if still not found (initial load)
  if (results.length === 0) {
    results = Array.from(document.querySelectorAll('div.conversation-container[role="option"]'));
  }

  if (results.length === 0) {
    results = Array.from(document.querySelectorAll('[role="option"].conversation-container'));
  }

  return results;
}

// Highlight search result (visual highlight)
function highlightSearchResult(index) {
  const items = getSearchResults();
  if (items.length === 0) return;

  // Keep index within bounds
  selectedSearchIndex = Math.max(0, Math.min(index, items.length - 1));

  // Remove all highlights
  items.forEach(item => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });

  // Highlight selected item
  const selectedItem = items[selectedSearchIndex];
  if (selectedItem) {
    selectedItem.style.outline = '2px solid #1a73e8';
    selectedItem.style.outlineOffset = '-2px';

    // Scroll into view (immediately)
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

// Move search result up
function moveSearchResultUp() {
  highlightSearchResult(selectedSearchIndex - 1);
  // Return focus to search input
  const searchInput = document.querySelector('input[data-test-id="search-input"]');
  if (searchInput) {
    searchInput.focus();
  }
}

// Move search result down
function moveSearchResultDown() {
  highlightSearchResult(selectedSearchIndex + 1);
  // Return focus to search input
  const searchInput = document.querySelector('input[data-test-id="search-input"]');
  if (searchInput) {
    searchInput.focus();
  }
}

// Open selected search result
function openSelectedSearchResult() {
  const items = getSearchResults();
  if (items.length === 0 || !items[selectedSearchIndex]) return;

  const selectedItem = items[selectedSearchIndex];

  // First, look for div with jslog attribute (clickable element)
  const clickableDiv = selectedItem.querySelector('div[jslog]');
  if (clickableDiv) {
    console.log('Gemini Search: Clicking jslog div');
    clickableDiv.click();

    // Also dispatch mouse events
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true
      });
      clickableDiv.dispatchEvent(event);
    });

    // Wait a bit then change URL directly (fallback)
    setTimeout(() => {
      // Get text from title element to construct URL
      const titleElement = selectedItem.querySelector('.title');
      if (titleElement) {
        const title = titleElement.textContent;
        console.log('Gemini Search: Opening result -', title);
        // If search-snippet doesn't navigate, try clicking directly
        selectedItem.click();
      }
    }, 100);
    return;
  }

  // Look for link
  const link = selectedItem.querySelector('a[href]');
  if (link) {
    console.log('Gemini Search: Clicking link', link.href);
    link.click();
    return;
  }

  // If neither found, click the element itself
  console.log('Gemini Search: Clicking element directly');
  selectedItem.click();

  ['mousedown', 'mouseup', 'click'].forEach(eventType => {
    const event = new MouseEvent(eventType, {
      view: window,
      bubbles: true,
      cancelable: true
    });
    selectedItem.dispatchEvent(event);
  });
}

// Initialize search page
function initializeSearchPage() {
  if (!isSearchPage()) return;

  let attempts = 0;
  const maxAttempts = 10;

  const highlightInterval = setInterval(() => {
    attempts++;
    const searchResults = getSearchResults();

    if (searchResults.length > 0) {
      selectedSearchIndex = 0;
      highlightSearchResult(0);
      clearInterval(highlightInterval);
      console.log('Gemini Search: Found', searchResults.length, 'results');
    } else if (attempts >= maxAttempts) {
      clearInterval(highlightInterval);
      console.log('Gemini Search: No results found after', maxAttempts, 'attempts');
    }
  }, 500);
}

// Navigate to search page
function navigateToSearchPage() {
  // Use History API since it's an SPA
  const searchUrl = '/search?hl=ja';
  history.pushState(null, '', searchUrl);

  // Dispatch popstate event to notify SPA router
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}
