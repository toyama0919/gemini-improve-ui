// Deep dive functionality for Gemini responses

interface DeepDiveMode {
  id: string;
  prompt?: string;
}

interface DeepDiveTarget {
  type: 'section' | 'table' | 'blockquote' | 'list' | 'child';
  element: HTMLElement;
  getContent: () => string;
  expandButtonId?: string;
}

const DEFAULT_DEEP_DIVE_MODES: DeepDiveMode[] = [
  { id: 'default', prompt: 'これについて詳しく' },
];

function addDeepDiveButtons(): void {
  const responseContainers = document.querySelectorAll('.markdown-main-panel');
  if (responseContainers.length === 0) return;

  responseContainers.forEach((responseContainer) => {
    const targets: DeepDiveTarget[] = [];

    const headings = responseContainer.querySelectorAll<HTMLElement>(
      'h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]'
    );
    const hasHeadings = headings.length > 0;

    if (hasHeadings) {
      headings.forEach((heading) => {
        if (heading.querySelector('.deep-dive-button-inline')) return;
        targets.push({
          type: 'section',
          element: heading,
          getContent: () => getSectionContent(heading),
        });
      });

      const tables = responseContainer.querySelectorAll<HTMLElement>(
        'table[data-path-to-node]'
      );
      tables.forEach((table) => {
        const wrapper = table.closest<HTMLElement>('.table-block-component');
        if (wrapper && !wrapper.querySelector('.deep-dive-button-inline')) {
          targets.push({
            type: 'table',
            element: wrapper,
            getContent: () => getTableContent(table),
          });
        }
      });
    } else {
      const tables = responseContainer.querySelectorAll<HTMLElement>(
        'table[data-path-to-node]'
      );
      tables.forEach((table) => {
        const wrapper = table.closest<HTMLElement>('.table-block-component');
        if (wrapper && !wrapper.querySelector('.deep-dive-button-inline')) {
          targets.push({
            type: 'table',
            element: wrapper,
            getContent: () => getTableContent(table),
          });
        }
      });

      const blockquotes = responseContainer.querySelectorAll<HTMLElement>(
        'blockquote[data-path-to-node]'
      );
      blockquotes.forEach((blockquote) => {
        if (!blockquote.querySelector('.deep-dive-button-inline')) {
          targets.push({
            type: 'blockquote',
            element: blockquote,
            getContent: () => blockquote.textContent?.trim() ?? '',
          });
        }
      });

      const lists = responseContainer.querySelectorAll<HTMLElement>(
        'ol[data-path-to-node], ul[data-path-to-node]'
      );
      lists.forEach((list) => {
        if (list.querySelector('.deep-dive-button-inline')) return;

        let parent = list.parentElement;
        let isNested = false;
        while (parent && parent !== responseContainer) {
          if (
            (parent.tagName === 'OL' || parent.tagName === 'UL') &&
            parent.hasAttribute('data-path-to-node')
          ) {
            isNested = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (isNested) return;

        targets.push({
          type: 'list',
          element: list,
          getContent: () => getListContent(list),
        });
      });
    }

    targets.forEach((target) => addDeepDiveButton(target));
  });
}

function getSectionContent(heading: HTMLElement): string {
  let content = (heading.textContent?.trim() ?? '') + '\n\n';
  let current = heading.nextElementSibling as HTMLElement | null;

  while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
    if (current.classList.contains('table-block-component')) {
      current = current.nextElementSibling as HTMLElement | null;
      continue;
    }
    content += (current.textContent?.trim() ?? '') + '\n\n';
    current = current.nextElementSibling as HTMLElement | null;
  }

  return content.trim();
}

function getTableContent(table: HTMLElement): string {
  let content = '';
  const rows = table.querySelectorAll<HTMLTableRowElement>('tr');

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('td, th');
    const cellTexts = Array.from(cells).map((cell) =>
      cell.textContent?.trim() ?? ''
    );
    content += '| ' + cellTexts.join(' | ') + ' |\n';
    if (rowIndex === 0) {
      content += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
    }
  });

  return content.trim();
}

function getListContent(list: HTMLElement): string {
  return list.textContent?.trim() ?? '';
}

type DeepDiveButtonElement = HTMLButtonElement & {
  _deepDiveTarget?: DeepDiveTarget;
  _expandButton?: HTMLButtonElement;
};

function addDeepDiveButton(target: DeepDiveTarget): void {
  const button = document.createElement('button') as DeepDiveButtonElement;
  button.className = 'deep-dive-button-inline';
  button.setAttribute('aria-label', 'Deep dive into this content');
  button.setAttribute('data-action', 'deep-dive');
  button.title = 'Deep dive into this content';
  button._deepDiveTarget = target;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z');
  svg.appendChild(path);
  button.appendChild(svg);

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    insertDeepDiveQuery(target, e.ctrlKey);
  });

  button.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      showTemplatePopup(button, target);
    }
  });

  let expandButton: HTMLButtonElement | null = null;
  if (target.type === 'section' || target.type === 'list') {
    expandButton = createExpandButton(target);
    button._expandButton = expandButton;
  }

  if (target.type === 'section') {
    target.element.style.position = 'relative';
    target.element.style.display = 'flex';
    target.element.style.alignItems = 'center';
    target.element.style.gap = '8px';
    target.element.appendChild(button);
    if (expandButton) target.element.appendChild(expandButton);
  } else if (target.type === 'table') {
    const footer = target.element.querySelector<HTMLElement>('.table-footer');
    if (footer) {
      const copyButton = footer.querySelector('.copy-button');
      if (copyButton) {
        footer.insertBefore(button, copyButton);
      } else {
        footer.appendChild(button);
      }
    }
  } else if (target.type === 'blockquote') {
    target.element.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '8px';
    button.style.right = '8px';
    target.element.appendChild(button);
  } else if (target.type === 'list') {
    target.element.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '0';
    button.style.right = '0';
    target.element.appendChild(button);
    if (expandButton) {
      expandButton.style.position = 'absolute';
      expandButton.style.top = '0';
      expandButton.style.right = '32px';
      target.element.appendChild(expandButton);
    }
  }
}

function createExpandButton(target: DeepDiveTarget): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'deep-dive-expand-button';
  button.setAttribute('aria-label', 'Expand to select');
  button.setAttribute('data-action', 'expand');
  button.setAttribute('tabindex', '-1');
  button.title = 'Expand to select';
  button.textContent = '+';
  button.style.fontSize = '14px';
  button.style.fontWeight = 'bold';

  button.dataset.targetId = Math.random().toString(36).substr(2, 9);
  target.expandButtonId = button.dataset.targetId;

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleExpand(target, button);
  });

  return button;
}

function toggleExpand(target: DeepDiveTarget, button: HTMLButtonElement): void {
  const isExpanded = button.getAttribute('data-action') === 'collapse';

  if (isExpanded) {
    collapseChildButtons(target);
    button.setAttribute('data-action', 'expand');
    button.setAttribute('aria-label', 'Expand to select');
    button.title = 'Expand to select';
    button.textContent = '+';
  } else {
    expandChildButtons(target);
    button.setAttribute('data-action', 'collapse');
    button.setAttribute('aria-label', 'Collapse');
    button.title = 'Collapse';
    button.textContent = '-';
  }
}

function expandChildButtons(target: DeepDiveTarget): void {
  if (target.type === 'section') {
    const heading = target.element;
    let current = heading.nextElementSibling as HTMLElement | null;

    while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
      if (current.classList.contains('table-block-component')) {
        current = current.nextElementSibling as HTMLElement | null;
        continue;
      }
      if (current.tagName === 'P' && !current.querySelector('.deep-dive-child-button')) {
        addChildButton(current);
      }
      if (
        (current.tagName === 'UL' || current.tagName === 'OL') &&
        current.hasAttribute('data-path-to-node')
      ) {
        const items = current.querySelectorAll<HTMLElement>(':scope > li');
        items.forEach((item) => {
          if (!item.querySelector('.deep-dive-child-button')) {
            addChildButton(item);
          }
        });
      }
      current = current.nextElementSibling as HTMLElement | null;
    }
  } else if (target.type === 'list') {
    const items = target.element.querySelectorAll<HTMLElement>(':scope > li');
    items.forEach((item) => {
      if (!item.querySelector('.deep-dive-child-button')) {
        addChildButton(item);
      }
    });
  }
}

function addChildButton(element: HTMLElement): void {
  element.style.position = 'relative';

  const button = document.createElement('button');
  button.className = 'deep-dive-button-inline deep-dive-child-button';
  button.setAttribute('aria-label', 'Deep dive into this content');
  button.setAttribute('data-action', 'deep-dive');
  button.title = 'Deep dive into this content';
  button.style.position = 'absolute';
  button.style.top = '0';
  button.style.right = '0';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z');
  svg.appendChild(path);
  button.appendChild(svg);

  const childTarget: DeepDiveTarget = {
    type: 'child',
    element,
    getContent: () => element.textContent?.trim() ?? '',
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    insertDeepDiveQuery(childTarget, e.ctrlKey);
  });

  button.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      showTemplatePopup(button, childTarget);
    }
  });

  element.appendChild(button);
}

function collapseChildButtons(target: DeepDiveTarget): void {
  if (target.type === 'section') {
    const heading = target.element;
    let current = heading.nextElementSibling as HTMLElement | null;
    while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
      if (current.classList.contains('table-block-component')) {
        current = current.nextElementSibling as HTMLElement | null;
        continue;
      }
      current
        .querySelectorAll('.deep-dive-child-button')
        .forEach((btn) => btn.remove());
      current = current.nextElementSibling as HTMLElement | null;
    }
  } else if (target.type === 'list') {
    target.element
      .querySelectorAll('.deep-dive-child-button')
      .forEach((btn) => btn.remove());
  }
}

async function showTemplatePopup(
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
    if (e.key === 'Escape' || (e.altKey && e.key === 'ArrowLeft')) {
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

function hideTemplatePopup(): void {
  document.getElementById('deep-dive-template-popup')?.remove();
}

function writeToTextarea(query: string, autoSend: boolean): void {
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

function doInsertQuery(target: DeepDiveTarget, mode: DeepDiveMode): void {
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

async function insertDeepDiveQuery(
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

function addDeepDiveStyles(): void {
  const styleId = 'gemini-deep-dive-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .deep-dive-button-inline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: #5f6368;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .deep-dive-button-inline:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #1a73e8;
    }
    .deep-dive-button-inline:focus {
      outline: 2px solid #1a73e8;
      outline-offset: 2px;
    }
    .deep-dive-button-inline svg {
      width: 16px;
      height: 16px;
    }
    .deep-dive-expand-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: #5f6368;
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
      font-size: 14px;
      font-weight: bold;
    }
    .deep-dive-expand-button:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #1a73e8;
    }
    .deep-dive-expand-button:focus {
      outline: 2px solid #1a73e8;
      outline-offset: 2px;
    }
    blockquote[data-path-to-node] {
      padding-top: 40px;
    }
    .gemini-deep-dive-mode-selector {
      display: inline-flex !important;
      align-items: center;
      padding: 0 8px;
      margin: 0 4px;
      flex-shrink: 0;
      white-space: nowrap;
      vertical-align: middle;
    }
    body > .gemini-deep-dive-mode-selector {
      position: fixed;
      bottom: 100px;
      left: 320px;
      z-index: 9999;
    }
    .gemini-deep-dive-mode-selector select {
      padding: 4px 8px;
      border: 1px solid #dadce0;
      border-radius: 8px;
      background: #fff;
      font-size: 13px;
      color: #5f6368;
      cursor: pointer;
      max-width: 100px;
    }
    .gemini-deep-dive-mode-selector select:hover {
      border-color: #1a73e8;
      color: #1a73e8;
    }
    .deep-dive-template-popup {
      position: absolute;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      min-width: 160px;
      padding: 4px 0;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      outline: none;
    }
    .deep-dive-template-item {
      display: block;
      width: 100%;
      padding: 7px 14px;
      border: none;
      background: transparent;
      text-align: left;
      font-size: 13px;
      color: #3c4043;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .deep-dive-template-item:hover,
    .deep-dive-template-item:focus {
      background: #f1f3f4;
      color: #1a73e8;
      outline: none;
    }
  `;
  document.head.appendChild(style);
}

function injectModeSelector(): void {
  const existing = document.getElementById('gemini-deep-dive-mode-selector');
  if (existing) existing.remove();

  chrome.storage.sync.get(
    ['deepDiveModes', 'currentDeepDiveModeId'],
    (r: Record<string, unknown>) => {
      const modes =
        (r.deepDiveModes as DeepDiveMode[] | undefined) &&
        (r.deepDiveModes as DeepDiveMode[]).length > 0
          ? (r.deepDiveModes as DeepDiveMode[])
          : DEFAULT_DEEP_DIVE_MODES;

      const wrapper = document.createElement('div');
      wrapper.id = 'gemini-deep-dive-mode-selector';
      wrapper.className = 'gemini-deep-dive-mode-selector';

      const select = document.createElement('select');
      select.id = 'gemini-deep-dive-mode';
      select.title = '深掘りモード';
      select.setAttribute('aria-label', '深掘りモード');

      modes.forEach((mode) => {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.id;
        select.appendChild(option);
      });

      select.addEventListener('change', () => {
        chrome.storage.sync.set({ currentDeepDiveModeId: select.value });
      });

      wrapper.appendChild(select);

      const addButton = document.querySelector<HTMLElement>(
        'button[aria-label*="ファイル"], button[aria-label*="追加"]'
      );
      const toolsButton = document.querySelector<HTMLElement>(
        'button[aria-label*="ツール"], button[aria-label*="Tool"]'
      );
      const insertAfter = toolsButton || (addButton && addButton.nextElementSibling as HTMLElement | null);
      if (insertAfter && insertAfter.parentElement) {
        insertAfter.parentElement.insertBefore(wrapper, insertAfter.nextSibling);
      } else {
        const inputArea = document.querySelector<HTMLElement>(
          'div[contenteditable="true"][role="textbox"]'
        );
        if (inputArea) {
          const parent =
            inputArea.closest('form') ||
            inputArea.parentElement?.parentElement;
          if (parent) {
            parent.insertBefore(wrapper, parent.firstChild);
          } else {
            document.body.appendChild(wrapper);
          }
        } else {
          document.body.appendChild(wrapper);
        }
      }

      const urlParams = new URLSearchParams(location.search);
      const urlModeId = urlParams.get('mode_id');
      let modeId = r.currentDeepDiveModeId as string | undefined;
      if (urlModeId && modes.some((m) => m.id === urlModeId)) {
        modeId = urlModeId;
        chrome.storage.sync.set({ currentDeepDiveModeId: urlModeId });
      }
      if (modeId && modes.some((m) => m.id === modeId)) {
        select.value = modeId;
      } else if (modes.length > 0) {
        select.value = modes[0].id;
      }
    }
  );
}

let deepDiveTimer: ReturnType<typeof setTimeout> | null = null;

export function initializeDeepDive(): void {
  addDeepDiveStyles();

  const tryInjectModeSelector = () => {
    const hasButtons = document.querySelector(
      'button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]'
    );
    if (
      hasButtons ||
      document.querySelector('div[contenteditable="true"][role="textbox"]')
    ) {
      injectModeSelector();
    } else {
      setTimeout(tryInjectModeSelector, 500);
    }
  };
  tryInjectModeSelector();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (
      namespace === 'sync' &&
      changes.deepDiveModes &&
      location.href.includes('gemini.google.com') &&
      document.querySelector(
        'button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]'
      )
    ) {
      injectModeSelector();
    }
  });

  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const el = node as Element;
            if (
              el.matches?.('[data-path-to-node]') ||
              el.querySelector?.('[data-path-to-node]')
            ) {
              shouldUpdate = true;
              break;
            }
          }
        }
      }
      if (shouldUpdate) break;
    }

    if (shouldUpdate) {
      if (deepDiveTimer) clearTimeout(deepDiveTimer);
      deepDiveTimer = setTimeout(() => addDeepDiveButtons(), 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => addDeepDiveButtons(), 1000);
}
