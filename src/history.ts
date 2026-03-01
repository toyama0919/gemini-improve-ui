// Chat history selection functionality

import { clearAndFocusTextarea } from './chat';

let selectedHistoryIndex = 0;
let historySelectionMode = false;

function getHistoryItems(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '.conversation-items-container .conversation[data-test-id="conversation"]'
    )
  );
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

export function enterHistorySelectionMode(): void {
  historySelectionMode = true;
  if (document.activeElement) {
    (document.activeElement as HTMLElement).blur();
  }
  highlightHistory(selectedHistoryIndex);
}

export function isHistorySelectionMode(): boolean {
  return historySelectionMode;
}
