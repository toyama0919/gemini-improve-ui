import { addDeepDiveButton } from './buttons';
import {
  getListContent,
  getOrphanParagraphGroups,
  getSectionContent,
  getTableBlockWrapper,
  getTableContent,
} from './extraction';
import { SESSION_ID, type DeepDiveTarget } from './types';

export function addDeepDiveButtons(): void {
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
        const existing = heading.querySelector('.deep-dive-button-inline');
        if (existing) {
          if (existing.getAttribute('data-initialized') === SESSION_ID) return;
          heading.querySelectorAll('.deep-dive-button-inline, .deep-dive-expand-button').forEach((b) => b.remove());
        }
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
        const wrapper = getTableBlockWrapper(table);
        if (wrapper) {
          const existing = wrapper.querySelector('.deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            existing.remove();
          }
          wrapper
            .querySelectorAll('.deep-dive-expand-button, .deep-dive-child-button')
            .forEach((b) => b.remove());
          targets.push({
            type: 'table',
            element: wrapper,
            getContent: () => getTableContent(table),
          });
        }
      });

      const orphanGroups = getOrphanParagraphGroups(responseContainer as HTMLElement, headings);
      orphanGroups.forEach((group) => {
        const existing = group.anchor.querySelector('.deep-dive-button-inline');
        if (existing) {
          if (existing.getAttribute('data-initialized') === SESSION_ID) return;
          existing.remove();
        }
        targets.push({
          type: 'orphan',
          element: group.anchor,
          getContent: () => group.elements.map((el) => el.textContent?.trim() ?? '').filter(Boolean).join('\n\n'),
        });
      });
    } else {
      const tables = responseContainer.querySelectorAll<HTMLElement>(
        'table[data-path-to-node]'
      );
      tables.forEach((table) => {
        const wrapper = getTableBlockWrapper(table);
        if (wrapper) {
          const existing = wrapper.querySelector('.deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            existing.remove();
          }
          wrapper
            .querySelectorAll('.deep-dive-expand-button, .deep-dive-child-button')
            .forEach((b) => b.remove());
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
        const existing = blockquote.querySelector('.deep-dive-button-inline');
        if (existing) {
          if (existing.getAttribute('data-initialized') === SESSION_ID) return;
          existing.remove();
        }
        targets.push({
          type: 'blockquote',
          element: blockquote,
          getContent: () => blockquote.textContent?.trim() ?? '',
        });
      });

      const lists = responseContainer.querySelectorAll<HTMLElement>(
        'ol[data-path-to-node], ul[data-path-to-node]'
      );
      lists.forEach((list) => {
        const existing = list.querySelector(':scope > .deep-dive-button-inline');
        if (existing) {
          if (existing.getAttribute('data-initialized') === SESSION_ID) return;
          list.querySelectorAll('.deep-dive-button-inline, .deep-dive-expand-button').forEach((b) => b.remove());
        }

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
