// Map view - shows current chat turn outline in sidebar

let mapMode = false;
let mapSelectionMode = false;
let mapSelectionIndex = 0;
const MAP_PANEL_ID = 'gemini-map-panel';
const MAP_STYLE_ID = 'gemini-map-styles';

function injectMapStyles() {
  if (document.getElementById(MAP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MAP_STYLE_ID;
  style.textContent = `
    #gemini-map-panel {
      display: none;
      overflow-y: auto;
      padding: 8px 4px;
      height: 100%;
      box-sizing: border-box;
    }
    #gemini-map-panel .map-header {
      padding: 8px 12px 6px;
      font-size: 11px;
      font-weight: 600;
      opacity: 0.5;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    #gemini-map-panel ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    #gemini-map-panel li button {
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-radius: 8px;
      padding: 7px 12px;
      margin: 1px 0;
      cursor: pointer;
      font-size: 13px;
      line-height: 1.4;
      color: inherit;
      font-family: inherit;
      word-break: break-word;
      transition: background 0.15s;
    }
    #gemini-map-panel li button:hover {
      background: rgba(128, 128, 128, 0.18);
    }
    #gemini-map-panel li button.map-item-selected {
      background: rgba(26, 115, 232, 0.1);
      outline: 2px solid #1a73e8;
      outline-offset: -2px;
    }
    #gemini-map-panel li button .map-turn-index {
      display: inline-block;
      min-width: 22px;
      font-size: 11px;
      opacity: 0.45;
      margin-right: 2px;
      vertical-align: baseline;
    }
  `;
  document.head.appendChild(style);
}

// Extract clean prompt text from user-query element
function getPromptText(userQuery) {
  const heading = userQuery.querySelector('h1, h2, h3, [role="heading"]');
  let text = heading?.textContent?.trim() || userQuery.textContent?.trim() || '';
  // Remove "あなたのプロンプト" prefix
  text = text.replace(/^あなたのプロンプト\s*/, '');
  // Remove "> " prefix added by deep-dive prompts
  text = text.replace(/^>\s*/, '');
  return text.substring(0, 70) || '(空)';
}

// Get all conversation turn containers from the chat area
function getConversationContainers() {
  return Array.from(document.querySelectorAll(
    'infinite-scroller.chat-history > .conversation-container'
  ));
}

// Find the sidebar root container (map panel injection target)
function getSidebarContainer() {
  return document.querySelector('.sidenav-with-history-container');
}

// Find the chat-list container to hide/show
function getOverflowContainer() {
  return document.querySelector('.sidenav-with-history-container > div.overflow-container') ||
         document.querySelector('.sidenav-with-history-container .overflow-container');
}

// Build map panel DOM from current chat turns
function buildMapPanel() {
  const panel = document.createElement('div');
  panel.id = MAP_PANEL_ID;

  const header = document.createElement('div');
  header.className = 'map-header';
  header.textContent = 'このチャットの流れ';
  panel.appendChild(header);

  const containers = getConversationContainers();

  if (containers.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 12px; opacity: 0.5; font-size: 13px;';
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

// Measure the height of native sidebar header elements (≡, 🔍 buttons etc.)
// to offset the map panel list below them
function measureSidebarHeaderHeight(sidebarContainer) {
  const overflowContainer = getOverflowContainer();
  let maxBottom = 0;

  for (const child of sidebarContainer.children) {
    if (child.id === MAP_PANEL_ID) continue;
    if (child === overflowContainer) continue;
    const rect = child.getBoundingClientRect();
    if (rect.height > 0) {
      const sidebarTop = sidebarContainer.getBoundingClientRect().top;
      maxBottom = Math.max(maxBottom, rect.bottom - sidebarTop);
    }
  }

  return maxBottom;
}

// Show map view (hide chat-list, inject map panel)
function showMap() {
  injectMapStyles();

  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) return;

  const overflowContainer = getOverflowContainer();

  // Rebuild panel with fresh content every time
  const existing = document.getElementById(MAP_PANEL_ID);
  if (existing) existing.remove();

  const panel = buildMapPanel();
  sidebarContainer.appendChild(panel);

  if (overflowContainer) overflowContainer.style.display = 'none';
  panel.style.display = 'block';
  mapMode = true;

  // Offset list items below native sidebar header buttons (≡, 🔍)
  requestAnimationFrame(() => {
    const headerHeight = measureSidebarHeaderHeight(sidebarContainer);
    if (headerHeight > 0) {
      panel.style.paddingTop = `${headerHeight}px`;
    }
  });

  // Start watching for new chat turns
  startChatObserver();
}

// Show chat-list view (hide map panel, restore chat-list)
function hideMap() {
  const overflowContainer = getOverflowContainer();
  const panel = document.getElementById(MAP_PANEL_ID);

  if (overflowContainer) overflowContainer.style.display = '';
  if (panel) panel.style.display = 'none';
  mapMode = false;
  stopChatObserver();
}

// Toggle between map and chat-list
function toggleMapMode() {
  if (mapMode) {
    hideMap();
  } else {
    showMap();
  }
}

function isMapMode() {
  return mapMode;
}

// Rebuild map panel in place, preserving scroll and selection
function refreshMap() {
  if (!mapMode) return;

  const sidebarContainer = getSidebarContainer();
  if (!sidebarContainer) return;

  const existing = document.getElementById(MAP_PANEL_ID);
  const savedIndex = mapSelectionMode ? mapSelectionIndex : -1;
  const savedScroll = existing ? existing.scrollTop : 0;

  if (existing) existing.remove();

  const panel = buildMapPanel();
  sidebarContainer.appendChild(panel);
  panel.style.display = 'block';

  // Restore header offset
  const headerHeight = measureSidebarHeaderHeight(sidebarContainer);
  if (headerHeight > 0) panel.style.paddingTop = `${headerHeight}px`;

  // Restore scroll position
  panel.scrollTop = savedScroll;

  // Restore selection highlight if in selection mode
  if (savedIndex >= 0) {
    highlightMapItem(savedIndex);
  }
}

// Watch for new conversation turns and auto-refresh the map
let chatObserver = null;

function startChatObserver() {
  if (chatObserver) chatObserver.disconnect();

  const chatHistory = document.querySelector('infinite-scroller.chat-history');
  if (!chatHistory) return;

  let debounceTimer = null;

  chatObserver = new MutationObserver(() => {
    if (!mapMode) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refreshMap(), 300);
  });

  chatObserver.observe(chatHistory, { childList: true, subtree: false });
}

function stopChatObserver() {
  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
}

// Reset map state on navigation (called from content.js on URL change)
function resetMapMode() {
  stopChatObserver();
  mapSelectionMode = false;
  mapSelectionIndex = 0;
  const panel = document.getElementById(MAP_PANEL_ID);
  if (panel) panel.remove();
  const overflowContainer = getOverflowContainer();
  if (overflowContainer) overflowContainer.style.display = '';
  mapMode = false;
}

// --- Map selection mode (keyboard navigation within map panel) ---

function getMapButtons() {
  const panel = document.getElementById(MAP_PANEL_ID);
  if (!panel) return [];
  return Array.from(panel.querySelectorAll('li button'));
}

function highlightMapItem(index) {
  const buttons = getMapButtons();
  if (buttons.length === 0) return;

  mapSelectionIndex = Math.max(0, Math.min(index, buttons.length - 1));

  buttons.forEach(btn => btn.classList.remove('map-item-selected'));

  const selected = buttons[mapSelectionIndex];
  if (selected) {
    selected.classList.add('map-item-selected');
    selected.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

function enterMapSelectionMode() {
  mapSelectionMode = true;
  if (document.activeElement) document.activeElement.blur();
  highlightMapItem(mapSelectionIndex);
}

function exitMapSelectionMode() {
  mapSelectionMode = false;
  getMapButtons().forEach(btn => btn.classList.remove('map-item-selected'));
}

function moveMapUp() {
  highlightMapItem(mapSelectionIndex - 1);
}

function moveMapDown() {
  highlightMapItem(mapSelectionIndex + 1);
}

function openSelectedMapItem() {
  const buttons = getMapButtons();
  if (!buttons[mapSelectionIndex]) return;
  buttons[mapSelectionIndex].click();
  // Keep map selection active so focus stays on map panel
  highlightMapItem(mapSelectionIndex);
}

function isMapSelectionMode() {
  return mapSelectionMode;
}
