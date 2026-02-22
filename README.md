# Gemini Chat UI Improvements

A Chrome extension that enhances Google Gemini Web UI with keyboard shortcuts, customizable chat width, autocomplete, and a conversation map panel.

## Features

- Customizable keyboard shortcuts for efficient navigation
- Adjustable chat area width (600px - 1600px)
- Keyboard navigation for chat history
- Recent chats history tracking
- Efficient search result browsing
- Sidebar element hiding (Gems list, My Stuff section)
- Quick access to copy buttons
- **Deep dive into responses** - Explore topics in detail with inline buttons
- Autocomplete for faster input
- DOM structure analysis for AI developers
- **Conversation map** - Fixed right-side panel showing the outline of the current chat with scroll-position highlight
- **URL query parameter** - Open Gemini with pre-filled questions via URL (`?q=...`)

## Keyboard Shortcuts

All keyboard shortcuts can be customized via the extension's options page. The default shortcuts are listed below.

### Chat Screen (Default)

- `Insert`: Navigate to search screen
- `Home`: Toggle sidebar open/close
- `End`: Cycle through textarea → action buttons (if responses exist) → sidebar → textarea
- `PageUp` / `PageDown`: Scroll chat area
- `↑` / `↓`: Navigate through history (in history selection mode)
- `Enter`: Open selected history
- `Esc`: Exit history selection mode

### Search Screen (Default)

- `↑` / `↓`: Navigate through search results
- `Enter`: Open selected search result
- `PageUp` / `PageDown`: Scroll page

### Deep Dive Buttons

- `↑` / `↓` (when textarea is empty): Focus on deep dive button
- `↑` / `↓` (when deep dive button is focused): Move to other deep dive buttons
- `→` (when deep dive button is focused): Expand to show child buttons
- `←` (when deep dive button is focused): Collapse child buttons
- `Enter`: Click focused button

### Autocomplete

- `Tab`: Replace current word with selected suggestion
- `↑` / `↓`: Navigate through autocomplete suggestions
- `Esc`: Close autocomplete menu

### AI Developer Support

- `Ctrl+Shift+D`: Copy current page DOM structure to clipboard for AI analysis
  - Useful for developing extensions that adapt to UI changes
  - Exports element selectors, interactive components, and page metadata

### Context Menu (Right-Click Menu)

Select any text on a webpage, right-click, and choose from Gemini actions:

**General Actions:**
- **Geminiに質問** - Ask Gemini directly with selected text
- **Geminiで説明** - Get an explanation of the selected text

**Code Actions:**
- **コードレビュー** - Review code for improvements

All actions open a new Gemini tab with the query pre-filled and automatically sent.

### Deep Dive into Responses

Explore Gemini's responses in more detail with inline deep dive buttons. Buttons appear on:

- **Section headings** - Dive deeper into specific sections
- **Lists (ol/ul)** - Ask follow-up questions about list items
- **Tables** - Ask follow-up questions about data
- **Blockquotes** - Explore quoted content

**How to use:**

1. Click the ↳ (subdirectory arrow) button next to any section, table, or blockquote
2. **Enter or normal click:** Quotes the content + adds prompt (default: "これについて詳しく") and auto-sends
3. **Ctrl+Enter or Ctrl+click:** Only quotes the content, you add your own prompt

The default prompt can be customized in extension options (right-click the extension icon → Options). Leave empty to only quote without auto-send.

**Fine-grained selection:**

For sections and lists, you can expand to select individual paragraphs or list items:

1. Click the **+** button next to the deep dive button
2. Or press `→` when deep dive button is focused to expand
3. Select specific paragraphs or list items with their own ↳ buttons
4. Click the **-** button or press `←` to collapse back

**Keyboard navigation:**

- Press `End` key to cycle: textarea → action buttons → sidebar → textarea
- Press `↑` / `↓` with empty textarea to focus on buttons
- Use `↑` / `↓` to move between deep dive buttons
- Use `→` to expand, `←` to collapse (shows +/- indicator)
- Press `Enter` to click the focused button

### Conversation Map

A fixed panel on the right side of the screen showing the outline of the current chat.

- Always visible on chat pages
- Highlights the chat turn currently visible in the viewport (scroll-position aware)
- Click any item to smoothly scroll to that turn
- Automatically updates when new turns are added

### URL Query Parameter

You can open Gemini with a pre-filled question by using the `q` parameter in the URL:

```
https://gemini.google.com/app?q=YOUR_QUESTION
```

**Basic usage:**
```
https://gemini.google.com/app?q=Pythonでソートアルゴリズムを教えて
```

**Control auto-send behavior:**
```
https://gemini.google.com/app?q=YOUR_QUESTION&send=false
```

- `send=true` or omit `send` - Automatically send the question (default)
- `send=false` - Fill the textarea but don't send automatically

**Practical use cases:**

1. **Bookmarklets** - Create browser bookmarks for frequently asked questions:
   ```javascript
   javascript:(function(){
     window.open('https://gemini.google.com/app?q=このコードをレビューして');
   })();
   ```

2. **External tools integration** - Link from documentation, IDE, or other tools:
   ```bash
   # Open from terminal
   open "https://gemini.google.com/app?q=Debug this error: $(cat error.log)"
   ```

3. **Workflow automation** - Integrate with Alfred, Raycast, or custom scripts:
   ```bash
   # Alfred workflow example
   open "https://gemini.google.com/app?q=${query}"
   ```

## Customizing Settings

### Context Menu

1. Right-click the extension icon in Chrome's toolbar
2. Select "Options" from the menu
3. Toggle "Enable right-click menu" checkbox
4. Click "Save Settings" to apply changes

### Keyboard Shortcuts

1. Right-click the extension icon in Chrome's toolbar
2. Select "Options" from the menu
3. Click on any shortcut field and press the desired key
4. Click "Save Settings" to apply changes
5. Reload the Gemini Chat page to use the new shortcuts

You can reset all shortcuts to their default values by clicking the "Reset to Default" button on the options page.

### Chat Width

You can adjust the maximum width of the chat area (Range: 600px - 1600px, Default: 900px).

1. Open the extension's options page
2. Adjust the "Chat area width" slider
3. Click "Save Settings"
4. Changes apply immediately (no page reload required)

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

For more advanced usage, you can connect to this extension using Chrome DevTools MCP.

**Quick Start (Cursor users):**

This repository includes `.cursor/mcp.json` with Chrome DevTools MCP pre-configured. Simply:

1. Start Chrome with remote debugging (from repository root):
   ```bash
   # Using helper script (recommended - won't kill your existing Chrome)
   ./dev.sh start           # Background mode
   ./dev.sh start --fg      # Foreground mode (press Ctrl+C to stop)

   # Or manually (macOS)
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 \
     --user-data-dir="$(pwd)/.chrome-devtools-mcp" &
   ```

2. Open this project in Cursor - MCP is automatically configured

3. When done debugging:
   ```bash
   ./dev.sh stop         # Stop debug Chrome (background mode)
   # or press Ctrl+C     # (foreground mode)
   ```

For detailed debugging instructions, see `.cursorrules` file in the repository.

This allows AI agents to:
- Inspect the live DOM using accessibility tree
- Execute JavaScript to query elements
- Take screenshots and snapshots
- Interact with the page programmatically

## Development

For detailed development instructions, including Chrome DevTools MCP setup, see `.cursorrules` file.

### File Structure

```
gemini-improve-ui/
├── manifest.json      # Chrome extension manifest file (v3.0)
├── options.html       # Settings page UI
├── options.js         # Settings page script
├── dev.sh             # Development helper script for Chrome debugging
├── .cursor/           # Cursor IDE configuration
│   └── mcp.json       # MCP server configuration for Chrome DevTools
├── src/               # Source code
│   ├── settings.js    # Settings management and storage
│   ├── content.js     # Main entry point and CSS injection
│   ├── keyboard.js    # Keyboard event handlers
│   ├── chat.js        # Chat UI functionality (textarea, sidebar, scroll)
│   ├── map.js         # Conversation map panel (right-side outline view)
│   ├── history.js     # Chat history selection mode
│   ├── search.js      # Search page functionality
│   ├── recent.js      # Recent chats tracking
│   ├── autocomplete.js # Autocomplete functionality
│   └── dom-analyzer.js # DOM structure analysis for AI
├── icons/             # Extension icons
│   ├── icon.svg       # SVG source
│   ├── icon16.png     # 16x16 icon
│   ├── icon48.png     # 48x48 icon
│   └── icon128.png    # 128x128 icon
└── README.md          # This file
```

### Module Organization

The code is organized into modular files for better maintainability:

- **settings.js**: Manages keyboard shortcut settings and storage
- **content.js**: Main initialization, entry point, and CSS injection
- **keyboard.js**: Central keyboard event handling and shortcut routing
- **chat.js**: Manages textarea, sidebar, scrolling, and copy buttons
- **map.js**: Conversation map panel — right-side fixed outline with IntersectionObserver-based scroll highlight
- **history.js**: Manages chat history selection mode
- **search.js**: Handles search result navigation and selection
- **recent.js**: Tracks and manages recent chats history
- **autocomplete.js**: Provides autocomplete functionality for faster input
- **dom-analyzer.js**: Analyzes page structure for AI agents

### Selector Strategy

This extension uses a resilient selector strategy to handle Gemini's UI changes:

1. **Priority Order**:
   - ARIA attributes (`aria-label`, `role`) - Most stable
   - Semantic attributes (`data-test-id`) - Moderately stable
   - Class names - Least stable, used as fallback

2. **Multiple Candidates**: Each element type has multiple selector candidates, automatically falling back if the primary selector fails

3. **DOM Analyzer**: Press `Ctrl+Shift+D` to export current page structure for AI analysis when selectors need updating

### Debugging

1. Click the "Reload" button for the extension at `chrome://extensions/`
2. Press F12 on the Gemini Chat page to open DevTools
3. Check logs in the Console tab

## License

MIT License

## Author

toyama0919
