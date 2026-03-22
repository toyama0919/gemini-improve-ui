const SELECTOR_ID = 'gemini-quick-prompt-selector';
const PLACEHOLDER = '-- クイック --';

export const DEFAULT_QUICK_PROMPTS = [
  'ここまでの内容をまとめて',
  '続きを教えて',
  'もっと詳しく教えて',
  '具体例を挙げて',
];

let quickPrompts: string[] = [...DEFAULT_QUICK_PROMPTS];

function loadQuickPrompts(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['quickPrompts'], (result) => {
      if (result.quickPrompts && result.quickPrompts.length > 0) {
        quickPrompts = result.quickPrompts;
      }
      resolve(quickPrompts);
    });
  });
}

function findTextarea(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(
      'div[contenteditable="true"][role="textbox"]'
    ) || document.querySelector<HTMLElement>('[contenteditable="true"]')
  );
}

function findSendButton(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(
      'button[aria-label*="送信"], button[aria-label*="Send"]'
    ) ||
    document.querySelector<HTMLButtonElement>('button.send-button') ||
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) =>
        btn.getAttribute('aria-label')?.includes('送信') ||
        btn.getAttribute('aria-label')?.includes('Send')
    ) ||
    null
  );
}

function writeAndSend(text: string): void {
  const textarea = findTextarea();
  if (!textarea) return;

  while (textarea.firstChild) textarea.removeChild(textarea.firstChild);

  const p = document.createElement('p');
  p.textContent = text;
  textarea.appendChild(p);
  textarea.focus();

  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(textarea);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  setTimeout(() => {
    const sendButton = findSendButton();
    if (sendButton && !sendButton.disabled) sendButton.click();
  }, 200);
}

function injectSelector(): void {
  const existing = document.getElementById(SELECTOR_ID);
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = SELECTOR_ID;
  wrapper.className = 'gemini-deep-dive-mode-selector';

  const select = document.createElement('select');
  select.title = 'クイックプロンプト';
  select.setAttribute('aria-label', 'クイックプロンプト');

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = PLACEHOLDER;
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  quickPrompts.forEach((prompt) => {
    const option = document.createElement('option');
    option.value = prompt;
    option.textContent = prompt.length > 20 ? prompt.substring(0, 18) + '…' : prompt;
    option.title = prompt;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    const text = select.value;
    if (text) {
      writeAndSend(text);
      select.selectedIndex = 0;
    }
  });

  wrapper.appendChild(select);

  const deepDiveSelector = document.getElementById('gemini-deep-dive-mode-selector');
  if (deepDiveSelector?.parentElement) {
    deepDiveSelector.parentElement.insertBefore(wrapper, deepDiveSelector.nextSibling);
    return;
  }

  const trailing = document.querySelector<HTMLElement>('.trailing-actions-wrapper');
  if (trailing) {
    const modelPicker = trailing.querySelector('.model-picker-container');
    if (modelPicker) {
      trailing.insertBefore(wrapper, modelPicker);
    } else {
      trailing.insertBefore(wrapper, trailing.firstChild);
    }
    return;
  }

  const textarea = findTextarea();
  const inputField = textarea?.closest('.text-input-field') as HTMLElement | null;
  if (inputField) {
    inputField.appendChild(wrapper);
  }
}

export function focusQuickPromptSelector(): void {
  const wrapper = document.getElementById(SELECTOR_ID);
  const select = wrapper?.querySelector('select');
  if (select) {
    select.focus();
    select.showPicker?.();
  }
}

export function isQuickPromptFocused(): boolean {
  return document.activeElement?.closest(`#${SELECTOR_ID}`) !== null;
}

export function initializeQuickPrompts(): void {
  loadQuickPrompts().then(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (findTextarea()) {
        clearInterval(interval);
        setTimeout(() => injectSelector(), 500);
      } else if (attempts >= 15) {
        clearInterval(interval);
      }
    }, 500);
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.quickPrompts) {
      quickPrompts = changes.quickPrompts.newValue || [...DEFAULT_QUICK_PROMPTS];
      if (document.getElementById(SELECTOR_ID)) injectSelector();
    }
  });
}
