// Map view - fixed right-side panel showing current chat outline with scroll highlight

let mapMode = false;
const MAP_PANEL_ID = 'gemini-map-panel';
const MAP_STYLE_ID = 'gemini-map-styles';

function injectMapStyles() {
  if (document.getElementById(MAP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MAP_STYLE_ID;
  style.textContent = `
    #gemini-map-panel {
      position: fixed;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      max-height: 70vh;
      width: 200px;
      background: rgba(248, 249, 250, 0.95);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      overflow-y: auto;
      z-index: 100;
      padding: 6px 4px;
      font-family: inherit;
      backdrop-filter: blur(8px);
    }
    .dark-theme #gemini-map-panel {
      background: rgba(32, 33, 36, 0.95);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    }
    #gemini-map-panel .map-header {
      padding: 6px 10px 4px;
      font-size: 10px;
      font-weight: 600;
      opacity: 0.45;
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
      border-left: 2px solid transparent;
      border-radius: 0 6px 6px 0;
      padding: 5px 10px 5px 8px;
      margin: 1px 0;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.35;
      color: inherit;
      font-family: inherit;
      word-break: break-word;
      opacity: 0.5;
      transition: background 0.15s, opacity 0.15s, border-color 0.15s;
    }
    #gemini-map-panel li button:hover {
      background: rgba(128, 128, 128, 0.12);
      opacity: 0.85;
    }
    #gemini-map-panel li button.map-item-current {
      opacity: 1;
      background: rgba(26, 115, 232, 0.08);
      border-left-color: #1a73e8;
    }
    #gemini-map-panel li button .map-turn-index {
      display: inline-block;
      min-width: 18px;
      font-size: 10px;
      opacity: 0.5;
      margin-right: 3px;
    }
  `;
  document.head.appendChild(style);
}

function getPromptText(userQuery) {
  const heading = userQuery.querySelector('h1, h2, h3, [role="heading"]');
  let text = heading?.textContent?.trim() || userQuery.textContent?.trim() || '';
  text = text.replace(/^あなたのプロンプト\s*/, '');
  text = text.replace(/^>\s*/, '');
  return text.substring(0, 60) || '(空)';
}

function getConversationContainers() {
  return Array.from(document.querySelectorAll(
    'infinite-scroller.chat-history > .conversation-container'
  ));
}

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

function getMapButtons() {
  const panel = document.getElementById(MAP_PANEL_ID);
  if (!panel) return [];
  return Array.from(panel.querySelectorAll('li button'));
}

// IntersectionObserver: highlight map items for currently visible chat turns
let intersectionObserver = null;
const visibleTurns = new Set();

function setupIntersectionObserver() {
  if (intersectionObserver) intersectionObserver.disconnect();
  visibleTurns.clear();

  const containers = getConversationContainers();
  if (containers.length === 0) return;

  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const index = containers.indexOf(entry.target);
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
  }, { threshold: 0.15 });

  containers.forEach(c => intersectionObserver.observe(c));
}

function stopIntersectionObserver() {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  visibleTurns.clear();
}

// MutationObserver: auto-refresh map when new chat turns are added
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

// Rebuild map panel, preserving scroll position
function refreshMap() {
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

function showMap() {
  injectMapStyles();

  const existing = document.getElementById(MAP_PANEL_ID);
  if (existing) existing.remove();

  const panel = buildMapPanel();
  document.body.appendChild(panel);
  mapMode = true;

  setupIntersectionObserver();
  startChatObserver();
}

function hideMap() {
  const panel = document.getElementById(MAP_PANEL_ID);
  if (panel) panel.remove();
  mapMode = false;
  stopIntersectionObserver();
  stopChatObserver();
}

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

// Reset map state on navigation (called from content.js on URL change)
function resetMapMode() {
  stopChatObserver();
  stopIntersectionObserver();
  const panel = document.getElementById(MAP_PANEL_ID);
  if (panel) panel.remove();
  mapMode = false;
}
