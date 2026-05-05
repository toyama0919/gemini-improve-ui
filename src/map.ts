// Map view - fixed right-side panel showing current chat outline with scroll highlight

import { getMapPanelCss, MAP_BODY_CLASS } from './styles/mapPanel';

let mapMode = false;
const MAP_PANEL_ID = 'gemini-map-panel';
const MAP_STYLE_ID = 'gemini-map-styles-v3';

/** Panel width + map `right` offset (`right: 16px`). */
const MAP_PANEL_WIDTH_PX = 240;
const MAP_PANEL_RIGHT_PX = 16;
const MAP_CONTENT_RESERVE_PX = MAP_PANEL_WIDTH_PX + MAP_PANEL_RIGHT_PX;

function injectMapStyles(): void {
  if (document.getElementById(MAP_STYLE_ID)) return;
  for (const id of ['gemini-map-styles', 'gemini-map-styles-v2'] as const) {
    document.getElementById(id)?.remove();
  }
  const style = document.createElement('style');
  style.id = MAP_STYLE_ID;
  style.textContent = getMapPanelCss(MAP_CONTENT_RESERVE_PX);
  document.head.appendChild(style);
}

function getPromptText(userQuery: Element): string {
  const heading = userQuery.querySelector('h1, h2, h3, [role="heading"]');
  let text =
    (heading as HTMLElement)?.textContent?.trim() ||
    (userQuery as HTMLElement).textContent?.trim() ||
    '';
  text = text.replace(/^あなたのプロンプト\s*/, '');
  text = text.replace(/^>\s*/, '');
  return text.substring(0, 60) || '(空)';
}

function getConversationContainers(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'infinite-scroller.chat-history > .conversation-container'
    )
  );
}

function buildMapPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = MAP_PANEL_ID;

  const header = document.createElement('div');
  header.className = 'map-header';
  header.textContent = 'このチャットの流れ';
  panel.appendChild(header);

  const containers = getConversationContainers();

  if (containers.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 10px; opacity: 0.45; font-size: 12px;';
    empty.textContent = 'チャットがまだありません';
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement('ul');

  containers.forEach((container, index) => {
    const userQuery = container.querySelector('user-query');
    if (!userQuery) return;

    const promptText = getPromptText(userQuery);
    const li = document.createElement('li');
    const btn = document.createElement('button');

    const indexSpan = document.createElement('span');
    indexSpan.className = 'map-turn-index';
    indexSpan.textContent = `${index + 1}.`;

    btn.appendChild(indexSpan);
    btn.appendChild(document.createTextNode(promptText));
    btn.addEventListener('click', () => {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    li.appendChild(btn);
    list.appendChild(li);
  });

  panel.appendChild(list);
  return panel;
}

function getMapButtons(): HTMLButtonElement[] {
  const panel = document.getElementById(MAP_PANEL_ID);
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLButtonElement>('li button'));
}

let intersectionObserver: IntersectionObserver | null = null;
const visibleTurns = new Set<number>();

function setupIntersectionObserver(): void {
  if (intersectionObserver) intersectionObserver.disconnect();
  visibleTurns.clear();

  const containers = getConversationContainers();
  if (containers.length === 0) return;

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const index = containers.indexOf(entry.target as HTMLElement);
        if (index === -1) return;
        if (entry.isIntersecting) {
          visibleTurns.add(index);
        } else {
          visibleTurns.delete(index);
        }
      });

      const buttons = getMapButtons();
      buttons.forEach((btn, i) => {
        btn.classList.toggle('map-item-current', visibleTurns.has(i));
      });

      const panel = document.getElementById(MAP_PANEL_ID);
      if (panel) {
        const firstHighlighted = buttons.find((_, i) => visibleTurns.has(i));
        if (firstHighlighted) {
          firstHighlighted.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    },
    { threshold: 0.15 }
  );

  containers.forEach((c) => intersectionObserver!.observe(c));
}

function stopIntersectionObserver(): void {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  visibleTurns.clear();
}

let chatObserver: MutationObserver | null = null;

function startChatObserver(): void {
  if (chatObserver) chatObserver.disconnect();

  const chatHistory = document.querySelector('infinite-scroller.chat-history');
  if (!chatHistory) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  chatObserver = new MutationObserver(() => {
    if (!mapMode) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refreshMap(), 300);
  });

  chatObserver.observe(chatHistory, { childList: true, subtree: false });
}

function stopChatObserver(): void {
  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
}

function refreshMap(): void {
  if (!mapMode) return;

  const existing = document.getElementById(MAP_PANEL_ID);
  const savedScroll = existing ? existing.scrollTop : 0;
  if (existing) existing.remove();

  stopIntersectionObserver();

  const panel = buildMapPanel();
  document.body.appendChild(panel);
  panel.scrollTop = savedScroll;

  setupIntersectionObserver();
}

export function showMap(): void {
  injectMapStyles();

  const existing = document.getElementById(MAP_PANEL_ID);
  if (existing) existing.remove();

  const panel = buildMapPanel();
  document.body.appendChild(panel);
  mapMode = true;

  document.body.classList.add(MAP_BODY_CLASS);

  setupIntersectionObserver();
  startChatObserver();
}

export function resetMapMode(): void {
  stopChatObserver();
  stopIntersectionObserver();

  document.body.classList.remove(MAP_BODY_CLASS);

  const panel = document.getElementById(MAP_PANEL_ID);
  if (panel) panel.remove();
  mapMode = false;
}
