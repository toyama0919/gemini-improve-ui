import type { OrphanGroup } from './types';

export function getOrphanParagraphGroups(
  container: HTMLElement,
  headings: NodeListOf<HTMLElement>
): OrphanGroup[] {
  const headingSet = new Set(Array.from(headings));
  const children = Array.from(container.children) as HTMLElement[];
  const groups: OrphanGroup[] = [];
  let current: HTMLElement[] = [];
  let prevBreakerWasHeading = false;

  const flush = (afterHeading: boolean) => {
    if (current.length > 0 && !afterHeading) {
      groups.push({ anchor: current[0], elements: [...current] });
    }
    current = [];
  };

  for (const child of children) {
    const tag = child.tagName;
    const isParagraph = tag === 'P';
    const isHeading =
      headingSet.has(child) ||
      tag === 'H1' ||
      tag === 'H2' ||
      tag === 'H3' ||
      tag === 'H4' ||
      tag === 'H5' ||
      tag === 'H6';
    const isHr = tag === 'HR';

    if (isHeading) {
      flush(prevBreakerWasHeading);
      prevBreakerWasHeading = true;
    } else if (isHr) {
      flush(prevBreakerWasHeading);
      prevBreakerWasHeading = false;
    } else if (isParagraph) {
      current.push(child);
    } else {
      flush(prevBreakerWasHeading);
      prevBreakerWasHeading = false;
    }
  }
  flush(prevBreakerWasHeading);

  return groups;
}

export function getTableBlockWrapper(table: HTMLElement): HTMLElement | null {
  return (
    table.closest<HTMLElement>('.table-block-component') ??
    table.closest<HTMLElement>('table-block') ??
    table.closest<HTMLElement>('.table-block')
  );
}

export function isTableBlockWrapper(el: HTMLElement): boolean {
  if (el.classList.contains('table-block-component')) return true;
  if (el.tagName === 'TABLE-BLOCK') return true;
  return (
    el.classList.contains('table-block') &&
    el.querySelector(':scope > .table-footer') !== null
  );
}

export function getSectionContent(heading: HTMLElement): string {
  let content = (heading.textContent?.trim() ?? '') + '\n\n';
  let current = heading.nextElementSibling as HTMLElement | null;

  while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
    if (isTableBlockWrapper(current)) {
      current = current.nextElementSibling as HTMLElement | null;
      continue;
    }
    content += (current.textContent?.trim() ?? '') + '\n\n';
    current = current.nextElementSibling as HTMLElement | null;
  }

  return content.trim();
}

export function getTableContent(table: HTMLElement): string {
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

export function getTableRowMarkdown(_table: HTMLElement, row: HTMLTableRowElement): string {
  const cells = row.querySelectorAll('td, th');
  const cellTexts = Array.from(cells).map((cell) =>
    cell.textContent?.trim() ?? ''
  );
  return '| ' + cellTexts.join(' | ') + ' |';
}

export function getListContent(list: HTMLElement): string {
  return list.textContent?.trim() ?? '';
}
