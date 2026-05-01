# Gemini Chat UI Improvements

Chrome extension that enhances the Google Gemini web UI: keyboard shortcuts, chat width, Deep Dive, conversation map, and more.

## Features

- Customizable keyboard shortcuts
- Adjustable chat area width (600px–1600px)
- Keyboard navigation of chat history
- Keyboard browsing of search results
- Hide sidebar clutter (Gems list, My Stuff section)
- Quick access to copy buttons
- **Deep Dive** — drill into sections, lists, tables, and quotes inside responses
- **Conversation map** — outline panel on the right with scroll-position highlight
- **Quick prompts** — pick a canned prompt from a dropdown and send without leaving the page
- **URL query parameters** — `?q=...` pre-fills a new chat; `?qt=...` pre-fills on any thread
- Autocomplete
- DOM structure export (for extension / AI-assisted development)

## Keyboard Shortcuts

All shortcuts can be changed on the extension options page. Defaults below.

### Chat view

| Key | Action |
|-----|--------|
| `Insert` | Go to search |
| `Home` | Toggle sidebar |
| `End` | Cycle: textarea → action buttons → sidebar → textarea |
| `PageUp` / `PageDown` | Scroll chat area |
| `↑` / `↓` | Navigate in history-picker mode |
| `Enter` | Open selected history item |
| `Esc` | Exit history-picker mode |

### Search view

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move through search results |
| `Enter` | Open selected result |
| `PageUp` / `PageDown` | Scroll page |

### Deep Dive buttons

| Key | Action |
|-----|--------|
| `↑` / `↓` (empty textarea) | Focus Deep Dive buttons |
| `↑` / `↓` (button focused) | Move between Deep Dive buttons |
| `→` | Expand/collapse child buttons (+/− toggle) |
| `←` | Show/hide quote template menu |
| `Enter` | Activate focused button |

### Autocomplete

| Key | Action |
|-----|--------|
| `Tab` | Accept selected suggestion |
| `↑` / `↓` | Move in suggestion list |
| `Esc` | Close menu |

### Extension development

- `Ctrl+Shift+D`: Copy page DOM structure to clipboard (for AI / selector work)

## Deep Dive

Inline buttons to follow up on parts of a Gemini reply. Buttons appear on:

- **Section headings** (h1–h6)
- **Lists** (ol/ul)
- **Tables**
- **Block quotes**
- **Orphan paragraphs** (blocks not under a heading)

**Usage**

1. Click ↳ — sends quote + prompt
2. With the ↳ button focused, press the **Quick prompt focus** shortcut (default `Insert`) — quote only (you type the prompt). In the input, that shortcut still toggles quick prompt focus as before.

**Modes:** Pick a prompt from the dropdown next to the input, or pass `?mode_id=xxx` in the URL. Configure modes on the options page.

**Fine-grained selection**

1. Press `→` to flip `+`/`−` and expand per-child ↳ buttons
2. Select individual paragraphs or list items to drill down
3. Press `→` again to collapse
4. Press `←` for the quote template menu

## Conversation map

Outline panel fixed on the right of the chat view.

- Always visible on chat pages
- Highlights the turn in view (IntersectionObserver)
- Click a row to smooth-scroll to that turn
- Updates when new turns are added

## URL query parameters

Append `q` to pre-fill the prompt when opening Gemini.

```
https://gemini.google.com/app?q=Teach%20me%20sort%20algorithms%20in%20Python
```

To add a follow-up on an existing thread (`/app/xxxx`), use `qt`:

```
https://gemini.google.com/app/abc123?qt=Explain%20this%20result%20in%20more%20detail
```

| Parameter | Path | Behavior |
|-----------|------|----------|
| `q` | `/app` only | Pre-fill prompt on a **new** chat |
| `qt` | Any `/app/...` | Pre-fill prompt (including existing threads) |
| `send` | Any | `true` (default) auto-sends; `false` fills only |

```bash
# From a terminal
open "https://gemini.google.com/app?q=Debug this error: $(cat error.log)"
# Append to an existing thread
open "https://gemini.google.com/app/abc123?qt=Explain this result in more detail"
```

## Quick prompts

Open the menu from the button next to the input, pick a template, send—no navigation.

Default templates (Japanese in the shipped build):

- ここまでの内容をまとめて
- 続きを教えて
- もっと詳しく教えて
- 具体例を挙げて

Add, edit, or remove prompts on the Options page.

## Settings

1. Right-click the extension icon → **Options**
2. Adjust shortcuts, chat width, Deep Dive modes, quick prompts, etc.
3. Click **Save Settings**

## Installation

```bash
git clone https://github.com/toyama0919/gemini-improve-ui.git
cd gemini-improve-ui
npm install
npm run build
```

1. Open `chrome://extensions/` in Chrome
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Choose the `dist/chrome-mv3/` directory

## Development

Built with [WXT](https://wxt.dev/).

```bash
./dev.sh dev      # WXT dev server + Chrome (hot reload)
./dev.sh stop     # Stop Chrome
./dev.sh status   # Connection check
```

### Layout

```
gemini-improve-ui/
├── wxt.config.ts           # WXT config
├── package.json
├── dev.sh                  # Dev helper
├── entrypoints/
│   ├── content/index.ts    # Content script entry
│   └── options/main.ts     # Options page
├── src/
│   ├── settings.ts         # Settings + storage
│   ├── keyboard.ts         # Keyboard handlers
│   ├── chat.ts             # Chat UI (textarea, sidebar, scroll)
│   ├── deep-dive.ts        # Deep Dive buttons
│   ├── map.ts              # Conversation map
│   ├── history.ts          # Chat history picker
│   ├── search.ts           # Search page
│   ├── autocomplete.ts     # Autocomplete
│   ├── export.ts           # Zettelkasten export
│   └── dom-analyzer.ts     # DOM export / analysis
├── public/icons/           # Extension icons
└── .cursor/mcp.json        # Chrome DevTools MCP (optional)
```

### Chrome DevTools MCP

You can debug with Chrome DevTools MCP from Cursor; see `.cursor/mcp.json`.

```bash
./dev.sh dev          # Chrome + MCP
curl http://localhost:9222/json/list   # Sanity check
```

### Selector strategy

1. ARIA (`aria-label`, `role`) — most stable
2. Semantic hooks (`data-test-id`) — medium
3. Class names — last resort / fallback

## License

MIT License

## Author

toyama0919
