import { DEFAULT_DEEP_DIVE_MODES, type DeepDiveMode, type DeepDiveTarget } from './types';
import { doInsertQuery } from './query';

export async function showTemplatePopup(
  button: HTMLButtonElement,
  target: DeepDiveTarget
): Promise<void> {
  hideTemplatePopup();

  const result = await new Promise<{
    deepDiveModes?: DeepDiveMode[];
    currentDeepDiveModeId?: string;
    deepDiveRecentModes?: string[];
  }>((resolve) => {
    chrome.storage.sync.get(
      ['deepDiveModes', 'currentDeepDiveModeId', 'deepDiveRecentModes'],
      resolve as (items: Record<string, unknown>) => void
    );
  });

  const modes =
    result.deepDiveModes && result.deepDiveModes.length > 0
      ? result.deepDiveModes
      : DEFAULT_DEEP_DIVE_MODES;

  const recentIds = result.deepDiveRecentModes || [];
  const sorted = [...modes].sort((a, b) => {
    const ai = recentIds.indexOf(a.id);
    const bi = recentIds.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const popup = document.createElement('div');
  popup.className = 'deep-dive-template-popup';
  popup.id = 'deep-dive-template-popup';
  popup.setAttribute('role', 'menu');

  const makeItem = (
    label: string,
    hint: string,
    onClick: () => void
  ): HTMLButtonElement => {
    const item = document.createElement('button');
    item.className = 'deep-dive-template-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    if (hint) item.title = hint;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTemplatePopup();
      onClick();
    });
    return item;
  };

  sorted.forEach((mode) => {
    popup.appendChild(
      makeItem(mode.id, mode.prompt || '', () => doInsertQuery(target, mode))
    );
  });

  document.body.appendChild(popup);

  const rect = button.getBoundingClientRect();
  const popupW = 160;
  let left = rect.left + window.scrollX;
  if (left + popupW > window.innerWidth - 8) {
    left = window.innerWidth - popupW - 8;
  }
  popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${left}px`;

  const items = Array.from(
    popup.querySelectorAll<HTMLButtonElement>('.deep-dive-template-item')
  );
  let focusIndex = 0;
  items[0]?.focus();

  popup.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'ArrowLeft') {
      e.preventDefault();
      hideTemplatePopup();
      button.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex = (focusIndex + 1) % items.length;
      items[focusIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex = (focusIndex - 1 + items.length) % items.length;
      items[focusIndex].focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        focusIndex = (focusIndex - 1 + items.length) % items.length;
      } else {
        focusIndex = (focusIndex + 1) % items.length;
      }
      items[focusIndex].focus();
    }
  });

  setTimeout(() => {
    document.addEventListener('click', hideTemplatePopup, { once: true });
  }, 0);
}

export function hideTemplatePopup(): void {
  document.getElementById('deep-dive-template-popup')?.remove();
}
