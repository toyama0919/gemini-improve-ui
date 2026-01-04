# Gemini Chat UI Improvements

A Chrome extension that enhances Gemini Chat UI with powerful keyboard shortcuts.

Original Tampermonkey script: [gemini-chat.js](https://github.com/toyama0919/tampermonkey/blob/master/gemini-chat.js)

## Features

- Keyboard shortcuts for efficient navigation
- Chat history selection and navigation
- Efficient search result browsing
- Sidebar toggle
- Quick access to copy buttons

## Keyboard Shortcuts

### Chat Screen

- `Insert`: Navigate to search screen
- `Delete`: Toggle sidebar open/close
- `Home`: Create new chat
- `End`: Toggle between textarea ⇔ history selection mode
- `PageUp` / `PageDown`: Scroll chat area
- `↑` / `↓`: Navigate through history (in history selection mode)
- `Enter`: Open selected history
- `Esc`: Exit history selection mode

### Search Screen

- `↑` / `↓`: Navigate through search results
- `Enter`: Open selected search result
- `PageUp` / `PageDown`: Scroll page

### Copy Buttons

- `↑` / `↓` (when textarea is empty): Focus on copy button
- `↑` / `↓` (when copy button is focused): Move to other copy buttons
- `Enter`: Click focused copy button

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

## Development

### File Structure

```
gemini-improve-ui/
├── manifest.json      # Chrome extension manifest file
├── src/               # Source code
│   ├── content.js     # Main entry point
│   ├── search.js      # Search page functionality
│   ├── history.js     # Chat history selection
│   ├── chat.js        # Chat UI functionality
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

- **search.js**: Handles search result navigation and selection
- **history.js**: Manages chat history selection mode
- **chat.js**: Manages textarea, sidebar, scrolling, and copy buttons
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

## Changelog

### v2.9 (Chrome Extension)

- Converted from Tampermonkey script to Chrome extension
- All features ported
- Refactored code into modular files for better maintainability
