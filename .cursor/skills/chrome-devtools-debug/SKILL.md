---
name: chrome-devtools-debug
description: Debug Chrome extensions using chrome-devtools-mcp. Use when testing extensions, inspecting UI state, debugging Chrome interactions, or when user requests browser debugging.
---

# Chrome DevTools Debug

Debugging workflow for Chrome extension development using MCP (Model Context Protocol).

## Quick Start

**1. Start Debug Chrome**

```bash
./dev.sh start           # Start in background (recommended)
./dev.sh start --test    # Open test chat URL
./dev.sh start --fg      # Start in foreground (stop with Ctrl+C)
./dev.sh stop            # Stop debug Chrome only (normal Chrome unaffected)
./dev.sh restart --test  # Restart and open test chat
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

### Testing Extensions

1. **Load extension in Debug Chrome**
   ```bash
   ./dev.sh start --test  # Opens test chat (https://gemini.google.com/app/6cbdc99490e24d7e)
   ```
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select project directory

2. **Verify Functionality**
   ```javascript
   // take_snapshot() to get DOM structure
   // evaluate_script() to check console logs
   // click(), fill() to test UI interactions
   ```

3. **Fix Issues**
   - Modify code
   - Click reload button in `chrome://extensions/`
   - Test again

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
./dev.sh start           # Start debug Chrome (no-op if already running)
./dev.sh start --test    # Start debug Chrome + open test chat
./dev.sh stop            # Stop debug Chrome (port 9222 only, normal Chrome unaffected)
./dev.sh restart --test  # Restart + open test chat
./dev.sh status          # Check status
```

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
