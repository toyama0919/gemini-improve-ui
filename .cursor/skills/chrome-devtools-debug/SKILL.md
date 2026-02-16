---
name: chrome-devtools-debug
description: Debug Chrome extensions using chrome-devtools-mcp. Use when testing extensions, inspecting UI state, debugging Chrome interactions, or when user requests browser debugging.
---

# Chrome DevTools Debug

Debugging workflow for Chrome extension development using MCP (Model Context Protocol). Supports headless mode for background debugging.

## Quick Start

**1. Start Debug Chrome (Headless Recommended)**

```bash
./dev.sh start --headless        # Headless mode (recommended)
./dev.sh start                   # Normal mode with GUI
./dev.sh start --fg --headless   # Headless + foreground (stop with Ctrl+C)
./dev.sh stop                    # Stop (normal Chrome unaffected)
./dev.sh restart --headless      # Restart in headless mode
```

**2. Verify Connection**

```bash
curl http://localhost:9222/json/list
```

**3. Use MCP Tools**

- `list_pages()` - List open tabs
- `take_snapshot()` - Get DOM structure
- `evaluate_script()` - Execute JavaScript
- `click()`, `fill()` - UI interactions
- `list_network_requests()` - Network logs

## MCP Configuration

Configured in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browserUrl=http://127.0.0.1:9222"
      ]
    }
  }
}
```

## Debugging Workflow

### Best Practices

**Prefer text-based debugging over screenshots:**
- Use `take_snapshot()` to get DOM structure as text
- Use `evaluate_script()` to check element existence, counts, and properties
- Only use `take_screenshot()` when visual verification is absolutely necessary

**Example: Check if buttons are added**
```javascript
// Good: Text-based verification
evaluate_script(() => {
  const buttons = document.querySelectorAll('.deep-dive-button-inline');
  return {
    count: buttons.length,
    firstButtonHTML: buttons[0]?.outerHTML.substring(0, 200),
    positions: Array.from(buttons).map(b => ({
      parent: b.parentElement.tagName,
      position: b.style.position
    }))
  };
});

// Avoid: Taking screenshots for every check
// take_screenshot() - only when visual layout verification is needed
```

### Testing Extensions

**Extension is automatically loaded on Chrome startup!**

The extension from current directory is auto-loaded using `--load-extension` flag.

1. **Start Debug Chrome**
   
   ```bash
   ./dev.sh start --headless
   # Extension is automatically loaded from $(pwd)
   ```

2. **Reload Extension After Code Changes**
   
   **Recommended: Restart Chrome**
   ```bash
   ./dev.sh restart --headless
   # Clean reload - extension is automatically reloaded
   ```
   
   **Alternative: Using chrome.runtime.reload()**
   
   Add to `src/background.js`:
   ```javascript
   chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
     if (request.action === 'reload') {
       chrome.runtime.reload();
       sendResponse({ reloaded: true });
       return true;
     }
   });
   ```
   
   Then trigger from content script:
   ```javascript
   evaluate_script(() => {
     chrome.runtime.sendMessage({ action: 'reload' });
     return { reloadTriggered: true };
   })
   ```

3. **Verify Functionality**
   ```javascript
   // Navigate to test page
   navigate_page({ type: "url", url: "https://gemini.google.com/app/6cbdc99490e24d7e" })
   
   // Wait for page load
   wait_for({ text: "Gemini" })
   
   // Take snapshot to verify extension features are present
   take_snapshot()
   
   // Test extension functionality
   evaluate_script(() => {
     return {
       keyboardHandlerExists: typeof window.handleGeminiKeyboard !== 'undefined',
       deepDiveButtonCount: document.querySelectorAll('.deep-dive-button-inline').length,
       chatMaxWidth: getComputedStyle(document.documentElement).getPropertyValue('--chat-max-width')
     };
   })
   ```

4. **Development Workflow**
   ```bash
   # Edit code
   vim src/chat.js
   
   # Reload extension (restart Chrome)
   ./dev.sh restart --headless
   
   # Extension is automatically reloaded
   # Test changes via MCP tools
   ```

### Inspecting DOM Structure

Find UI elements targeted by your extension:

```javascript
// Use take_snapshot() to get current DOM structure
// Identify elements by selector priority:
// 1. data-test-id (most stable)
// 2. ARIA attributes (aria-label, role)
// 3. Semantic attributes
// 4. Class names (last resort)
```

### Network Monitoring

Check API requests and responses:

```javascript
// list_network_requests() for request list
// get_network_request(reqid) for details
```

## Debug Commands

```bash
# Recommended: Start in headless mode
./dev.sh start --headless

# Normal mode (with GUI)
./dev.sh start

# Headless + foreground (stop with Ctrl+C)
./dev.sh start --fg --headless

# Start with test chat open
./dev.sh start --headless --test

# Stop (port 9222 only, normal Chrome unaffected)
./dev.sh stop

# Restart
./dev.sh restart --headless

# Check status
./dev.sh status
```

**Headless Mode Benefits:**
- Lower resource consumption
- Runs in background without UI interference
- Ideal for CI/CD automated testing
- All MCP tools work normally

## Troubleshooting

**MCP connection fails**
- Check Node.js 20.19.0+
- Verify debug Chrome is running: `curl http://localhost:9222/json/list`
- Restart Chrome/Cursor

**Extension shortcuts don't work**
- Reload extension in `chrome://extensions/`
- Hard reload page (Cmd+Shift+R)

**Styles not applied**
- Check CSS variables like `--chat-max-width` in DevTools
- Hard reload page

## Notes

- Debug Chrome uses separate user data directory (`.chrome-devtools-mcp`)
- Normal Chrome usage is unaffected
- Listens for remote debugging connections on port 9222
- Test chat URL: `https://gemini.google.com/app/6cbdc99490e24d7e` (fixed to avoid creating new chats each time)
