import { isShortcut } from '../settings';
import {
  getTableRowMarkdown,
  isTableBlockWrapper,
} from './extraction';
import { hideTemplatePopup, showTemplatePopup } from './popup';
import { insertDeepDiveQuery } from './query';
import {
  type DeepDiveTarget,
  SESSION_ID,
  type DeepDiveButtonElement,
} from './types';

export function addDeepDiveButton(target: DeepDiveTarget): void {
  const button = document.createElement('button') as DeepDiveButtonElement;
  button.className = 'deep-dive-button-inline';
  button.setAttribute('aria-label', 'Deep dive into this content');
  button.setAttribute('data-action', 'deep-dive');
  button.setAttribute('data-initialized', SESSION_ID);
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
    void insertDeepDiveQuery(target, false);
  });

  button.addEventListener('keydown', (e) => {
    if (isShortcut(e, 'chat.focusQuickPrompt')) {
      if (!e.isTrusted || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      void insertDeepDiveQuery(target, true);
      return;
    }
    if (e.key === 'ArrowRight' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const expandBtn = target.element.querySelector<HTMLButtonElement>('.deep-dive-expand-button');
      if (expandBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleExpand(target, expandBtn);
      }
    } else if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (document.getElementById('deep-dive-template-popup')) {
        hideTemplatePopup();
        button.focus();
      } else {
        void showTemplatePopup(button, target);
      }
    }
  });

  let expandButton: HTMLButtonElement | null = null;
  if (target.type === 'section' || target.type === 'list' || target.type === 'table') {
    expandButton = createExpandButton(target);
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
        if (expandButton) footer.insertBefore(expandButton, copyButton);
      } else {
        footer.appendChild(button);
        if (expandButton) footer.appendChild(expandButton);
      }
    }
  } else if (target.type === 'blockquote') {
    target.element.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '8px';
    button.style.right = '8px';
    target.element.appendChild(button);
  } else if (target.type === 'orphan') {
    target.element.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '0';
    button.style.right = '0';
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
      if (isTableBlockWrapper(current)) {
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
  } else if (target.type === 'table') {
    const table = target.element.querySelector<HTMLElement>('table[data-path-to-node]');
    if (!table) return;
    table.querySelectorAll<HTMLTableRowElement>('tr').forEach((tr) => {
      if (!tr.querySelector('.deep-dive-child-button')) {
        addChildButton(tr, () => getTableRowMarkdown(table, tr));
      }
    });
  }
}

function addChildButton(
  element: HTMLElement,
  getContent: () => string = () => element.textContent?.trim() ?? ''
): void {
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
    getContent,
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void insertDeepDiveQuery(childTarget, false);
  });

  button.addEventListener('keydown', (e) => {
    if (isShortcut(e, 'chat.focusQuickPrompt')) {
      if (!e.isTrusted || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      void insertDeepDiveQuery(childTarget, true);
      return;
    }
    if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (document.getElementById('deep-dive-template-popup')) {
        hideTemplatePopup();
        button.focus();
      } else {
        void showTemplatePopup(button, childTarget);
      }
    }
  });

  element.appendChild(button);
}

function collapseChildButtons(target: DeepDiveTarget): void {
  if (target.type === 'section') {
    const heading = target.element;
    let current = heading.nextElementSibling as HTMLElement | null;
    while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
      if (isTableBlockWrapper(current)) {
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
  } else if (target.type === 'table') {
    target.element
      .querySelectorAll('.deep-dive-child-button')
      .forEach((btn) => btn.remove());
  }
}
