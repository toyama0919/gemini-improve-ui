// Settings management

export const DEFAULT_DEEP_DIVE_PROMPT = 'これについて詳しく';

let deepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;

export function loadDeepDivePrompt(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['deepDivePrompt'], (result) => {
      if (result.deepDivePrompt !== undefined) {
        deepDivePrompt = result.deepDivePrompt;
      } else {
        deepDivePrompt = DEFAULT_DEEP_DIVE_PROMPT;
      }
      resolve(deepDivePrompt);
    });
  });
}

export function getDeepDivePrompt(): string {
  return deepDivePrompt || DEFAULT_DEEP_DIVE_PROMPT;
}

export interface Shortcuts {
  chat: {
    navigateToSearch: string;
    toggleSidebar: string;
    toggleHistoryMode: string;
    scrollUp: string;
    scrollDown: string;
    historyUp: string;
    historyDown: string;
    historyOpen: string;
    historyExit: string;
  };
  search: {
    moveUp: string;
    moveDown: string;
    openResult: string;
    scrollUp: string;
    scrollDown: string;
  };
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  chat: {
    navigateToSearch: 'Insert',
    toggleSidebar: 'Delete',
    toggleHistoryMode: 'End',
    scrollUp: 'PageUp',
    scrollDown: 'PageDown',
    historyUp: 'ArrowUp',
    historyDown: 'ArrowDown',
    historyOpen: 'Enter',
    historyExit: 'Escape',
  },
  search: {
    moveUp: 'ArrowUp',
    moveDown: 'ArrowDown',
    openResult: 'Enter',
    scrollUp: 'PageUp',
    scrollDown: 'PageDown',
  },
};

let currentShortcuts: Shortcuts | null = null;

export function loadShortcuts(): Promise<Shortcuts> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['shortcuts'], (result) => {
      if (result.shortcuts) {
        currentShortcuts = result.shortcuts;
      } else {
        currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
      }
      resolve(currentShortcuts!);
    });
  });
}

export function saveShortcuts(shortcuts: Shortcuts): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ shortcuts }, () => {
      currentShortcuts = shortcuts;
      resolve();
    });
  });
}

export function getShortcuts(): Shortcuts {
  return currentShortcuts || DEFAULT_SHORTCUTS;
}

export function resetShortcuts(): Promise<void> {
  return saveShortcuts(JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS)));
}

type ShortcutKey = string;

export function isShortcut(event: KeyboardEvent, shortcutKey: ShortcutKey): boolean {
  const shortcuts = getShortcuts();
  const keys = shortcutKey.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let shortcut: any = shortcuts;
  for (const key of keys) {
    shortcut = shortcut[key];
    if (!shortcut) return false;
  }

  if (typeof shortcut === 'object') {
    const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
    const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
    const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
    return (
      event.code === shortcut.key && metaMatch && ctrlMatch && shiftMatch
    );
  }

  return (
    event.code === shortcut &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
