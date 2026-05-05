import {
  DEFAULT_DEEP_DIVE_MODES,
  type DeepDiveMode,
  type DeepDiveTarget,
} from './types';

export function writeToTextarea(query: string, autoSend: boolean): void {
  const textarea = document.querySelector<HTMLElement>(
    'div[contenteditable="true"][role="textbox"]'
  );
  if (!textarea) return;

  while (textarea.firstChild) textarea.removeChild(textarea.firstChild);

  query.split('\n').forEach((line) => {
    const p = document.createElement('p');
    if (line.trim() === '') {
      p.appendChild(document.createElement('br'));
    } else {
      p.textContent = line;
    }
    textarea.appendChild(p);
  });

  textarea.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(textarea);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  if (autoSend) {
    setTimeout(() => {
      const sendButton = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="送信"], button[aria-label*="Send"]'
      );
      if (sendButton && !sendButton.disabled) sendButton.click();
    }, 100);
  }
}

export function doInsertQuery(target: DeepDiveTarget, mode: DeepDiveMode): void {
  const content = target.getContent();
  const quotedContent = content
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  const query = quotedContent + '\n\n' + (mode.prompt || 'これについて詳しく');
  writeToTextarea(query, true);

  chrome.storage.sync.get(['deepDiveRecentModes'], (r) => {
    const recent = ((r.deepDiveRecentModes as string[]) || []).filter(
      (id) => id !== mode.id
    );
    recent.unshift(mode.id);
    chrome.storage.sync.set({ deepDiveRecentModes: recent.slice(0, 20) });
  });
}

export async function insertDeepDiveQuery(
  target: DeepDiveTarget,
  quoteOnly = false
): Promise<void> {
  if (!document.querySelector('div[contenteditable="true"][role="textbox"]')) return;

  const content = target.getContent();
  const quotedContent = content
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  let query: string;
  let shouldAutoSend = false;

  if (quoteOnly) {
    query = quotedContent + '\n\n';
  } else {
    const result = await new Promise<{
      deepDiveModes?: DeepDiveMode[];
      currentDeepDiveModeId?: string;
    }>((resolve) => {
      chrome.storage.sync.get(
        ['deepDiveModes', 'currentDeepDiveModeId'],
        resolve as (items: Record<string, unknown>) => void
      );
    });
    const modes =
      result.deepDiveModes && result.deepDiveModes.length > 0
        ? result.deepDiveModes
        : DEFAULT_DEEP_DIVE_MODES;
    const urlParams = new URLSearchParams(location.search);
    const urlModeId = urlParams.get('mode_id');
    let modeId = urlModeId || result.currentDeepDiveModeId || modes[0]?.id;
    if (!modes.some((m) => m.id === modeId)) modeId = modes[0]?.id;
    const mode =
      modes.find((m) => m.id === modeId) ||
      modes[0] ||
      DEFAULT_DEEP_DIVE_MODES[0];
    query = quotedContent + '\n\n' + (mode.prompt || 'これについて詳しく');
    shouldAutoSend = true;
  }

  writeToTextarea(query, shouldAutoSend);
}
