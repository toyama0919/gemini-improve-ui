# Gemini Chat UI Improvements

A Chrome extension that enhances Gemini Chat UI with powerful keyboard shortcuts.

## Features

- Keyboard shortcuts for efficient navigation
- Chat history selection and navigation
- Efficient search result browsing
- Sidebar toggle
- Quick access to copy buttons
- DOM structure analysis for AI agents

## Keyboard Shortcuts

All keyboard shortcuts can be customized via the extension's options page. The default shortcuts are listed below.

### Chat Screen (Default)

- `Insert`: Navigate to search screen
- `Delete`: Toggle sidebar open/close
- `Home`: Create new chat
- `End`: Toggle between textarea ⇔ history selection mode
- `PageUp` / `PageDown`: Scroll chat area
- `↑` / `↓`: Navigate through history (in history selection mode)
- `Enter`: Open selected history
- `Esc`: Exit history selection mode

### Search Screen (Default)

- `↑` / `↓`: Navigate through search results
- `Enter`: Open selected search result
- `PageUp` / `PageDown`: Scroll page

### Copy Buttons

- `↑` / `↓` (when textarea is empty): Focus on copy button
- `↑` / `↓` (when copy button is focused): Move to other copy buttons
- `Enter`: Click focused copy button

### AI Agent Support

- `Ctrl+Shift+D`: Copy current page DOM structure to clipboard for AI analysis
  - Useful for developing extensions that adapt to UI changes
  - Exports element selectors, interactive components, and page metadata

## Customizing Shortcuts

1. Right-click the extension icon in Chrome's toolbar
2. Select "Options" from the menu
3. Click on any shortcut field and press the desired key
4. Click "Save Settings" to apply changes
5. Reload the Gemini Chat page to use the new shortcuts

You can reset all shortcuts to their default values by clicking the "Reset to Default" button on the options page.

## Installation

1. Clone or download this repository

```bash
git clone https://github.com/toyama0919/gemini-improve-ui.git
cd gemini-improve-ui
```

2. Load the extension in Chrome

   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked"
   - Select this project directory

3. Visit `https://gemini.google.com/` and start using the shortcuts

## AI Agent Support

This extension includes functionality to help AI agents understand the current page structure, even as Gemini's HTML changes over time.

### Usage

1. Press `Ctrl+Shift+D` on any Gemini page to copy the DOM structure
2. Paste the output into your AI chat (Claude, ChatGPT, Gemini, etc.)
3. The AI can now understand the current page layout and suggest appropriate selectors

### Using with Chrome DevTools MCP

For more advanced usage, you can connect to this extension using Chrome DevTools MCP:

```bash
# Start Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/path/to/profile"
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl=http://127.0.0.1:9222"]
    }
  }
}
```

This allows AI agents to:
- Inspect the live DOM using accessibility tree
- Execute JavaScript to query elements
- Take screenshots and snapshots
- Interact with the page programmatically

## Development

For detailed development instructions, including Chrome DevTools MCP setup, see [DEVELOPMENT.md](DEVELOPMENT.md).

### File Structure

```
gemini-improve-ui/
├── manifest.json      # Chrome extension manifest file
├── options.html       # Settings page
├── options.js         # Settings page script
├── src/               # Source code
│   ├── settings.js    # Settings management
│   ├── content.js     # Main entry point
│   ├── search.js      # Search page functionality
│   ├── history.js     # Chat history selection
│   ├── chat.js        # Chat UI functionality
│   ├── dom-analyzer.js # DOM structure analysis for AI
│   └── keyboard.js    # Keyboard event handlers
├── icons/             # Icon images
│   ├── icon.svg       # SVG source
│   ├── icon16.png     # 16x16 icon
│   ├── icon48.png     # 48x48 icon
│   └── icon128.png    # 128x128 icon
└── README.md          # This file
```

### Module Organization

The code is organized into modular files for better maintainability:

- **settings.js**: Manages keyboard shortcut settings and storage
- **search.js**: Handles search result navigation and selection
- **history.js**: Manages chat history selection mode
- **chat.js**: Manages textarea, sidebar, scrolling, and copy buttons
- **dom-analyzer.js**: Analyzes page structure for AI agents
- **keyboard.js**: Central keyboard event handling
- **content.js**: Main initialization and entry point

### Debugging

1. Click the "Reload" button for the extension at `chrome://extensions/`
2. Press F12 on the Gemini Chat page to open DevTools
3. Check logs in the Console tab

## License

MIT License

## Author

toyama0919
