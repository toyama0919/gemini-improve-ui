// Deep dive functionality for Gemini responses

// Add deep dive buttons to response sections
function addDeepDiveButtons() {
  // Target elements for deep dive buttons
  const responseContainers = document.querySelectorAll('.markdown-main-panel');
  
  if (responseContainers.length === 0) return;

  // Process each response container
  responseContainers.forEach(responseContainer => {
    // Find all sections, tables, and blockquotes
    const targets = [];
    
    // 1. Sections (heading + following content until next heading)
    const headings = responseContainer.querySelectorAll('h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]');
    headings.forEach(heading => {
      // Skip if already has deep dive button
      if (heading.querySelector('.deep-dive-button-inline')) return;
      
      targets.push({
        type: 'section',
        element: heading,
        getContent: () => getSectionContent(heading)
      });
    });

    // 2. Tables
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

    // 3. Blockquotes
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

// Add deep dive button to an element
function addDeepDiveButton(target) {
  const button = document.createElement('button');
  button.className = 'deep-dive-button-inline';
  button.setAttribute('aria-label', 'この内容を深掘り');
  button.setAttribute('data-action', 'deep-dive');
  button.title = 'この内容を深掘り';
  
  // Create SVG element using DOM API (avoid innerHTML for TrustedHTML)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z');
  svg.appendChild(path);
  
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '1.5');
  svg.appendChild(circle);
  
  button.appendChild(svg);
  
  // Add click handler
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if Ctrl key is pressed
    const isCtrlPressed = e.ctrlKey;
    insertDeepDiveQuery(target, isCtrlPressed);
  });

  // Position button based on element type
  if (target.type === 'section') {
    // Add button inline with heading
    target.element.style.position = 'relative';
    target.element.style.display = 'flex';
    target.element.style.alignItems = 'center';
    target.element.style.gap = '8px';
    target.element.appendChild(button);
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
  }
}

// Insert deep dive query into textarea
function insertDeepDiveQuery(target, quoteOnly = false) {
  const textarea = document.querySelector('div[contenteditable="true"][role="textbox"]');
  if (!textarea) return;

  // Get quoted content
  const content = target.getContent();
  const quotedContent = content.split('\n').map(line => `> ${line}`).join('\n');
  
  // Build query based on mode
  let query;
  if (quoteOnly) {
    // Ctrl+Enter: Only quote (user will add their own prompt)
    query = quotedContent + '\n\n';
  } else {
    // Normal Enter: Add default prompt
    query = quotedContent + '\n\nこれについて詳しく';
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
  
  // If not quote-only mode, auto-send
  if (!quoteOnly) {
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

    /* Blockquote with deep dive button */
    blockquote[data-path-to-node] {
      padding-top: 40px;
    }
  `;
  
  document.head.appendChild(style);
}

// Initialize deep dive functionality
function initializeDeepDive() {
  // Add styles
  addDeepDiveStyles();

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
