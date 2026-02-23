// Deep dive functionality for Gemini responses

// Default modes (fallback when not in storage)
const DEFAULT_DEEP_DIVE_MODES = [
  { id: 'default', prompt: 'これについて詳しく' }
];

// Add deep dive buttons to response sections
function addDeepDiveButtons() {
  // Target elements for deep dive buttons
  const responseContainers = document.querySelectorAll('.markdown-main-panel');
  
  if (responseContainers.length === 0) return;

  // Process each response container
  responseContainers.forEach(responseContainer => {
    const targets = [];
    
    // 1. Check if there are any headings in this response
    const headings = responseContainer.querySelectorAll('h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]');
    const hasHeadings = headings.length > 0;
    
    if (hasHeadings) {
      // If headings exist, only process sections and tables
      // (blockquotes and lists are covered by section buttons)
      
      // Process sections (heading + following content until next heading)
      headings.forEach(heading => {
        // Skip if already has deep dive button
        if (heading.querySelector('.deep-dive-button-inline')) return;
        
        targets.push({
          type: 'section',
          element: heading,
          getContent: () => getSectionContent(heading)
        });
      });

      // Process tables
      const tables = responseContainer.querySelectorAll('table[data-path-to-node]');
      tables.forEach(table => {
        const wrapper = table.closest('.table-block-component');
        if (wrapper && !wrapper.querySelector('.deep-dive-button-inline')) {
          targets.push({
            type: 'table',
            element: wrapper,
            getContent: () => getTableContent(table)
          });
        }
      });
    } else {
      // If no headings, process tables, blockquotes, and lists individually
      
      // Process tables
      const tables = responseContainer.querySelectorAll('table[data-path-to-node]');
      tables.forEach(table => {
        const wrapper = table.closest('.table-block-component');
        if (wrapper && !wrapper.querySelector('.deep-dive-button-inline')) {
          targets.push({
            type: 'table',
            element: wrapper,
            getContent: () => getTableContent(table)
          });
        }
      });

      // Process blockquotes
      const blockquotes = responseContainer.querySelectorAll('blockquote[data-path-to-node]');
      blockquotes.forEach(blockquote => {
        if (!blockquote.querySelector('.deep-dive-button-inline')) {
          targets.push({
            type: 'blockquote',
            element: blockquote,
            getContent: () => blockquote.textContent.trim()
          });
        }
      });

      // Process lists (only top-level lists, not nested ones)
      const lists = responseContainer.querySelectorAll('ol[data-path-to-node], ul[data-path-to-node]');
      lists.forEach(list => {
        // Skip if already has deep dive button
        if (list.querySelector('.deep-dive-button-inline')) {
          return;
        }
        
        // Check if this list is nested inside another list
        let parent = list.parentElement;
        let isNested = false;
        
        while (parent && parent !== responseContainer) {
          if ((parent.tagName === 'OL' || parent.tagName === 'UL') && parent.hasAttribute('data-path-to-node')) {
            isNested = true;
            break;
          }
          parent = parent.parentElement;
        }
        
        // Skip nested lists
        if (isNested) {
          return;
        }
        
        targets.push({
          type: 'list',
          element: list,
          getContent: () => getListContent(list)
        });
      });
    }

    // Add deep dive button to each target
    targets.forEach(target => {
      addDeepDiveButton(target);
    });
  });
}

// Get section content (heading + following elements until next heading)
function getSectionContent(heading) {
  let content = heading.textContent.trim() + '\n\n';
  let current = heading.nextElementSibling;
  
  while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
    // Skip if it's a table wrapper (we handle tables separately)
    if (current.classList.contains('table-block-component')) {
      current = current.nextElementSibling;
      continue;
    }
    
    content += current.textContent.trim() + '\n\n';
    current = current.nextElementSibling;
  }
  
  return content.trim();
}

// Get table content as markdown
function getTableContent(table) {
  let content = '';
  const rows = table.querySelectorAll('tr');
  
  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('td, th');
    const cellTexts = Array.from(cells).map(cell => cell.textContent.trim());
    content += '| ' + cellTexts.join(' | ') + ' |\n';
    
    // Add separator after header row
    if (rowIndex === 0) {
      content += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
    }
  });
  
  return content.trim();
}

// Get list content
function getListContent(list) {
  return list.textContent.trim();
}

// Add deep dive button to an element
function addDeepDiveButton(target) {
  const button = document.createElement('button');
  button.className = 'deep-dive-button-inline';
  button.setAttribute('aria-label', 'Deep dive into this content');
  button.setAttribute('data-action', 'deep-dive');
  button.title = 'Deep dive into this content';
  
  // Store reference to target for keyboard access
  button._deepDiveTarget = target;
  
  // Create SVG element using DOM API (avoid innerHTML for TrustedHTML)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z');
  svg.appendChild(path);
  
  button.appendChild(svg);
  
  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if Ctrl key is pressed
    const isCtrlPressed = e.ctrlKey;
    insertDeepDiveQuery(target, isCtrlPressed);
  });

  // Create expand button for sections and lists
  let expandButton = null;
  if (target.type === 'section' || target.type === 'list') {
    expandButton = createExpandButton(target);
    // Store reference to expand button on the deep dive button
    button._expandButton = expandButton;
  }

  // Position button based on element type
  if (target.type === 'section') {
    // Add button inline with heading
    target.element.style.position = 'relative';
    target.element.style.display = 'flex';
    target.element.style.alignItems = 'center';
    target.element.style.gap = '8px';
    target.element.appendChild(button);
    if (expandButton) {
      target.element.appendChild(expandButton);
    }
  } else if (target.type === 'table') {
    // Add button to table footer (next to copy button)
    const footer = target.element.querySelector('.table-footer');
    if (footer) {
      const copyButton = footer.querySelector('.copy-button');
      if (copyButton) {
        footer.insertBefore(button, copyButton);
      } else {
        footer.appendChild(button);
      }
    }
  } else if (target.type === 'blockquote') {
    // Add button at the top right of blockquote
    target.element.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '8px';
    button.style.right = '8px';
    target.element.appendChild(button);
  } else if (target.type === 'list') {
    // Add button at the top right of list
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

// Create expand/collapse button for sections and lists
function createExpandButton(target) {
  const button = document.createElement('button');
  button.className = 'deep-dive-expand-button';
  button.setAttribute('aria-label', 'Expand to select');
  button.setAttribute('data-action', 'expand');
  button.setAttribute('tabindex', '-1'); // Not keyboard focusable
  button.title = 'Expand to select';
  button.textContent = '+';
  button.style.fontSize = '14px';
  button.style.fontWeight = 'bold';
  
  // Store reference to target for keyboard access
  button.dataset.targetId = Math.random().toString(36).substr(2, 9);
  target.expandButtonId = button.dataset.targetId;
  
  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    toggleExpand(target, button);
  });
  
  return button;
}

// Toggle expand/collapse state
function toggleExpand(target, button) {
  const isExpanded = button.getAttribute('data-action') === 'collapse';
  
  if (isExpanded) {
    // Collapse: remove child buttons
    collapseChildButtons(target);
    button.setAttribute('data-action', 'expand');
    button.setAttribute('aria-label', 'Expand to select');
    button.title = 'Expand to select';
    button.textContent = '+';
  } else {
    // Expand: add child buttons
    expandChildButtons(target);
    button.setAttribute('data-action', 'collapse');
    button.setAttribute('aria-label', 'Collapse');
    button.title = 'Collapse';
    button.textContent = '-';
  }
}

// Expand child buttons for a section or list
function expandChildButtons(target) {
  if (target.type === 'section') {
    // Get all paragraphs and lists in the section
    const heading = target.element;
    let current = heading.nextElementSibling;
    
    while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
      // Skip if it's a table wrapper
      if (current.classList.contains('table-block-component')) {
        current = current.nextElementSibling;
        continue;
      }
      
      // Add button to paragraphs
      if (current.tagName === 'P' && !current.querySelector('.deep-dive-child-button')) {
        addChildButton(current);
      }
      
      // For lists, add buttons to list items (not the list itself)
      if ((current.tagName === 'UL' || current.tagName === 'OL') && 
          current.hasAttribute('data-path-to-node')) {
        
        // Get direct children list items only
        const items = current.querySelectorAll(':scope > li');
        items.forEach(item => {
          if (!item.querySelector('.deep-dive-child-button')) {
            addChildButton(item);
          }
        });
      }
      
      current = current.nextElementSibling;
    }
  } else if (target.type === 'list') {
    // Get all list items
    const list = target.element;
    const items = list.querySelectorAll(':scope > li');
    
    items.forEach(item => {
      if (!item.querySelector('.deep-dive-child-button')) {
        addChildButton(item);
      }
    });
  }
}

// Add a child button to an element
function addChildButton(element) {
  element.style.position = 'relative';
  
  const button = document.createElement('button');
  button.className = 'deep-dive-button-inline deep-dive-child-button';
  button.setAttribute('aria-label', 'Deep dive into this content');
  button.setAttribute('data-action', 'deep-dive');
  button.title = 'Deep dive into this content';
  button.style.position = 'absolute';
  button.style.top = '0';
  button.style.right = '0';
  
  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z');
  svg.appendChild(path);
  
  button.appendChild(svg);
  
  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isCtrlPressed = e.ctrlKey;
    const childTarget = {
      type: 'child',
      element: element,
      getContent: () => element.textContent.trim()
    };
    insertDeepDiveQuery(childTarget, isCtrlPressed);
  });
  
  element.appendChild(button);
}

// Collapse (remove) child buttons
function collapseChildButtons(target) {
  if (target.type === 'section') {
    const heading = target.element;
    let current = heading.nextElementSibling;
    
    while (current && !current.matches('h1, h2, h3, h4, h5, h6, hr')) {
      if (current.classList.contains('table-block-component')) {
        current = current.nextElementSibling;
        continue;
      }
      
      // Remove all child buttons in this element and its descendants
      const childButtons = current.querySelectorAll('.deep-dive-child-button');
      childButtons.forEach(btn => btn.remove());
      
      current = current.nextElementSibling;
    }
  } else if (target.type === 'list') {
    const list = target.element;
    const childButtons = list.querySelectorAll('.deep-dive-child-button');
    childButtons.forEach(btn => btn.remove());
  }
}

// Insert deep dive query into textarea
async function insertDeepDiveQuery(target, quoteOnly = false) {
  const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');
  if (!textarea) return;

  // Get quoted content
  const content = target.getContent();
  const quotedContent = content.split('\n').map(line => `> ${line}`).join('\n');
  
  // Build query based on mode
  let query;
  let shouldAutoSend = false;

  if (quoteOnly) {
    // Ctrl+Enter: Only quote (user will add their own prompt)
    query = quotedContent + '\n\n';
  } else {
    // Normal Enter: Add prompt from selected mode
    const result = await new Promise((resolve) => {
      chrome.storage.sync.get(['deepDiveModes', 'currentDeepDiveModeId'], resolve);
    });
    const modes = (result.deepDiveModes && result.deepDiveModes.length > 0)
      ? result.deepDiveModes
      : DEFAULT_DEEP_DIVE_MODES;
    const urlParams = new URLSearchParams(location.search);
    const urlModeId = urlParams.get('mode_id');
    let modeId = urlModeId || result.currentDeepDiveModeId || modes[0]?.id;
    if (!modes.some(m => m.id === modeId)) modeId = modes[0]?.id;
    const mode = modes.find(m => m.id === modeId) || modes[0] || DEFAULT_DEEP_DIVE_MODES[0];
    query = quotedContent + '\n\n' + (mode.prompt || 'これについて詳しく');
    shouldAutoSend = true;
  }

  // Clear textarea
  while (textarea.firstChild) {
    textarea.removeChild(textarea.firstChild);
  }

  // Insert query (preserve line breaks)
  const lines = query.split('\n');
  lines.forEach((line, index) => {
    const p = document.createElement('p');
    if (line.trim() === '') {
      p.appendChild(document.createElement('br'));
    } else {
      p.textContent = line;
    }
    textarea.appendChild(p);
  });

  // Focus and move cursor to end
  textarea.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(textarea);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  // Dispatch input event
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  
  // Auto-send when prompt is set (not in quote-only mode and prompt is not empty)
  if (shouldAutoSend) {
    setTimeout(() => {
      const sendButton = document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');
      if (sendButton && !sendButton.disabled) {
        sendButton.click();
      }
    }, 100);
  }
}

// Add styles for deep dive buttons and menu
function addDeepDiveStyles() {
  const styleId = 'gemini-deep-dive-styles';
  
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Deep dive button */
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

    /* Expand/collapse button */
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

    /* Blockquote with deep dive button */
    blockquote[data-path-to-node] {
      padding-top: 40px;
    }

    /* Mode selector - inline with + and ツール */
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
  `;
  
  document.head.appendChild(style);
}

// Create and inject mode selector dropdown
function injectModeSelector() {
  // Remove existing to allow re-inject when modes change
  const existing = document.getElementById('gemini-deep-dive-mode-selector');
  if (existing) existing.remove();

  chrome.storage.sync.get(['deepDiveModes', 'currentDeepDiveModeId'], (r) => {
    const modes = (r.deepDiveModes && r.deepDiveModes.length > 0)
      ? r.deepDiveModes
      : DEFAULT_DEEP_DIVE_MODES;

    const wrapper = document.createElement('div');
    wrapper.id = 'gemini-deep-dive-mode-selector';
    wrapper.className = 'gemini-deep-dive-mode-selector';

    const select = document.createElement('select');
    select.id = 'gemini-deep-dive-mode';
    select.title = '深掘りモード';
    select.setAttribute('aria-label', '深掘りモード');

    modes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode.id;
      option.textContent = mode.id;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      chrome.storage.sync.set({ currentDeepDiveModeId: select.value });
    });

    wrapper.appendChild(select);

    // Add after + and ツール buttons
    const addButton = document.querySelector('button[aria-label*="ファイル"], button[aria-label*="追加"]');
    const toolsButton = document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"]');
    const insertAfter = toolsButton || (addButton && addButton.nextElementSibling);
    if (insertAfter) {
      insertAfter.parentElement.insertBefore(wrapper, insertAfter.nextSibling);
    } else {
      const inputArea = document.querySelector('div[contenteditable="true"][role="textbox"]');
      if (inputArea) {
        const parent = inputArea.closest('form') || inputArea.parentElement?.parentElement;
        if (parent) {
          parent.insertBefore(wrapper, parent.firstChild);
        } else {
          document.body.appendChild(wrapper);
        }
      } else {
        document.body.appendChild(wrapper);
      }
    }

    // URL param ?mode_id=xxx takes precedence
    const urlParams = new URLSearchParams(location.search);
    const urlModeId = urlParams.get('mode_id');
    let modeId = r.currentDeepDiveModeId;
    if (urlModeId && modes.some(m => m.id === urlModeId)) {
      modeId = urlModeId;
      chrome.storage.sync.set({ currentDeepDiveModeId: urlModeId });
    }
    if (modeId && modes.some(m => m.id === modeId)) {
      select.value = modeId;
    } else if (modes.length > 0) {
      select.value = modes[0].id;
    }
  });
}

// Initialize deep dive functionality
function initializeDeepDive() {
  // Add styles
  addDeepDiveStyles();

  // Inject mode selector (wait for input area buttons to appear)
  const tryInjectModeSelector = () => {
    const hasButtons = document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]');
    if (hasButtons || document.querySelector('div[contenteditable="true"][role="textbox"]')) {
      injectModeSelector();
    } else {
      setTimeout(tryInjectModeSelector, 500);
    }
  };
  tryInjectModeSelector();

  // Update dropdown only when modes list changes in options (not on mode switch - that would remove/recreate dropdown)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.deepDiveModes &&
        location.href.includes('gemini.google.com') &&
        document.querySelector('button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]')) {
      injectModeSelector();
    }
  });

  // Watch for new responses
  const observer = new MutationObserver((mutations) => {
    // Check if there are new response elements
    let shouldUpdate = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { // Element node
            if (node.matches && (
              node.matches('[data-path-to-node]') ||
              node.querySelector('[data-path-to-node]')
            )) {
              shouldUpdate = true;
              break;
            }
          }
        }
      }
      if (shouldUpdate) break;
    }
    
    if (shouldUpdate) {
      // Debounce: wait a bit for all elements to be added
      clearTimeout(initializeDeepDive.timer);
      initializeDeepDive.timer = setTimeout(() => {
        addDeepDiveButtons();
      }, 500);
    }
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Add buttons to existing content
  setTimeout(() => {
    addDeepDiveButtons();
  }, 1000);
}
