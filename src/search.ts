// Search page functionality

import { exitHistorySelectionMode } from './history';

let selectedSearchIndex = 0;

export function isSearchPage(): boolean {
  return window.location.pathname.startsWith('/search');
}

function getSearchResults(): HTMLElement[] {
  let results = Array.from(
    document.querySelectorAll<HTMLElement>('search-snippet[tabindex="0"]')
  );
  if (results.length === 0) {
    results = Array.from(
      document.querySelectorAll<HTMLElement>('search-snippet')
    );
  }
  if (results.length === 0) {
    results = Array.from(
      document.querySelectorAll<HTMLElement>(
        'div.conversation-container[role="option"]'
      )
    );
  }
  if (results.length === 0) {
    results = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="option"].conversation-container'
      )
    );
  }
  return results;
}

function highlightSearchResult(index: number): void {
  const items = getSearchResults();
  if (items.length === 0) return;

  selectedSearchIndex = Math.max(0, Math.min(index, items.length - 1));

  items.forEach((item) => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });

  const selectedItem = items[selectedSearchIndex];
  if (selectedItem) {
    selectedItem.style.outline = '2px solid #1a73e8';
    selectedItem.style.outlineOffset = '-2px';
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

export function moveSearchResultUp(): void {
  highlightSearchResult(selectedSearchIndex - 1);
  const searchInput = document.querySelector<HTMLElement>(
    'input[data-test-id="search-input"]'
  );
  if (searchInput) searchInput.focus();
}

export function moveSearchResultDown(): void {
  highlightSearchResult(selectedSearchIndex + 1);
  const searchInput = document.querySelector<HTMLElement>(
    'input[data-test-id="search-input"]'
  );
  if (searchInput) searchInput.focus();
}

export function openSelectedSearchResult(): void {
  const items = getSearchResults();
  if (items.length === 0 || !items[selectedSearchIndex]) return;

  const selectedItem = items[selectedSearchIndex];

  const clickableDiv = selectedItem.querySelector<HTMLElement>('div[jslog]');
  if (clickableDiv) {
    clickableDiv.click();
    ['mousedown', 'mouseup', 'click'].forEach((eventType) => {
      clickableDiv.dispatchEvent(
        new MouseEvent(eventType, { view: window, bubbles: true, cancelable: true })
      );
    });
    setTimeout(() => {
      selectedItem.click();
    }, 100);
    return;
  }

  const link = selectedItem.querySelector<HTMLAnchorElement>('a[href]');
  if (link) {
    link.click();
    return;
  }

  selectedItem.click();
  ['mousedown', 'mouseup', 'click'].forEach((eventType) => {
    selectedItem.dispatchEvent(
      new MouseEvent(eventType, { view: window, bubbles: true, cancelable: true })
    );
  });
}

export function initializeSearchPage(): void {
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
    } else if (attempts >= maxAttempts) {
      clearInterval(highlightInterval);
    }
  }, 500);
}

function navigateToSearchPage(): void {
  const searchUrl = '/search?hl=ja';
  history.pushState(null, '', searchUrl);
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

export function toggleSearchPage(): void {
  if (isSearchPage()) {
    history.back();
  } else {
    exitHistorySelectionMode();
    navigateToSearchPage();
  }
}
