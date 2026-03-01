// Autocomplete functionality for Gemini chat textarea

const RETRY_DELAY = 500;
const DEBOUNCE_DELAY = 300;
const DROPDOWN_MARGIN = 10;
const ITEM_HEIGHT = 40;
const MIN_DROPDOWN_HEIGHT = 100;

let autocompleteList: HTMLDivElement | null = null;
let selectedIndex = -1;
let currentSuggestions: string[] = [];
let autocompleteTimeout: ReturnType<typeof setTimeout> | null = null;

export function isAutocompleteVisible(): boolean {
  return (
    autocompleteList !== null &&
    autocompleteList.style.display === 'block' &&
    currentSuggestions.length > 0
  );
}

function preventEventPropagation(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function moveSelection(direction: 'next' | 'prev'): void {
  if (direction === 'next') {
    selectedIndex =
      selectedIndex < 0 ? 0 : (selectedIndex + 1) % currentSuggestions.length;
  } else {
    selectedIndex =
      selectedIndex < 0
        ? currentSuggestions.length - 1
        : selectedIndex <= 0
          ? currentSuggestions.length - 1
          : selectedIndex - 1;
  }
  updateSelectedItem();
}

async function fetchGoogleSuggestions(query: string): Promise<string[]> {
  if (!query || query.trim().length === 0) return [];
  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const response = await fetch(
      `https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${encodedQuery}`
    );
    const data = await response.json();
    return data[1] || [];
  } catch {
    return [];
  }
}

function createAutocompleteDropdown(): HTMLDivElement {
  if (autocompleteList) return autocompleteList;

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

function positionDropdown(
  inputElement: Element,
  list: HTMLDivElement,
  suggestions: string[]
): void {
  const rect = inputElement.getBoundingClientRect();
  list.style.left = `${rect.left}px`;
  list.style.width = `${rect.width}px`;
  list.style.display = 'block';

  const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;
  const spaceAbove = rect.top - DROPDOWN_MARGIN;
  const maxItemsBelow = Math.floor(spaceBelow / ITEM_HEIGHT);
  const maxItemsAbove = Math.floor(spaceAbove / ITEM_HEIGHT);

  if (maxItemsBelow < suggestions.length && maxItemsAbove > maxItemsBelow) {
    list.style.bottom = `${window.innerHeight - rect.top}px`;
    list.style.top = 'auto';
    list.style.maxHeight = `${Math.max(spaceAbove, MIN_DROPDOWN_HEIGHT)}px`;
  } else {
    list.style.top = `${rect.bottom}px`;
    list.style.bottom = 'auto';
    list.style.maxHeight = `${Math.max(spaceBelow, MIN_DROPDOWN_HEIGHT)}px`;
  }
}

function showAutocompleteSuggestions(
  inputElement: HTMLElement,
  suggestions: string[]
): void {
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
      selectSuggestion(inputElement, suggestion);
    });
    list.appendChild(item);
  });

  positionDropdown(inputElement, list, suggestions);
}

export function hideAutocompleteSuggestions(): void {
  if (autocompleteList) {
    autocompleteList.style.display = 'none';
  }
  currentSuggestions = [];
  selectedIndex = -1;
}

function updateSelectedItem(): void {
  if (!autocompleteList) return;
  const items = autocompleteList.querySelectorAll('.gemini-autocomplete-item');
  items.forEach((item, index) => {
    (item as HTMLElement).style.backgroundColor =
      index === selectedIndex ? '#e8f0fe' : 'transparent';
  });
}

function selectSuggestion(inputElement: HTMLElement, suggestion: string): void {
  if ((inputElement as HTMLElement & { contentEditable: string }).contentEditable === 'true') {
    while (inputElement.firstChild) {
      inputElement.removeChild(inputElement.firstChild);
    }
    const p = document.createElement('p');
    p.textContent = suggestion;
    inputElement.appendChild(p);
    inputElement.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(inputElement);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    (inputElement as HTMLInputElement).value = suggestion;
    inputElement.focus();
    (inputElement as HTMLInputElement).setSelectionRange(
      suggestion.length,
      suggestion.length
    );
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  }
  hideAutocompleteSuggestions();
}

export function initializeAutocomplete(): void {
  const textarea = document.querySelector<HTMLElement>(
    'div[contenteditable="true"][role="textbox"]'
  );
  if (!textarea) {
    setTimeout(initializeAutocomplete, RETRY_DELAY);
    return;
  }

  textarea.addEventListener(
    'keydown',
    async (e) => {
      if (!e.isTrusted || e.isComposing) return;

      if (e.metaKey && e.code === 'Space') {
        preventEventPropagation(e);
        const text = textarea.textContent || '';
        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
          hideAutocompleteSuggestions();
          return;
        }
        const suggestions = await fetchGoogleSuggestions(trimmedText);
        showAutocompleteSuggestions(textarea, suggestions);
        return;
      }

      if (!isAutocompleteVisible()) return;

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
    },
    true
  );

  document.addEventListener('click', (e) => {
    if (
      autocompleteList &&
      !autocompleteList.contains(e.target as Node) &&
      e.target !== textarea
    ) {
      hideAutocompleteSuggestions();
    }
  });
}

export function initializeSearchAutocomplete(): void {
  if (!window.location.pathname.startsWith('/search')) return;

  let attempts = 0;
  const maxAttempts = 10;

  const searchInputInterval = setInterval(() => {
    attempts++;
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[data-test-id="search-input"]'
    ) ||
      document.querySelector<HTMLInputElement>(
        'input[type="text"][placeholder*="検索"]'
      ) ||
      document.querySelector<HTMLInputElement>('input[type="text"]');

    if (searchInput) {
      clearInterval(searchInputInterval);

      searchInput.addEventListener('input', (e) => {
        if (!e.isTrusted) return;
        if (autocompleteTimeout) clearTimeout(autocompleteTimeout);

        const text = searchInput.value || '';
        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
          hideAutocompleteSuggestions();
          return;
        }

        autocompleteTimeout = setTimeout(async () => {
          const currentTrimmed = (searchInput.value || '').trim();
          if (currentTrimmed.length === 0) {
            hideAutocompleteSuggestions();
            return;
          }
          const suggestions = await fetchGoogleSuggestions(currentTrimmed);
          showAutocompleteSuggestions(searchInput, suggestions);
        }, DEBOUNCE_DELAY);
      });

      searchInput.addEventListener(
        'keydown',
        (e) => {
          if (!e.isTrusted || e.isComposing) return;
          if (!isAutocompleteVisible()) return;

          if (e.key === 'Tab' || e.key === 'ArrowDown') {
            preventEventPropagation(e);
            moveSelection('next');
          } else if (e.key === 'ArrowUp') {
            preventEventPropagation(e);
            moveSelection('prev');
          } else if (e.key === 'Enter') {
            if (selectedIndex >= 0) {
              preventEventPropagation(e);
              selectSuggestion(searchInput, currentSuggestions[selectedIndex]);
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            hideAutocompleteSuggestions();
          }
        },
        true
      );

      document.addEventListener('click', (e) => {
        if (
          autocompleteList &&
          !autocompleteList.contains(e.target as Node) &&
          e.target !== searchInput
        ) {
          hideAutocompleteSuggestions();
        }
      });
    } else if (attempts >= maxAttempts) {
      clearInterval(searchInputInterval);
    }
  }, 500);
}
