/** Injected by entrypoints/content — layout overrides for chat column / tables */
export const CHAT_LAYOUT_CUSTOM_CSS = `
    .gems-list-container {
      display: none !important;
    }
    .side-nav-entry-container {
      display: none !important;
    }
    /* Notebook sidebar list (any column; scoped selectors missed real DOM) */
    project-sidenav-list {
      display: none !important;
    }
    mat-drawer-content,
    .mat-drawer-inner-container,
    bard-sidenav-content {
      min-width: 0 !important;
    }
    main.main {
      min-width: 0 !important;
      box-sizing: border-box !important;
    }
    chat-window {
      box-sizing: border-box !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: min(var(--chat-max-width, 900px), 100%) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .conversation-container {
      box-sizing: border-box !important;
      min-width: 0 !important;
      max-width: min(var(--chat-max-width, 900px), 100%) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
    chat-window .markdown-main-panel,
    .conversation-container .markdown-main-panel,
    chat-window .markdown,
    .conversation-container .markdown {
      min-width: 0 !important;
      max-width: 100% !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .conversation-container .markdown-main-panel table-block,
    .conversation-container .markdown-main-panel .table-block-component,
    .conversation-container .markdown-main-panel .table-block,
    chat-window .markdown-main-panel table-block,
    chat-window .markdown-main-panel .table-block-component,
    chat-window .markdown-main-panel .table-block {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel .table-content,
    chat-window .markdown-main-panel .table-content {
      width: 100% !important;
      max-width: none !important;
      overflow-x: visible !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel table[data-path-to-node],
    chat-window .markdown-main-panel table[data-path-to-node] {
      width: 100% !important;
      max-width: none !important;
      table-layout: fixed !important;
      box-sizing: border-box !important;
    }
    .conversation-container .markdown-main-panel table[data-path-to-node] th,
    .conversation-container .markdown-main-panel table[data-path-to-node] td,
    chat-window .markdown-main-panel table[data-path-to-node] th,
    chat-window .markdown-main-panel table[data-path-to-node] td {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
  `;
