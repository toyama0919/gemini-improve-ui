// Chat export functionality - saves current conversation as Zettelkasten Markdown

const EXPORT_BUTTON_ID = 'gemini-export-note-button';
let exportDirHandle = null;

// --- IndexedDB helpers ---

function openExportDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gemini-export', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('handles');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredDirHandle() {
  try {
    const db = await openExportDB();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('save_dir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storeDirHandle(handle) {
  try {
    const db = await openExportDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'save_dir');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage errors
  }
}

// --- Directory handle management ---

async function getExportDirHandle() {
  // Use in-memory cache first
  if (exportDirHandle) {
    const perm = await exportDirHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return exportDirHandle;
  }

  // Try stored handle
  const stored = await getStoredDirHandle();
  if (stored) {
    const perm = await stored.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      exportDirHandle = stored;
      return exportDirHandle;
    }
    // Permission expired - request it (valid because this runs in a click handler)
    const newPerm = await stored.requestPermission({ mode: 'readwrite' });
    if (newPerm === 'granted') {
      exportDirHandle = stored;
      return exportDirHandle;
    }
  }

  // No handle or permission denied - ask user to pick a folder
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await storeDirHandle(handle);
  exportDirHandle = handle;
  return exportDirHandle;
}

// --- Text cleanup ---

const ARTIFACT_PATTERNS = [
  /^[+＋]$/,                          // Gemini accordion expand buttons
  /^Google スプレッドシートにエクスポート$/,  // Table export button
  /^Google Sheets にエクスポート$/,
  /^Export to Sheets$/,
];

function cleanModelText(text) {
  return text
    .split('\n')
    .filter(line => !ARTIFACT_PATTERNS.some(p => p.test(line.trim())))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Chat content extraction ---

function extractChatContent() {
  const userQueries = Array.from(document.querySelectorAll('user-query'));
  const modelResponses = Array.from(document.querySelectorAll('model-response'));

  const turns = [];
  const len = Math.min(userQueries.length, modelResponses.length);

  for (let i = 0; i < len; i++) {
    const userText = Array.from(userQueries[i].querySelectorAll('.query-text-line'))
      .map(el => el.innerText.trim())
      .filter(Boolean)
      .join('\n');

    const rawModelText = modelResponses[i].querySelector('message-content .markdown')?.innerText?.trim();
    const modelText = rawModelText ? cleanModelText(rawModelText) : '';

    if (userText || modelText) {
      turns.push({ user: userText || '', model: modelText || '' });
    }
  }

  return turns;
}

function getChatId() {
  return location.pathname.split('/').pop() || 'unknown';
}

// --- Markdown generation (Zettelkasten format) ---

function generateMarkdown(turns) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const id = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${dateStr}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const conversationTitle = document.querySelector('[data-test-id="conversation-title"]')?.innerText?.trim();
  const firstUserLines = (turns[0]?.user || '').split('\n').map(l => l.trim()).filter(Boolean);
  const fallbackTitle = firstUserLines.find(l => !/^https?:\/\//i.test(l)) || firstUserLines[0] || 'Gemini chat';
  const title = (conversationTitle || fallbackTitle).slice(0, 60);

  const chatId = getChatId();
  const frontmatter = [
    '---',
    `id: ${chatId}`,
    `title: "Gemini: ${title}"`,
    `date: ${timeStr}`,
    `source: ${location.href}`,
    'tags: [gemini, fleeting]',
    '---',
  ].join('\n');

  const sections = [frontmatter];

  for (const turn of turns) {
    sections.push('');
    sections.push(`**Q:** ${turn.user}`);
    sections.push('');
    sections.push(`**A:** ${turn.model}`);
    sections.push('');
    sections.push('---');
  }

  return { markdown: sections.join('\n'), id, title };
}

// --- File save ---

async function saveNote(forcePickDir = false) {
  const turns = extractChatContent();
  if (turns.length === 0) {
    showExportNotification('保存できる会話が見つかりません', 'error');
    return;
  }

  let dirHandle;
  try {
    if (forcePickDir) {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await storeDirHandle(handle);
      exportDirHandle = handle;
      dirHandle = handle;
      showExportNotification(`保存先を変更: ${handle.name}`);
    } else {
      dirHandle = await getExportDirHandle();
    }
  } catch {
    // User cancelled picker or permission denied
    return;
  }

  const { markdown, title } = generateMarkdown(turns);
  const chatId = getChatId();
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40);
  const filename = `gemini-${safeTitle}-${chatId}.md`;

  try {
    const inboxHandle = await dirHandle.getDirectoryHandle('inbox', { create: true });
    const fileHandle = await inboxHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdown);
    await writable.close();
    showExportNotification(`保存しました: inbox/${filename}`);
  } catch {
    showExportNotification('保存に失敗しました', 'error');
  }
}

// --- UI ---

function showExportNotification(message, type = 'success') {
  const existing = document.getElementById('gemini-export-notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'gemini-export-notification';
  el.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${type === 'error' ? '#c62828' : '#1b5e20'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function createExportButton() {
  if (document.getElementById(EXPORT_BUTTON_ID)) return;

  // Find the input area toolbar to place the button near it
  const inputArea = document.querySelector('input-area-v2') || document.querySelector('input-container');
  if (!inputArea) return;

  const btn = document.createElement('button');
  btn.id = EXPORT_BUTTON_ID;
  btn.title = 'Save as Zettelkasten note';
  btn.textContent = '💾 Save note';
  btn.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 24px;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    transition: background 0.2s;
  `;

  btn.addEventListener('mouseenter', () => { btn.style.background = '#1557b0'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#1a73e8'; });
  btn.addEventListener('click', (e) => saveNote(e.shiftKey));
  btn.title = 'Save as Zettelkasten note\nShift+クリックで保存先を変更';

  document.body.appendChild(btn);
}

function initializeExport() {
  // Only show button when viewing a conversation (URL has chat ID)
  const chatId = getChatId();
  if (!chatId || chatId === 'app') return;

  createExportButton();
}
