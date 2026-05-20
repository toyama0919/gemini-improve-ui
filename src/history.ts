// Chat history selection functionality

import { clearAndFocusTextarea, isSidebarOpen, toggleSidebar } from './chat';

let selectedHistoryIndex = 0;
let historySelectionMode = false;

const HISTORY_ITEM_SELECTORS = [
  'gem-nav-list-item[data-test-id="conversation"] > a[href^="/app/"]',
  '.conversation-items-container .conversation[data-test-id="conversation"]',
  'bard-sidenav .conversation[data-test-id="conversation"]',
] as const;

const SIDEBAR_OPEN_DELAY_MS = 350;

function getHistoryItems(): HTMLElement[] {
  for (const selector of HISTORY_ITEM_SELECTORS) {
    const items = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.getBoundingClientRect().height > 0
    );
    if (items.length > 0) return items;
  }
  return [];
}

function highlightHistory(index: number): void {
  const items = getHistoryItems();
  if (items.length === 0) return;

  selectedHistoryIndex = Math.max(0, Math.min(index, items.length - 1));

  items.forEach((item) => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });

  const selectedItem = items[selectedHistoryIndex];
  if (selectedItem) {
    selectedItem.style.outline = '2px solid #1a73e8';
    selectedItem.style.outlineOffset = '-2px';
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

export function moveHistoryUp(): void {
  highlightHistory(selectedHistoryIndex - 1);
}

export function moveHistoryDown(): void {
  highlightHistory(selectedHistoryIndex + 1);
}

export function openSelectedHistory(): void {
  const items = getHistoryItems();
  if (items.length === 0 || !items[selectedHistoryIndex]) return;

  items[selectedHistoryIndex].click();
  historySelectionMode = false;

  items.forEach((item) => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });

  clearAndFocusTextarea();
}

export function exitHistorySelectionMode(): void {
  historySelectionMode = false;
  const items = getHistoryItems();
  items.forEach((item) => {
    item.style.outline = '';
    item.style.outlineOffset = '';
  });
}

function applyHistoryHighlight(): void {
  if (!historySelectionMode) return;
  highlightHistory(selectedHistoryIndex);
}

export function enterHistorySelectionMode(): void {
  historySelectionMode = true;
  if (document.activeElement) {
    (document.activeElement as HTMLElement).blur();
  }

  if (getHistoryItems().length > 0) {
    applyHistoryHighlight();
    return;
  }

  if (!isSidebarOpen()) {
    toggleSidebar();
    window.setTimeout(applyHistoryHighlight, SIDEBAR_OPEN_DELAY_MS);
    return;
  }

  applyHistoryHighlight();
}

export function isHistorySelectionMode(): boolean {
  return historySelectionMode;
}
