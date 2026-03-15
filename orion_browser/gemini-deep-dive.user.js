// ==UserScript==
// @name         Gemini Deep Dive (iOS/Orion)
// @namespace    https://github.com/toyama0919/gemini-improve-ui
// @version      1.0.0
// @description  Deep dive buttons for Gemini responses — standalone userscript for Orion browser (iOS)
// @author       toyama0919
// @match        https://gemini.google.com/app*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Settings (GM_setValue / GM_getValue with localStorage fallback)
  // ---------------------------------------------------------------------------
  const storage = {
    get(key, defaultValue) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(key);
          return v === undefined ? defaultValue : JSON.parse(v);
        }
      } catch { /* fall through */ }
      try {
        const raw = localStorage.getItem('gdd_' + key);
        return raw === null ? defaultValue : JSON.parse(raw);
      } catch {
        return defaultValue;
      }
    },
    set(key, value) {
      const json = JSON.stringify(value);
      try {
        if (typeof GM_setValue === 'function') GM_setValue(key, json);
      } catch { /* ignore */ }
      try {
        localStorage.setItem('gdd_' + key, json);
      } catch { /* ignore */ }
    },
  };

  const DEFAULT_MODES = [{ id: 'default', prompt: 'これについて詳しく' }];
  const SESSION_ID = Math.random().toString(36).substr(2, 9);

  function getModes() {
    const modes = storage.get('deepDiveModes', []);
    return modes.length > 0 ? modes : DEFAULT_MODES;
  }

  function getCurrentModeId() {
    const params = new URLSearchParams(location.search);
    return params.get('mode_id') || storage.get('currentDeepDiveModeId', null);
  }

  // ---------------------------------------------------------------------------
  // Content extraction
  // ---------------------------------------------------------------------------
  function getSectionContent(heading) {
    let content = (heading.textContent?.trim() ?? '') + '\n\n';
    let cur = heading.nextElementSibling;
    while (cur && !cur.matches('h1,h2,h3,h4,h5,h6,hr')) {
      if (!cur.classList.contains('table-block-component')) {
        content += (cur.textContent?.trim() ?? '') + '\n\n';
      }
      cur = cur.nextElementSibling;
    }
    return content.trim();
  }

  function getTableContent(table) {
    let content = '';
    table.querySelectorAll('tr').forEach((row, i) => {
      const cells = Array.from(row.querySelectorAll('td,th')).map(
        (c) => c.textContent?.trim() ?? ''
      );
      content += '| ' + cells.join(' | ') + ' |\n';
      if (i === 0) content += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
    });
    return content.trim();
  }

  function getListContent(list) {
    return list.textContent?.trim() ?? '';
  }

  // ---------------------------------------------------------------------------
  // Orphan paragraph groups (paragraphs not belonging to any heading)
  // ---------------------------------------------------------------------------
  function getOrphanParagraphGroups(container, headings) {
    const headingSet = new Set(Array.from(headings));
    const children = Array.from(container.children);
    const groups = [];
    let current = [];
    let prevBreakerWasHeading = false;

    const flush = (afterHeading) => {
      if (current.length > 0 && !afterHeading) {
        groups.push({ anchor: current[0], elements: [...current] });
      }
      current = [];
    };

    for (const child of children) {
      const tag = child.tagName;
      const isHeading =
        headingSet.has(child) || /^H[1-6]$/.test(tag);
      if (isHeading) {
        flush(prevBreakerWasHeading);
        prevBreakerWasHeading = true;
      } else if (tag === 'HR') {
        flush(prevBreakerWasHeading);
        prevBreakerWasHeading = false;
      } else if (tag === 'P') {
        current.push(child);
      } else {
        flush(prevBreakerWasHeading);
        prevBreakerWasHeading = false;
      }
    }
    flush(prevBreakerWasHeading);
    return groups;
  }

  // ---------------------------------------------------------------------------
  // Textarea writer
  // ---------------------------------------------------------------------------
  function writeToTextarea(query, autoSend) {
    const textarea = document.querySelector(
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
        const btn = document.querySelector(
          'button[aria-label*="送信"], button[aria-label*="Send"]'
        );
        if (btn && !btn.disabled) btn.click();
      }, 100);
    }
  }

  // ---------------------------------------------------------------------------
  // Query insertion
  // ---------------------------------------------------------------------------
  function doInsertQuery(target, mode) {
    const content = target.getContent();
    const quoted = content.split('\n').map((l) => '> ' + l).join('\n');
    writeToTextarea(quoted + '\n\n' + (mode.prompt || 'これについて詳しく'), true);

    const recent = storage.get('deepDiveRecentModes', []).filter((id) => id !== mode.id);
    recent.unshift(mode.id);
    storage.set('deepDiveRecentModes', recent.slice(0, 20));
  }

  function insertDeepDiveQuery(target, quoteOnly) {
    if (!document.querySelector('div[contenteditable="true"][role="textbox"]')) return;

    const content = target.getContent();
    const quoted = content.split('\n').map((l) => '> ' + l).join('\n');

    if (quoteOnly) {
      writeToTextarea(quoted + '\n\n', false);
      return;
    }

    const modes = getModes();
    let modeId = getCurrentModeId() || modes[0]?.id;
    if (!modes.some((m) => m.id === modeId)) modeId = modes[0]?.id;
    const mode = modes.find((m) => m.id === modeId) || modes[0] || DEFAULT_MODES[0];
    writeToTextarea(quoted + '\n\n' + (mode.prompt || 'これについて詳しく'), true);
  }

  // ---------------------------------------------------------------------------
  // Template popup
  // ---------------------------------------------------------------------------
  function hideTemplatePopup() {
    document.getElementById('deep-dive-template-popup')?.remove();
  }

  function showTemplatePopup(button, target) {
    hideTemplatePopup();

    const modes = getModes();
    const recentIds = storage.get('deepDiveRecentModes', []);
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

    sorted.forEach((mode) => {
      const item = document.createElement('button');
      item.className = 'deep-dive-template-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = mode.id;
      if (mode.prompt) item.title = mode.prompt;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTemplatePopup();
        doInsertQuery(target, mode);
      });
      popup.appendChild(item);
    });

    document.body.appendChild(popup);

    const rect = button.getBoundingClientRect();
    const popupW = 200;
    let left = rect.left + window.scrollX;
    if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
    popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popup.style.left = `${left}px`;

    setTimeout(() => {
      document.addEventListener('click', hideTemplatePopup, { once: true });
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Touch: long-press detection (500ms → quote only / show popup)
  // ---------------------------------------------------------------------------
  function addTouchHandlers(button, target) {
    let pressTimer = null;
    let didLongPress = false;

    button.addEventListener('touchstart', (e) => {
      didLongPress = false;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        showTemplatePopup(button, target);
      }, 500);
    }, { passive: true });

    button.addEventListener('touchend', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    });

    button.addEventListener('touchmove', () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }, { passive: true });

    button.addEventListener('click', (e) => {
      if (didLongPress) { e.preventDefault(); e.stopPropagation(); return; }
      e.preventDefault();
      e.stopPropagation();
      insertDeepDiveQuery(target, false);
    });
  }

  // ---------------------------------------------------------------------------
  // Button creation
  // ---------------------------------------------------------------------------
  function createSvgIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z');
    svg.appendChild(path);
    return svg;
  }

  function createExpandButton(target) {
    const button = document.createElement('button');
    button.className = 'deep-dive-expand-button';
    button.setAttribute('aria-label', 'Expand to select');
    button.title = 'Expand to select';
    button.textContent = '+';
    button.dataset.targetId = Math.random().toString(36).substr(2, 9);
    target.expandButtonId = button.dataset.targetId;

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleExpand(target, button);
    });
    return button;
  }

  function toggleExpand(target, button) {
    const expanded = button.getAttribute('data-action') === 'collapse';
    if (expanded) {
      collapseChildButtons(target);
      button.setAttribute('data-action', 'expand');
      button.title = 'Expand to select';
      button.textContent = '+';
    } else {
      expandChildButtons(target);
      button.setAttribute('data-action', 'collapse');
      button.title = 'Collapse';
      button.textContent = '-';
    }
  }

  function expandChildButtons(target) {
    if (target.type === 'section') {
      let cur = target.element.nextElementSibling;
      while (cur && !cur.matches('h1,h2,h3,h4,h5,h6,hr')) {
        if (!cur.classList.contains('table-block-component')) {
          if (cur.tagName === 'P' && !cur.querySelector('.deep-dive-child-button')) {
            addChildButton(cur);
          }
          if ((cur.tagName === 'UL' || cur.tagName === 'OL') && cur.hasAttribute('data-path-to-node')) {
            cur.querySelectorAll(':scope > li').forEach((item) => {
              if (!item.querySelector('.deep-dive-child-button')) addChildButton(item);
            });
          }
        }
        cur = cur.nextElementSibling;
      }
    } else if (target.type === 'list') {
      target.element.querySelectorAll(':scope > li').forEach((item) => {
        if (!item.querySelector('.deep-dive-child-button')) addChildButton(item);
      });
    }
  }

  function addChildButton(element) {
    element.style.position = 'relative';
    const button = document.createElement('button');
    button.className = 'deep-dive-button-inline deep-dive-child-button';
    button.setAttribute('aria-label', 'Deep dive into this content');
    button.title = 'Deep dive into this content';
    button.style.position = 'absolute';
    button.style.top = '0';
    button.style.right = '0';
    button.appendChild(createSvgIcon());

    const childTarget = {
      type: 'child',
      element,
      getContent: () => element.textContent?.trim() ?? '',
    };
    addTouchHandlers(button, childTarget);
    element.appendChild(button);
  }

  function collapseChildButtons(target) {
    if (target.type === 'section') {
      let cur = target.element.nextElementSibling;
      while (cur && !cur.matches('h1,h2,h3,h4,h5,h6,hr')) {
        if (!cur.classList.contains('table-block-component')) {
          cur.querySelectorAll('.deep-dive-child-button').forEach((b) => b.remove());
        }
        cur = cur.nextElementSibling;
      }
    } else if (target.type === 'list') {
      target.element.querySelectorAll('.deep-dive-child-button').forEach((b) => b.remove());
    }
  }

  // ---------------------------------------------------------------------------
  // Main button injection
  // ---------------------------------------------------------------------------
  function addDeepDiveButton(target) {
    const button = document.createElement('button');
    button.className = 'deep-dive-button-inline';
    button.setAttribute('aria-label', 'Deep dive into this content');
    button.setAttribute('data-initialized', SESSION_ID);
    button.title = 'Deep dive into this content';
    button.appendChild(createSvgIcon());
    addTouchHandlers(button, target);

    let expandButton = null;
    if (target.type === 'section' || target.type === 'list') {
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
      const footer = target.element.querySelector('.table-footer');
      if (footer) {
        const copyBtn = footer.querySelector('.copy-button');
        if (copyBtn) footer.insertBefore(button, copyBtn);
        else footer.appendChild(button);
      }
    } else if (target.type === 'blockquote') {
      target.element.style.position = 'relative';
      button.style.cssText = 'position:absolute;top:8px;right:8px;';
      target.element.appendChild(button);
    } else if (target.type === 'orphan') {
      target.element.style.position = 'relative';
      button.style.cssText = 'position:absolute;top:0;right:0;';
      target.element.appendChild(button);
    } else if (target.type === 'list') {
      target.element.style.position = 'relative';
      button.style.cssText = 'position:absolute;top:0;right:0;';
      target.element.appendChild(button);
      if (expandButton) {
        expandButton.style.cssText = 'position:absolute;top:0;right:36px;';
        target.element.appendChild(expandButton);
      }
    }
  }

  function addDeepDiveButtons() {
    const containers = document.querySelectorAll('.markdown-main-panel');
    if (!containers.length) return;

    containers.forEach((container) => {
      const targets = [];

      const headings = container.querySelectorAll(
        'h1[data-path-to-node],h2[data-path-to-node],h3[data-path-to-node],h4[data-path-to-node],h5[data-path-to-node],h6[data-path-to-node]'
      );
      const hasHeadings = headings.length > 0;

      if (hasHeadings) {
        headings.forEach((heading) => {
          const existing = heading.querySelector('.deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            heading.querySelectorAll('.deep-dive-button-inline,.deep-dive-expand-button').forEach((b) => b.remove());
          }
          targets.push({ type: 'section', element: heading, getContent: () => getSectionContent(heading) });
        });

        container.querySelectorAll('table[data-path-to-node]').forEach((table) => {
          const wrapper = table.closest('.table-block-component');
          if (!wrapper) return;
          const existing = wrapper.querySelector('.deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            existing.remove();
          }
          targets.push({ type: 'table', element: wrapper, getContent: () => getTableContent(table) });
        });

        getOrphanParagraphGroups(container, headings).forEach((group) => {
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
        container.querySelectorAll('table[data-path-to-node]').forEach((table) => {
          const wrapper = table.closest('.table-block-component');
          if (!wrapper) return;
          const existing = wrapper.querySelector('.deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            existing.remove();
          }
          targets.push({ type: 'table', element: wrapper, getContent: () => getTableContent(table) });
        });

        container.querySelectorAll('blockquote[data-path-to-node]').forEach((bq) => {
          const existing = bq.querySelector('.deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            existing.remove();
          }
          targets.push({ type: 'blockquote', element: bq, getContent: () => bq.textContent?.trim() ?? '' });
        });

        container.querySelectorAll('ol[data-path-to-node],ul[data-path-to-node]').forEach((list) => {
          const existing = list.querySelector(':scope > .deep-dive-button-inline');
          if (existing) {
            if (existing.getAttribute('data-initialized') === SESSION_ID) return;
            list.querySelectorAll('.deep-dive-button-inline,.deep-dive-expand-button').forEach((b) => b.remove());
          }
          let parent = list.parentElement;
          let nested = false;
          while (parent && parent !== container) {
            if ((parent.tagName === 'OL' || parent.tagName === 'UL') && parent.hasAttribute('data-path-to-node')) {
              nested = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (nested) return;
          targets.push({ type: 'list', element: list, getContent: () => getListContent(list) });
        });
      }

      targets.forEach((t) => addDeepDiveButton(t));
    });
  }

  // ---------------------------------------------------------------------------
  // Mode selector (floating button for mobile)
  // ---------------------------------------------------------------------------
  function injectModeSelector() {
    const existing = document.getElementById('gdd-mode-fab');
    if (existing) existing.remove();

    const modes = getModes();

    const fab = document.createElement('div');
    fab.id = 'gdd-mode-fab';

    if (modes.length > 1) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', '深掘りモード');
      modes.forEach((mode) => {
        const opt = document.createElement('option');
        opt.value = mode.id;
        opt.textContent = mode.id;
        select.appendChild(opt);
      });

      const modeId = getCurrentModeId();
      if (modeId && modes.some((m) => m.id === modeId)) {
        select.value = modeId;
      }

      select.addEventListener('change', () => {
        storage.set('currentDeepDiveModeId', select.value);
      });

      fab.appendChild(select);
    }

    const gearBtn = document.createElement('button');
    gearBtn.id = 'gdd-settings-btn';
    gearBtn.setAttribute('aria-label', '設定');
    gearBtn.innerHTML = '&#9881;';
    gearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSettingsPanel();
    });
    fab.appendChild(gearBtn);

    document.body.appendChild(fab);
  }

  // ---------------------------------------------------------------------------
  // Settings panel (in-page, replaces options.html)
  // ---------------------------------------------------------------------------
  function toggleSettingsPanel() {
    const existing = document.getElementById('gdd-settings-panel');
    if (existing) { existing.remove(); return; }
    showSettingsPanel();
  }

  function showSettingsPanel() {
    const modes = getModes();

    const overlay = document.createElement('div');
    overlay.id = 'gdd-settings-panel';

    const panel = document.createElement('div');
    panel.className = 'gdd-panel-inner';

    const title = document.createElement('h2');
    title.textContent = 'Deep Dive Settings';
    panel.appendChild(title);

    const listEl = document.createElement('div');
    listEl.id = 'gdd-mode-list';
    panel.appendChild(listEl);

    function renderModes(modeData) {
      listEl.innerHTML = '';
      modeData.forEach((mode, i) => {
        const row = document.createElement('div');
        row.className = 'gdd-mode-row';

        const idInput = document.createElement('input');
        idInput.type = 'text';
        idInput.value = mode.id;
        idInput.placeholder = 'ID';
        idInput.className = 'gdd-input gdd-input-id';
        idInput.addEventListener('input', () => { modeData[i].id = idInput.value; });

        const promptInput = document.createElement('input');
        promptInput.type = 'text';
        promptInput.value = mode.prompt || '';
        promptInput.placeholder = 'プロンプト';
        promptInput.className = 'gdd-input gdd-input-prompt';
        promptInput.addEventListener('input', () => { modeData[i].prompt = promptInput.value; });

        const delBtn = document.createElement('button');
        delBtn.className = 'gdd-btn gdd-btn-del';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => {
          if (modeData.length <= 1) return;
          modeData.splice(i, 1);
          renderModes(modeData);
        });

        row.appendChild(idInput);
        row.appendChild(promptInput);
        row.appendChild(delBtn);
        listEl.appendChild(row);
      });
    }

    renderModes(modes);

    const addBtn = document.createElement('button');
    addBtn.className = 'gdd-btn gdd-btn-add';
    addBtn.textContent = '+ モード追加';
    addBtn.addEventListener('click', () => {
      modes.push({ id: 'mode-' + Date.now(), prompt: '' });
      renderModes(modes);
    });
    panel.appendChild(addBtn);

    const actions = document.createElement('div');
    actions.className = 'gdd-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'gdd-btn gdd-btn-save';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', () => {
      const cleaned = modes.filter((m) => m.id.trim());
      storage.set('deepDiveModes', cleaned.length > 0 ? cleaned : DEFAULT_MODES);
      overlay.remove();
      injectModeSelector();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gdd-btn gdd-btn-cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const resetBtn = document.createElement('button');
    resetBtn.className = 'gdd-btn gdd-btn-reset';
    resetBtn.textContent = 'リセット';
    resetBtn.addEventListener('click', () => {
      storage.set('deepDiveModes', DEFAULT_MODES);
      storage.set('currentDeepDiveModeId', DEFAULT_MODES[0].id);
      overlay.remove();
      injectModeSelector();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(resetBtn);
    panel.appendChild(actions);

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  function addStyles() {
    if (document.getElementById('gdd-styles')) return;
    const style = document.createElement('style');
    style.id = 'gdd-styles';
    style.textContent = `
      .deep-dive-button-inline {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        min-width: 36px;
        min-height: 36px;
        padding: 0;
        border: none;
        border-radius: 18px;
        background: transparent;
        color: #5f6368;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .deep-dive-button-inline:hover,
      .deep-dive-button-inline:active {
        background: rgba(0, 0, 0, 0.08);
        color: #1a73e8;
      }
      .deep-dive-button-inline svg {
        width: 18px;
        height: 18px;
        pointer-events: none;
      }
      .deep-dive-expand-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        min-width: 36px;
        min-height: 36px;
        padding: 0;
        border: none;
        border-radius: 18px;
        background: transparent;
        color: #5f6368;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        font-size: 16px;
        font-weight: bold;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .deep-dive-expand-button:hover,
      .deep-dive-expand-button:active {
        background: rgba(0, 0, 0, 0.08);
        color: #1a73e8;
      }
      blockquote[data-path-to-node] {
        padding-top: 40px;
      }
      .deep-dive-template-popup {
        position: absolute;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        min-width: 200px;
        padding: 4px 0;
        background: #fff;
        border: 1px solid #dadce0;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      }
      .deep-dive-template-item {
        display: block;
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: transparent;
        text-align: left;
        font-size: 15px;
        color: #3c4043;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        -webkit-tap-highlight-color: transparent;
      }
      .deep-dive-template-item:active {
        background: #f1f3f4;
        color: #1a73e8;
      }
      #gdd-mode-fab {
        position: fixed;
        bottom: 90px;
        right: 12px;
        z-index: 99998;
        display: flex;
        gap: 6px;
        align-items: center;
      }
      #gdd-mode-fab select {
        padding: 6px 10px;
        border: 1px solid #dadce0;
        border-radius: 10px;
        background: #fff;
        font-size: 14px;
        color: #5f6368;
        -webkit-appearance: none;
        appearance: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      }
      #gdd-settings-btn {
        width: 36px;
        height: 36px;
        border: 1px solid #dadce0;
        border-radius: 50%;
        background: #fff;
        font-size: 18px;
        line-height: 1;
        color: #5f6368;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      #gdd-settings-btn:active { background: #f1f3f4; }

      #gdd-settings-panel {
        position: fixed;
        inset: 0;
        z-index: 100000;
        background: rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .gdd-panel-inner {
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        padding: 24px;
        width: 100%;
        max-width: 480px;
        max-height: 80vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .gdd-panel-inner h2 {
        font-size: 18px;
        margin: 0 0 16px;
        color: #1a73e8;
      }
      .gdd-mode-row {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
        align-items: center;
      }
      .gdd-input {
        padding: 8px 10px;
        border: 1px solid #dadce0;
        border-radius: 8px;
        font-size: 14px;
        background: #fafafa;
        color: #333;
        outline: none;
      }
      .gdd-input:focus { border-color: #1a73e8; background: #fff; }
      .gdd-input-id { width: 80px; flex-shrink: 0; }
      .gdd-input-prompt { flex: 1; min-width: 0; }
      .gdd-btn {
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .gdd-btn-del {
        width: 36px;
        height: 36px;
        min-width: 36px;
        padding: 0;
        background: #fee;
        color: #d93025;
        border-radius: 50%;
        font-size: 16px;
        flex-shrink: 0;
      }
      .gdd-btn-del:active { background: #fdd; }
      .gdd-btn-add {
        width: 100%;
        background: #f1f3f4;
        color: #1a73e8;
        margin: 8px 0 16px;
        font-weight: 500;
      }
      .gdd-btn-add:active { background: #e8eaed; }
      .gdd-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .gdd-btn-save {
        background: #1a73e8;
        color: #fff;
        font-weight: 500;
        flex: 1;
      }
      .gdd-btn-save:active { background: #1557b0; }
      .gdd-btn-cancel {
        background: #f1f3f4;
        color: #333;
        flex: 1;
      }
      .gdd-btn-cancel:active { background: #e8eaed; }
      .gdd-btn-reset {
        background: transparent;
        color: #d93025;
        font-size: 13px;
        padding: 8px;
      }
      .gdd-btn-reset:active { background: #fee; }
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Initialize
  // ---------------------------------------------------------------------------
  let debounceTimer = null;

  function init() {
    addStyles();

    const tryInject = () => {
      if (document.querySelector('div[contenteditable="true"][role="textbox"]')) {
        injectModeSelector();
      } else {
        setTimeout(tryInject, 500);
      }
    };
    tryInject();

    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const el = node;
            if (el.matches?.('[data-path-to-node]') || el.querySelector?.('[data-path-to-node]')) {
              shouldUpdate = true;
              break;
            }
          }
        }
        if (shouldUpdate) break;
      }
      if (shouldUpdate) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => addDeepDiveButtons(), 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => addDeepDiveButtons(), 1000);
  }

  init();
})();
