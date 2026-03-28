var content = (function() {
  "use strict";
  function defineContentScript(definition2) {
    return definition2;
  }
  const DEFAULT_SHORTCUTS = {
    chat: {
      focusQuickPrompt: "Insert",
      toggleSidebar: "Delete",
      toggleHistoryMode: "End",
      scrollUp: "PageUp",
      scrollDown: "PageDown",
      historyUp: "ArrowUp",
      historyDown: "ArrowDown",
      historyOpen: "Enter",
      historyExit: "Escape"
    },
    search: {
      moveUp: "ArrowUp",
      moveDown: "ArrowDown",
      openResult: "Enter",
      scrollUp: "PageUp",
      scrollDown: "PageDown"
    }
  };
  let currentShortcuts = null;
  function loadShortcuts() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["shortcuts"], (result2) => {
        if (result2.shortcuts) {
          currentShortcuts = result2.shortcuts;
          migrateShortcuts(currentShortcuts);
        } else {
          currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
        }
        resolve(currentShortcuts);
      });
    });
  }
  function migrateShortcuts(shortcuts) {
    const chat = shortcuts.chat;
    if (chat.navigateToSearch && !chat.focusQuickPrompt) {
      chat.focusQuickPrompt = chat.navigateToSearch;
      delete chat.navigateToSearch;
      chrome.storage.sync.set({ shortcuts });
    }
  }
  function getShortcuts() {
    return currentShortcuts || DEFAULT_SHORTCUTS;
  }
  function isShortcut(event, shortcutKey) {
    const shortcuts = getShortcuts();
    const keys = shortcutKey.split(".");
    let shortcut = shortcuts;
    for (const key of keys) {
      shortcut = shortcut[key];
      if (!shortcut) return false;
    }
    if (typeof shortcut === "object") {
      const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
      const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
      return event.code === shortcut.key && metaMatch && ctrlMatch && shiftMatch;
    }
    return event.code === shortcut && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  }
  const RETRY_DELAY = 500;
  const DEBOUNCE_DELAY = 300;
  const DROPDOWN_MARGIN = 10;
  const ITEM_HEIGHT = 40;
  const MIN_DROPDOWN_HEIGHT = 100;
  let autocompleteList = null;
  let selectedIndex = -1;
  let currentSuggestions = [];
  let autocompleteTimeout = null;
  function isAutocompleteVisible() {
    return autocompleteList !== null && autocompleteList.style.display === "block" && currentSuggestions.length > 0;
  }
  function preventEventPropagation(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function moveSelection(direction) {
    if (direction === "next") {
      selectedIndex = selectedIndex < 0 ? 0 : (selectedIndex + 1) % currentSuggestions.length;
    } else {
      selectedIndex = selectedIndex < 0 ? currentSuggestions.length - 1 : selectedIndex <= 0 ? currentSuggestions.length - 1 : selectedIndex - 1;
    }
    updateSelectedItem();
  }
  async function fetchGoogleSuggestions(query) {
    if (!query || query.trim().length === 0) return [];
    try {
      const encodedQuery = encodeURIComponent(query.trim());
      const response = await fetch(
        `https://www.google.co.jp/complete/search?output=firefox&hl=ja&ie=utf-8&oe=utf-8&q=${encodedQuery}`
      );
      const data = await response.json();
      return data[1] || [];
    } catch {
      return [];
    }
  }
  function createAutocompleteDropdown() {
    if (autocompleteList) return autocompleteList;
    const list = document.createElement("div");
    list.className = "gemini-autocomplete-list";
    list.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow-y: auto;
    z-index: 10000;
    display: none;
    min-width: 300px;
  `;
    document.body.appendChild(list);
    autocompleteList = list;
    return list;
  }
  function positionDropdown(inputElement, list, suggestions) {
    const rect = inputElement.getBoundingClientRect();
    list.style.left = `${rect.left}px`;
    list.style.width = `${rect.width}px`;
    list.style.display = "block";
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_MARGIN;
    const spaceAbove = rect.top - DROPDOWN_MARGIN;
    const maxItemsBelow = Math.floor(spaceBelow / ITEM_HEIGHT);
    const maxItemsAbove = Math.floor(spaceAbove / ITEM_HEIGHT);
    if (maxItemsBelow < suggestions.length && maxItemsAbove > maxItemsBelow) {
      list.style.bottom = `${window.innerHeight - rect.top}px`;
      list.style.top = "auto";
      list.style.maxHeight = `${Math.max(spaceAbove, MIN_DROPDOWN_HEIGHT)}px`;
    } else {
      list.style.top = `${rect.bottom}px`;
      list.style.bottom = "auto";
      list.style.maxHeight = `${Math.max(spaceBelow, MIN_DROPDOWN_HEIGHT)}px`;
    }
  }
  function showAutocompleteSuggestions(inputElement, suggestions) {
    if (!suggestions || suggestions.length === 0) {
      hideAutocompleteSuggestions();
      return;
    }
    const list = createAutocompleteDropdown();
    list.innerHTML = "";
    currentSuggestions = suggestions;
    selectedIndex = -1;
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement("div");
      item.className = "gemini-autocomplete-item";
      item.textContent = suggestion;
      item.style.cssText = `
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;
    `;
      item.addEventListener("mouseenter", () => {
        selectedIndex = index;
        updateSelectedItem();
      });
      item.addEventListener("click", () => {
        selectSuggestion(inputElement, suggestion);
      });
      list.appendChild(item);
    });
    positionDropdown(inputElement, list, suggestions);
  }
  function hideAutocompleteSuggestions() {
    if (autocompleteList) {
      autocompleteList.style.display = "none";
    }
    currentSuggestions = [];
    selectedIndex = -1;
  }
  function updateSelectedItem() {
    if (!autocompleteList) return;
    const items = autocompleteList.querySelectorAll(".gemini-autocomplete-item");
    items.forEach((item, index) => {
      item.style.backgroundColor = index === selectedIndex ? "#e8f0fe" : "transparent";
    });
  }
  function selectSuggestion(inputElement, suggestion) {
    if (inputElement.contentEditable === "true") {
      while (inputElement.firstChild) {
        inputElement.removeChild(inputElement.firstChild);
      }
      const p = document.createElement("p");
      p.textContent = suggestion;
      inputElement.appendChild(p);
      inputElement.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputElement);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      inputElement.value = suggestion;
      inputElement.focus();
      inputElement.setSelectionRange(
        suggestion.length,
        suggestion.length
      );
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    }
    hideAutocompleteSuggestions();
  }
  function initializeAutocomplete() {
    const textarea = document.querySelector(
      'div[contenteditable="true"][role="textbox"]'
    );
    if (!textarea) {
      setTimeout(initializeAutocomplete, RETRY_DELAY);
      return;
    }
    textarea.addEventListener(
      "keydown",
      async (e) => {
        if (!e.isTrusted || e.isComposing) return;
        if (e.metaKey && e.code === "Space") {
          preventEventPropagation(e);
          const text = textarea.textContent || "";
          const trimmedText = text.trim();
          if (trimmedText.length === 0) {
            hideAutocompleteSuggestions();
            return;
          }
          const suggestions = await fetchGoogleSuggestions(trimmedText);
          showAutocompleteSuggestions(textarea, suggestions);
          return;
        }
        if (!isAutocompleteVisible()) return;
        if (e.key === "Tab" || e.key === "ArrowDown") {
          preventEventPropagation(e);
          moveSelection("next");
        } else if (e.key === "ArrowUp") {
          preventEventPropagation(e);
          moveSelection("prev");
        } else if (e.key === "Enter") {
          preventEventPropagation(e);
          const indexToSelect = selectedIndex >= 0 ? selectedIndex : 0;
          selectSuggestion(textarea, currentSuggestions[indexToSelect]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          hideAutocompleteSuggestions();
        }
      },
      true
    );
    document.addEventListener("click", (e) => {
      if (autocompleteList && !autocompleteList.contains(e.target) && e.target !== textarea) {
        hideAutocompleteSuggestions();
      }
    });
  }
  function initializeSearchAutocomplete() {
    if (!window.location.pathname.startsWith("/search")) return;
    let attempts = 0;
    const maxAttempts = 10;
    const searchInputInterval = setInterval(() => {
      attempts++;
      const searchInput = document.querySelector(
        'input[data-test-id="search-input"]'
      ) || document.querySelector(
        'input[type="text"][placeholder*="検索"]'
      ) || document.querySelector('input[type="text"]');
      if (searchInput) {
        clearInterval(searchInputInterval);
        searchInput.addEventListener("input", (e) => {
          if (!e.isTrusted) return;
          if (autocompleteTimeout) clearTimeout(autocompleteTimeout);
          const text = searchInput.value || "";
          const trimmedText = text.trim();
          if (trimmedText.length === 0) {
            hideAutocompleteSuggestions();
            return;
          }
          autocompleteTimeout = setTimeout(async () => {
            const currentTrimmed = (searchInput.value || "").trim();
            if (currentTrimmed.length === 0) {
              hideAutocompleteSuggestions();
              return;
            }
            const suggestions = await fetchGoogleSuggestions(currentTrimmed);
            showAutocompleteSuggestions(searchInput, suggestions);
          }, DEBOUNCE_DELAY);
        });
        searchInput.addEventListener(
          "keydown",
          (e) => {
            if (!e.isTrusted || e.isComposing) return;
            if (!isAutocompleteVisible()) return;
            if (e.key === "Tab" || e.key === "ArrowDown") {
              preventEventPropagation(e);
              moveSelection("next");
            } else if (e.key === "ArrowUp") {
              preventEventPropagation(e);
              moveSelection("prev");
            } else if (e.key === "Enter") {
              if (selectedIndex >= 0) {
                preventEventPropagation(e);
                selectSuggestion(searchInput, currentSuggestions[selectedIndex]);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              hideAutocompleteSuggestions();
            }
          },
          true
        );
        document.addEventListener("click", (e) => {
          if (autocompleteList && !autocompleteList.contains(e.target) && e.target !== searchInput) {
            hideAutocompleteSuggestions();
          }
        });
      } else if (attempts >= maxAttempts) {
        clearInterval(searchInputInterval);
      }
    }, 500);
  }
  let cachedChatArea = null;
  let chatAreaCacheTime = 0;
  const CHAT_AREA_CACHE_DURATION = 5e3;
  function getChatArea() {
    const now = Date.now();
    if (cachedChatArea && now - chatAreaCacheTime < CHAT_AREA_CACHE_DURATION) {
      return cachedChatArea;
    }
    const chatHistory = document.querySelector("infinite-scroller.chat-history");
    if (chatHistory && chatHistory.scrollHeight > chatHistory.clientHeight) {
      cachedChatArea = chatHistory;
      chatAreaCacheTime = now;
      return chatHistory;
    }
    if (document.documentElement.scrollHeight > document.documentElement.clientHeight) {
      cachedChatArea = document.documentElement;
      chatAreaCacheTime = now;
      return document.documentElement;
    }
    const selectors = [
      "infinite-scroller",
      'main[class*="main"]',
      ".conversation-container",
      '[class*="chat-history"]',
      '[class*="messages"]',
      "main",
      '[class*="scroll"]',
      'div[class*="conversation"]'
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.scrollHeight > element.clientHeight) {
        cachedChatArea = element;
        chatAreaCacheTime = now;
        return element;
      }
    }
    cachedChatArea = document.documentElement;
    chatAreaCacheTime = now;
    return document.documentElement;
  }
  function scrollChatArea(direction) {
    const chatArea = getChatArea();
    const scrollAmount = window.innerHeight * 0.1;
    const scrollValue = direction === "up" ? -scrollAmount : scrollAmount;
    if (chatArea === document.documentElement || chatArea === document.body) {
      window.scrollBy({ top: scrollValue, behavior: "auto" });
    } else {
      chatArea.scrollBy({ top: scrollValue, behavior: "auto" });
    }
  }
  function focusTextarea() {
    const textarea = document.querySelector(
      'div[contenteditable="true"][role="textbox"]'
    ) || document.querySelector('[contenteditable="true"]');
    if (!textarea) return;
    textarea.focus();
    if (textarea.contentEditable === "true") {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textarea);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }
  function clearAndFocusTextarea() {
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(() => {
      attempts++;
      const textarea = document.querySelector(
        'div[contenteditable="true"][role="textbox"]'
      );
      if (textarea) {
        clearInterval(interval);
        while (textarea.firstChild) {
          textarea.removeChild(textarea.firstChild);
        }
        const p = document.createElement("p");
        p.appendChild(document.createElement("br"));
        textarea.appendChild(p);
        textarea.focus();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 200);
  }
  function setQueryFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    const isNewChat = path === "/app" || path === "/app/";
    const query = isNewChat ? urlParams.get("q") : null;
    const queryThread = urlParams.get("qt");
    const text = query || queryThread;
    if (!text) return;
    const send = urlParams.get("send");
    const shouldSend = send === null || send === "true" || send === "1";
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts++;
      const textarea = document.querySelector(
        'div[contenteditable="true"][role="textbox"]'
      );
      if (textarea) {
        clearInterval(interval);
        while (textarea.firstChild) {
          textarea.removeChild(textarea.firstChild);
        }
        const p = document.createElement("p");
        p.textContent = text;
        textarea.appendChild(p);
        textarea.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(textarea);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        if (shouldSend) {
          setTimeout(() => {
            const sendButton = document.querySelector('button[aria-label*="送信"]') || document.querySelector('button[aria-label*="Send"]') || document.querySelector("button.send-button") || Array.from(
              document.querySelectorAll("button")
            ).find(
              (btn) => btn.getAttribute("aria-label")?.includes("送信") || btn.getAttribute("aria-label")?.includes("Send")
            );
            if (sendButton && !sendButton.disabled) {
              sendButton.click();
            }
          }, 500);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 200);
  }
  function focusActionButton(direction) {
    const actionButtons = getAllActionButtons();
    if (actionButtons.length === 0) return false;
    if (direction === "up") {
      actionButtons[actionButtons.length - 1].focus();
    } else {
      actionButtons[0].focus();
    }
    return true;
  }
  function moveBetweenActionButtons(direction) {
    const actionButtons = getAllActionButtons();
    const currentIndex = actionButtons.findIndex(
      (btn) => btn === document.activeElement
    );
    if (currentIndex === -1) return false;
    if (direction === "up") {
      if (currentIndex > 0) {
        actionButtons[currentIndex - 1].focus();
        window.rememberActionButtonPosition?.(currentIndex - 1);
        return true;
      }
      return true;
    } else {
      if (currentIndex < actionButtons.length - 1) {
        actionButtons[currentIndex + 1].focus();
        window.rememberActionButtonPosition?.(currentIndex + 1);
        return true;
      }
      return true;
    }
  }
  function getAllActionButtons() {
    const allButtons = Array.from(
      document.querySelectorAll(
        'button.deep-dive-button-inline, button[data-action="deep-dive"]'
      )
    );
    return allButtons.filter((btn) => {
      const container = btn.closest('[data-test-id*="user"]') || btn.closest('[data-test-id*="prompt"]') || btn.closest('[class*="user"]');
      return !container;
    });
  }
  function findSidebarToggleButton() {
    return document.querySelector('[data-test-id="side-nav-toggle"]') || document.querySelector('button[aria-label*="メニュー"]') || document.querySelector('button[aria-label*="menu"]') || document.querySelector('button[aria-label*="Menu"]');
  }
  function toggleSidebar() {
    const toggle = findSidebarToggleButton();
    if (toggle) toggle.click();
  }
  function initializeChatPage() {
    setTimeout(() => {
      setQueryFromUrl();
    }, 1e3);
    setTimeout(() => {
      initializeAutocomplete();
    }, 1500);
    const observer = new MutationObserver(() => {
      const isStreaming = document.querySelector('[aria-busy="true"]');
      if (isStreaming) {
        window.rememberActionButtonPosition?.(-1);
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["aria-busy"],
      subtree: true
    });
  }
  let selectedHistoryIndex = 0;
  let historySelectionMode = false;
  function getHistoryItems() {
    return Array.from(
      document.querySelectorAll(
        '.conversation-items-container .conversation[data-test-id="conversation"]'
      )
    );
  }
  function highlightHistory(index) {
    const items = getHistoryItems();
    if (items.length === 0) return;
    selectedHistoryIndex = Math.max(0, Math.min(index, items.length - 1));
    items.forEach((item) => {
      item.style.outline = "";
      item.style.outlineOffset = "";
    });
    const selectedItem = items[selectedHistoryIndex];
    if (selectedItem) {
      selectedItem.style.outline = "2px solid #1a73e8";
      selectedItem.style.outlineOffset = "-2px";
      selectedItem.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }
  function moveHistoryUp() {
    highlightHistory(selectedHistoryIndex - 1);
  }
  function moveHistoryDown() {
    highlightHistory(selectedHistoryIndex + 1);
  }
  function openSelectedHistory() {
    const items = getHistoryItems();
    if (items.length === 0 || !items[selectedHistoryIndex]) return;
    items[selectedHistoryIndex].click();
    historySelectionMode = false;
    items.forEach((item) => {
      item.style.outline = "";
      item.style.outlineOffset = "";
    });
    clearAndFocusTextarea();
  }
  function exitHistorySelectionMode() {
    historySelectionMode = false;
    const items = getHistoryItems();
    items.forEach((item) => {
      item.style.outline = "";
      item.style.outlineOffset = "";
    });
  }
  function enterHistorySelectionMode() {
    historySelectionMode = true;
    if (document.activeElement) {
      document.activeElement.blur();
    }
    highlightHistory(selectedHistoryIndex);
  }
  function isHistorySelectionMode() {
    return historySelectionMode;
  }
  let selectedSearchIndex = 0;
  function isSearchPage() {
    return window.location.pathname.startsWith("/search");
  }
  function getSearchResults() {
    let results = Array.from(
      document.querySelectorAll('search-snippet[tabindex="0"]')
    );
    if (results.length === 0) {
      results = Array.from(
        document.querySelectorAll("search-snippet")
      );
    }
    if (results.length === 0) {
      results = Array.from(
        document.querySelectorAll(
          'div.conversation-container[role="option"]'
        )
      );
    }
    if (results.length === 0) {
      results = Array.from(
        document.querySelectorAll(
          '[role="option"].conversation-container'
        )
      );
    }
    return results;
  }
  function highlightSearchResult(index) {
    const items = getSearchResults();
    if (items.length === 0) return;
    selectedSearchIndex = Math.max(0, Math.min(index, items.length - 1));
    items.forEach((item) => {
      item.style.outline = "";
      item.style.outlineOffset = "";
    });
    const selectedItem = items[selectedSearchIndex];
    if (selectedItem) {
      selectedItem.style.outline = "2px solid #1a73e8";
      selectedItem.style.outlineOffset = "-2px";
      selectedItem.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }
  function moveSearchResultUp() {
    highlightSearchResult(selectedSearchIndex - 1);
    const searchInput = document.querySelector(
      'input[data-test-id="search-input"]'
    );
    if (searchInput) searchInput.focus();
  }
  function moveSearchResultDown() {
    highlightSearchResult(selectedSearchIndex + 1);
    const searchInput = document.querySelector(
      'input[data-test-id="search-input"]'
    );
    if (searchInput) searchInput.focus();
  }
  function openSelectedSearchResult() {
    const items = getSearchResults();
    if (items.length === 0 || !items[selectedSearchIndex]) return;
    const selectedItem = items[selectedSearchIndex];
    const clickableDiv = selectedItem.querySelector("div[jslog]");
    if (clickableDiv) {
      clickableDiv.click();
      ["mousedown", "mouseup", "click"].forEach((eventType) => {
        clickableDiv.dispatchEvent(
          new MouseEvent(eventType, { view: window, bubbles: true, cancelable: true })
        );
      });
      setTimeout(() => {
        selectedItem.click();
      }, 100);
      return;
    }
    const link = selectedItem.querySelector("a[href]");
    if (link) {
      link.click();
      return;
    }
    selectedItem.click();
    ["mousedown", "mouseup", "click"].forEach((eventType) => {
      selectedItem.dispatchEvent(
        new MouseEvent(eventType, { view: window, bubbles: true, cancelable: true })
      );
    });
  }
  function initializeSearchPage() {
    if (!isSearchPage()) return;
    let attempts = 0;
    const maxAttempts = 10;
    const highlightInterval = setInterval(() => {
      attempts++;
      const searchResults = getSearchResults();
      if (searchResults.length > 0) {
        selectedSearchIndex = 0;
        highlightSearchResult(0);
        clearInterval(highlightInterval);
      } else if (attempts >= maxAttempts) {
        clearInterval(highlightInterval);
      }
    }, 500);
  }
  const EXPORT_BUTTON_ID = "gemini-export-note-button";
  let exportDirHandle = null;
  function openExportDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("gemini-export", 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore("handles");
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function getStoredDirHandle() {
    try {
      const db = await openExportDB();
      return new Promise((resolve) => {
        const tx = db.transaction("handles", "readonly");
        const req = tx.objectStore("handles").get("save_dir");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }
  async function storeDirHandle(handle) {
    try {
      const db = await openExportDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(handle, "save_dir");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
    }
  }
  async function getExportDirHandle() {
    if (exportDirHandle) {
      const perm = await exportDirHandle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") return exportDirHandle;
    }
    const stored = await getStoredDirHandle();
    if (stored) {
      const perm = await stored.queryPermission({ mode: "readwrite" });
      if (perm === "granted") {
        exportDirHandle = stored;
        return exportDirHandle;
      }
      const newPerm = await stored.requestPermission({ mode: "readwrite" });
      if (newPerm === "granted") {
        exportDirHandle = stored;
        return exportDirHandle;
      }
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await storeDirHandle(handle);
    exportDirHandle = handle;
    return exportDirHandle;
  }
  function domToMarkdown(el) {
    const SKIP_TAGS = /* @__PURE__ */ new Set(["button", "svg", "path", "mat-icon"]);
    function nodeToMd(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const elem = node;
      const tag = elem.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return "";
      const inner = () => Array.from(elem.childNodes).map(nodeToMd).join("");
      const hm = tag.match(/^h([1-6])$/);
      if (hm) {
        const hashes = "#".repeat(Number(hm[1]));
        const text = inner().trim();
        return `
${hashes} ${text}

`;
      }
      switch (tag) {
        case "p":
          return inner() + "\n\n";
        case "br":
          return "\n";
        case "hr":
          return "\n---\n\n";
        case "ul":
        case "ol":
          return inner() + "\n";
        case "li": {
          const content2 = inner().replace(/\n+$/, "");
          return `- ${content2}
`;
        }
        case "b":
        case "strong":
          return `**${inner()}**`;
        case "i":
        case "em":
          return `*${inner()}*`;
        case "code":
          return `\`${inner()}\``;
        case "pre":
          return `\`\`\`
${inner()}
\`\`\`

`;
        case "table":
          return tableToMd(elem) + "\n\n";
        case "thead":
        case "tbody":
        case "tr":
        case "td":
        case "th":
          return "";
        default:
          return inner();
      }
    }
    function tableToMd(table) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length === 0) return "";
      const getCells = (row) => Array.from(row.querySelectorAll("td, th")).map(
        (cell) => Array.from(cell.childNodes).map(nodeToMd).join("").replace(/\n+/g, " ").trim()
      );
      const [headerRow, ...bodyRows] = rows;
      const headers = getCells(headerRow);
      const separator = headers.map(() => "---");
      return [
        `| ${headers.join(" | ")} |`,
        `| ${separator.join(" | ")} |`,
        ...bodyRows.map((r) => `| ${getCells(r).join(" | ")} |`)
      ].join("\n");
    }
    return Array.from(el.childNodes).map(nodeToMd).join("").replace(/\n{3,}/g, "\n\n").trim();
  }
  const ARTIFACT_PATTERNS = [
    /^[+＋]$/,
    /^Google スプレッドシートにエクスポート$/,
    /^Google Sheets にエクスポート$/,
    /^Export to Sheets$/
  ];
  function cleanModelText(text) {
    return text.split("\n").filter((line) => !ARTIFACT_PATTERNS.some((p) => p.test(line.trim()))).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  async function loadAllMessages() {
    const scroller = document.querySelector(
      "infinite-scroller.chat-history"
    );
    if (!scroller) return;
    showExportNotification("メッセージを読み込み中...");
    let prevCount = 0;
    for (let i = 0; i < 30; i++) {
      scroller.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 400));
      const count = document.querySelectorAll("user-query").length;
      if (count === prevCount) break;
      prevCount = count;
    }
    scroller.scrollTop = scroller.scrollHeight;
  }
  function extractChatContent() {
    const userQueries = Array.from(document.querySelectorAll("user-query"));
    const modelResponses = Array.from(document.querySelectorAll("model-response"));
    const chats = [];
    const len = Math.min(userQueries.length, modelResponses.length);
    for (let i = 0; i < len; i++) {
      const userText = Array.from(
        userQueries[i].querySelectorAll(".query-text-line")
      ).map((el) => el.innerText.trim()).filter(Boolean).join("\n");
      const markdownEl = modelResponses[i].querySelector(
        "message-content .markdown"
      );
      const rawModelText = markdownEl ? domToMarkdown(markdownEl).trim() : void 0;
      const modelText = rawModelText ? cleanModelText(rawModelText) : "";
      if (userText || modelText) {
        chats.push({ user: userText || "", model: modelText || "" });
      }
    }
    return chats;
  }
  function getChatId() {
    return location.pathname.split("/").pop() || "unknown";
  }
  function yamlQuote(s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  function yamlBlock(text, indent) {
    return text.split("\n").map((line) => line === "" ? "" : indent + line).join("\n");
  }
  function generateMarkdown(chats) {
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${dateStr}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = timeStr.replace(/[-:T]/g, "");
    const conversationTitle = document.querySelector(
      '[data-test-id="conversation-title"]'
    )?.innerText?.trim();
    const firstUserLines = (chats[0]?.user || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const fallbackTitle = firstUserLines.find((l) => !/^https?:\/\//i.test(l)) || firstUserLines[0] || "Gemini chat";
    const title = (conversationTitle || fallbackTitle).slice(0, 60);
    const chatId = getChatId();
    const lines = [
      `id: ${yamlQuote(chatId)}`,
      `title: ${yamlQuote("Gemini: " + title)}`,
      `date: ${yamlQuote(timeStr)}`,
      `source: ${yamlQuote(location.href)}`,
      "tags:",
      "  - gemini",
      "  - fleeting",
      "chats:"
    ];
    for (const turn of chats) {
      lines.push("  - q: |");
      lines.push(yamlBlock(turn.user, "      "));
      lines.push("    a: |");
      lines.push(yamlBlock(turn.model, "      "));
    }
    return { markdown: lines.join("\n"), id, title };
  }
  async function saveNote(forcePickDir = false) {
    await loadAllMessages();
    const chats = extractChatContent();
    if (chats.length === 0) {
      showExportNotification("保存できる会話が見つかりません", "error");
      return;
    }
    let dirHandle;
    try {
      if (forcePickDir) {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        await storeDirHandle(handle);
        exportDirHandle = handle;
        dirHandle = handle;
        showExportNotification(`保存先を変更: ${handle.name}`);
      } else {
        dirHandle = await getExportDirHandle();
      }
    } catch {
      return;
    }
    const { markdown, title } = generateMarkdown(chats);
    const chatId = getChatId();
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").slice(0, 40);
    const filename = `gemini-${safeTitle}-${chatId}.yaml`;
    try {
      const inboxHandle = await dirHandle.getDirectoryHandle("inbox", {
        create: true
      });
      const fileHandle = await inboxHandle.getFileHandle(filename, {
        create: true
      });
      const writable = await fileHandle.createWritable();
      await writable.write(markdown);
      await writable.close();
      showExportNotification(`保存しました: inbox/${filename}`);
    } catch {
      showExportNotification("保存に失敗しました", "error");
    }
  }
  function showExportNotification(message, type = "success") {
    const existing = document.getElementById("gemini-export-notification");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "gemini-export-notification";
    el.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${type === "error" ? "#c62828" : "#1b5e20"};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3e3);
  }
  function createExportButton() {
    if (document.getElementById(EXPORT_BUTTON_ID)) return;
    const inputArea = document.querySelector("input-area-v2") || document.querySelector("input-container");
    if (!inputArea) return;
    const btn = document.createElement("button");
    btn.id = EXPORT_BUTTON_ID;
    btn.title = "Save as Zettelkasten note\nShift+クリックで保存先を変更";
    btn.textContent = "💾 Save note";
    btn.style.cssText = `
    position: fixed;
    bottom: 100px;
    right: 24px;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 8px 16px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    transition: background 0.2s;
  `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#1557b0";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#1a73e8";
    });
    btn.addEventListener("click", (e) => saveNote(e.shiftKey));
    document.body.appendChild(btn);
  }
  function initializeExport() {
    const chatId = getChatId();
    if (chatId === "app") return;
    createExportButton();
  }
  const SELECTOR_ID = "gemini-quick-prompt-selector";
  const PLACEHOLDER = "-- クイック --";
  const DEFAULT_QUICK_PROMPTS = [
    "ここまでの内容をまとめて",
    "続きを教えて",
    "もっと詳しく教えて",
    "具体例を挙げて"
  ];
  let quickPrompts = [...DEFAULT_QUICK_PROMPTS];
  function loadQuickPrompts() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["quickPrompts"], (result2) => {
        if (result2.quickPrompts && result2.quickPrompts.length > 0) {
          quickPrompts = result2.quickPrompts;
        }
        resolve(quickPrompts);
      });
    });
  }
  function findTextarea() {
    return document.querySelector(
      'div[contenteditable="true"][role="textbox"]'
    ) || document.querySelector('[contenteditable="true"]');
  }
  function findSendButton() {
    return document.querySelector(
      'button[aria-label*="送信"], button[aria-label*="Send"]'
    ) || document.querySelector("button.send-button") || Array.from(document.querySelectorAll("button")).find(
      (btn) => btn.getAttribute("aria-label")?.includes("送信") || btn.getAttribute("aria-label")?.includes("Send")
    ) || null;
  }
  function writeAndSend(text) {
    const textarea = findTextarea();
    if (!textarea) return;
    while (textarea.firstChild) textarea.removeChild(textarea.firstChild);
    const p = document.createElement("p");
    p.textContent = text;
    textarea.appendChild(p);
    textarea.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(textarea);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    setTimeout(() => {
      const sendButton = findSendButton();
      if (sendButton && !sendButton.disabled) sendButton.click();
    }, 200);
  }
  function injectSelector() {
    const existing = document.getElementById(SELECTOR_ID);
    if (existing) existing.remove();
    const wrapper = document.createElement("div");
    wrapper.id = SELECTOR_ID;
    wrapper.className = "gemini-deep-dive-mode-selector";
    const select = document.createElement("select");
    select.title = "クイックプロンプト";
    select.setAttribute("aria-label", "クイックプロンプト");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = PLACEHOLDER;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    quickPrompts.forEach((prompt) => {
      const option = document.createElement("option");
      option.value = prompt;
      option.textContent = prompt.length > 20 ? prompt.substring(0, 18) + "…" : prompt;
      option.title = prompt;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      const text = select.value;
      if (text) {
        writeAndSend(text);
        select.selectedIndex = 0;
      }
    });
    wrapper.appendChild(select);
    const deepDiveSelector = document.getElementById("gemini-deep-dive-mode-selector");
    if (deepDiveSelector?.parentElement) {
      deepDiveSelector.parentElement.insertBefore(wrapper, deepDiveSelector.nextSibling);
      return;
    }
    const trailing = document.querySelector(".trailing-actions-wrapper");
    if (trailing) {
      const modelPicker = trailing.querySelector(".model-picker-container");
      if (modelPicker) {
        trailing.insertBefore(wrapper, modelPicker);
      } else {
        trailing.insertBefore(wrapper, trailing.firstChild);
      }
      return;
    }
    const textarea = findTextarea();
    const inputField = textarea?.closest(".text-input-field");
    if (inputField) {
      inputField.appendChild(wrapper);
    }
  }
  function focusQuickPromptSelector() {
    const wrapper = document.getElementById(SELECTOR_ID);
    const select = wrapper?.querySelector("select");
    if (select) {
      select.focus();
      select.showPicker?.();
    }
  }
  function isQuickPromptFocused() {
    return document.activeElement?.closest(`#${SELECTOR_ID}`) !== null;
  }
  function initializeQuickPrompts() {
    loadQuickPrompts().then(() => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (findTextarea()) {
          clearInterval(interval);
          setTimeout(() => injectSelector(), 500);
        } else if (attempts >= 15) {
          clearInterval(interval);
        }
      }, 500);
    });
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.quickPrompts) {
        quickPrompts = changes.quickPrompts.newValue || [...DEFAULT_QUICK_PROMPTS];
        if (document.getElementById(SELECTOR_ID)) injectSelector();
      }
    });
  }
  let lastFocusedActionButtonIndex = -1;
  function rememberActionButtonPosition(index) {
    lastFocusedActionButtonIndex = index;
  }
  function handleSearchPageKeydown(event) {
    if (isAutocompleteVisible()) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab" || event.key === "Escape") {
        return false;
      }
    }
    if (isShortcut(event, "search.moveUp")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      moveSearchResultUp();
      return true;
    }
    if (isShortcut(event, "search.moveDown")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      moveSearchResultDown();
      return true;
    }
    if (isShortcut(event, "search.openResult")) {
      if (event.isComposing) return false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSelectedSearchResult();
      return true;
    }
    if (isShortcut(event, "search.scrollUp")) {
      event.preventDefault();
      window.scrollBy({ top: -window.innerHeight * 0.8, behavior: "auto" });
      return true;
    }
    if (isShortcut(event, "search.scrollDown")) {
      event.preventDefault();
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: "auto" });
      return true;
    }
    const shortcuts = getShortcuts();
    const chatKeys = Object.values(shortcuts.chat);
    if (chatKeys.includes(event.code)) return true;
    return false;
  }
  function handleChatPageKeydown(event) {
    const isInInput = event.target.matches(
      'input, textarea, [contenteditable="true"]'
    );
    if (isAutocompleteVisible()) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab" || event.key === "Escape") {
        return false;
      }
    }
    if (event.code === "Home" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      saveNote(event.shiftKey);
      return true;
    }
    if (event.ctrlKey && event.shiftKey && event.code === "KeyD") {
      event.preventDefault();
      window.domAnalyzer?.copyToClipboard();
      return true;
    }
    if (isShortcut(event, "chat.focusQuickPrompt")) {
      event.preventDefault();
      if (isQuickPromptFocused()) {
        focusTextarea();
      } else {
        focusQuickPromptSelector();
      }
      return true;
    }
    if (isShortcut(event, "chat.toggleSidebar")) {
      event.preventDefault();
      toggleSidebar();
      return true;
    }
    if (isShortcut(event, "chat.toggleHistoryMode")) {
      event.preventDefault();
      const actionButtons = getAllActionButtons();
      const hasResponses = actionButtons.length > 0;
      if (isHistorySelectionMode()) {
        exitHistorySelectionMode();
        focusTextarea();
      } else if (isInInput) {
        if (hasResponses) {
          let targetIndex = lastFocusedActionButtonIndex;
          if (targetIndex < 0 || targetIndex >= actionButtons.length) {
            targetIndex = actionButtons.length - 1;
          }
          actionButtons[targetIndex].focus();
        } else {
          enterHistorySelectionMode();
        }
      } else {
        const focusedElement = document.activeElement;
        const isActionButton = focusedElement && (focusedElement.classList?.contains("deep-dive-button-inline") || focusedElement.getAttribute("data-action") === "deep-dive");
        if (isActionButton) {
          const currentIndex = actionButtons.findIndex(
            (btn) => btn === focusedElement
          );
          if (currentIndex !== -1) lastFocusedActionButtonIndex = currentIndex;
          enterHistorySelectionMode();
        } else {
          focusTextarea();
        }
      }
      return true;
    }
    if (isHistorySelectionMode() && isShortcut(event, "chat.historyExit")) {
      event.preventDefault();
      exitHistorySelectionMode();
      return true;
    }
    if (isShortcut(event, "chat.scrollUp")) {
      event.preventDefault();
      scrollChatArea("up");
      return true;
    }
    if (isShortcut(event, "chat.scrollDown")) {
      event.preventDefault();
      scrollChatArea("down");
      return true;
    }
    if (isHistorySelectionMode()) {
      if (isShortcut(event, "chat.historyUp")) {
        event.preventDefault();
        moveHistoryUp();
        return true;
      } else if (isShortcut(event, "chat.historyDown")) {
        event.preventDefault();
        moveHistoryDown();
        return true;
      } else if (isShortcut(event, "chat.historyOpen")) {
        event.preventDefault();
        openSelectedHistory();
        return true;
      }
    }
    if (!isHistorySelectionMode() && isInInput && (isShortcut(event, "chat.historyUp") || isShortcut(event, "chat.historyDown"))) {
      const textarea = document.querySelector(
        'div[contenteditable="true"][role="textbox"]'
      );
      if (textarea && textarea.textContent?.trim() === "") {
        event.preventDefault();
        const direction = isShortcut(event, "chat.historyUp") ? "up" : "down";
        focusActionButton(direction);
        return true;
      }
    }
    if (!isHistorySelectionMode() && !isInInput) {
      const focusedElement = document.activeElement;
      const isActionButton = focusedElement && (focusedElement.classList?.contains("deep-dive-button-inline") || focusedElement.getAttribute("data-action") === "deep-dive");
      if (isActionButton) {
        if (isShortcut(event, "chat.historyUp") || isShortcut(event, "chat.historyDown")) {
          event.preventDefault();
          const direction = isShortcut(event, "chat.historyUp") ? "up" : "down";
          moveBetweenActionButtons(direction);
          return true;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          return false;
        }
        if (isShortcut(event, "chat.historyOpen")) {
          event.preventDefault();
          focusedElement.click();
          return true;
        }
      }
    }
    return false;
  }
  const KEYBOARD_HANDLER_KEY = "__geminiKeyboardHandlerVersion";
  function initializeKeyboardHandlers() {
    const version = Date.now().toString();
    document[KEYBOARD_HANDLER_KEY] = version;
    loadShortcuts().then(() => {
      document.addEventListener(
        "keydown",
        (event) => {
          if (document[KEYBOARD_HANDLER_KEY] !== version) return;
          if (isSearchPage()) {
            handleSearchPageKeydown(event);
            return;
          }
          handleChatPageKeydown(event);
        },
        true
      );
    });
  }
  const DEFAULT_DEEP_DIVE_MODES = [
    { id: "default", prompt: "これについて詳しく" }
  ];
  const SESSION_ID = Math.random().toString(36).substr(2, 9);
  function addDeepDiveButtons() {
    const responseContainers = document.querySelectorAll(".markdown-main-panel");
    if (responseContainers.length === 0) return;
    responseContainers.forEach((responseContainer) => {
      const targets = [];
      const headings = responseContainer.querySelectorAll(
        "h1[data-path-to-node], h2[data-path-to-node], h3[data-path-to-node], h4[data-path-to-node], h5[data-path-to-node], h6[data-path-to-node]"
      );
      const hasHeadings = headings.length > 0;
      if (hasHeadings) {
        headings.forEach((heading) => {
          const existing = heading.querySelector(".deep-dive-button-inline");
          if (existing) {
            if (existing.getAttribute("data-initialized") === SESSION_ID) return;
            heading.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach((b) => b.remove());
          }
          targets.push({
            type: "section",
            element: heading,
            getContent: () => getSectionContent(heading)
          });
        });
        const tables = responseContainer.querySelectorAll(
          "table[data-path-to-node]"
        );
        tables.forEach((table) => {
          const wrapper = table.closest(".table-block-component");
          if (wrapper) {
            const existing = wrapper.querySelector(".deep-dive-button-inline");
            if (existing) {
              if (existing.getAttribute("data-initialized") === SESSION_ID) return;
              existing.remove();
            }
            targets.push({
              type: "table",
              element: wrapper,
              getContent: () => getTableContent(table)
            });
          }
        });
        const orphanGroups = getOrphanParagraphGroups(responseContainer, headings);
        orphanGroups.forEach((group) => {
          const existing = group.anchor.querySelector(".deep-dive-button-inline");
          if (existing) {
            if (existing.getAttribute("data-initialized") === SESSION_ID) return;
            existing.remove();
          }
          targets.push({
            type: "orphan",
            element: group.anchor,
            getContent: () => group.elements.map((el) => el.textContent?.trim() ?? "").filter(Boolean).join("\n\n")
          });
        });
      } else {
        const tables = responseContainer.querySelectorAll(
          "table[data-path-to-node]"
        );
        tables.forEach((table) => {
          const wrapper = table.closest(".table-block-component");
          if (wrapper) {
            const existing = wrapper.querySelector(".deep-dive-button-inline");
            if (existing) {
              if (existing.getAttribute("data-initialized") === SESSION_ID) return;
              existing.remove();
            }
            targets.push({
              type: "table",
              element: wrapper,
              getContent: () => getTableContent(table)
            });
          }
        });
        const blockquotes = responseContainer.querySelectorAll(
          "blockquote[data-path-to-node]"
        );
        blockquotes.forEach((blockquote) => {
          const existing = blockquote.querySelector(".deep-dive-button-inline");
          if (existing) {
            if (existing.getAttribute("data-initialized") === SESSION_ID) return;
            existing.remove();
          }
          targets.push({
            type: "blockquote",
            element: blockquote,
            getContent: () => blockquote.textContent?.trim() ?? ""
          });
        });
        const lists = responseContainer.querySelectorAll(
          "ol[data-path-to-node], ul[data-path-to-node]"
        );
        lists.forEach((list) => {
          const existing = list.querySelector(":scope > .deep-dive-button-inline");
          if (existing) {
            if (existing.getAttribute("data-initialized") === SESSION_ID) return;
            list.querySelectorAll(".deep-dive-button-inline, .deep-dive-expand-button").forEach((b) => b.remove());
          }
          let parent = list.parentElement;
          let isNested = false;
          while (parent && parent !== responseContainer) {
            if ((parent.tagName === "OL" || parent.tagName === "UL") && parent.hasAttribute("data-path-to-node")) {
              isNested = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (isNested) return;
          targets.push({
            type: "list",
            element: list,
            getContent: () => getListContent(list)
          });
        });
      }
      targets.forEach((target) => addDeepDiveButton(target));
    });
  }
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
      const isParagraph = tag === "P";
      const isHeading = headingSet.has(child) || tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6";
      const isHr = tag === "HR";
      if (isHeading) {
        flush(prevBreakerWasHeading);
        prevBreakerWasHeading = true;
      } else if (isHr) {
        flush(prevBreakerWasHeading);
        prevBreakerWasHeading = false;
      } else if (isParagraph) {
        current.push(child);
      } else {
        flush(prevBreakerWasHeading);
        prevBreakerWasHeading = false;
      }
    }
    flush(prevBreakerWasHeading);
    return groups;
  }
  function getSectionContent(heading) {
    let content2 = (heading.textContent?.trim() ?? "") + "\n\n";
    let current = heading.nextElementSibling;
    while (current && !current.matches("h1, h2, h3, h4, h5, h6, hr")) {
      if (current.classList.contains("table-block-component")) {
        current = current.nextElementSibling;
        continue;
      }
      content2 += (current.textContent?.trim() ?? "") + "\n\n";
      current = current.nextElementSibling;
    }
    return content2.trim();
  }
  function getTableContent(table) {
    let content2 = "";
    const rows = table.querySelectorAll("tr");
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll("td, th");
      const cellTexts = Array.from(cells).map(
        (cell) => cell.textContent?.trim() ?? ""
      );
      content2 += "| " + cellTexts.join(" | ") + " |\n";
      if (rowIndex === 0) {
        content2 += "| " + cellTexts.map(() => "---").join(" | ") + " |\n";
      }
    });
    return content2.trim();
  }
  function getListContent(list) {
    return list.textContent?.trim() ?? "";
  }
  function addDeepDiveButton(target) {
    const button = document.createElement("button");
    button.className = "deep-dive-button-inline";
    button.setAttribute("aria-label", "Deep dive into this content");
    button.setAttribute("data-action", "deep-dive");
    button.setAttribute("data-initialized", SESSION_ID);
    button.title = "Deep dive into this content";
    button._deepDiveTarget = target;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z");
    svg.appendChild(path);
    button.appendChild(svg);
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertDeepDiveQuery(target, e.ctrlKey);
    });
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const expandBtn = target.element.querySelector(".deep-dive-expand-button");
        if (expandBtn) {
          e.preventDefault();
          e.stopPropagation();
          toggleExpand(target, expandBtn);
        }
      } else if (e.key === "ArrowLeft" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (document.getElementById("deep-dive-template-popup")) {
          hideTemplatePopup();
          button.focus();
        } else {
          showTemplatePopup(button, target);
        }
      }
    });
    let expandButton = null;
    if (target.type === "section" || target.type === "list") {
      expandButton = createExpandButton(target);
    }
    if (target.type === "section") {
      target.element.style.position = "relative";
      target.element.style.display = "flex";
      target.element.style.alignItems = "center";
      target.element.style.gap = "8px";
      target.element.appendChild(button);
      if (expandButton) target.element.appendChild(expandButton);
    } else if (target.type === "table") {
      const footer = target.element.querySelector(".table-footer");
      if (footer) {
        const copyButton = footer.querySelector(".copy-button");
        if (copyButton) {
          footer.insertBefore(button, copyButton);
        } else {
          footer.appendChild(button);
        }
      }
    } else if (target.type === "blockquote") {
      target.element.style.position = "relative";
      button.style.position = "absolute";
      button.style.top = "8px";
      button.style.right = "8px";
      target.element.appendChild(button);
    } else if (target.type === "orphan") {
      target.element.style.position = "relative";
      button.style.position = "absolute";
      button.style.top = "0";
      button.style.right = "0";
      target.element.appendChild(button);
    } else if (target.type === "list") {
      target.element.style.position = "relative";
      button.style.position = "absolute";
      button.style.top = "0";
      button.style.right = "0";
      target.element.appendChild(button);
      if (expandButton) {
        expandButton.style.position = "absolute";
        expandButton.style.top = "0";
        expandButton.style.right = "32px";
        target.element.appendChild(expandButton);
      }
    }
  }
  function createExpandButton(target) {
    const button = document.createElement("button");
    button.className = "deep-dive-expand-button";
    button.setAttribute("aria-label", "Expand to select");
    button.setAttribute("data-action", "expand");
    button.setAttribute("tabindex", "-1");
    button.title = "Expand to select";
    button.textContent = "+";
    button.style.fontSize = "14px";
    button.style.fontWeight = "bold";
    button.dataset.targetId = Math.random().toString(36).substr(2, 9);
    target.expandButtonId = button.dataset.targetId;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleExpand(target, button);
    });
    return button;
  }
  function toggleExpand(target, button) {
    const isExpanded = button.getAttribute("data-action") === "collapse";
    if (isExpanded) {
      collapseChildButtons(target);
      button.setAttribute("data-action", "expand");
      button.setAttribute("aria-label", "Expand to select");
      button.title = "Expand to select";
      button.textContent = "+";
    } else {
      expandChildButtons(target);
      button.setAttribute("data-action", "collapse");
      button.setAttribute("aria-label", "Collapse");
      button.title = "Collapse";
      button.textContent = "-";
    }
  }
  function expandChildButtons(target) {
    if (target.type === "section") {
      const heading = target.element;
      let current = heading.nextElementSibling;
      while (current && !current.matches("h1, h2, h3, h4, h5, h6, hr")) {
        if (current.classList.contains("table-block-component")) {
          current = current.nextElementSibling;
          continue;
        }
        if (current.tagName === "P" && !current.querySelector(".deep-dive-child-button")) {
          addChildButton(current);
        }
        if ((current.tagName === "UL" || current.tagName === "OL") && current.hasAttribute("data-path-to-node")) {
          const items = current.querySelectorAll(":scope > li");
          items.forEach((item) => {
            if (!item.querySelector(".deep-dive-child-button")) {
              addChildButton(item);
            }
          });
        }
        current = current.nextElementSibling;
      }
    } else if (target.type === "list") {
      const items = target.element.querySelectorAll(":scope > li");
      items.forEach((item) => {
        if (!item.querySelector(".deep-dive-child-button")) {
          addChildButton(item);
        }
      });
    }
  }
  function addChildButton(element) {
    element.style.position = "relative";
    const button = document.createElement("button");
    button.className = "deep-dive-button-inline deep-dive-child-button";
    button.setAttribute("aria-label", "Deep dive into this content");
    button.setAttribute("data-action", "deep-dive");
    button.title = "Deep dive into this content";
    button.style.position = "absolute";
    button.style.top = "0";
    button.style.right = "0";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 15l-6 6-1.5-1.5L15 16H4V9h2v5h9l-3.5-3.5L13 9l6 6z");
    svg.appendChild(path);
    button.appendChild(svg);
    const childTarget = {
      type: "child",
      element,
      getContent: () => element.textContent?.trim() ?? ""
    };
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      insertDeepDiveQuery(childTarget, e.ctrlKey);
    });
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (document.getElementById("deep-dive-template-popup")) {
          hideTemplatePopup();
          button.focus();
        } else {
          showTemplatePopup(button, childTarget);
        }
      }
    });
    element.appendChild(button);
  }
  function collapseChildButtons(target) {
    if (target.type === "section") {
      const heading = target.element;
      let current = heading.nextElementSibling;
      while (current && !current.matches("h1, h2, h3, h4, h5, h6, hr")) {
        if (current.classList.contains("table-block-component")) {
          current = current.nextElementSibling;
          continue;
        }
        current.querySelectorAll(".deep-dive-child-button").forEach((btn) => btn.remove());
        current = current.nextElementSibling;
      }
    } else if (target.type === "list") {
      target.element.querySelectorAll(".deep-dive-child-button").forEach((btn) => btn.remove());
    }
  }
  async function showTemplatePopup(button, target) {
    hideTemplatePopup();
    const result2 = await new Promise((resolve) => {
      chrome.storage.sync.get(
        ["deepDiveModes", "currentDeepDiveModeId", "deepDiveRecentModes"],
        resolve
      );
    });
    const modes = result2.deepDiveModes && result2.deepDiveModes.length > 0 ? result2.deepDiveModes : DEFAULT_DEEP_DIVE_MODES;
    const recentIds = result2.deepDiveRecentModes || [];
    const sorted = [...modes].sort((a, b) => {
      const ai = recentIds.indexOf(a.id);
      const bi = recentIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    const popup = document.createElement("div");
    popup.className = "deep-dive-template-popup";
    popup.id = "deep-dive-template-popup";
    popup.setAttribute("role", "menu");
    const makeItem = (label, hint, onClick) => {
      const item = document.createElement("button");
      item.className = "deep-dive-template-item";
      item.setAttribute("role", "menuitem");
      item.textContent = label;
      if (hint) item.title = hint;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideTemplatePopup();
        onClick();
      });
      return item;
    };
    sorted.forEach((mode) => {
      popup.appendChild(
        makeItem(mode.id, mode.prompt || "", () => doInsertQuery(target, mode))
      );
    });
    document.body.appendChild(popup);
    const rect = button.getBoundingClientRect();
    const popupW = 160;
    let left = rect.left + window.scrollX;
    if (left + popupW > window.innerWidth - 8) {
      left = window.innerWidth - popupW - 8;
    }
    popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
    popup.style.left = `${left}px`;
    const items = Array.from(
      popup.querySelectorAll(".deep-dive-template-item")
    );
    let focusIndex = 0;
    items[0]?.focus();
    popup.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "ArrowLeft") {
        e.preventDefault();
        hideTemplatePopup();
        button.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusIndex = (focusIndex + 1) % items.length;
        items[focusIndex].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusIndex = (focusIndex - 1 + items.length) % items.length;
        items[focusIndex].focus();
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          focusIndex = (focusIndex - 1 + items.length) % items.length;
        } else {
          focusIndex = (focusIndex + 1) % items.length;
        }
        items[focusIndex].focus();
      }
    });
    setTimeout(() => {
      document.addEventListener("click", hideTemplatePopup, { once: true });
    }, 0);
  }
  function hideTemplatePopup() {
    document.getElementById("deep-dive-template-popup")?.remove();
  }
  function writeToTextarea(query, autoSend) {
    const textarea = document.querySelector(
      'div[contenteditable="true"][role="textbox"]'
    );
    if (!textarea) return;
    while (textarea.firstChild) textarea.removeChild(textarea.firstChild);
    query.split("\n").forEach((line) => {
      const p = document.createElement("p");
      if (line.trim() === "") {
        p.appendChild(document.createElement("br"));
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
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    if (autoSend) {
      setTimeout(() => {
        const sendButton = document.querySelector(
          'button[aria-label*="送信"], button[aria-label*="Send"]'
        );
        if (sendButton && !sendButton.disabled) sendButton.click();
      }, 100);
    }
  }
  function doInsertQuery(target, mode) {
    const content2 = target.getContent();
    const quotedContent = content2.split("\n").map((line) => `> ${line}`).join("\n");
    const query = quotedContent + "\n\n" + (mode.prompt || "これについて詳しく");
    writeToTextarea(query, true);
    chrome.storage.sync.get(["deepDiveRecentModes"], (r) => {
      const recent = (r.deepDiveRecentModes || []).filter(
        (id) => id !== mode.id
      );
      recent.unshift(mode.id);
      chrome.storage.sync.set({ deepDiveRecentModes: recent.slice(0, 20) });
    });
  }
  async function insertDeepDiveQuery(target, quoteOnly = false) {
    if (!document.querySelector('div[contenteditable="true"][role="textbox"]')) return;
    const content2 = target.getContent();
    const quotedContent = content2.split("\n").map((line) => `> ${line}`).join("\n");
    let query;
    let shouldAutoSend = false;
    if (quoteOnly) {
      query = quotedContent + "\n\n";
    } else {
      const result2 = await new Promise((resolve) => {
        chrome.storage.sync.get(
          ["deepDiveModes", "currentDeepDiveModeId"],
          resolve
        );
      });
      const modes = result2.deepDiveModes && result2.deepDiveModes.length > 0 ? result2.deepDiveModes : DEFAULT_DEEP_DIVE_MODES;
      const urlParams = new URLSearchParams(location.search);
      const urlModeId = urlParams.get("mode_id");
      let modeId = urlModeId || result2.currentDeepDiveModeId || modes[0]?.id;
      if (!modes.some((m) => m.id === modeId)) modeId = modes[0]?.id;
      const mode = modes.find((m) => m.id === modeId) || modes[0] || DEFAULT_DEEP_DIVE_MODES[0];
      query = quotedContent + "\n\n" + (mode.prompt || "これについて詳しく");
      shouldAutoSend = true;
    }
    writeToTextarea(query, shouldAutoSend);
  }
  function addDeepDiveStyles() {
    const styleId = "gemini-deep-dive-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
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
    blockquote[data-path-to-node] {
      padding-top: 40px;
    }
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
    .deep-dive-template-popup {
      position: absolute;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      min-width: 160px;
      padding: 4px 0;
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      outline: none;
    }
    .deep-dive-template-item {
      display: block;
      width: 100%;
      padding: 7px 14px;
      border: none;
      background: transparent;
      text-align: left;
      font-size: 13px;
      color: #3c4043;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .deep-dive-template-item:hover,
    .deep-dive-template-item:focus {
      background: #f1f3f4;
      color: #1a73e8;
      outline: none;
    }
  `;
    document.head.appendChild(style);
  }
  function injectModeSelector() {
    const existing = document.getElementById("gemini-deep-dive-mode-selector");
    if (existing) existing.remove();
    chrome.storage.sync.get(
      ["deepDiveModes", "currentDeepDiveModeId"],
      (r) => {
        const modes = r.deepDiveModes && r.deepDiveModes.length > 0 ? r.deepDiveModes : DEFAULT_DEEP_DIVE_MODES;
        const wrapper = document.createElement("div");
        wrapper.id = "gemini-deep-dive-mode-selector";
        wrapper.className = "gemini-deep-dive-mode-selector";
        const select = document.createElement("select");
        select.id = "gemini-deep-dive-mode";
        select.title = "深掘りモード";
        select.setAttribute("aria-label", "深掘りモード");
        modes.forEach((mode) => {
          const option = document.createElement("option");
          option.value = mode.id;
          option.textContent = mode.id;
          select.appendChild(option);
        });
        select.addEventListener("change", () => {
          chrome.storage.sync.set({ currentDeepDiveModeId: select.value });
        });
        wrapper.appendChild(select);
        const addButton = document.querySelector(
          'button[aria-label*="ファイル"], button[aria-label*="追加"]'
        );
        const toolsButton = document.querySelector(
          'button[aria-label*="ツール"], button[aria-label*="Tool"]'
        );
        const insertAfter = toolsButton || addButton && addButton.nextElementSibling;
        if (insertAfter && insertAfter.parentElement) {
          insertAfter.parentElement.insertBefore(wrapper, insertAfter.nextSibling);
        } else {
          const inputArea = document.querySelector(
            'div[contenteditable="true"][role="textbox"]'
          );
          if (inputArea) {
            const parent = inputArea.closest("form") || inputArea.parentElement?.parentElement;
            if (parent) {
              parent.insertBefore(wrapper, parent.firstChild);
            } else {
              document.body.appendChild(wrapper);
            }
          } else {
            document.body.appendChild(wrapper);
          }
        }
        const urlParams = new URLSearchParams(location.search);
        const urlModeId = urlParams.get("mode_id");
        let modeId = r.currentDeepDiveModeId;
        if (urlModeId && modes.some((m) => m.id === urlModeId)) {
          modeId = urlModeId;
          chrome.storage.sync.set({ currentDeepDiveModeId: urlModeId });
        }
        if (modeId && modes.some((m) => m.id === modeId)) {
          select.value = modeId;
        } else if (modes.length > 0) {
          select.value = modes[0].id;
        }
      }
    );
  }
  let deepDiveTimer = null;
  function initializeDeepDive() {
    addDeepDiveStyles();
    const tryInjectModeSelector = () => {
      const hasButtons = document.querySelector(
        'button[aria-label*="ツール"], button[aria-label*="Tool"], button[aria-label*="ファイル"], button[aria-label*="追加"]'
      );
      if (hasButtons || document.querySelector('div[contenteditable="true"][role="textbox"]')) {
        injectModeSelector();
      } else {
        setTimeout(tryInjectModeSelector, 500);
      }
    };
    tryInjectModeSelector();
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.deepDiveModes && location.href.includes("gemini.google.com") && document.querySelector(
        'button[aria-label*="ツール"], button[aria-label*="Tool"], div[contenteditable="true"][role="textbox"]'
      )) {
        injectModeSelector();
      }
    });
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              const el = node;
              if (el.matches?.("[data-path-to-node]") || el.querySelector?.("[data-path-to-node]")) {
                shouldUpdate = true;
                break;
              }
            }
          }
        }
        if (shouldUpdate) break;
      }
      if (shouldUpdate) {
        if (deepDiveTimer) clearTimeout(deepDiveTimer);
        deepDiveTimer = setTimeout(() => addDeepDiveButtons(), 500);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => addDeepDiveButtons(), 1e3);
  }
  let mapMode = false;
  const MAP_PANEL_ID = "gemini-map-panel";
  const MAP_STYLE_ID = "gemini-map-styles";
  function injectMapStyles() {
    if (document.getElementById(MAP_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = MAP_STYLE_ID;
    style.textContent = `
    #gemini-map-panel {
      position: fixed;
      right: 16px;
      top: 60px;
      bottom: 16px;
      width: 240px;
      background: rgba(248, 249, 250, 0.95);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
      overflow-y: auto;
      z-index: 100;
      padding: 6px 4px;
      font-family: inherit;
      backdrop-filter: blur(8px);
    }
    .dark-theme #gemini-map-panel {
      background: rgba(32, 33, 36, 0.95);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    }
    #gemini-map-panel .map-header {
      display: none;
    }
    #gemini-map-panel ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    #gemini-map-panel li button {
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-left: 2px solid transparent;
      border-radius: 0 6px 6px 0;
      padding: 5px 10px 5px 8px;
      margin: 1px 0;
      cursor: pointer;
      font-size: 15px;
      line-height: 1.35;
      color: inherit;
      font-family: inherit;
      word-break: break-word;
      opacity: 0.5;
      transition: background 0.15s, opacity 0.15s, border-color 0.15s;
    }
    #gemini-map-panel li button:hover {
      background: rgba(128, 128, 128, 0.12);
      opacity: 0.85;
    }
    #gemini-map-panel li button.map-item-current {
      opacity: 1;
      background: rgba(26, 115, 232, 0.08);
      border-left-color: #1a73e8;
    }
    #gemini-map-panel li button .map-turn-index {
      display: inline-block;
      min-width: 18px;
      font-size: 10px;
      opacity: 0.5;
      margin-right: 3px;
    }
  `;
    document.head.appendChild(style);
  }
  function getPromptText(userQuery) {
    const heading = userQuery.querySelector('h1, h2, h3, [role="heading"]');
    let text = heading?.textContent?.trim() || userQuery.textContent?.trim() || "";
    text = text.replace(/^あなたのプロンプト\s*/, "");
    text = text.replace(/^>\s*/, "");
    return text.substring(0, 60) || "(空)";
  }
  function getConversationContainers() {
    return Array.from(
      document.querySelectorAll(
        "infinite-scroller.chat-history > .conversation-container"
      )
    );
  }
  function buildMapPanel() {
    const panel = document.createElement("div");
    panel.id = MAP_PANEL_ID;
    const header = document.createElement("div");
    header.className = "map-header";
    header.textContent = "このチャットの流れ";
    panel.appendChild(header);
    const containers = getConversationContainers();
    if (containers.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding: 10px; opacity: 0.45; font-size: 12px;";
      empty.textContent = "チャットがまだありません";
      panel.appendChild(empty);
      return panel;
    }
    const list = document.createElement("ul");
    containers.forEach((container, index) => {
      const userQuery = container.querySelector("user-query");
      if (!userQuery) return;
      const promptText = getPromptText(userQuery);
      const li = document.createElement("li");
      const btn = document.createElement("button");
      const indexSpan = document.createElement("span");
      indexSpan.className = "map-turn-index";
      indexSpan.textContent = `${index + 1}.`;
      btn.appendChild(indexSpan);
      btn.appendChild(document.createTextNode(promptText));
      btn.addEventListener("click", () => {
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    panel.appendChild(list);
    return panel;
  }
  function getMapButtons() {
    const panel = document.getElementById(MAP_PANEL_ID);
    if (!panel) return [];
    return Array.from(panel.querySelectorAll("li button"));
  }
  let intersectionObserver = null;
  const visibleTurns = /* @__PURE__ */ new Set();
  function setupIntersectionObserver() {
    if (intersectionObserver) intersectionObserver.disconnect();
    visibleTurns.clear();
    const containers = getConversationContainers();
    if (containers.length === 0) return;
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = containers.indexOf(entry.target);
          if (index === -1) return;
          if (entry.isIntersecting) {
            visibleTurns.add(index);
          } else {
            visibleTurns.delete(index);
          }
        });
        const buttons = getMapButtons();
        buttons.forEach((btn, i) => {
          btn.classList.toggle("map-item-current", visibleTurns.has(i));
        });
        const panel = document.getElementById(MAP_PANEL_ID);
        if (panel) {
          const firstHighlighted = buttons.find((_, i) => visibleTurns.has(i));
          if (firstHighlighted) {
            firstHighlighted.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      },
      { threshold: 0.15 }
    );
    containers.forEach((c) => intersectionObserver.observe(c));
  }
  function stopIntersectionObserver() {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    visibleTurns.clear();
  }
  let chatObserver = null;
  function startChatObserver() {
    if (chatObserver) chatObserver.disconnect();
    const chatHistory = document.querySelector("infinite-scroller.chat-history");
    if (!chatHistory) return;
    let debounceTimer = null;
    chatObserver = new MutationObserver(() => {
      if (!mapMode) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshMap(), 300);
    });
    chatObserver.observe(chatHistory, { childList: true, subtree: false });
  }
  function stopChatObserver() {
    if (chatObserver) {
      chatObserver.disconnect();
      chatObserver = null;
    }
  }
  function refreshMap() {
    if (!mapMode) return;
    const existing = document.getElementById(MAP_PANEL_ID);
    const savedScroll = existing ? existing.scrollTop : 0;
    if (existing) existing.remove();
    stopIntersectionObserver();
    const panel = buildMapPanel();
    document.body.appendChild(panel);
    panel.scrollTop = savedScroll;
    setupIntersectionObserver();
  }
  function showMap() {
    injectMapStyles();
    const existing = document.getElementById(MAP_PANEL_ID);
    if (existing) existing.remove();
    const panel = buildMapPanel();
    document.body.appendChild(panel);
    mapMode = true;
    setupIntersectionObserver();
    startChatObserver();
  }
  function resetMapMode() {
    stopChatObserver();
    stopIntersectionObserver();
    const panel = document.getElementById(MAP_PANEL_ID);
    if (panel) panel.remove();
    mapMode = false;
  }
  class DOMAnalyzer {
    constructor() {
      this.elementSelectors = {
        textarea: [
          '[role="textbox"][contenteditable="true"]',
          '[aria-label*="プロンプト"]',
          ".ql-editor.textarea",
          'rich-textarea [contenteditable="true"]'
        ],
        sidebar: [
          '[role="navigation"]',
          "bard-sidenav",
          ".side-nav-container",
          "aside"
        ],
        sidebarToggle: [
          'button[aria-label*="メインメニュー"]',
          'button[aria-label*="Main menu"]',
          'button[data-test-id="side-nav-menu-button"]'
        ],
        chatHistory: [
          '.conversation[role="button"]',
          '[data-test-id="conversation"]',
          ".conversation-items-container .conversation"
        ],
        newChatButton: [
          'a[href="https://gemini.google.com/app"]',
          'a[aria-label*="新規作成"]',
          '[data-test-id="new-chat-button"]'
        ],
        copyButtons: [
          'button[aria-label*="コピー"]',
          'button[aria-label*="Copy"]',
          ".copy-button"
        ],
        chatContainer: [
          "chat-window",
          "main.main",
          ".conversation-container"
        ]
      };
    }
    findElement(type) {
      const selectors = this.elementSelectors[type] || [];
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element) return { element, selector };
        } catch {
        }
      }
      return { element: null, selector: null };
    }
    findAllElements() {
      const result2 = {};
      for (const type in this.elementSelectors) {
        result2[type] = this.findElement(type);
      }
      return result2;
    }
    capturePageStructure() {
      return {
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
        elements: this.findAllElements(),
        interactiveElements: this.getInteractiveElements(),
        metadata: {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollPosition: { x: window.scrollX, y: window.scrollY }
        }
      };
    }
    getInteractiveElements() {
      const elements = [];
      const selector = 'button, a, input, textarea, [role="button"], [contenteditable="true"]';
      const interactives = document.querySelectorAll(selector);
      interactives.forEach((el, index) => {
        if (index >= 50) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        elements.push({
          index,
          type: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          text: el.textContent?.trim().substring(0, 50) || "",
          description: el.getAttribute("description") || "",
          isVisible: rect.width > 0 && rect.height > 0,
          position: { x: Math.round(rect.x), y: Math.round(rect.y) }
        });
      });
      return elements;
    }
    exportForAI() {
      const structure = this.capturePageStructure();
      let output = `## Gemini Chat Page Structure

`;
      output += `**URL**: ${structure.url}
`;
      output += `**Title**: ${structure.title}

`;
      output += `### Main Elements

`;
      for (const [type, data] of Object.entries(structure.elements)) {
        if (data.element) {
          output += `- **${type}**: \`${data.selector}\` ✓
`;
        } else {
          output += `- **${type}**: Not found ✗
`;
        }
      }
      output += `
### Interactive Elements (${structure.interactiveElements.length})

`;
      structure.interactiveElements.slice(0, 10).forEach((el) => {
        if (el.text) {
          output += `- [${el.type}] ${el.text} (${el.ariaLabel || el.role})
`;
        }
      });
      return output;
    }
    async copyToClipboard() {
      const text = this.exportForAI();
      try {
        await navigator.clipboard.writeText(text);
        this.showNotification("ページ構造をクリップボードにコピーしました");
        return true;
      } catch {
        this.showNotification("コピーに失敗しました", "error");
        return false;
      }
    }
    showNotification(message, type = "success") {
      const notification = document.createElement("div");
      notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === "error" ? "#f44336" : "#4CAF50"};
      color: white;
      padding: 16px 24px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease-out;
    `;
      notification.textContent = message;
      const style = document.createElement("style");
      style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
      document.head.appendChild(style);
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.style.transition = "opacity 0.3s";
        notification.style.opacity = "0";
        setTimeout(() => notification.remove(), 300);
      }, 3e3);
    }
  }
  function initializeDOMAnalyzer() {
    window.domAnalyzer = new DOMAnalyzer();
    window.analyzePage = () => {
      console.log(window.domAnalyzer.capturePageStructure());
    };
    window.copyPageStructure = () => {
      window.domAnalyzer.copyToClipboard();
    };
  }
  const definition = defineContentScript({
    matches: [
      "https://gemini.google.com/app*",
      "https://gemini.google.com/search*"
    ],
    runAt: "document_end",
    main() {
      window.rememberActionButtonPosition = rememberActionButtonPosition;
      initializeDOMAnalyzer();
      initialize();
    }
  });
  function applyCustomStyles() {
    const styleId = "gemini-improve-ui-custom-styles";
    document.getElementById(styleId)?.remove();
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
    .gems-list-container {
      display: none !important;
    }
    .side-nav-entry-container {
      display: none !important;
    }
    chat-window {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
    .conversation-container {
      max-width: var(--chat-max-width, 900px) !important;
      margin-left: 0 !important;
      margin-right: auto !important;
    }
  `;
    document.head.appendChild(style);
  }
  function updateChatWidth(width) {
    document.documentElement.style.setProperty("--chat-max-width", `${width}px`);
  }
  function loadChatWidth() {
    chrome.storage.sync.get(["chatWidth"], (result2) => {
      updateChatWidth(result2.chatWidth || 900);
    });
  }
  function initialize() {
    loadChatWidth();
    applyCustomStyles();
    window.addEventListener("popstate", () => {
      exitHistorySelectionMode();
    });
    let lastUrl = location.href;
    new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        window.rememberActionButtonPosition?.(-1);
        resetMapMode();
        setTimeout(() => {
          initializeAutocomplete();
          initializeSearchAutocomplete();
          if (!isSearchPage()) {
            showMap();
            initializeQuickPrompts();
          }
          document.getElementById("gemini-export-note-button")?.remove();
          initializeExport();
        }, 1500);
      }
    }).observe(document, { subtree: true, childList: true });
    initializeKeyboardHandlers();
    if (isSearchPage()) {
      initializeSearchPage();
      initializeSearchAutocomplete();
    } else {
      initializeChatPage();
      initializeDeepDive();
      initializeQuickPrompts();
      setTimeout(() => {
        initializeExport();
      }, 1500);
      setTimeout(() => {
        showMap();
      }, 1500);
    }
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.chatWidth) {
        updateChatWidth(changes.chatWidth.newValue);
        applyCustomStyles();
      }
    });
  }
  function print$1(method, ...args) {
    if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
    else method("[wxt]", ...args);
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  const browser$1 = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  var WxtLocationChangeEvent = class WxtLocationChangeEvent2 extends Event {
    static EVENT_NAME = getUniqueEventName("wxt:locationchange");
    constructor(newUrl, oldUrl) {
      super(WxtLocationChangeEvent2.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
  };
  function getUniqueEventName(eventName) {
    return `${browser?.runtime?.id}:${"content"}:${eventName}`;
  }
  const supportsNavigationApi = typeof globalThis.navigation?.addEventListener === "function";
  function createLocationWatcher(ctx) {
    let lastUrl;
    let watching = false;
    return { run() {
      if (watching) return;
      watching = true;
      lastUrl = new URL(location.href);
      if (supportsNavigationApi) globalThis.navigation.addEventListener("navigate", (event) => {
        const newUrl = new URL(event.destination.url);
        if (newUrl.href === lastUrl.href) return;
        window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
        lastUrl = newUrl;
      }, { signal: ctx.signal });
      else ctx.setInterval(() => {
        const newUrl = new URL(location.href);
        if (newUrl.href !== lastUrl.href) {
          window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
          lastUrl = newUrl;
        }
      }, 1e3);
    } };
  }
  var ContentScriptContext = class ContentScriptContext2 {
    static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName("wxt:content-script-started");
    id;
    abortController;
    locationWatcher = createLocationWatcher(this);
    constructor(contentScriptName, options) {
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.id = Math.random().toString(36).slice(2);
      this.abortController = new AbortController();
      this.stopOldScripts();
      this.listenForNewerScripts();
    }
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime?.id == null) this.notifyInvalidated();
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
    * Add a listener that is called when the content script's context is invalidated.
    *
    * @returns A function to remove the listener.
    *
    * @example
    * browser.runtime.onMessage.addListener(cb);
    * const removeInvalidatedListener = ctx.onInvalidated(() => {
    *   browser.runtime.onMessage.removeListener(cb);
    * })
    * // ...
    * removeInvalidatedListener();
    */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
    * Return a promise that never resolves. Useful if you have an async function that shouldn't run
    * after the context is expired.
    *
    * @example
    * const getValueFromStorage = async () => {
    *   if (ctx.isInvalid) return ctx.block();
    *
    *   // ...
    * }
    */
    block() {
      return new Promise(() => {
      });
    }
    /**
    * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
    *
    * Intervals can be cleared by calling the normal `clearInterval` function.
    */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
    * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
    *
    * Timeouts can be cleared by calling the normal `setTimeout` function.
    */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
    * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
    * invalidated.
    *
    * Callbacks can be canceled by calling the normal `cancelAnimationFrame` function.
    */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
    * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
    * invalidated.
    *
    * Callbacks can be canceled by calling the normal `cancelIdleCallback` function.
    */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      target.addEventListener?.(type.startsWith("wxt:") ? getUniqueEventName(type) : type, handler, {
        ...options,
        signal: this.signal
      });
    }
    /**
    * @internal
    * Abort the abort controller and execute all `onInvalidated` listeners.
    */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(`Content script "${this.contentScriptName}" context invalidated`);
    }
    stopOldScripts() {
      document.dispatchEvent(new CustomEvent(ContentScriptContext2.SCRIPT_STARTED_MESSAGE_TYPE, { detail: {
        contentScriptName: this.contentScriptName,
        messageId: this.id
      } }));
      window.postMessage({
        type: ContentScriptContext2.SCRIPT_STARTED_MESSAGE_TYPE,
        contentScriptName: this.contentScriptName,
        messageId: this.id
      }, "*");
    }
    verifyScriptStartedEvent(event) {
      const isSameContentScript = event.detail?.contentScriptName === this.contentScriptName;
      const isFromSelf = event.detail?.messageId === this.id;
      return isSameContentScript && !isFromSelf;
    }
    listenForNewerScripts() {
      const cb = (event) => {
        if (!(event instanceof CustomEvent) || !this.verifyScriptStartedEvent(event)) return;
        this.notifyInvalidated();
      };
      document.addEventListener(ContentScriptContext2.SCRIPT_STARTED_MESSAGE_TYPE, cb);
      this.onInvalidated(() => document.removeEventListener(ContentScriptContext2.SCRIPT_STARTED_MESSAGE_TYPE, cb));
    }
  };
  function initPlugins() {
  }
  function print(method, ...args) {
    if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
    else method("[wxt]", ...args);
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      return await main(new ContentScriptContext("content", options));
    } catch (err) {
      logger.error(`The content script "${"content"}" crashed on startup!`, err);
      throw err;
    }
  })();
  return result;
})();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvc2V0dGluZ3MudHMiLCIuLi8uLi8uLi9zcmMvYXV0b2NvbXBsZXRlLnRzIiwiLi4vLi4vLi4vc3JjL2NoYXQudHMiLCIuLi8uLi8uLi9zcmMvaGlzdG9yeS50cyIsIi4uLy4uLy4uL3NyYy9zZWFyY2gudHMiLCIuLi8uLi8uLi9zcmMvZXhwb3J0LnRzIiwiLi4vLi4vLi4vc3JjL3F1aWNrLXByb21wdHMudHMiLCIuLi8uLi8uLi9zcmMva2V5Ym9hcmQudHMiLCIuLi8uLi8uLi9zcmMvZGVlcC1kaXZlLnRzIiwiLi4vLi4vLi4vc3JjL21hcC50cyIsIi4uLy4uLy4uL3NyYy9kb20tYW5hbHl6ZXIudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50L2luZGV4LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWNvbnRlbnQtc2NyaXB0LnRzXG5mdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcblx0cmV0dXJuIGRlZmluaXRpb247XG59XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgZGVmaW5lQ29udGVudFNjcmlwdCB9OyIsIi8vIFNldHRpbmdzIG1hbmFnZW1lbnRcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfREVFUF9ESVZFX1BST01QVCA9ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nO1xuXG5sZXQgZGVlcERpdmVQcm9tcHQgPSBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkRGVlcERpdmVQcm9tcHQoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydkZWVwRGl2ZVByb21wdCddLCAocmVzdWx0KSA9PiB7XG4gICAgICBpZiAocmVzdWx0LmRlZXBEaXZlUHJvbXB0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZGVlcERpdmVQcm9tcHQgPSByZXN1bHQuZGVlcERpdmVQcm9tcHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWVwRGl2ZVByb21wdCA9IERFRkFVTFRfREVFUF9ESVZFX1BST01QVDtcbiAgICAgIH1cbiAgICAgIHJlc29sdmUoZGVlcERpdmVQcm9tcHQpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZXBEaXZlUHJvbXB0KCk6IHN0cmluZyB7XG4gIHJldHVybiBkZWVwRGl2ZVByb21wdCB8fCBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hvcnRjdXRzIHtcbiAgY2hhdDoge1xuICAgIGZvY3VzUXVpY2tQcm9tcHQ6IHN0cmluZztcbiAgICB0b2dnbGVTaWRlYmFyOiBzdHJpbmc7XG4gICAgdG9nZ2xlSGlzdG9yeU1vZGU6IHN0cmluZztcbiAgICBzY3JvbGxVcDogc3RyaW5nO1xuICAgIHNjcm9sbERvd246IHN0cmluZztcbiAgICBoaXN0b3J5VXA6IHN0cmluZztcbiAgICBoaXN0b3J5RG93bjogc3RyaW5nO1xuICAgIGhpc3RvcnlPcGVuOiBzdHJpbmc7XG4gICAgaGlzdG9yeUV4aXQ6IHN0cmluZztcbiAgfTtcbiAgc2VhcmNoOiB7XG4gICAgbW92ZVVwOiBzdHJpbmc7XG4gICAgbW92ZURvd246IHN0cmluZztcbiAgICBvcGVuUmVzdWx0OiBzdHJpbmc7XG4gICAgc2Nyb2xsVXA6IHN0cmluZztcbiAgICBzY3JvbGxEb3duOiBzdHJpbmc7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NIT1JUQ1VUUzogU2hvcnRjdXRzID0ge1xuICBjaGF0OiB7XG4gICAgZm9jdXNRdWlja1Byb21wdDogJ0luc2VydCcsXG4gICAgdG9nZ2xlU2lkZWJhcjogJ0RlbGV0ZScsXG4gICAgdG9nZ2xlSGlzdG9yeU1vZGU6ICdFbmQnLFxuICAgIHNjcm9sbFVwOiAnUGFnZVVwJyxcbiAgICBzY3JvbGxEb3duOiAnUGFnZURvd24nLFxuICAgIGhpc3RvcnlVcDogJ0Fycm93VXAnLFxuICAgIGhpc3RvcnlEb3duOiAnQXJyb3dEb3duJyxcbiAgICBoaXN0b3J5T3BlbjogJ0VudGVyJyxcbiAgICBoaXN0b3J5RXhpdDogJ0VzY2FwZScsXG4gIH0sXG4gIHNlYXJjaDoge1xuICAgIG1vdmVVcDogJ0Fycm93VXAnLFxuICAgIG1vdmVEb3duOiAnQXJyb3dEb3duJyxcbiAgICBvcGVuUmVzdWx0OiAnRW50ZXInLFxuICAgIHNjcm9sbFVwOiAnUGFnZVVwJyxcbiAgICBzY3JvbGxEb3duOiAnUGFnZURvd24nLFxuICB9LFxufTtcblxubGV0IGN1cnJlbnRTaG9ydGN1dHM6IFNob3J0Y3V0cyB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFNob3J0Y3V0cygpOiBQcm9taXNlPFNob3J0Y3V0cz4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChbJ3Nob3J0Y3V0cyddLCAocmVzdWx0KSA9PiB7XG4gICAgICBpZiAocmVzdWx0LnNob3J0Y3V0cykge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gcmVzdWx0LnNob3J0Y3V0cztcbiAgICAgICAgbWlncmF0ZVNob3J0Y3V0cyhjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX1NIT1JUQ1VUUykpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBtaWdyYXRlU2hvcnRjdXRzKHNob3J0Y3V0czogU2hvcnRjdXRzKTogdm9pZCB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IGNoYXQgPSBzaG9ydGN1dHMuY2hhdCBhcyBhbnk7XG4gIGlmIChjaGF0Lm5hdmlnYXRlVG9TZWFyY2ggJiYgIWNoYXQuZm9jdXNRdWlja1Byb21wdCkge1xuICAgIGNoYXQuZm9jdXNRdWlja1Byb21wdCA9IGNoYXQubmF2aWdhdGVUb1NlYXJjaDtcbiAgICBkZWxldGUgY2hhdC5uYXZpZ2F0ZVRvU2VhcmNoO1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgc2hvcnRjdXRzIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU2hvcnRjdXRzKHNob3J0Y3V0czogU2hvcnRjdXRzKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgc2hvcnRjdXRzIH0sICgpID0+IHtcbiAgICAgIGN1cnJlbnRTaG9ydGN1dHMgPSBzaG9ydGN1dHM7XG4gICAgICByZXNvbHZlKCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2hvcnRjdXRzKCk6IFNob3J0Y3V0cyB7XG4gIHJldHVybiBjdXJyZW50U2hvcnRjdXRzIHx8IERFRkFVTFRfU0hPUlRDVVRTO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRTaG9ydGN1dHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBzYXZlU2hvcnRjdXRzKEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoREVGQVVMVF9TSE9SVENVVFMpKSk7XG59XG5cbnR5cGUgU2hvcnRjdXRLZXkgPSBzdHJpbmc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Nob3J0Y3V0KGV2ZW50OiBLZXlib2FyZEV2ZW50LCBzaG9ydGN1dEtleTogU2hvcnRjdXRLZXkpOiBib29sZWFuIHtcbiAgY29uc3Qgc2hvcnRjdXRzID0gZ2V0U2hvcnRjdXRzKCk7XG4gIGNvbnN0IGtleXMgPSBzaG9ydGN1dEtleS5zcGxpdCgnLicpO1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICBsZXQgc2hvcnRjdXQ6IGFueSA9IHNob3J0Y3V0cztcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIHNob3J0Y3V0ID0gc2hvcnRjdXRba2V5XTtcbiAgICBpZiAoIXNob3J0Y3V0KSByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAodHlwZW9mIHNob3J0Y3V0ID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG1ldGFNYXRjaCA9IHNob3J0Y3V0Lm1ldGEgPyBldmVudC5tZXRhS2V5IDogIWV2ZW50Lm1ldGFLZXk7XG4gICAgY29uc3QgY3RybE1hdGNoID0gc2hvcnRjdXQuY3RybCA/IGV2ZW50LmN0cmxLZXkgOiAhZXZlbnQuY3RybEtleTtcbiAgICBjb25zdCBzaGlmdE1hdGNoID0gc2hvcnRjdXQuc2hpZnQgPyBldmVudC5zaGlmdEtleSA6ICFldmVudC5zaGlmdEtleTtcbiAgICByZXR1cm4gKFxuICAgICAgZXZlbnQuY29kZSA9PT0gc2hvcnRjdXQua2V5ICYmIG1ldGFNYXRjaCAmJiBjdHJsTWF0Y2ggJiYgc2hpZnRNYXRjaFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gKFxuICAgIGV2ZW50LmNvZGUgPT09IHNob3J0Y3V0ICYmXG4gICAgIWV2ZW50LmN0cmxLZXkgJiZcbiAgICAhZXZlbnQubWV0YUtleSAmJlxuICAgICFldmVudC5zaGlmdEtleVxuICApO1xufVxuIiwiLy8gQXV0b2NvbXBsZXRlIGZ1bmN0aW9uYWxpdHkgZm9yIEdlbWluaSBjaGF0IHRleHRhcmVhXG5cbmNvbnN0IFJFVFJZX0RFTEFZID0gNTAwO1xuY29uc3QgREVCT1VOQ0VfREVMQVkgPSAzMDA7XG5jb25zdCBEUk9QRE9XTl9NQVJHSU4gPSAxMDtcbmNvbnN0IElURU1fSEVJR0hUID0gNDA7XG5jb25zdCBNSU5fRFJPUERPV05fSEVJR0hUID0gMTAwO1xuXG5sZXQgYXV0b2NvbXBsZXRlTGlzdDogSFRNTERpdkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzZWxlY3RlZEluZGV4ID0gLTE7XG5sZXQgY3VycmVudFN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xubGV0IGF1dG9jb21wbGV0ZVRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0F1dG9jb21wbGV0ZVZpc2libGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgYXV0b2NvbXBsZXRlTGlzdCAhPT0gbnVsbCAmJlxuICAgIGF1dG9jb21wbGV0ZUxpc3Quc3R5bGUuZGlzcGxheSA9PT0gJ2Jsb2NrJyAmJlxuICAgIGN1cnJlbnRTdWdnZXN0aW9ucy5sZW5ndGggPiAwXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGU6IEV2ZW50KTogdm9pZCB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbn1cblxuZnVuY3Rpb24gbW92ZVNlbGVjdGlvbihkaXJlY3Rpb246ICduZXh0JyB8ICdwcmV2Jyk6IHZvaWQge1xuICBpZiAoZGlyZWN0aW9uID09PSAnbmV4dCcpIHtcbiAgICBzZWxlY3RlZEluZGV4ID1cbiAgICAgIHNlbGVjdGVkSW5kZXggPCAwID8gMCA6IChzZWxlY3RlZEluZGV4ICsgMSkgJSBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdGVkSW5kZXggPVxuICAgICAgc2VsZWN0ZWRJbmRleCA8IDBcbiAgICAgICAgPyBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoIC0gMVxuICAgICAgICA6IHNlbGVjdGVkSW5kZXggPD0gMFxuICAgICAgICAgID8gY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aCAtIDFcbiAgICAgICAgICA6IHNlbGVjdGVkSW5kZXggLSAxO1xuICB9XG4gIHVwZGF0ZVNlbGVjdGVkSXRlbSgpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaEdvb2dsZVN1Z2dlc3Rpb25zKHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGlmICghcXVlcnkgfHwgcXVlcnkudHJpbSgpLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdO1xuICB0cnkge1xuICAgIGNvbnN0IGVuY29kZWRRdWVyeSA9IGVuY29kZVVSSUNvbXBvbmVudChxdWVyeS50cmltKCkpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goXG4gICAgICBgaHR0cHM6Ly93d3cuZ29vZ2xlLmNvLmpwL2NvbXBsZXRlL3NlYXJjaD9vdXRwdXQ9ZmlyZWZveCZobD1qYSZpZT11dGYtOCZvZT11dGYtOCZxPSR7ZW5jb2RlZFF1ZXJ5fWBcbiAgICApO1xuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgcmV0dXJuIGRhdGFbMV0gfHwgW107XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBbXTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBdXRvY29tcGxldGVEcm9wZG93bigpOiBIVE1MRGl2RWxlbWVudCB7XG4gIGlmIChhdXRvY29tcGxldGVMaXN0KSByZXR1cm4gYXV0b2NvbXBsZXRlTGlzdDtcblxuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGxpc3QuY2xhc3NOYW1lID0gJ2dlbWluaS1hdXRvY29tcGxldGUtbGlzdCc7XG4gIGxpc3Quc3R5bGUuY3NzVGV4dCA9IGBcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgYmFja2dyb3VuZDogd2hpdGU7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2RkZDtcbiAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsIDAsIDAsIDAuMTUpO1xuICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgei1pbmRleDogMTAwMDA7XG4gICAgZGlzcGxheTogbm9uZTtcbiAgICBtaW4td2lkdGg6IDMwMHB4O1xuICBgO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxpc3QpO1xuICBhdXRvY29tcGxldGVMaXN0ID0gbGlzdDtcbiAgcmV0dXJuIGxpc3Q7XG59XG5cbmZ1bmN0aW9uIHBvc2l0aW9uRHJvcGRvd24oXG4gIGlucHV0RWxlbWVudDogRWxlbWVudCxcbiAgbGlzdDogSFRNTERpdkVsZW1lbnQsXG4gIHN1Z2dlc3Rpb25zOiBzdHJpbmdbXVxuKTogdm9pZCB7XG4gIGNvbnN0IHJlY3QgPSBpbnB1dEVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGxpc3Quc3R5bGUubGVmdCA9IGAke3JlY3QubGVmdH1weGA7XG4gIGxpc3Quc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcbiAgbGlzdC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblxuICBjb25zdCBzcGFjZUJlbG93ID0gd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5ib3R0b20gLSBEUk9QRE9XTl9NQVJHSU47XG4gIGNvbnN0IHNwYWNlQWJvdmUgPSByZWN0LnRvcCAtIERST1BET1dOX01BUkdJTjtcbiAgY29uc3QgbWF4SXRlbXNCZWxvdyA9IE1hdGguZmxvb3Ioc3BhY2VCZWxvdyAvIElURU1fSEVJR0hUKTtcbiAgY29uc3QgbWF4SXRlbXNBYm92ZSA9IE1hdGguZmxvb3Ioc3BhY2VBYm92ZSAvIElURU1fSEVJR0hUKTtcblxuICBpZiAobWF4SXRlbXNCZWxvdyA8IHN1Z2dlc3Rpb25zLmxlbmd0aCAmJiBtYXhJdGVtc0Fib3ZlID4gbWF4SXRlbXNCZWxvdykge1xuICAgIGxpc3Quc3R5bGUuYm90dG9tID0gYCR7d2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC50b3B9cHhgO1xuICAgIGxpc3Quc3R5bGUudG9wID0gJ2F1dG8nO1xuICAgIGxpc3Quc3R5bGUubWF4SGVpZ2h0ID0gYCR7TWF0aC5tYXgoc3BhY2VBYm92ZSwgTUlOX0RST1BET1dOX0hFSUdIVCl9cHhgO1xuICB9IGVsc2Uge1xuICAgIGxpc3Quc3R5bGUudG9wID0gYCR7cmVjdC5ib3R0b219cHhgO1xuICAgIGxpc3Quc3R5bGUuYm90dG9tID0gJ2F1dG8nO1xuICAgIGxpc3Quc3R5bGUubWF4SGVpZ2h0ID0gYCR7TWF0aC5tYXgoc3BhY2VCZWxvdywgTUlOX0RST1BET1dOX0hFSUdIVCl9cHhgO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNob3dBdXRvY29tcGxldGVTdWdnZXN0aW9ucyhcbiAgaW5wdXRFbGVtZW50OiBIVE1MRWxlbWVudCxcbiAgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdXG4pOiB2b2lkIHtcbiAgaWYgKCFzdWdnZXN0aW9ucyB8fCBzdWdnZXN0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaXN0ID0gY3JlYXRlQXV0b2NvbXBsZXRlRHJvcGRvd24oKTtcbiAgbGlzdC5pbm5lckhUTUwgPSAnJztcbiAgY3VycmVudFN1Z2dlc3Rpb25zID0gc3VnZ2VzdGlvbnM7XG4gIHNlbGVjdGVkSW5kZXggPSAtMTtcblxuICBzdWdnZXN0aW9ucy5mb3JFYWNoKChzdWdnZXN0aW9uLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBpdGVtLmNsYXNzTmFtZSA9ICdnZW1pbmktYXV0b2NvbXBsZXRlLWl0ZW0nO1xuICAgIGl0ZW0udGV4dENvbnRlbnQgPSBzdWdnZXN0aW9uO1xuICAgIGl0ZW0uc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgIHBhZGRpbmc6IDEwcHggMTZweDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZjBmMGYwO1xuICAgIGA7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgc2VsZWN0ZWRJbmRleCA9IGluZGV4O1xuICAgICAgdXBkYXRlU2VsZWN0ZWRJdGVtKCk7XG4gICAgfSk7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIHNlbGVjdFN1Z2dlc3Rpb24oaW5wdXRFbGVtZW50LCBzdWdnZXN0aW9uKTtcbiAgICB9KTtcbiAgICBsaXN0LmFwcGVuZENoaWxkKGl0ZW0pO1xuICB9KTtcblxuICBwb3NpdGlvbkRyb3Bkb3duKGlucHV0RWxlbWVudCwgbGlzdCwgc3VnZ2VzdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk6IHZvaWQge1xuICBpZiAoYXV0b2NvbXBsZXRlTGlzdCkge1xuICAgIGF1dG9jb21wbGV0ZUxpc3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgfVxuICBjdXJyZW50U3VnZ2VzdGlvbnMgPSBbXTtcbiAgc2VsZWN0ZWRJbmRleCA9IC0xO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTZWxlY3RlZEl0ZW0oKTogdm9pZCB7XG4gIGlmICghYXV0b2NvbXBsZXRlTGlzdCkgcmV0dXJuO1xuICBjb25zdCBpdGVtcyA9IGF1dG9jb21wbGV0ZUxpc3QucXVlcnlTZWxlY3RvckFsbCgnLmdlbWluaS1hdXRvY29tcGxldGUtaXRlbScpO1xuICBpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgIChpdGVtIGFzIEhUTUxFbGVtZW50KS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPVxuICAgICAgaW5kZXggPT09IHNlbGVjdGVkSW5kZXggPyAnI2U4ZjBmZScgOiAndHJhbnNwYXJlbnQnO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc2VsZWN0U3VnZ2VzdGlvbihpbnB1dEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzdWdnZXN0aW9uOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKChpbnB1dEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgJiB7IGNvbnRlbnRFZGl0YWJsZTogc3RyaW5nIH0pLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XG4gICAgd2hpbGUgKGlucHV0RWxlbWVudC5maXJzdENoaWxkKSB7XG4gICAgICBpbnB1dEVsZW1lbnQucmVtb3ZlQ2hpbGQoaW5wdXRFbGVtZW50LmZpcnN0Q2hpbGQpO1xuICAgIH1cbiAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgIHAudGV4dENvbnRlbnQgPSBzdWdnZXN0aW9uO1xuICAgIGlucHV0RWxlbWVudC5hcHBlbmRDaGlsZChwKTtcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcbiAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyhpbnB1dEVsZW1lbnQpO1xuICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICB9IGVsc2Uge1xuICAgIChpbnB1dEVsZW1lbnQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBzdWdnZXN0aW9uO1xuICAgIGlucHV0RWxlbWVudC5mb2N1cygpO1xuICAgIChpbnB1dEVsZW1lbnQgYXMgSFRNTElucHV0RWxlbWVudCkuc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICBzdWdnZXN0aW9uLmxlbmd0aCxcbiAgICAgIHN1Z2dlc3Rpb24ubGVuZ3RoXG4gICAgKTtcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgfVxuICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICApO1xuICBpZiAoIXRleHRhcmVhKSB7XG4gICAgc2V0VGltZW91dChpbml0aWFsaXplQXV0b2NvbXBsZXRlLCBSRVRSWV9ERUxBWSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGV4dGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAna2V5ZG93bicsXG4gICAgYXN5bmMgKGUpID0+IHtcbiAgICAgIGlmICghZS5pc1RydXN0ZWQgfHwgZS5pc0NvbXBvc2luZykgcmV0dXJuO1xuXG4gICAgICBpZiAoZS5tZXRhS2V5ICYmIGUuY29kZSA9PT0gJ1NwYWNlJykge1xuICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgY29uc3QgdGV4dCA9IHRleHRhcmVhLnRleHRDb250ZW50IHx8ICcnO1xuICAgICAgICBjb25zdCB0cmltbWVkVGV4dCA9IHRleHQudHJpbSgpO1xuICAgICAgICBpZiAodHJpbW1lZFRleHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gYXdhaXQgZmV0Y2hHb29nbGVTdWdnZXN0aW9ucyh0cmltbWVkVGV4dCk7XG4gICAgICAgIHNob3dBdXRvY29tcGxldGVTdWdnZXN0aW9ucyh0ZXh0YXJlYSwgc3VnZ2VzdGlvbnMpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHJldHVybjtcblxuICAgICAgaWYgKGUua2V5ID09PSAnVGFiJyB8fCBlLmtleSA9PT0gJ0Fycm93RG93bicpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIG1vdmVTZWxlY3Rpb24oJ25leHQnKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd1VwJykge1xuICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgbW92ZVNlbGVjdGlvbigncHJldicpO1xuICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgY29uc3QgaW5kZXhUb1NlbGVjdCA9IHNlbGVjdGVkSW5kZXggPj0gMCA/IHNlbGVjdGVkSW5kZXggOiAwO1xuICAgICAgICBzZWxlY3RTdWdnZXN0aW9uKHRleHRhcmVhLCBjdXJyZW50U3VnZ2VzdGlvbnNbaW5kZXhUb1NlbGVjdF0pO1xuICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHRydWVcbiAgKTtcblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgaWYgKFxuICAgICAgYXV0b2NvbXBsZXRlTGlzdCAmJlxuICAgICAgIWF1dG9jb21wbGV0ZUxpc3QuY29udGFpbnMoZS50YXJnZXQgYXMgTm9kZSkgJiZcbiAgICAgIGUudGFyZ2V0ICE9PSB0ZXh0YXJlYVxuICAgICkge1xuICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUoKTogdm9pZCB7XG4gIGlmICghd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9zZWFyY2gnKSkgcmV0dXJuO1xuXG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3Qgc2VhcmNoSW5wdXRJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihcbiAgICAgICdpbnB1dFtkYXRhLXRlc3QtaWQ9XCJzZWFyY2gtaW5wdXRcIl0nXG4gICAgKSB8fFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihcbiAgICAgICAgJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdW3BsYWNlaG9sZGVyKj1cIuaknOe0olwiXSdcbiAgICAgICkgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdJyk7XG5cbiAgICBpZiAoc2VhcmNoSW5wdXQpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoc2VhcmNoSW5wdXRJbnRlcnZhbCk7XG5cbiAgICAgIHNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgaWYgKCFlLmlzVHJ1c3RlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoYXV0b2NvbXBsZXRlVGltZW91dCkgY2xlYXJUaW1lb3V0KGF1dG9jb21wbGV0ZVRpbWVvdXQpO1xuXG4gICAgICAgIGNvbnN0IHRleHQgPSBzZWFyY2hJbnB1dC52YWx1ZSB8fCAnJztcbiAgICAgICAgY29uc3QgdHJpbW1lZFRleHQgPSB0ZXh0LnRyaW0oKTtcbiAgICAgICAgaWYgKHRyaW1tZWRUZXh0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGF1dG9jb21wbGV0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCBjdXJyZW50VHJpbW1lZCA9IChzZWFyY2hJbnB1dC52YWx1ZSB8fCAnJykudHJpbSgpO1xuICAgICAgICAgIGlmIChjdXJyZW50VHJpbW1lZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IGF3YWl0IGZldGNoR29vZ2xlU3VnZ2VzdGlvbnMoY3VycmVudFRyaW1tZWQpO1xuICAgICAgICAgIHNob3dBdXRvY29tcGxldGVTdWdnZXN0aW9ucyhzZWFyY2hJbnB1dCwgc3VnZ2VzdGlvbnMpO1xuICAgICAgICB9LCBERUJPVU5DRV9ERUxBWSk7XG4gICAgICB9KTtcblxuICAgICAgc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgJ2tleWRvd24nLFxuICAgICAgICAoZSkgPT4ge1xuICAgICAgICAgIGlmICghZS5pc1RydXN0ZWQgfHwgZS5pc0NvbXBvc2luZykgcmV0dXJuO1xuICAgICAgICAgIGlmICghaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHJldHVybjtcblxuICAgICAgICAgIGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgICAgIG1vdmVTZWxlY3Rpb24oJ25leHQnKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICAgICAgbW92ZVNlbGVjdGlvbigncHJldicpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgIGlmIChzZWxlY3RlZEluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgICAgICAgIHNlbGVjdFN1Z2dlc3Rpb24oc2VhcmNoSW5wdXQsIGN1cnJlbnRTdWdnZXN0aW9uc1tzZWxlY3RlZEluZGV4XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcblxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgYXV0b2NvbXBsZXRlTGlzdCAmJlxuICAgICAgICAgICFhdXRvY29tcGxldGVMaXN0LmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpICYmXG4gICAgICAgICAgZS50YXJnZXQgIT09IHNlYXJjaElucHV0XG4gICAgICAgICkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKHNlYXJjaElucHV0SW50ZXJ2YWwpO1xuICAgIH1cbiAgfSwgNTAwKTtcbn1cbiIsIi8vIENoYXQgVUkgZnVuY3Rpb25hbGl0eSAodGV4dGFyZWEsIHNpZGViYXIsIHNjcm9sbGluZywgY29weSBidXR0b25zKVxuXG5pbXBvcnQgeyBpbml0aWFsaXplQXV0b2NvbXBsZXRlIH0gZnJvbSAnLi9hdXRvY29tcGxldGUnO1xuXG5sZXQgY2FjaGVkQ2hhdEFyZWE6IEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjaGF0QXJlYUNhY2hlVGltZSA9IDA7XG5jb25zdCBDSEFUX0FSRUFfQ0FDSEVfRFVSQVRJT04gPSA1MDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdEFyZWEoKTogRWxlbWVudCB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cbiAgaWYgKGNhY2hlZENoYXRBcmVhICYmIG5vdyAtIGNoYXRBcmVhQ2FjaGVUaW1lIDwgQ0hBVF9BUkVBX0NBQ0hFX0RVUkFUSU9OKSB7XG4gICAgcmV0dXJuIGNhY2hlZENoYXRBcmVhO1xuICB9XG5cbiAgY29uc3QgY2hhdEhpc3RvcnkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbmZpbml0ZS1zY3JvbGxlci5jaGF0LWhpc3RvcnknKTtcbiAgaWYgKGNoYXRIaXN0b3J5ICYmIGNoYXRIaXN0b3J5LnNjcm9sbEhlaWdodCA+IGNoYXRIaXN0b3J5LmNsaWVudEhlaWdodCkge1xuICAgIGNhY2hlZENoYXRBcmVhID0gY2hhdEhpc3Rvcnk7XG4gICAgY2hhdEFyZWFDYWNoZVRpbWUgPSBub3c7XG4gICAgcmV0dXJuIGNoYXRIaXN0b3J5O1xuICB9XG5cbiAgaWYgKFxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxIZWlnaHQgPlxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHRcbiAgKSB7XG4gICAgY2FjaGVkQ2hhdEFyZWEgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgY2hhdEFyZWFDYWNoZVRpbWUgPSBub3c7XG4gICAgcmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgfVxuXG4gIGNvbnN0IHNlbGVjdG9ycyA9IFtcbiAgICAnaW5maW5pdGUtc2Nyb2xsZXInLFxuICAgICdtYWluW2NsYXNzKj1cIm1haW5cIl0nLFxuICAgICcuY29udmVyc2F0aW9uLWNvbnRhaW5lcicsXG4gICAgJ1tjbGFzcyo9XCJjaGF0LWhpc3RvcnlcIl0nLFxuICAgICdbY2xhc3MqPVwibWVzc2FnZXNcIl0nLFxuICAgICdtYWluJyxcbiAgICAnW2NsYXNzKj1cInNjcm9sbFwiXScsXG4gICAgJ2RpdltjbGFzcyo9XCJjb252ZXJzYXRpb25cIl0nLFxuICBdO1xuXG4gIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgIGlmIChlbGVtZW50ICYmIGVsZW1lbnQuc2Nyb2xsSGVpZ2h0ID4gZWxlbWVudC5jbGllbnRIZWlnaHQpIHtcbiAgICAgIGNhY2hlZENoYXRBcmVhID0gZWxlbWVudDtcbiAgICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgfVxuICB9XG5cbiAgY2FjaGVkQ2hhdEFyZWEgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICByZXR1cm4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2Nyb2xsQ2hhdEFyZWEoZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogdm9pZCB7XG4gIGNvbnN0IGNoYXRBcmVhID0gZ2V0Q2hhdEFyZWEoKTtcbiAgY29uc3Qgc2Nyb2xsQW1vdW50ID0gd2luZG93LmlubmVySGVpZ2h0ICogMC4xO1xuICBjb25zdCBzY3JvbGxWYWx1ZSA9IGRpcmVjdGlvbiA9PT0gJ3VwJyA/IC1zY3JvbGxBbW91bnQgOiBzY3JvbGxBbW91bnQ7XG5cbiAgaWYgKGNoYXRBcmVhID09PSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgfHwgY2hhdEFyZWEgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IHNjcm9sbFZhbHVlLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9IGVsc2Uge1xuICAgIChjaGF0QXJlYSBhcyBIVE1MRWxlbWVudCkuc2Nyb2xsQnkoeyB0b3A6IHNjcm9sbFZhbHVlLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOZXdDaGF0KCk6IHZvaWQge1xuICBjb25zdCBuZXdDaGF0TGluayA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oXG4gICAgICAnYVtocmVmPVwiaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS9hcHBcIl0nXG4gICAgKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2FyaWEtbGFiZWwqPVwi5paw6KaP5L2c5oiQXCJdJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYVthcmlhLWxhYmVsKj1cIk5ldyBjaGF0XCJdJyk7XG5cbiAgaWYgKG5ld0NoYXRMaW5rKSB7XG4gICAgbmV3Q2hhdExpbmsuY2xpY2soKTtcbiAgICByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBuZXdDaGF0QnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtdGVzdC1pZD1cIm5ldy1jaGF0LWJ1dHRvblwiXScpO1xuICBpZiAobmV3Q2hhdEJ1dHRvbikge1xuICAgIGNvbnN0IGNsaWNrYWJsZSA9XG4gICAgICBuZXdDaGF0QnV0dG9uLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdhLCBidXR0b24nKSB8fFxuICAgICAgKG5ld0NoYXRCdXR0b24gYXMgSFRNTEVsZW1lbnQpO1xuICAgIGNsaWNrYWJsZS5jbGljaygpO1xuICAgIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGxpbmtzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignYSwgYnV0dG9uJykpO1xuICBjb25zdCBuZXdDaGF0QnRuID0gbGlua3MuZmluZChcbiAgICAoZWwpID0+XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ+aWsOimj+S9nOaIkCcpIHx8XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ05ldyBjaGF0JykgfHxcbiAgICAgIGVsLnRleHRDb250ZW50Py5pbmNsdWRlcygn5paw6KaPJylcbiAgKTtcbiAgaWYgKG5ld0NoYXRCdG4pIHtcbiAgICBuZXdDaGF0QnRuLmNsaWNrKCk7XG4gICAgcmVpbml0aWFsaXplQWZ0ZXJOYXZpZ2F0aW9uKCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpOiB2b2lkIHtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSgpO1xuICB9LCAxNTAwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvY3VzVGV4dGFyZWEoKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID1cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgICApIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuXG4gIGlmICghdGV4dGFyZWEpIHJldHVybjtcbiAgdGV4dGFyZWEuZm9jdXMoKTtcblxuICBpZiAodGV4dGFyZWEuY29udGVudEVkaXRhYmxlID09PSAndHJ1ZScpIHtcbiAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0ZXh0YXJlYSk7XG4gICAgcmFuZ2UuY29sbGFwc2UoZmFsc2UpO1xuICAgIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgc2VsPy5hZGRSYW5nZShyYW5nZSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQW5kRm9jdXNUZXh0YXJlYSgpOiB2b2lkIHtcbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAxMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICB3aGlsZSAodGV4dGFyZWEuZmlyc3RDaGlsZCkge1xuICAgICAgICB0ZXh0YXJlYS5yZW1vdmVDaGlsZCh0ZXh0YXJlYS5maXJzdENoaWxkKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgICBwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2JyJykpO1xuICAgICAgdGV4dGFyZWEuYXBwZW5kQ2hpbGQocCk7XG4gICAgICB0ZXh0YXJlYS5mb2N1cygpO1xuICAgICAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICB9XG4gIH0sIDIwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRRdWVyeUZyb21VcmwoKTogdm9pZCB7XG4gIGNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHBhdGggPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWU7XG5cbiAgY29uc3QgaXNOZXdDaGF0ID0gcGF0aCA9PT0gJy9hcHAnIHx8IHBhdGggPT09ICcvYXBwLyc7XG4gIGNvbnN0IHF1ZXJ5ID0gaXNOZXdDaGF0ID8gdXJsUGFyYW1zLmdldCgncScpIDogbnVsbDtcbiAgY29uc3QgcXVlcnlUaHJlYWQgPSB1cmxQYXJhbXMuZ2V0KCdxdCcpO1xuICBjb25zdCB0ZXh0ID0gcXVlcnkgfHwgcXVlcnlUaHJlYWQ7XG4gIGlmICghdGV4dCkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbmQgPSB1cmxQYXJhbXMuZ2V0KCdzZW5kJyk7XG4gIGNvbnN0IHNob3VsZFNlbmQgPSBzZW5kID09PSBudWxsIHx8IHNlbmQgPT09ICd0cnVlJyB8fCBzZW5kID09PSAnMSc7XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAyMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG5cbiAgICAgIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB7XG4gICAgICAgIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuICAgICAgfVxuICAgICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIHAudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgICAgdGV4dGFyZWEuYXBwZW5kQ2hpbGQocCk7XG4gICAgICB0ZXh0YXJlYS5mb2N1cygpO1xuXG4gICAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgICBjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG4gICAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICAgICAgcmFuZ2UuY29sbGFwc2UoZmFsc2UpO1xuICAgICAgc2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuXG4gICAgICB0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG4gICAgICBpZiAoc2hvdWxkU2VuZCkge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBjb25zdCBzZW5kQnV0dG9uID1cbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCLpgIHkv6FcIl0nKSB8fFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIlNlbmRcIl0nKSB8fFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5zZW5kLWJ1dHRvbicpIHx8XG4gICAgICAgICAgICBBcnJheS5mcm9tKFxuICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uJylcbiAgICAgICAgICAgICkuZmluZChcbiAgICAgICAgICAgICAgKGJ0bikgPT5cbiAgICAgICAgICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCfpgIHkv6EnKSB8fFxuICAgICAgICAgICAgICAgIGJ0bi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8uaW5jbHVkZXMoJ1NlbmQnKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoc2VuZEJ1dHRvbiAmJiAhc2VuZEJ1dHRvbi5kaXNhYmxlZCkge1xuICAgICAgICAgICAgc2VuZEJ1dHRvbi5jbGljaygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgNTAwKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICB9XG4gIH0sIDIwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c0FjdGlvbkJ1dHRvbihkaXJlY3Rpb246ICd1cCcgfCAnZG93bicpOiBib29sZWFuIHtcbiAgY29uc3QgYWN0aW9uQnV0dG9ucyA9IGdldEFsbEFjdGlvbkJ1dHRvbnMoKTtcbiAgaWYgKGFjdGlvbkJ1dHRvbnMubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuICAgIGFjdGlvbkJ1dHRvbnNbYWN0aW9uQnV0dG9ucy5sZW5ndGggLSAxXS5mb2N1cygpO1xuICB9IGVsc2Uge1xuICAgIGFjdGlvbkJ1dHRvbnNbMF0uZm9jdXMoKTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyhkaXJlY3Rpb246ICd1cCcgfCAnZG93bicpOiBib29sZWFuIHtcbiAgY29uc3QgYWN0aW9uQnV0dG9ucyA9IGdldEFsbEFjdGlvbkJ1dHRvbnMoKTtcbiAgY29uc3QgY3VycmVudEluZGV4ID0gYWN0aW9uQnV0dG9ucy5maW5kSW5kZXgoXG4gICAgKGJ0bikgPT4gYnRuID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50XG4gICk7XG4gIGlmIChjdXJyZW50SW5kZXggPT09IC0xKSByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuICAgIGlmIChjdXJyZW50SW5kZXggPiAwKSB7XG4gICAgICBhY3Rpb25CdXR0b25zW2N1cnJlbnRJbmRleCAtIDFdLmZvY3VzKCk7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKGN1cnJlbnRJbmRleCAtIDEpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2Uge1xuICAgIGlmIChjdXJyZW50SW5kZXggPCBhY3Rpb25CdXR0b25zLmxlbmd0aCAtIDEpIHtcbiAgICAgIGFjdGlvbkJ1dHRvbnNbY3VycmVudEluZGV4ICsgMV0uZm9jdXMoKTtcbiAgICAgIHdpbmRvdy5yZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uPy4oY3VycmVudEluZGV4ICsgMSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFsbEFjdGlvbkJ1dHRvbnMoKTogSFRNTEVsZW1lbnRbXSB7XG4gIGNvbnN0IGFsbEJ1dHRvbnMgPSBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2J1dHRvbi5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSwgYnV0dG9uW2RhdGEtYWN0aW9uPVwiZGVlcC1kaXZlXCJdJ1xuICAgIClcbiAgKTtcblxuICByZXR1cm4gYWxsQnV0dG9ucy5maWx0ZXIoKGJ0bikgPT4ge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9XG4gICAgICBidG4uY2xvc2VzdCgnW2RhdGEtdGVzdC1pZCo9XCJ1c2VyXCJdJykgfHxcbiAgICAgIGJ0bi5jbG9zZXN0KCdbZGF0YS10ZXN0LWlkKj1cInByb21wdFwiXScpIHx8XG4gICAgICBidG4uY2xvc2VzdCgnW2NsYXNzKj1cInVzZXJcIl0nKTtcbiAgICByZXR1cm4gIWNvbnRhaW5lcjtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kU2lkZWJhclRvZ2dsZUJ1dHRvbigpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICByZXR1cm4gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbZGF0YS10ZXN0LWlkPVwic2lkZS1uYXYtdG9nZ2xlXCJdJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwi44Oh44OL44Ol44O8XCJdJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwibWVudVwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIk1lbnVcIl0nKVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTaWRlYmFyT3BlbigpOiBib29sZWFuIHtcbiAgY29uc3Qgc2lkZW5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ21hdC1zaWRlbmF2Jyk7XG4gIGlmICghc2lkZW5hdikgcmV0dXJuIHRydWU7XG4gIHJldHVybiBzaWRlbmF2LmNsYXNzTGlzdC5jb250YWlucygnbWF0LWRyYXdlci1vcGVuZWQnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZVNpZGViYXIoKTogdm9pZCB7XG4gIGNvbnN0IHRvZ2dsZSA9IGZpbmRTaWRlYmFyVG9nZ2xlQnV0dG9uKCk7XG4gIGlmICh0b2dnbGUpIHRvZ2dsZS5jbGljaygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZUNoYXRQYWdlKCk6IHZvaWQge1xuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBzZXRRdWVyeUZyb21VcmwoKTtcbiAgfSwgMTAwMCk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSgpO1xuICB9LCAxNTAwKTtcblxuICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICBjb25zdCBpc1N0cmVhbWluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1thcmlhLWJ1c3k9XCJ0cnVlXCJdJyk7XG4gICAgaWYgKGlzU3RyZWFtaW5nKSB7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKC0xKTtcbiAgICB9XG4gIH0pO1xuXG4gIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwge1xuICAgIGF0dHJpYnV0ZXM6IHRydWUsXG4gICAgYXR0cmlidXRlRmlsdGVyOiBbJ2FyaWEtYnVzeSddLFxuICAgIHN1YnRyZWU6IHRydWUsXG4gIH0pO1xufVxuIiwiLy8gQ2hhdCBoaXN0b3J5IHNlbGVjdGlvbiBmdW5jdGlvbmFsaXR5XG5cbmltcG9ydCB7IGNsZWFyQW5kRm9jdXNUZXh0YXJlYSB9IGZyb20gJy4vY2hhdCc7XG5cbmxldCBzZWxlY3RlZEhpc3RvcnlJbmRleCA9IDA7XG5sZXQgaGlzdG9yeVNlbGVjdGlvbk1vZGUgPSBmYWxzZTtcblxuZnVuY3Rpb24gZ2V0SGlzdG9yeUl0ZW1zKCk6IEhUTUxFbGVtZW50W10ge1xuICByZXR1cm4gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICcuY29udmVyc2F0aW9uLWl0ZW1zLWNvbnRhaW5lciAuY29udmVyc2F0aW9uW2RhdGEtdGVzdC1pZD1cImNvbnZlcnNhdGlvblwiXSdcbiAgICApXG4gICk7XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodEhpc3RvcnkoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBpdGVtcyA9IGdldEhpc3RvcnlJdGVtcygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgc2VsZWN0ZWRIaXN0b3J5SW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihpbmRleCwgaXRlbXMubGVuZ3RoIC0gMSkpO1xuXG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG5cbiAgY29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbc2VsZWN0ZWRIaXN0b3J5SW5kZXhdO1xuICBpZiAoc2VsZWN0ZWRJdGVtKSB7XG4gICAgc2VsZWN0ZWRJdGVtLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICMxYTczZTgnO1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJy0ycHgnO1xuICAgIHNlbGVjdGVkSXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVIaXN0b3J5VXAoKTogdm9pZCB7XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXggLSAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVIaXN0b3J5RG93bigpOiB2b2lkIHtcbiAgaGlnaGxpZ2h0SGlzdG9yeShzZWxlY3RlZEhpc3RvcnlJbmRleCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3BlblNlbGVjdGVkSGlzdG9yeSgpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCB8fCAhaXRlbXNbc2VsZWN0ZWRIaXN0b3J5SW5kZXhdKSByZXR1cm47XG5cbiAgaXRlbXNbc2VsZWN0ZWRIaXN0b3J5SW5kZXhdLmNsaWNrKCk7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG5cbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcblxuICBjbGVhckFuZEZvY3VzVGV4dGFyZWEoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpOiB2b2lkIHtcbiAgaGlzdG9yeVNlbGVjdGlvbk1vZGUgPSBmYWxzZTtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogdm9pZCB7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gdHJ1ZTtcbiAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpIHtcbiAgICAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCkuYmx1cigpO1xuICB9XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIGhpc3RvcnlTZWxlY3Rpb25Nb2RlO1xufVxuIiwiLy8gU2VhcmNoIHBhZ2UgZnVuY3Rpb25hbGl0eVxuXG5pbXBvcnQgeyBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUgfSBmcm9tICcuL2hpc3RvcnknO1xuXG5sZXQgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlYXJjaFBhZ2UoKTogYm9vbGVhbiB7XG4gIHJldHVybiB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuc3RhcnRzV2l0aCgnL3NlYXJjaCcpO1xufVxuXG5mdW5jdGlvbiBnZXRTZWFyY2hSZXN1bHRzKCk6IEhUTUxFbGVtZW50W10ge1xuICBsZXQgcmVzdWx0cyA9IEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ3NlYXJjaC1zbmlwcGV0W3RhYmluZGV4PVwiMFwiXScpXG4gICk7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ3NlYXJjaC1zbmlwcGV0JylcbiAgICApO1xuICB9XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICdkaXYuY29udmVyc2F0aW9uLWNvbnRhaW5lcltyb2xlPVwib3B0aW9uXCJdJ1xuICAgICAgKVxuICAgICk7XG4gIH1cbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmVzdWx0cyA9IEFycmF5LmZyb20oXG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ1tyb2xlPVwib3B0aW9uXCJdLmNvbnZlcnNhdGlvbi1jb250YWluZXInXG4gICAgICApXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0U2VhcmNoUmVzdWx0KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRTZWFyY2hSZXN1bHRzKCk7XG4gIGlmIChpdGVtcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICBzZWxlY3RlZFNlYXJjaEluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaW5kZXgsIGl0ZW1zLmxlbmd0aCAtIDEpKTtcblxuICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lID0gJyc7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7XG4gIH0pO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkU2VhcmNoSW5kZXhdO1xuICBpZiAoc2VsZWN0ZWRJdGVtKSB7XG4gICAgc2VsZWN0ZWRJdGVtLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICMxYTczZTgnO1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJy0ycHgnO1xuICAgIHNlbGVjdGVkSXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVTZWFyY2hSZXN1bHRVcCgpOiB2b2lkIHtcbiAgaGlnaGxpZ2h0U2VhcmNoUmVzdWx0KHNlbGVjdGVkU2VhcmNoSW5kZXggLSAxKTtcbiAgY29uc3Qgc2VhcmNoSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICApO1xuICBpZiAoc2VhcmNoSW5wdXQpIHNlYXJjaElucHV0LmZvY3VzKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlU2VhcmNoUmVzdWx0RG93bigpOiB2b2lkIHtcbiAgaGlnaGxpZ2h0U2VhcmNoUmVzdWx0KHNlbGVjdGVkU2VhcmNoSW5kZXggKyAxKTtcbiAgY29uc3Qgc2VhcmNoSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICApO1xuICBpZiAoc2VhcmNoSW5wdXQpIHNlYXJjaElucHV0LmZvY3VzKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQoKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwIHx8ICFpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XSkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkU2VhcmNoSW5kZXhdO1xuXG4gIGNvbnN0IGNsaWNrYWJsZURpdiA9IHNlbGVjdGVkSXRlbS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignZGl2W2pzbG9nXScpO1xuICBpZiAoY2xpY2thYmxlRGl2KSB7XG4gICAgY2xpY2thYmxlRGl2LmNsaWNrKCk7XG4gICAgWydtb3VzZWRvd24nLCAnbW91c2V1cCcsICdjbGljayddLmZvckVhY2goKGV2ZW50VHlwZSkgPT4ge1xuICAgICAgY2xpY2thYmxlRGl2LmRpc3BhdGNoRXZlbnQoXG4gICAgICAgIG5ldyBNb3VzZUV2ZW50KGV2ZW50VHlwZSwgeyB2aWV3OiB3aW5kb3csIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBzZWxlY3RlZEl0ZW0uY2xpY2soKTtcbiAgICB9LCAxMDApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGxpbmsgPSBzZWxlY3RlZEl0ZW0ucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbaHJlZl0nKTtcbiAgaWYgKGxpbmspIHtcbiAgICBsaW5rLmNsaWNrKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc2VsZWN0ZWRJdGVtLmNsaWNrKCk7XG4gIFsnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnY2xpY2snXS5mb3JFYWNoKChldmVudFR5cGUpID0+IHtcbiAgICBzZWxlY3RlZEl0ZW0uZGlzcGF0Y2hFdmVudChcbiAgICAgIG5ldyBNb3VzZUV2ZW50KGV2ZW50VHlwZSwgeyB2aWV3OiB3aW5kb3csIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSlcbiAgICApO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVTZWFyY2hQYWdlKCk6IHZvaWQge1xuICBpZiAoIWlzU2VhcmNoUGFnZSgpKSByZXR1cm47XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAxMDtcblxuICBjb25zdCBoaWdobGlnaHRJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHNlYXJjaFJlc3VsdHMgPSBnZXRTZWFyY2hSZXN1bHRzKCk7XG5cbiAgICBpZiAoc2VhcmNoUmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICBzZWxlY3RlZFNlYXJjaEluZGV4ID0gMDtcbiAgICAgIGhpZ2hsaWdodFNlYXJjaFJlc3VsdCgwKTtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaGlnaGxpZ2h0SW50ZXJ2YWwpO1xuICAgIH0gZWxzZSBpZiAoYXR0ZW1wdHMgPj0gbWF4QXR0ZW1wdHMpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaGlnaGxpZ2h0SW50ZXJ2YWwpO1xuICAgIH1cbiAgfSwgNTAwKTtcbn1cblxuZnVuY3Rpb24gbmF2aWdhdGVUb1NlYXJjaFBhZ2UoKTogdm9pZCB7XG4gIGNvbnN0IHNlYXJjaFVybCA9ICcvc2VhcmNoP2hsPWphJztcbiAgaGlzdG9yeS5wdXNoU3RhdGUobnVsbCwgJycsIHNlYXJjaFVybCk7XG4gIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBQb3BTdGF0ZUV2ZW50KCdwb3BzdGF0ZScsIHsgc3RhdGU6IG51bGwgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlU2VhcmNoUGFnZSgpOiB2b2lkIHtcbiAgaWYgKGlzU2VhcmNoUGFnZSgpKSB7XG4gICAgaGlzdG9yeS5iYWNrKCk7XG4gIH0gZWxzZSB7XG4gICAgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gICAgbmF2aWdhdGVUb1NlYXJjaFBhZ2UoKTtcbiAgfVxufVxuIiwiLy8gQ2hhdCBleHBvcnQgZnVuY3Rpb25hbGl0eSAtIHNhdmVzIGN1cnJlbnQgY29udmVyc2F0aW9uIGFzIFpldHRlbGthc3RlbiBNYXJrZG93blxuXG5jb25zdCBFWFBPUlRfQlVUVE9OX0lEID0gJ2dlbWluaS1leHBvcnQtbm90ZS1idXR0b24nO1xubGV0IGV4cG9ydERpckhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSB8IG51bGwgPSBudWxsO1xuXG4vLyAtLS0gSW5kZXhlZERCIGhlbHBlcnMgLS0tXG5cbmZ1bmN0aW9uIG9wZW5FeHBvcnREQigpOiBQcm9taXNlPElEQkRhdGFiYXNlPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaW5kZXhlZERCLm9wZW4oJ2dlbWluaS1leHBvcnQnLCAxKTtcbiAgICByZXEub251cGdyYWRlbmVlZGVkID0gKGUpID0+IHtcbiAgICAgIChlLnRhcmdldCBhcyBJREJPcGVuREJSZXF1ZXN0KS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoJ2hhbmRsZXMnKTtcbiAgICB9O1xuICAgIHJlcS5vbnN1Y2Nlc3MgPSAoZSkgPT4gcmVzb2x2ZSgoZS50YXJnZXQgYXMgSURCT3BlbkRCUmVxdWVzdCkucmVzdWx0KTtcbiAgICByZXEub25lcnJvciA9ICgpID0+IHJlamVjdChyZXEuZXJyb3IpO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U3RvcmVkRGlySGFuZGxlKCk6IFByb21pc2U8RmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSB8IG51bGw+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBkYiA9IGF3YWl0IG9wZW5FeHBvcnREQigpO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaGFuZGxlcycsICdyZWFkb25seScpO1xuICAgICAgY29uc3QgcmVxID0gdHgub2JqZWN0U3RvcmUoJ2hhbmRsZXMnKS5nZXQoJ3NhdmVfZGlyJyk7XG4gICAgICByZXEub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZSgocmVxLnJlc3VsdCBhcyBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKSB8fCBudWxsKTtcbiAgICAgIHJlcS5vbmVycm9yID0gKCkgPT4gcmVzb2x2ZShudWxsKTtcbiAgICB9KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RvcmVEaXJIYW5kbGUoaGFuZGxlOiBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGIgPSBhd2FpdCBvcGVuRXhwb3J0REIoKTtcbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdoYW5kbGVzJywgJ3JlYWR3cml0ZScpO1xuICAgICAgdHgub2JqZWN0U3RvcmUoJ2hhbmRsZXMnKS5wdXQoaGFuZGxlLCAnc2F2ZV9kaXInKTtcbiAgICAgIHR4Lm9uY29tcGxldGUgPSAoKSA9PiByZXNvbHZlKCk7XG4gICAgICB0eC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHR4LmVycm9yKTtcbiAgICB9KTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gSWdub3JlIHN0b3JhZ2UgZXJyb3JzXG4gIH1cbn1cblxuLy8gLS0tIERpcmVjdG9yeSBoYW5kbGUgbWFuYWdlbWVudCAtLS1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RXhwb3J0RGlySGFuZGxlKCk6IFByb21pc2U8RmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZT4ge1xuICBpZiAoZXhwb3J0RGlySGFuZGxlKSB7XG4gICAgY29uc3QgcGVybSA9IGF3YWl0IGV4cG9ydERpckhhbmRsZS5xdWVyeVBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAocGVybSA9PT0gJ2dyYW50ZWQnKSByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICB9XG5cbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkRGlySGFuZGxlKCk7XG4gIGlmIChzdG9yZWQpIHtcbiAgICBjb25zdCBwZXJtID0gYXdhaXQgc3RvcmVkLnF1ZXJ5UGVybWlzc2lvbih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICAgIGlmIChwZXJtID09PSAnZ3JhbnRlZCcpIHtcbiAgICAgIGV4cG9ydERpckhhbmRsZSA9IHN0b3JlZDtcbiAgICAgIHJldHVybiBleHBvcnREaXJIYW5kbGU7XG4gICAgfVxuICAgIGNvbnN0IG5ld1Blcm0gPSBhd2FpdCBzdG9yZWQucmVxdWVzdFBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAobmV3UGVybSA9PT0gJ2dyYW50ZWQnKSB7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBzdG9yZWQ7XG4gICAgICByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGhhbmRsZSA9IGF3YWl0IHdpbmRvdy5zaG93RGlyZWN0b3J5UGlja2VyKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gIGF3YWl0IHN0b3JlRGlySGFuZGxlKGhhbmRsZSk7XG4gIGV4cG9ydERpckhhbmRsZSA9IGhhbmRsZTtcbiAgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbn1cblxuLy8gLS0tIERPTSB0byBNYXJrZG93biBjb252ZXJzaW9uIC0tLVxuXG5mdW5jdGlvbiBkb21Ub01hcmtkb3duKGVsOiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIGNvbnN0IFNLSVBfVEFHUyA9IG5ldyBTZXQoWydidXR0b24nLCAnc3ZnJywgJ3BhdGgnLCAnbWF0LWljb24nXSk7XG5cbiAgZnVuY3Rpb24gbm9kZVRvTWQobm9kZTogTm9kZSk6IHN0cmluZyB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSByZXR1cm4gbm9kZS50ZXh0Q29udGVudCB8fCAnJztcbiAgICBpZiAobm9kZS5ub2RlVHlwZSAhPT0gTm9kZS5FTEVNRU5UX05PREUpIHJldHVybiAnJztcblxuICAgIGNvbnN0IGVsZW0gPSBub2RlIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IHRhZyA9IGVsZW0udGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKFNLSVBfVEFHUy5oYXModGFnKSkgcmV0dXJuICcnO1xuXG4gICAgY29uc3QgaW5uZXIgPSAoKSA9PiBBcnJheS5mcm9tKGVsZW0uY2hpbGROb2RlcykubWFwKG5vZGVUb01kKS5qb2luKCcnKTtcblxuICAgIGNvbnN0IGhtID0gdGFnLm1hdGNoKC9eaChbMS02XSkkLyk7XG4gICAgaWYgKGhtKSB7XG4gICAgICBjb25zdCBoYXNoZXMgPSAnIycucmVwZWF0KE51bWJlcihobVsxXSkpO1xuICAgICAgY29uc3QgdGV4dCA9IGlubmVyKCkudHJpbSgpO1xuICAgICAgcmV0dXJuIGBcXG4ke2hhc2hlc30gJHt0ZXh0fVxcblxcbmA7XG4gICAgfVxuXG4gICAgc3dpdGNoICh0YWcpIHtcbiAgICAgIGNhc2UgJ3AnOlxuICAgICAgICByZXR1cm4gaW5uZXIoKSArICdcXG5cXG4nO1xuICAgICAgY2FzZSAnYnInOlxuICAgICAgICByZXR1cm4gJ1xcbic7XG4gICAgICBjYXNlICdocic6XG4gICAgICAgIHJldHVybiAnXFxuLS0tXFxuXFxuJztcbiAgICAgIGNhc2UgJ3VsJzpcbiAgICAgIGNhc2UgJ29sJzpcbiAgICAgICAgcmV0dXJuIGlubmVyKCkgKyAnXFxuJztcbiAgICAgIGNhc2UgJ2xpJzoge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gaW5uZXIoKS5yZXBsYWNlKC9cXG4rJC8sICcnKTtcbiAgICAgICAgcmV0dXJuIGAtICR7Y29udGVudH1cXG5gO1xuICAgICAgfVxuICAgICAgY2FzZSAnYic6XG4gICAgICBjYXNlICdzdHJvbmcnOlxuICAgICAgICByZXR1cm4gYCoqJHtpbm5lcigpfSoqYDtcbiAgICAgIGNhc2UgJ2knOlxuICAgICAgY2FzZSAnZW0nOlxuICAgICAgICByZXR1cm4gYCoke2lubmVyKCl9KmA7XG4gICAgICBjYXNlICdjb2RlJzpcbiAgICAgICAgcmV0dXJuIGBcXGAke2lubmVyKCl9XFxgYDtcbiAgICAgIGNhc2UgJ3ByZSc6XG4gICAgICAgIHJldHVybiBgXFxgXFxgXFxgXFxuJHtpbm5lcigpfVxcblxcYFxcYFxcYFxcblxcbmA7XG4gICAgICBjYXNlICd0YWJsZSc6XG4gICAgICAgIHJldHVybiB0YWJsZVRvTWQoZWxlbSkgKyAnXFxuXFxuJztcbiAgICAgIGNhc2UgJ3RoZWFkJzpcbiAgICAgIGNhc2UgJ3Rib2R5JzpcbiAgICAgIGNhc2UgJ3RyJzpcbiAgICAgIGNhc2UgJ3RkJzpcbiAgICAgIGNhc2UgJ3RoJzpcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIGlubmVyKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdGFibGVUb01kKHRhYmxlOiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gICAgY29uc3Qgcm93cyA9IEFycmF5LmZyb20odGFibGUucXVlcnlTZWxlY3RvckFsbCgndHInKSk7XG4gICAgaWYgKHJvd3MubGVuZ3RoID09PSAwKSByZXR1cm4gJyc7XG5cbiAgICBjb25zdCBnZXRDZWxscyA9IChyb3c6IEVsZW1lbnQpID0+XG4gICAgICBBcnJheS5mcm9tKHJvdy5xdWVyeVNlbGVjdG9yQWxsKCd0ZCwgdGgnKSkubWFwKChjZWxsKSA9PlxuICAgICAgICBBcnJheS5mcm9tKGNlbGwuY2hpbGROb2RlcylcbiAgICAgICAgICAubWFwKG5vZGVUb01kKVxuICAgICAgICAgIC5qb2luKCcnKVxuICAgICAgICAgIC5yZXBsYWNlKC9cXG4rL2csICcgJylcbiAgICAgICAgICAudHJpbSgpXG4gICAgICApO1xuXG4gICAgY29uc3QgW2hlYWRlclJvdywgLi4uYm9keVJvd3NdID0gcm93cztcbiAgICBjb25zdCBoZWFkZXJzID0gZ2V0Q2VsbHMoaGVhZGVyUm93KTtcbiAgICBjb25zdCBzZXBhcmF0b3IgPSBoZWFkZXJzLm1hcCgoKSA9PiAnLS0tJyk7XG5cbiAgICByZXR1cm4gW1xuICAgICAgYHwgJHtoZWFkZXJzLmpvaW4oJyB8ICcpfSB8YCxcbiAgICAgIGB8ICR7c2VwYXJhdG9yLmpvaW4oJyB8ICcpfSB8YCxcbiAgICAgIC4uLmJvZHlSb3dzLm1hcCgocikgPT4gYHwgJHtnZXRDZWxscyhyKS5qb2luKCcgfCAnKX0gfGApLFxuICAgIF0uam9pbignXFxuJyk7XG4gIH1cblxuICByZXR1cm4gQXJyYXkuZnJvbShlbC5jaGlsZE5vZGVzKVxuICAgIC5tYXAobm9kZVRvTWQpXG4gICAgLmpvaW4oJycpXG4gICAgLnJlcGxhY2UoL1xcbnszLH0vZywgJ1xcblxcbicpXG4gICAgLnRyaW0oKTtcbn1cblxuLy8gLS0tIFRleHQgY2xlYW51cCAtLS1cblxuY29uc3QgQVJUSUZBQ1RfUEFUVEVSTlMgPSBbXG4gIC9eWyvvvItdJC8sXG4gIC9eR29vZ2xlIOOCueODl+ODrOODg+ODieOCt+ODvOODiOOBq+OCqOOCr+OCueODneODvOODiCQvLFxuICAvXkdvb2dsZSBTaGVldHMg44Gr44Ko44Kv44K544Od44O844OIJC8sXG4gIC9eRXhwb3J0IHRvIFNoZWV0cyQvLFxuXTtcblxuZnVuY3Rpb24gY2xlYW5Nb2RlbFRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHRleHRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLmZpbHRlcigobGluZSkgPT4gIUFSVElGQUNUX1BBVFRFUk5TLnNvbWUoKHApID0+IHAudGVzdChsaW5lLnRyaW0oKSkpKVxuICAgIC5qb2luKCdcXG4nKVxuICAgIC5yZXBsYWNlKC9cXG57Myx9L2csICdcXG5cXG4nKVxuICAgIC50cmltKCk7XG59XG5cbi8vIC0tLSBTY3JvbGwgdG8gbG9hZCBhbGwgbWVzc2FnZXMgLS0tXG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRBbGxNZXNzYWdlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc2Nyb2xsZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5J1xuICApO1xuICBpZiAoIXNjcm9sbGVyKSByZXR1cm47XG5cbiAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbign44Oh44OD44K744O844K444KS6Kqt44G/6L6844G/5LitLi4uJyk7XG5cbiAgbGV0IHByZXZDb3VudCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMzA7IGkrKykge1xuICAgIHNjcm9sbGVyLnNjcm9sbFRvcCA9IDA7XG4gICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgNDAwKSk7XG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd1c2VyLXF1ZXJ5JykubGVuZ3RoO1xuICAgIGlmIChjb3VudCA9PT0gcHJldkNvdW50KSBicmVhaztcbiAgICBwcmV2Q291bnQgPSBjb3VudDtcbiAgfVxuXG4gIHNjcm9sbGVyLnNjcm9sbFRvcCA9IHNjcm9sbGVyLnNjcm9sbEhlaWdodDtcbn1cblxuLy8gLS0tIENoYXQgY29udGVudCBleHRyYWN0aW9uIC0tLVxuXG5pbnRlcmZhY2UgQ2hhdCB7XG4gIHVzZXI6IHN0cmluZztcbiAgbW9kZWw6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZXh0cmFjdENoYXRDb250ZW50KCk6IENoYXRbXSB7XG4gIGNvbnN0IHVzZXJRdWVyaWVzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd1c2VyLXF1ZXJ5JykpO1xuICBjb25zdCBtb2RlbFJlc3BvbnNlcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbW9kZWwtcmVzcG9uc2UnKSk7XG5cbiAgY29uc3QgY2hhdHM6IENoYXRbXSA9IFtdO1xuICBjb25zdCBsZW4gPSBNYXRoLm1pbih1c2VyUXVlcmllcy5sZW5ndGgsIG1vZGVsUmVzcG9uc2VzLmxlbmd0aCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGNvbnN0IHVzZXJUZXh0ID0gQXJyYXkuZnJvbShcbiAgICAgIHVzZXJRdWVyaWVzW2ldLnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdWVyeS10ZXh0LWxpbmUnKVxuICAgIClcbiAgICAgIC5tYXAoKGVsKSA9PiAoZWwgYXMgSFRNTEVsZW1lbnQpLmlubmVyVGV4dC50cmltKCkpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbignXFxuJyk7XG5cbiAgICBjb25zdCBtYXJrZG93bkVsID0gbW9kZWxSZXNwb25zZXNbaV0ucXVlcnlTZWxlY3RvcihcbiAgICAgICdtZXNzYWdlLWNvbnRlbnQgLm1hcmtkb3duJ1xuICAgICkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHJhd01vZGVsVGV4dCA9IG1hcmtkb3duRWxcbiAgICAgID8gZG9tVG9NYXJrZG93bihtYXJrZG93bkVsKS50cmltKClcbiAgICAgIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IG1vZGVsVGV4dCA9IHJhd01vZGVsVGV4dCA/IGNsZWFuTW9kZWxUZXh0KHJhd01vZGVsVGV4dCkgOiAnJztcblxuICAgIGlmICh1c2VyVGV4dCB8fCBtb2RlbFRleHQpIHtcbiAgICAgIGNoYXRzLnB1c2goeyB1c2VyOiB1c2VyVGV4dCB8fCAnJywgbW9kZWw6IG1vZGVsVGV4dCB8fCAnJyB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gY2hhdHM7XG59XG5cbmZ1bmN0aW9uIGdldENoYXRJZCgpOiBzdHJpbmcge1xuICByZXR1cm4gbG9jYXRpb24ucGF0aG5hbWUuc3BsaXQoJy8nKS5wb3AoKSB8fCAndW5rbm93bic7XG59XG5cbi8vIC0tLSBZQU1MIGdlbmVyYXRpb24gKFpldHRlbGthc3RlbiBmb3JtYXQpIC0tLVxuXG5mdW5jdGlvbiB5YW1sUXVvdGUoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuICdcIicgKyBzLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpICsgJ1wiJztcbn1cblxuZnVuY3Rpb24geWFtbEJsb2NrKHRleHQ6IHN0cmluZywgaW5kZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdGV4dFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsaW5lKSA9PiAobGluZSA9PT0gJycgPyAnJyA6IGluZGVudCArIGxpbmUpKVxuICAgIC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVNYXJrZG93bihjaGF0czogQ2hhdFtdKToge1xuICBtYXJrZG93bjogc3RyaW5nO1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xufSB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IHBhZCA9IChuOiBudW1iZXIpID0+IFN0cmluZyhuKS5wYWRTdGFydCgyLCAnMCcpO1xuICBjb25zdCBkYXRlU3RyID0gYCR7bm93LmdldEZ1bGxZZWFyKCl9LSR7cGFkKG5vdy5nZXRNb250aCgpICsgMSl9LSR7cGFkKG5vdy5nZXREYXRlKCkpfWA7XG4gIGNvbnN0IHRpbWVTdHIgPSBgJHtkYXRlU3RyfVQke3BhZChub3cuZ2V0SG91cnMoKSl9OiR7cGFkKG5vdy5nZXRNaW51dGVzKCkpfToke3BhZChub3cuZ2V0U2Vjb25kcygpKX1gO1xuICBjb25zdCBpZCA9IHRpbWVTdHIucmVwbGFjZSgvWy06VF0vZywgJycpO1xuXG4gIGNvbnN0IGNvbnZlcnNhdGlvblRpdGxlID0gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnW2RhdGEtdGVzdC1pZD1cImNvbnZlcnNhdGlvbi10aXRsZVwiXSdcbiAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbFxuICApPy5pbm5lclRleHQ/LnRyaW0oKTtcbiAgY29uc3QgZmlyc3RVc2VyTGluZXMgPSAoY2hhdHNbMF0/LnVzZXIgfHwgJycpXG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAoKGwpID0+IGwudHJpbSgpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IGZhbGxiYWNrVGl0bGUgPVxuICAgIGZpcnN0VXNlckxpbmVzLmZpbmQoKGwpID0+ICEvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGwpKSB8fFxuICAgIGZpcnN0VXNlckxpbmVzWzBdIHx8XG4gICAgJ0dlbWluaSBjaGF0JztcbiAgY29uc3QgdGl0bGUgPSAoY29udmVyc2F0aW9uVGl0bGUgfHwgZmFsbGJhY2tUaXRsZSkuc2xpY2UoMCwgNjApO1xuXG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgYGlkOiAke3lhbWxRdW90ZShjaGF0SWQpfWAsXG4gICAgYHRpdGxlOiAke3lhbWxRdW90ZSgnR2VtaW5pOiAnICsgdGl0bGUpfWAsXG4gICAgYGRhdGU6ICR7eWFtbFF1b3RlKHRpbWVTdHIpfWAsXG4gICAgYHNvdXJjZTogJHt5YW1sUXVvdGUobG9jYXRpb24uaHJlZil9YCxcbiAgICAndGFnczonLFxuICAgICcgIC0gZ2VtaW5pJyxcbiAgICAnICAtIGZsZWV0aW5nJyxcbiAgICAnY2hhdHM6JyxcbiAgXTtcblxuICBmb3IgKGNvbnN0IHR1cm4gb2YgY2hhdHMpIHtcbiAgICBsaW5lcy5wdXNoKCcgIC0gcTogfCcpO1xuICAgIGxpbmVzLnB1c2goeWFtbEJsb2NrKHR1cm4udXNlciwgJyAgICAgICcpKTtcbiAgICBsaW5lcy5wdXNoKCcgICAgYTogfCcpO1xuICAgIGxpbmVzLnB1c2goeWFtbEJsb2NrKHR1cm4ubW9kZWwsICcgICAgICAnKSk7XG4gIH1cblxuXG4gIHJldHVybiB7IG1hcmtkb3duOiBsaW5lcy5qb2luKCdcXG4nKSwgaWQsIHRpdGxlIH07XG59XG5cbi8vIC0tLSBGaWxlIHNhdmUgLS0tXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlTm90ZShmb3JjZVBpY2tEaXIgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBsb2FkQWxsTWVzc2FnZXMoKTtcblxuICBjb25zdCBjaGF0cyA9IGV4dHJhY3RDaGF0Q29udGVudCgpO1xuICBpZiAoY2hhdHMubGVuZ3RoID09PSAwKSB7XG4gICAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbign5L+d5a2Y44Gn44GN44KL5Lya6Kmx44GM6KaL44Gk44GL44KK44G+44Gb44KTJywgJ2Vycm9yJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IGRpckhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZTtcbiAgdHJ5IHtcbiAgICBpZiAoZm9yY2VQaWNrRGlyKSB7XG4gICAgICBjb25zdCBoYW5kbGUgPSBhd2FpdCB3aW5kb3cuc2hvd0RpcmVjdG9yeVBpY2tlcih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICAgICAgYXdhaXQgc3RvcmVEaXJIYW5kbGUoaGFuZGxlKTtcbiAgICAgIGV4cG9ydERpckhhbmRsZSA9IGhhbmRsZTtcbiAgICAgIGRpckhhbmRsZSA9IGhhbmRsZTtcbiAgICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oYOS/neWtmOWFiOOCkuWkieabtDogJHtoYW5kbGUubmFtZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlySGFuZGxlID0gYXdhaXQgZ2V0RXhwb3J0RGlySGFuZGxlKCk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IG1hcmtkb3duLCB0aXRsZSB9ID0gZ2VuZXJhdGVNYXJrZG93bihjaGF0cyk7XG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBjb25zdCBzYWZlVGl0bGUgPSB0aXRsZVxuICAgIC5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgJycpXG4gICAgLnJlcGxhY2UoL1xccysvZywgJy0nKVxuICAgIC5zbGljZSgwLCA0MCk7XG4gIGNvbnN0IGZpbGVuYW1lID0gYGdlbWluaS0ke3NhZmVUaXRsZX0tJHtjaGF0SWR9LnlhbWxgO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgaW5ib3hIYW5kbGUgPSBhd2FpdCBkaXJIYW5kbGUuZ2V0RGlyZWN0b3J5SGFuZGxlKCdpbmJveCcsIHtcbiAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBjb25zdCBmaWxlSGFuZGxlID0gYXdhaXQgaW5ib3hIYW5kbGUuZ2V0RmlsZUhhbmRsZShmaWxlbmFtZSwge1xuICAgICAgY3JlYXRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGNvbnN0IHdyaXRhYmxlID0gYXdhaXQgZmlsZUhhbmRsZS5jcmVhdGVXcml0YWJsZSgpO1xuICAgIGF3YWl0IHdyaXRhYmxlLndyaXRlKG1hcmtkb3duKTtcbiAgICBhd2FpdCB3cml0YWJsZS5jbG9zZSgpO1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oYOS/neWtmOOBl+OBvuOBl+OBnzogaW5ib3gvJHtmaWxlbmFtZX1gKTtcbiAgfSBjYXRjaCB7XG4gICAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbign5L+d5a2Y44Gr5aSx5pWX44GX44G+44GX44GfJywgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLy8gLS0tIFVJIC0tLVxuXG5mdW5jdGlvbiBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKFxuICBtZXNzYWdlOiBzdHJpbmcsXG4gIHR5cGU6ICdzdWNjZXNzJyB8ICdlcnJvcicgPSAnc3VjY2Vzcydcbik6IHZvaWQge1xuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnZW1pbmktZXhwb3J0LW5vdGlmaWNhdGlvbicpO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGVsLmlkID0gJ2dlbWluaS1leHBvcnQtbm90aWZpY2F0aW9uJztcbiAgZWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgYm90dG9tOiAyNHB4O1xuICAgIHJpZ2h0OiAyNHB4O1xuICAgIGJhY2tncm91bmQ6ICR7dHlwZSA9PT0gJ2Vycm9yJyA/ICcjYzYyODI4JyA6ICcjMWI1ZTIwJ307XG4gICAgY29sb3I6IHdoaXRlO1xuICAgIHBhZGRpbmc6IDEycHggMjBweDtcbiAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgei1pbmRleDogMTAwMDA7XG4gICAgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgc2Fucy1zZXJpZjtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsMCwwLDAuMyk7XG4gIGA7XG4gIGVsLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7XG4gIHNldFRpbWVvdXQoKCkgPT4gZWwucmVtb3ZlKCksIDMwMDApO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVFeHBvcnRCdXR0b24oKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChFWFBPUlRfQlVUVE9OX0lEKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGlucHV0QXJlYSA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQtYXJlYS12MicpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQtY29udGFpbmVyJyk7XG4gIGlmICghaW5wdXRBcmVhKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIGJ0bi5pZCA9IEVYUE9SVF9CVVRUT05fSUQ7XG4gIGJ0bi50aXRsZSA9XG4gICAgJ1NhdmUgYXMgWmV0dGVsa2FzdGVuIG5vdGVcXG5TaGlmdCvjgq/jg6rjg4Pjgq/jgafkv53lrZjlhYjjgpLlpInmm7QnO1xuICBidG4udGV4dENvbnRlbnQgPSAn8J+SviBTYXZlIG5vdGUnO1xuICBidG4uc3R5bGUuY3NzVGV4dCA9IGBcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgYm90dG9tOiAxMDBweDtcbiAgICByaWdodDogMjRweDtcbiAgICBiYWNrZ3JvdW5kOiAjMWE3M2U4O1xuICAgIGNvbG9yOiB3aGl0ZTtcbiAgICBib3JkZXI6IG5vbmU7XG4gICAgYm9yZGVyLXJhZGl1czogMjBweDtcbiAgICBwYWRkaW5nOiA4cHggMTZweDtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgc2Fucy1zZXJpZjtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgei1pbmRleDogOTk5OTtcbiAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwwLjI1KTtcbiAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMnM7XG4gIGA7XG5cbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG4gICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzE1NTdiMCc7XG4gIH0pO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICcjMWE3M2U4JztcbiAgfSk7XG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBzYXZlTm90ZShlLnNoaWZ0S2V5KSk7XG5cbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChidG4pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZUV4cG9ydCgpOiB2b2lkIHtcbiAgY29uc3QgY2hhdElkID0gZ2V0Q2hhdElkKCk7XG4gIGlmICghY2hhdElkIHx8IGNoYXRJZCA9PT0gJ2FwcCcpIHJldHVybjtcbiAgY3JlYXRlRXhwb3J0QnV0dG9uKCk7XG59XG4iLCJjb25zdCBTRUxFQ1RPUl9JRCA9ICdnZW1pbmktcXVpY2stcHJvbXB0LXNlbGVjdG9yJztcbmNvbnN0IFBMQUNFSE9MREVSID0gJy0tIOOCr+OCpOODg+OCryAtLSc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1FVSUNLX1BST01QVFMgPSBbXG4gICfjgZPjgZPjgb7jgafjga7lhoXlrrnjgpLjgb7jgajjgoHjgaYnLFxuICAn57aa44GN44KS5pWZ44GI44GmJyxcbiAgJ+OCguOBo+OBqOips+OBl+OBj+aVmeOBiOOBpicsXG4gICflhbfkvZPkvovjgpLmjJnjgZLjgaYnLFxuXTtcblxubGV0IHF1aWNrUHJvbXB0czogc3RyaW5nW10gPSBbLi4uREVGQVVMVF9RVUlDS19QUk9NUFRTXTtcblxuZnVuY3Rpb24gbG9hZFF1aWNrUHJvbXB0cygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsncXVpY2tQcm9tcHRzJ10sIChyZXN1bHQpID0+IHtcbiAgICAgIGlmIChyZXN1bHQucXVpY2tQcm9tcHRzICYmIHJlc3VsdC5xdWlja1Byb21wdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBxdWlja1Byb21wdHMgPSByZXN1bHQucXVpY2tQcm9tcHRzO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShxdWlja1Byb21wdHMpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZFRleHRhcmVhKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIHJldHVybiAoXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKVxuICApO1xufVxuXG5mdW5jdGlvbiBmaW5kU2VuZEJ1dHRvbigpOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwge1xuICByZXR1cm4gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFxuICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIumAgeS/oVwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VuZFwiXSdcbiAgICApIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5zZW5kLWJ1dHRvbicpIHx8XG4gICAgQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uJykpLmZpbmQoXG4gICAgICAoYnRuKSA9PlxuICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCfpgIHkv6EnKSB8fFxuICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCdTZW5kJylcbiAgICApIHx8XG4gICAgbnVsbFxuICApO1xufVxuXG5mdW5jdGlvbiB3cml0ZUFuZFNlbmQodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID0gZmluZFRleHRhcmVhKCk7XG4gIGlmICghdGV4dGFyZWEpIHJldHVybjtcblxuICB3aGlsZSAodGV4dGFyZWEuZmlyc3RDaGlsZCkgdGV4dGFyZWEucmVtb3ZlQ2hpbGQodGV4dGFyZWEuZmlyc3RDaGlsZCk7XG5cbiAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgcC50ZXh0Q29udGVudCA9IHRleHQ7XG4gIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICB0ZXh0YXJlYS5mb2N1cygpO1xuXG4gIGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGNvbnN0IHNlbmRCdXR0b24gPSBmaW5kU2VuZEJ1dHRvbigpO1xuICAgIGlmIChzZW5kQnV0dG9uICYmICFzZW5kQnV0dG9uLmRpc2FibGVkKSBzZW5kQnV0dG9uLmNsaWNrKCk7XG4gIH0sIDIwMCk7XG59XG5cbmZ1bmN0aW9uIGluamVjdFNlbGVjdG9yKCk6IHZvaWQge1xuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNFTEVDVE9SX0lEKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHdyYXBwZXIuaWQgPSBTRUxFQ1RPUl9JRDtcbiAgd3JhcHBlci5jbGFzc05hbWUgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJztcblxuICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzZWxlY3QnKTtcbiAgc2VsZWN0LnRpdGxlID0gJ+OCr+OCpOODg+OCr+ODl+ODreODs+ODl+ODiCc7XG4gIHNlbGVjdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAn44Kv44Kk44OD44Kv44OX44Ot44Oz44OX44OIJyk7XG5cbiAgY29uc3QgcGxhY2Vob2xkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgcGxhY2Vob2xkZXIudmFsdWUgPSAnJztcbiAgcGxhY2Vob2xkZXIudGV4dENvbnRlbnQgPSBQTEFDRUhPTERFUjtcbiAgcGxhY2Vob2xkZXIuZGlzYWJsZWQgPSB0cnVlO1xuICBwbGFjZWhvbGRlci5zZWxlY3RlZCA9IHRydWU7XG4gIHNlbGVjdC5hcHBlbmRDaGlsZChwbGFjZWhvbGRlcik7XG5cbiAgcXVpY2tQcm9tcHRzLmZvckVhY2goKHByb21wdCkgPT4ge1xuICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgIG9wdGlvbi52YWx1ZSA9IHByb21wdDtcbiAgICBvcHRpb24udGV4dENvbnRlbnQgPSBwcm9tcHQubGVuZ3RoID4gMjAgPyBwcm9tcHQuc3Vic3RyaW5nKDAsIDE4KSArICfigKYnIDogcHJvbXB0O1xuICAgIG9wdGlvbi50aXRsZSA9IHByb21wdDtcbiAgICBzZWxlY3QuYXBwZW5kQ2hpbGQob3B0aW9uKTtcbiAgfSk7XG5cbiAgc2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICBjb25zdCB0ZXh0ID0gc2VsZWN0LnZhbHVlO1xuICAgIGlmICh0ZXh0KSB7XG4gICAgICB3cml0ZUFuZFNlbmQodGV4dCk7XG4gICAgICBzZWxlY3Quc2VsZWN0ZWRJbmRleCA9IDA7XG4gICAgfVxuICB9KTtcblxuICB3cmFwcGVyLmFwcGVuZENoaWxkKHNlbGVjdCk7XG5cbiAgY29uc3QgZGVlcERpdmVTZWxlY3RvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3InKTtcbiAgaWYgKGRlZXBEaXZlU2VsZWN0b3I/LnBhcmVudEVsZW1lbnQpIHtcbiAgICBkZWVwRGl2ZVNlbGVjdG9yLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGRlZXBEaXZlU2VsZWN0b3IubmV4dFNpYmxpbmcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHRyYWlsaW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy50cmFpbGluZy1hY3Rpb25zLXdyYXBwZXInKTtcbiAgaWYgKHRyYWlsaW5nKSB7XG4gICAgY29uc3QgbW9kZWxQaWNrZXIgPSB0cmFpbGluZy5xdWVyeVNlbGVjdG9yKCcubW9kZWwtcGlja2VyLWNvbnRhaW5lcicpO1xuICAgIGlmIChtb2RlbFBpY2tlcikge1xuICAgICAgdHJhaWxpbmcuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIG1vZGVsUGlja2VyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhaWxpbmcuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIHRyYWlsaW5nLmZpcnN0Q2hpbGQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB0ZXh0YXJlYSA9IGZpbmRUZXh0YXJlYSgpO1xuICBjb25zdCBpbnB1dEZpZWxkID0gdGV4dGFyZWE/LmNsb3Nlc3QoJy50ZXh0LWlucHV0LWZpZWxkJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAoaW5wdXRGaWVsZCkge1xuICAgIGlucHV0RmllbGQuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvY3VzUXVpY2tQcm9tcHRTZWxlY3RvcigpOiB2b2lkIHtcbiAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNFTEVDVE9SX0lEKTtcbiAgY29uc3Qgc2VsZWN0ID0gd3JhcHBlcj8ucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XG4gIGlmIChzZWxlY3QpIHtcbiAgICBzZWxlY3QuZm9jdXMoKTtcbiAgICBzZWxlY3Quc2hvd1BpY2tlcj8uKCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUXVpY2tQcm9tcHRGb2N1c2VkKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gZG9jdW1lbnQuYWN0aXZlRWxlbWVudD8uY2xvc2VzdChgIyR7U0VMRUNUT1JfSUR9YCkgIT09IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplUXVpY2tQcm9tcHRzKCk6IHZvaWQge1xuICBsb2FkUXVpY2tQcm9tcHRzKCkudGhlbigoKSA9PiB7XG4gICAgbGV0IGF0dGVtcHRzID0gMDtcbiAgICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGF0dGVtcHRzKys7XG4gICAgICBpZiAoZmluZFRleHRhcmVhKCkpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gaW5qZWN0U2VsZWN0b3IoKSwgNTAwKTtcbiAgICAgIH0gZWxzZSBpZiAoYXR0ZW1wdHMgPj0gMTUpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICB9XG4gICAgfSwgNTAwKTtcbiAgfSk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBuYW1lc3BhY2UpID0+IHtcbiAgICBpZiAobmFtZXNwYWNlID09PSAnc3luYycgJiYgY2hhbmdlcy5xdWlja1Byb21wdHMpIHtcbiAgICAgIHF1aWNrUHJvbXB0cyA9IGNoYW5nZXMucXVpY2tQcm9tcHRzLm5ld1ZhbHVlIHx8IFsuLi5ERUZBVUxUX1FVSUNLX1BST01QVFNdO1xuICAgICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNFTEVDVE9SX0lEKSkgaW5qZWN0U2VsZWN0b3IoKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiLy8gS2V5Ym9hcmQgZXZlbnQgaGFuZGxlcnNcblxuaW1wb3J0IHsgaXNTaG9ydGN1dCwgbG9hZFNob3J0Y3V0cywgZ2V0U2hvcnRjdXRzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XG5pbXBvcnQgeyBpc0F1dG9jb21wbGV0ZVZpc2libGUgfSBmcm9tICcuL2F1dG9jb21wbGV0ZSc7XG5pbXBvcnQge1xuICBzY3JvbGxDaGF0QXJlYSxcbiAgZm9jdXNUZXh0YXJlYSxcbiAgdG9nZ2xlU2lkZWJhcixcbiAgZ2V0QWxsQWN0aW9uQnV0dG9ucyxcbiAgZm9jdXNBY3Rpb25CdXR0b24sXG4gIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyxcbn0gZnJvbSAnLi9jaGF0JztcbmltcG9ydCB7XG4gIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUsXG4gIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgbW92ZUhpc3RvcnlVcCxcbiAgbW92ZUhpc3RvcnlEb3duLFxuICBvcGVuU2VsZWN0ZWRIaXN0b3J5LFxufSBmcm9tICcuL2hpc3RvcnknO1xuaW1wb3J0IHtcbiAgaXNTZWFyY2hQYWdlLFxuICBtb3ZlU2VhcmNoUmVzdWx0VXAsXG4gIG1vdmVTZWFyY2hSZXN1bHREb3duLFxuICBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQsXG59IGZyb20gJy4vc2VhcmNoJztcbmltcG9ydCB7IHNhdmVOb3RlIH0gZnJvbSAnLi9leHBvcnQnO1xuaW1wb3J0IHsgZm9jdXNRdWlja1Byb21wdFNlbGVjdG9yLCBpc1F1aWNrUHJvbXB0Rm9jdXNlZCB9IGZyb20gJy4vcXVpY2stcHJvbXB0cyc7XG5cbmxldCBsYXN0Rm9jdXNlZEFjdGlvbkJ1dHRvbkluZGV4ID0gLTE7XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgbGFzdEZvY3VzZWRBY3Rpb25CdXR0b25JbmRleCA9IGluZGV4O1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTZWFyY2hQYWdlS2V5ZG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuICBpZiAoaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHtcbiAgICBpZiAoXG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd1VwJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRW50ZXInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdUYWInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFc2NhcGUnXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2gubW92ZVVwJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgIG1vdmVTZWFyY2hSZXN1bHRVcCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2gubW92ZURvd24nKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgbW92ZVNlYXJjaFJlc3VsdERvd24oKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLm9wZW5SZXN1bHQnKSkge1xuICAgIGlmIChldmVudC5pc0NvbXBvc2luZykgcmV0dXJuIGZhbHNlO1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgb3BlblNlbGVjdGVkU2VhcmNoUmVzdWx0KCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5zY3JvbGxVcCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IC13aW5kb3cuaW5uZXJIZWlnaHQgKiAwLjgsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5zY3JvbGxEb3duJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHdpbmRvdy5zY3JvbGxCeSh7IHRvcDogd2luZG93LmlubmVySGVpZ2h0ICogMC44LCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3Qgc2hvcnRjdXRzID0gZ2V0U2hvcnRjdXRzKCk7XG4gIGNvbnN0IGNoYXRLZXlzID0gT2JqZWN0LnZhbHVlcyhzaG9ydGN1dHMuY2hhdCk7XG4gIGlmIChjaGF0S2V5cy5pbmNsdWRlcyhldmVudC5jb2RlKSkgcmV0dXJuIHRydWU7XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVDaGF0UGFnZUtleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcbiAgY29uc3QgaXNJbklucHV0ID0gKGV2ZW50LnRhcmdldCBhcyBFbGVtZW50KS5tYXRjaGVzKFxuICAgICdpbnB1dCwgdGV4dGFyZWEsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJ1xuICApO1xuXG4gIGlmIChpc0F1dG9jb21wbGV0ZVZpc2libGUoKSkge1xuICAgIGlmIChcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0Fycm93VXAnIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd0Rvd24nIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFbnRlcicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ1RhYicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0VzY2FwZSdcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBpZiAoZXZlbnQuY29kZSA9PT0gJ0hvbWUnICYmICFldmVudC5tZXRhS2V5ICYmICFldmVudC5jdHJsS2V5KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBzYXZlTm90ZShldmVudC5zaGlmdEtleSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoZXZlbnQuY3RybEtleSAmJiBldmVudC5zaGlmdEtleSAmJiBldmVudC5jb2RlID09PSAnS2V5RCcpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHdpbmRvdy5kb21BbmFseXplcj8uY29weVRvQ2xpcGJvYXJkKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuZm9jdXNRdWlja1Byb21wdCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBpZiAoaXNRdWlja1Byb21wdEZvY3VzZWQoKSkge1xuICAgICAgZm9jdXNUZXh0YXJlYSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmb2N1c1F1aWNrUHJvbXB0U2VsZWN0b3IoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQudG9nZ2xlU2lkZWJhcicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB0b2dnbGVTaWRlYmFyKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQudG9nZ2xlSGlzdG9yeU1vZGUnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICBjb25zdCBhY3Rpb25CdXR0b25zID0gZ2V0QWxsQWN0aW9uQnV0dG9ucygpO1xuICAgIGNvbnN0IGhhc1Jlc3BvbnNlcyA9IGFjdGlvbkJ1dHRvbnMubGVuZ3RoID4gMDtcblxuICAgIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkpIHtcbiAgICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgZm9jdXNUZXh0YXJlYSgpO1xuICAgIH0gZWxzZSBpZiAoaXNJbklucHV0KSB7XG4gICAgICBpZiAoaGFzUmVzcG9uc2VzKSB7XG4gICAgICAgIGxldCB0YXJnZXRJbmRleCA9IGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXg7XG4gICAgICAgIGlmICh0YXJnZXRJbmRleCA8IDAgfHwgdGFyZ2V0SW5kZXggPj0gYWN0aW9uQnV0dG9ucy5sZW5ndGgpIHtcbiAgICAgICAgICB0YXJnZXRJbmRleCA9IGFjdGlvbkJ1dHRvbnMubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgICAgICBhY3Rpb25CdXR0b25zW3RhcmdldEluZGV4XS5mb2N1cygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmb2N1c2VkRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29uc3QgaXNBY3Rpb25CdXR0b24gPVxuICAgICAgICBmb2N1c2VkRWxlbWVudCAmJlxuICAgICAgICAoZm9jdXNlZEVsZW1lbnQuY2xhc3NMaXN0Py5jb250YWlucygnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKSB8fFxuICAgICAgICAgIGZvY3VzZWRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2RlZXAtZGl2ZScpO1xuICAgICAgaWYgKGlzQWN0aW9uQnV0dG9uKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KFxuICAgICAgICAgIChidG4pID0+IGJ0biA9PT0gZm9jdXNlZEVsZW1lbnRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCAhPT0gLTEpIGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXggPSBjdXJyZW50SW5kZXg7XG4gICAgICAgIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzVGV4dGFyZWEoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlFeGl0JykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnNjcm9sbFVwJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHNjcm9sbENoYXRBcmVhKCd1cCcpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnNjcm9sbERvd24nKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgc2Nyb2xsQ2hhdEFyZWEoJ2Rvd24nKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkpIHtcbiAgICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtb3ZlSGlzdG9yeVVwKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtb3ZlSGlzdG9yeURvd24oKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeU9wZW4nKSkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG9wZW5TZWxlY3RlZEhpc3RvcnkoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAhaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmXG4gICAgaXNJbklucHV0ICYmXG4gICAgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpIHx8IGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJykpXG4gICkge1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcbiAgICBpZiAodGV4dGFyZWEgJiYgdGV4dGFyZWEudGV4dENvbnRlbnQ/LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBkaXJlY3Rpb24gPSBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSA/ICd1cCcgOiAnZG93bic7XG4gICAgICBmb2N1c0FjdGlvbkJ1dHRvbihkaXJlY3Rpb24pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkgJiYgIWlzSW5JbnB1dCkge1xuICAgIGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgaXNBY3Rpb25CdXR0b24gPVxuICAgICAgZm9jdXNlZEVsZW1lbnQgJiZcbiAgICAgIChmb2N1c2VkRWxlbWVudC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdkZWVwLWRpdmUtYnV0dG9uLWlubGluZScpIHx8XG4gICAgICAgIGZvY3VzZWRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2RlZXAtZGl2ZScpO1xuXG4gICAgaWYgKGlzQWN0aW9uQnV0dG9uKSB7XG4gICAgICBpZiAoXG4gICAgICAgIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpIHx8XG4gICAgICAgIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJylcbiAgICAgICkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSA/ICd1cCcgOiAnZG93bic7XG4gICAgICAgIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyhkaXJlY3Rpb24pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnIHx8IGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeU9wZW4nKSkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBmb2N1c2VkRWxlbWVudC5jbGljaygpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmNvbnN0IEtFWUJPQVJEX0hBTkRMRVJfS0VZID0gJ19fZ2VtaW5pS2V5Ym9hcmRIYW5kbGVyVmVyc2lvbic7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplS2V5Ym9hcmRIYW5kbGVycygpOiB2b2lkIHtcbiAgY29uc3QgdmVyc2lvbiA9IERhdGUubm93KCkudG9TdHJpbmcoKTtcbiAgKGRvY3VtZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtLRVlCT0FSRF9IQU5ETEVSX0tFWV0gPSB2ZXJzaW9uO1xuXG4gIGxvYWRTaG9ydGN1dHMoKS50aGVuKCgpID0+IHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFxuICAgICAgJ2tleWRvd24nLFxuICAgICAgKGV2ZW50KSA9PiB7XG4gICAgICAgIGlmICgoZG9jdW1lbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW0tFWUJPQVJEX0hBTkRMRVJfS0VZXSAhPT0gdmVyc2lvbikgcmV0dXJuO1xuICAgICAgICBpZiAoaXNTZWFyY2hQYWdlKCkpIHtcbiAgICAgICAgICBoYW5kbGVTZWFyY2hQYWdlS2V5ZG93bihldmVudCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGhhbmRsZUNoYXRQYWdlS2V5ZG93bihldmVudCk7XG4gICAgICB9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH0pO1xufVxuIiwiLy8gRGVlcCBkaXZlIGZ1bmN0aW9uYWxpdHkgZm9yIEdlbWluaSByZXNwb25zZXNcblxuaW50ZXJmYWNlIERlZXBEaXZlTW9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHByb21wdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIERlZXBEaXZlVGFyZ2V0IHtcbiAgdHlwZTogJ3NlY3Rpb24nIHwgJ3RhYmxlJyB8ICdibG9ja3F1b3RlJyB8ICdsaXN0JyB8ICdjaGlsZCcgfCAnb3JwaGFuJztcbiAgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG4gIGdldENvbnRlbnQ6ICgpID0+IHN0cmluZztcbiAgZXhwYW5kQnV0dG9uSWQ/OiBzdHJpbmc7XG59XG5cbmNvbnN0IERFRkFVTFRfREVFUF9ESVZFX01PREVTOiBEZWVwRGl2ZU1vZGVbXSA9IFtcbiAgeyBpZDogJ2RlZmF1bHQnLCBwcm9tcHQ6ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nIH0sXG5dO1xuXG5jb25zdCBTRVNTSU9OX0lEID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpO1xuXG5mdW5jdGlvbiBhZGREZWVwRGl2ZUJ1dHRvbnMoKTogdm9pZCB7XG4gIGNvbnN0IHJlc3BvbnNlQ29udGFpbmVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tYXJrZG93bi1tYWluLXBhbmVsJyk7XG4gIGlmIChyZXNwb25zZUNvbnRhaW5lcnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgcmVzcG9uc2VDb250YWluZXJzLmZvckVhY2goKHJlc3BvbnNlQ29udGFpbmVyKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0czogRGVlcERpdmVUYXJnZXRbXSA9IFtdO1xuXG4gICAgY29uc3QgaGVhZGluZ3MgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICdoMVtkYXRhLXBhdGgtdG8tbm9kZV0sIGgyW2RhdGEtcGF0aC10by1ub2RlXSwgaDNbZGF0YS1wYXRoLXRvLW5vZGVdLCBoNFtkYXRhLXBhdGgtdG8tbm9kZV0sIGg1W2RhdGEtcGF0aC10by1ub2RlXSwgaDZbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICk7XG4gICAgY29uc3QgaGFzSGVhZGluZ3MgPSBoZWFkaW5ncy5sZW5ndGggPiAwO1xuXG4gICAgaWYgKGhhc0hlYWRpbmdzKSB7XG4gICAgICBoZWFkaW5ncy5mb3JFYWNoKChoZWFkaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gaGVhZGluZy5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nLmdldEF0dHJpYnV0ZSgnZGF0YS1pbml0aWFsaXplZCcpID09PSBTRVNTSU9OX0lEKSByZXR1cm47XG4gICAgICAgICAgaGVhZGluZy5xdWVyeVNlbGVjdG9yQWxsKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUsIC5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbicpLmZvckVhY2goKGIpID0+IGIucmVtb3ZlKCkpO1xuICAgICAgICB9XG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ3NlY3Rpb24nLFxuICAgICAgICAgIGVsZW1lbnQ6IGhlYWRpbmcsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0U2VjdGlvbkNvbnRlbnQoaGVhZGluZyksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHRhYmxlcyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAndGFibGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIHRhYmxlcy5mb3JFYWNoKCh0YWJsZSkgPT4ge1xuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGFibGUuY2xvc2VzdDxIVE1MRWxlbWVudD4oJy50YWJsZS1ibG9jay1jb21wb25lbnQnKTtcbiAgICAgICAgaWYgKHdyYXBwZXIpIHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHdyYXBwZXIucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcuZ2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykgPT09IFNFU1NJT05fSUQpIHJldHVybjtcbiAgICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ3RhYmxlJyxcbiAgICAgICAgICAgIGVsZW1lbnQ6IHdyYXBwZXIsXG4gICAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRUYWJsZUNvbnRlbnQodGFibGUpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaC9ociDjgavlsZ7jgZXjgarjgYTlraTnq4vmrrXokL3jg5bjg63jg4Pjgq/vvIjlhYjpoK3jg7vmnKvlsL7jgarjganvvInjgpLjgr/jg7zjgrLjg4Pjg4jjgavov73liqBcbiAgICAgIGNvbnN0IG9ycGhhbkdyb3VwcyA9IGdldE9ycGhhblBhcmFncmFwaEdyb3VwcyhyZXNwb25zZUNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCwgaGVhZGluZ3MpO1xuICAgICAgb3JwaGFuR3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gZ3JvdXAuYW5jaG9yLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuZ2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykgPT09IFNFU1NJT05fSUQpIHJldHVybjtcbiAgICAgICAgICBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdvcnBoYW4nLFxuICAgICAgICAgIGVsZW1lbnQ6IGdyb3VwLmFuY2hvcixcbiAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBncm91cC5lbGVtZW50cy5tYXAoKGVsKSA9PiBlbC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnKS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuXFxuJyksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlcyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAndGFibGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIHRhYmxlcy5mb3JFYWNoKCh0YWJsZSkgPT4ge1xuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGFibGUuY2xvc2VzdDxIVE1MRWxlbWVudD4oJy50YWJsZS1ibG9jay1jb21wb25lbnQnKTtcbiAgICAgICAgaWYgKHdyYXBwZXIpIHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHdyYXBwZXIucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcuZ2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykgPT09IFNFU1NJT05fSUQpIHJldHVybjtcbiAgICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ3RhYmxlJyxcbiAgICAgICAgICAgIGVsZW1lbnQ6IHdyYXBwZXIsXG4gICAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRUYWJsZUNvbnRlbnQodGFibGUpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgYmxvY2txdW90ZXMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ2Jsb2NrcXVvdGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGJsb2NrcXVvdGVzLmZvckVhY2goKGJsb2NrcXVvdGUpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBibG9ja3F1b3RlLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuZ2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykgPT09IFNFU1NJT05fSUQpIHJldHVybjtcbiAgICAgICAgICBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdibG9ja3F1b3RlJyxcbiAgICAgICAgICBlbGVtZW50OiBibG9ja3F1b3RlLFxuICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGJsb2NrcXVvdGUudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJyxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgbGlzdHMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ29sW2RhdGEtcGF0aC10by1ub2RlXSwgdWxbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGxpc3RzLmZvckVhY2goKGxpc3QpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBsaXN0LnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuZ2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykgPT09IFNFU1NJT05fSUQpIHJldHVybjtcbiAgICAgICAgICBsaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSwgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJykuZm9yRWFjaCgoYikgPT4gYi5yZW1vdmUoKSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcGFyZW50ID0gbGlzdC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBsZXQgaXNOZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgd2hpbGUgKHBhcmVudCAmJiBwYXJlbnQgIT09IHJlc3BvbnNlQ29udGFpbmVyKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHBhcmVudC50YWdOYW1lID09PSAnT0wnIHx8IHBhcmVudC50YWdOYW1lID09PSAnVUwnKSAmJlxuICAgICAgICAgICAgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZGF0YS1wYXRoLXRvLW5vZGUnKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgaXNOZXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc05lc3RlZCkgcmV0dXJuO1xuXG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ2xpc3QnLFxuICAgICAgICAgIGVsZW1lbnQ6IGxpc3QsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0TGlzdENvbnRlbnQobGlzdCksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGFyZ2V0cy5mb3JFYWNoKCh0YXJnZXQpID0+IGFkZERlZXBEaXZlQnV0dG9uKHRhcmdldCkpO1xuICB9KTtcbn1cblxuaW50ZXJmYWNlIE9ycGhhbkdyb3VwIHtcbiAgYW5jaG9yOiBIVE1MRWxlbWVudDtcbiAgZWxlbWVudHM6IEhUTUxFbGVtZW50W107XG59XG5cbmZ1bmN0aW9uIGdldE9ycGhhblBhcmFncmFwaEdyb3VwcyhcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcbiAgaGVhZGluZ3M6IE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+XG4pOiBPcnBoYW5Hcm91cFtdIHtcbiAgY29uc3QgaGVhZGluZ1NldCA9IG5ldyBTZXQoQXJyYXkuZnJvbShoZWFkaW5ncykpO1xuICBjb25zdCBjaGlsZHJlbiA9IEFycmF5LmZyb20oY29udGFpbmVyLmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdO1xuICBjb25zdCBncm91cHM6IE9ycGhhbkdyb3VwW10gPSBbXTtcbiAgbGV0IGN1cnJlbnQ6IEhUTUxFbGVtZW50W10gPSBbXTtcbiAgLy8g55u05YmN44Gu5Yy65YiH44KK44GMaOOCv+OCsOOBi+OBqeOBhuOBi++8iGjjgr/jgrDnm7Tlvozjga5w44Gv44K744Kv44K344On44Oz5pys5paH44Gq44Gu44Gnb3JwaGFu44Gn44Gv44Gq44GE77yJXG4gIGxldCBwcmV2QnJlYWtlcldhc0hlYWRpbmcgPSBmYWxzZTtcblxuICBjb25zdCBmbHVzaCA9IChhZnRlckhlYWRpbmc6IGJvb2xlYW4pID0+IHtcbiAgICBpZiAoY3VycmVudC5sZW5ndGggPiAwICYmICFhZnRlckhlYWRpbmcpIHtcbiAgICAgIGdyb3Vwcy5wdXNoKHsgYW5jaG9yOiBjdXJyZW50WzBdLCBlbGVtZW50czogWy4uLmN1cnJlbnRdIH0pO1xuICAgIH1cbiAgICBjdXJyZW50ID0gW107XG4gIH07XG5cbiAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgIGNvbnN0IHRhZyA9IGNoaWxkLnRhZ05hbWU7XG4gICAgY29uc3QgaXNQYXJhZ3JhcGggPSB0YWcgPT09ICdQJztcbiAgICBjb25zdCBpc0hlYWRpbmcgPVxuICAgICAgaGVhZGluZ1NldC5oYXMoY2hpbGQpIHx8XG4gICAgICB0YWcgPT09ICdIMScgfHwgdGFnID09PSAnSDInIHx8IHRhZyA9PT0gJ0gzJyB8fFxuICAgICAgdGFnID09PSAnSDQnIHx8IHRhZyA9PT0gJ0g1JyB8fCB0YWcgPT09ICdINic7XG4gICAgY29uc3QgaXNIciA9IHRhZyA9PT0gJ0hSJztcblxuICAgIGlmIChpc0hlYWRpbmcpIHtcbiAgICAgIGZsdXNoKHByZXZCcmVha2VyV2FzSGVhZGluZyk7XG4gICAgICBwcmV2QnJlYWtlcldhc0hlYWRpbmcgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaXNIcikge1xuICAgICAgZmx1c2gocHJldkJyZWFrZXJXYXNIZWFkaW5nKTtcbiAgICAgIHByZXZCcmVha2VyV2FzSGVhZGluZyA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAoaXNQYXJhZ3JhcGgpIHtcbiAgICAgIGN1cnJlbnQucHVzaChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHVsL29sL3RhYmxlL2Jsb2NrcXVvdGUg562J44Gv44Kw44Or44O844OX44KS5Yy65YiH44KL44Gg44GR44Gn5Y+O6ZuG44GX44Gq44GEXG4gICAgICBmbHVzaChwcmV2QnJlYWtlcldhc0hlYWRpbmcpO1xuICAgICAgcHJldkJyZWFrZXJXYXNIZWFkaW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZsdXNoKHByZXZCcmVha2VyV2FzSGVhZGluZyk7XG5cbiAgcmV0dXJuIGdyb3Vwcztcbn1cblxuZnVuY3Rpb24gZ2V0U2VjdGlvbkNvbnRlbnQoaGVhZGluZzogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBsZXQgY29udGVudCA9IChoZWFkaW5nLnRleHRDb250ZW50Py50cmltKCkgPz8gJycpICsgJ1xcblxcbic7XG4gIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXG4gIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnRlbnQgKz0gKGN1cnJlbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJykgKyAnXFxuXFxuJztcbiAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICB9XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUYWJsZUNvbnRlbnQodGFibGU6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgbGV0IGNvbnRlbnQgPSAnJztcbiAgY29uc3Qgcm93cyA9IHRhYmxlLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTFRhYmxlUm93RWxlbWVudD4oJ3RyJyk7XG5cbiAgcm93cy5mb3JFYWNoKChyb3csIHJvd0luZGV4KSA9PiB7XG4gICAgY29uc3QgY2VsbHMgPSByb3cucXVlcnlTZWxlY3RvckFsbCgndGQsIHRoJyk7XG4gICAgY29uc3QgY2VsbFRleHRzID0gQXJyYXkuZnJvbShjZWxscykubWFwKChjZWxsKSA9PlxuICAgICAgY2VsbC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnXG4gICAgKTtcbiAgICBjb250ZW50ICs9ICd8ICcgKyBjZWxsVGV4dHMuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIGlmIChyb3dJbmRleCA9PT0gMCkge1xuICAgICAgY29udGVudCArPSAnfCAnICsgY2VsbFRleHRzLm1hcCgoKSA9PiAnLS0tJykuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRMaXN0Q29udGVudChsaXN0OiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIHJldHVybiBsaXN0LnRleHRDb250ZW50Py50cmltKCkgPz8gJyc7XG59XG5cbnR5cGUgRGVlcERpdmVCdXR0b25FbGVtZW50ID0gSFRNTEJ1dHRvbkVsZW1lbnQgJiB7XG4gIF9kZWVwRGl2ZVRhcmdldD86IERlZXBEaXZlVGFyZ2V0O1xufTtcblxuZnVuY3Rpb24gYWRkRGVlcERpdmVCdXR0b24odGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSBhcyBEZWVwRGl2ZUJ1dHRvbkVsZW1lbnQ7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdkZWVwLWRpdmUnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1pbml0aWFsaXplZCcsIFNFU1NJT05fSUQpO1xuICBidXR0b24udGl0bGUgPSAnRGVlcCBkaXZlIGludG8gdGhpcyBjb250ZW50JztcbiAgYnV0dG9uLl9kZWVwRGl2ZVRhcmdldCA9IHRhcmdldDtcblxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd3aWR0aCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTYnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgMjQgMjQnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdjdXJyZW50Q29sb3InKTtcbiAgY29uc3QgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnZCcsICdNMTkgMTVsLTYgNi0xLjUtMS41TDE1IDE2SDRWOWgydjVoOWwtMy41LTMuNUwxMyA5bDYgNnonKTtcbiAgc3ZnLmFwcGVuZENoaWxkKHBhdGgpO1xuICBidXR0b24uYXBwZW5kQ2hpbGQoc3ZnKTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGluc2VydERlZXBEaXZlUXVlcnkodGFyZ2V0LCBlLmN0cmxLZXkpO1xuICB9KTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5ID09PSAnQXJyb3dSaWdodCcgJiYgIWUuYWx0S2V5ICYmICFlLmN0cmxLZXkgJiYgIWUubWV0YUtleSkge1xuICAgICAgY29uc3QgZXhwYW5kQnRuID0gdGFyZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbicpO1xuICAgICAgaWYgKGV4cGFuZEJ0bikge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIHRvZ2dsZUV4cGFuZCh0YXJnZXQsIGV4cGFuZEJ0bik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcgJiYgIWUuYWx0S2V5ICYmICFlLmN0cmxLZXkgJiYgIWUubWV0YUtleSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJykpIHtcbiAgICAgICAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcbiAgICAgICAgYnV0dG9uLmZvY3VzKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzaG93VGVtcGxhdGVQb3B1cChidXR0b24sIHRhcmdldCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBsZXQgZXhwYW5kQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJyB8fCB0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgZXhwYW5kQnV0dG9uID0gY3JlYXRlRXhwYW5kQnV0dG9uKHRhcmdldCk7XG4gIH1cblxuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5nYXAgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIGlmIChleHBhbmRCdXR0b24pIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGV4cGFuZEJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICd0YWJsZScpIHtcbiAgICBjb25zdCBmb290ZXIgPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnRhYmxlLWZvb3RlcicpO1xuICAgIGlmIChmb290ZXIpIHtcbiAgICAgIGNvbnN0IGNvcHlCdXR0b24gPSBmb290ZXIucXVlcnlTZWxlY3RvcignLmNvcHktYnV0dG9uJyk7XG4gICAgICBpZiAoY29weUJ1dHRvbikge1xuICAgICAgICBmb290ZXIuaW5zZXJ0QmVmb3JlKGJ1dHRvbiwgY29weUJ1dHRvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb290ZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdibG9ja3F1b3RlJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnOHB4JztcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnb3JwaGFuJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzAnO1xuICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdsaXN0Jykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzAnO1xuICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gICAgaWYgKGV4cGFuZEJ1dHRvbikge1xuICAgICAgZXhwYW5kQnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICAgIGV4cGFuZEJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gICAgICBleHBhbmRCdXR0b24uc3R5bGUucmlnaHQgPSAnMzJweCc7XG4gICAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChleHBhbmRCdXR0b24pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVFeHBhbmRCdXR0b24odGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLWV4cGFuZC1idXR0b24nO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0V4cGFuZCB0byBzZWxlY3QnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnZXhwYW5kJyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7XG4gIGJ1dHRvbi50aXRsZSA9ICdFeHBhbmQgdG8gc2VsZWN0JztcbiAgYnV0dG9uLnRleHRDb250ZW50ID0gJysnO1xuICBidXR0b24uc3R5bGUuZm9udFNpemUgPSAnMTRweCc7XG4gIGJ1dHRvbi5zdHlsZS5mb250V2VpZ2h0ID0gJ2JvbGQnO1xuXG4gIGJ1dHRvbi5kYXRhc2V0LnRhcmdldElkID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpO1xuICB0YXJnZXQuZXhwYW5kQnV0dG9uSWQgPSBidXR0b24uZGF0YXNldC50YXJnZXRJZDtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHRvZ2dsZUV4cGFuZCh0YXJnZXQsIGJ1dHRvbik7XG4gIH0pO1xuXG4gIHJldHVybiBidXR0b247XG59XG5cbmZ1bmN0aW9uIHRvZ2dsZUV4cGFuZCh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0LCBidXR0b246IEhUTUxCdXR0b25FbGVtZW50KTogdm9pZCB7XG4gIGNvbnN0IGlzRXhwYW5kZWQgPSBidXR0b24uZ2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicpID09PSAnY29sbGFwc2UnO1xuXG4gIGlmIChpc0V4cGFuZGVkKSB7XG4gICAgY29sbGFwc2VDaGlsZEJ1dHRvbnModGFyZ2V0KTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdleHBhbmQnKTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0V4cGFuZCB0byBzZWxlY3QnKTtcbiAgICBidXR0b24udGl0bGUgPSAnRXhwYW5kIHRvIHNlbGVjdCc7XG4gICAgYnV0dG9uLnRleHRDb250ZW50ID0gJysnO1xuICB9IGVsc2Uge1xuICAgIGV4cGFuZENoaWxkQnV0dG9ucyh0YXJnZXQpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2NvbGxhcHNlJyk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdDb2xsYXBzZScpO1xuICAgIGJ1dHRvbi50aXRsZSA9ICdDb2xsYXBzZSc7XG4gICAgYnV0dG9uLnRleHRDb250ZW50ID0gJy0nO1xuICB9XG59XG5cbmZ1bmN0aW9uIGV4cGFuZENoaWxkQnV0dG9ucyh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0KTogdm9pZCB7XG4gIGlmICh0YXJnZXQudHlwZSA9PT0gJ3NlY3Rpb24nKSB7XG4gICAgY29uc3QgaGVhZGluZyA9IHRhcmdldC5lbGVtZW50O1xuICAgIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXG4gICAgd2hpbGUgKGN1cnJlbnQgJiYgIWN1cnJlbnQubWF0Y2hlcygnaDEsIGgyLCBoMywgaDQsIGg1LCBoNiwgaHInKSkge1xuICAgICAgaWYgKGN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0YWJsZS1ibG9jay1jb21wb25lbnQnKSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LnRhZ05hbWUgPT09ICdQJyAmJiAhY3VycmVudC5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpKSB7XG4gICAgICAgIGFkZENoaWxkQnV0dG9uKGN1cnJlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAoY3VycmVudC50YWdOYW1lID09PSAnVUwnIHx8IGN1cnJlbnQudGFnTmFtZSA9PT0gJ09MJykgJiZcbiAgICAgICAgY3VycmVudC5oYXNBdHRyaWJ1dGUoJ2RhdGEtcGF0aC10by1ub2RlJylcbiAgICAgICkge1xuICAgICAgICBjb25zdCBpdGVtcyA9IGN1cnJlbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJzpzY29wZSA+IGxpJyk7XG4gICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgICAgICBpZiAoIWl0ZW0ucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKSkge1xuICAgICAgICAgICAgYWRkQ2hpbGRCdXR0b24oaXRlbSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRhcmdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCc6c2NvcGUgPiBsaScpO1xuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGlmICghaXRlbS5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpKSB7XG4gICAgICAgIGFkZENoaWxkQnV0dG9uKGl0ZW0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFkZENoaWxkQnV0dG9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG4gIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBidXR0b24uY2xhc3NOYW1lID0gJ2RlZXAtZGl2ZS1idXR0b24taW5saW5lIGRlZXAtZGl2ZS1jaGlsZC1idXR0b24nO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdkZWVwLWRpdmUnKTtcbiAgYnV0dG9uLnRpdGxlID0gJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCc7XG4gIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gIGJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwJztcblxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd3aWR0aCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTYnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgMjQgMjQnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdjdXJyZW50Q29sb3InKTtcbiAgY29uc3QgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnZCcsICdNMTkgMTVsLTYgNi0xLjUtMS41TDE1IDE2SDRWOWgydjVoOWwtMy41LTMuNUwxMyA5bDYgNnonKTtcbiAgc3ZnLmFwcGVuZENoaWxkKHBhdGgpO1xuICBidXR0b24uYXBwZW5kQ2hpbGQoc3ZnKTtcblxuICBjb25zdCBjaGlsZFRhcmdldDogRGVlcERpdmVUYXJnZXQgPSB7XG4gICAgdHlwZTogJ2NoaWxkJyxcbiAgICBlbGVtZW50LFxuICAgIGdldENvbnRlbnQ6ICgpID0+IGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJyxcbiAgfTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGluc2VydERlZXBEaXZlUXVlcnkoY2hpbGRUYXJnZXQsIGUuY3RybEtleSk7XG4gIH0pO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5rZXkgPT09ICdBcnJvd0xlZnQnICYmICFlLmFsdEtleSAmJiAhZS5jdHJsS2V5ICYmICFlLm1ldGFLZXkpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlZXAtZGl2ZS10ZW1wbGF0ZS1wb3B1cCcpKSB7XG4gICAgICAgIGhpZGVUZW1wbGF0ZVBvcHVwKCk7XG4gICAgICAgIGJ1dHRvbi5mb2N1cygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2hvd1RlbXBsYXRlUG9wdXAoYnV0dG9uLCBjaGlsZFRhcmdldCk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBlbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG59XG5cbmZ1bmN0aW9uIGNvbGxhcHNlQ2hpbGRCdXR0b25zKHRhcmdldDogRGVlcERpdmVUYXJnZXQpOiB2b2lkIHtcbiAgaWYgKHRhcmdldC50eXBlID09PSAnc2VjdGlvbicpIHtcbiAgICBjb25zdCBoZWFkaW5nID0gdGFyZ2V0LmVsZW1lbnQ7XG4gICAgbGV0IGN1cnJlbnQgPSBoZWFkaW5nLm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgd2hpbGUgKGN1cnJlbnQgJiYgIWN1cnJlbnQubWF0Y2hlcygnaDEsIGgyLCBoMywgaDQsIGg1LCBoNiwgaHInKSkge1xuICAgICAgaWYgKGN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0YWJsZS1ibG9jay1jb21wb25lbnQnKSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnRcbiAgICAgICAgLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJylcbiAgICAgICAgLmZvckVhY2goKGJ0bikgPT4gYnRuLnJlbW92ZSgpKTtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICB0YXJnZXQuZWxlbWVudFxuICAgICAgLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJylcbiAgICAgIC5mb3JFYWNoKChidG4pID0+IGJ0bi5yZW1vdmUoKSk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hvd1RlbXBsYXRlUG9wdXAoXG4gIGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQsXG4gIHRhcmdldDogRGVlcERpdmVUYXJnZXRcbik6IFByb21pc2U8dm9pZD4ge1xuICBoaWRlVGVtcGxhdGVQb3B1cCgpO1xuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPHtcbiAgICBkZWVwRGl2ZU1vZGVzPzogRGVlcERpdmVNb2RlW107XG4gICAgY3VycmVudERlZXBEaXZlTW9kZUlkPzogc3RyaW5nO1xuICAgIGRlZXBEaXZlUmVjZW50TW9kZXM/OiBzdHJpbmdbXTtcbiAgfT4oKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcbiAgICAgIFsnZGVlcERpdmVNb2RlcycsICdjdXJyZW50RGVlcERpdmVNb2RlSWQnLCAnZGVlcERpdmVSZWNlbnRNb2RlcyddLFxuICAgICAgcmVzb2x2ZSBhcyAoaXRlbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB2b2lkXG4gICAgKTtcbiAgfSk7XG5cbiAgY29uc3QgbW9kZXMgPVxuICAgIHJlc3VsdC5kZWVwRGl2ZU1vZGVzICYmIHJlc3VsdC5kZWVwRGl2ZU1vZGVzLmxlbmd0aCA+IDBcbiAgICAgID8gcmVzdWx0LmRlZXBEaXZlTW9kZXNcbiAgICAgIDogREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM7XG5cbiAgY29uc3QgcmVjZW50SWRzID0gcmVzdWx0LmRlZXBEaXZlUmVjZW50TW9kZXMgfHwgW107XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5tb2Rlc10uc29ydCgoYSwgYikgPT4ge1xuICAgIGNvbnN0IGFpID0gcmVjZW50SWRzLmluZGV4T2YoYS5pZCk7XG4gICAgY29uc3QgYmkgPSByZWNlbnRJZHMuaW5kZXhPZihiLmlkKTtcbiAgICBpZiAoYWkgPT09IC0xICYmIGJpID09PSAtMSkgcmV0dXJuIDA7XG4gICAgaWYgKGFpID09PSAtMSkgcmV0dXJuIDE7XG4gICAgaWYgKGJpID09PSAtMSkgcmV0dXJuIC0xO1xuICAgIHJldHVybiBhaSAtIGJpO1xuICB9KTtcblxuICBjb25zdCBwb3B1cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBwb3B1cC5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJztcbiAgcG9wdXAuaWQgPSAnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJztcbiAgcG9wdXAuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnUnKTtcblxuICBjb25zdCBtYWtlSXRlbSA9IChcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIGhpbnQ6IHN0cmluZyxcbiAgICBvbkNsaWNrOiAoKSA9PiB2b2lkXG4gICk6IEhUTUxCdXR0b25FbGVtZW50ID0+IHtcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgaXRlbS5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW0nO1xuICAgIGl0ZW0uc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnVpdGVtJyk7XG4gICAgaXRlbS50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgIGlmIChoaW50KSBpdGVtLnRpdGxlID0gaGludDtcbiAgICBpdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIH0pO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGhpZGVUZW1wbGF0ZVBvcHVwKCk7XG4gICAgICBvbkNsaWNrKCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGl0ZW07XG4gIH07XG5cbiAgc29ydGVkLmZvckVhY2goKG1vZGUpID0+IHtcbiAgICBwb3B1cC5hcHBlbmRDaGlsZChcbiAgICAgIG1ha2VJdGVtKG1vZGUuaWQsIG1vZGUucHJvbXB0IHx8ICcnLCAoKSA9PiBkb0luc2VydFF1ZXJ5KHRhcmdldCwgbW9kZSkpXG4gICAgKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwb3B1cCk7XG5cbiAgY29uc3QgcmVjdCA9IGJ1dHRvbi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgcG9wdXBXID0gMTYwO1xuICBsZXQgbGVmdCA9IHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYO1xuICBpZiAobGVmdCArIHBvcHVwVyA+IHdpbmRvdy5pbm5lcldpZHRoIC0gOCkge1xuICAgIGxlZnQgPSB3aW5kb3cuaW5uZXJXaWR0aCAtIHBvcHVwVyAtIDg7XG4gIH1cbiAgcG9wdXAuc3R5bGUudG9wID0gYCR7cmVjdC5ib3R0b20gKyB3aW5kb3cuc2Nyb2xsWSArIDR9cHhgO1xuICBwb3B1cC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cbiAgY29uc3QgaXRlbXMgPSBBcnJheS5mcm9tKFxuICAgIHBvcHVwLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW0nKVxuICApO1xuICBsZXQgZm9jdXNJbmRleCA9IDA7XG4gIGl0ZW1zWzBdPy5mb2N1cygpO1xuXG4gIHBvcHVwLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScgfHwgZS5rZXkgPT09ICdBcnJvd0xlZnQnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBoaWRlVGVtcGxhdGVQb3B1cCgpO1xuICAgICAgYnV0dG9uLmZvY3VzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93RG93bicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgaXRlbXNbZm9jdXNJbmRleF0uZm9jdXMoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgaXRlbXNbZm9jdXNJbmRleF0uZm9jdXMoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnVGFiJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgaWYgKGUuc2hpZnRLZXkpIHtcbiAgICAgICAgZm9jdXNJbmRleCA9IChmb2N1c0luZGV4IC0gMSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGg7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggKyAxKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIH1cbiAgICAgIGl0ZW1zW2ZvY3VzSW5kZXhdLmZvY3VzKCk7XG4gICAgfVxuICB9KTtcblxuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhpZGVUZW1wbGF0ZVBvcHVwLCB7IG9uY2U6IHRydWUgfSk7XG4gIH0sIDApO1xufVxuXG5mdW5jdGlvbiBoaWRlVGVtcGxhdGVQb3B1cCgpOiB2b2lkIHtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlZXAtZGl2ZS10ZW1wbGF0ZS1wb3B1cCcpPy5yZW1vdmUoKTtcbn1cblxuZnVuY3Rpb24gd3JpdGVUb1RleHRhcmVhKHF1ZXJ5OiBzdHJpbmcsIGF1dG9TZW5kOiBib29sZWFuKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICApO1xuICBpZiAoIXRleHRhcmVhKSByZXR1cm47XG5cbiAgd2hpbGUgKHRleHRhcmVhLmZpcnN0Q2hpbGQpIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuXG4gIHF1ZXJ5LnNwbGl0KCdcXG4nKS5mb3JFYWNoKChsaW5lKSA9PiB7XG4gICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2JyJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwLnRleHRDb250ZW50ID0gbGluZTtcbiAgICB9XG4gICAgdGV4dGFyZWEuYXBwZW5kQ2hpbGQocCk7XG4gIH0pO1xuXG4gIHRleHRhcmVhLmZvY3VzKCk7XG4gIGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG4gIGlmIChhdXRvU2VuZCkge1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc3Qgc2VuZEJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi6YCB5L+hXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJTZW5kXCJdJ1xuICAgICAgKTtcbiAgICAgIGlmIChzZW5kQnV0dG9uICYmICFzZW5kQnV0dG9uLmRpc2FibGVkKSBzZW5kQnV0dG9uLmNsaWNrKCk7XG4gICAgfSwgMTAwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkb0luc2VydFF1ZXJ5KHRhcmdldDogRGVlcERpdmVUYXJnZXQsIG1vZGU6IERlZXBEaXZlTW9kZSk6IHZvaWQge1xuICBjb25zdCBjb250ZW50ID0gdGFyZ2V0LmdldENvbnRlbnQoKTtcbiAgY29uc3QgcXVvdGVkQ29udGVudCA9IGNvbnRlbnRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcCgobGluZSkgPT4gYD4gJHtsaW5lfWApXG4gICAgLmpvaW4oJ1xcbicpO1xuICBjb25zdCBxdWVyeSA9IHF1b3RlZENvbnRlbnQgKyAnXFxuXFxuJyArIChtb2RlLnByb21wdCB8fCAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJyk7XG4gIHdyaXRlVG9UZXh0YXJlYShxdWVyeSwgdHJ1ZSk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydkZWVwRGl2ZVJlY2VudE1vZGVzJ10sIChyKSA9PiB7XG4gICAgY29uc3QgcmVjZW50ID0gKChyLmRlZXBEaXZlUmVjZW50TW9kZXMgYXMgc3RyaW5nW10pIHx8IFtdKS5maWx0ZXIoXG4gICAgICAoaWQpID0+IGlkICE9PSBtb2RlLmlkXG4gICAgKTtcbiAgICByZWNlbnQudW5zaGlmdChtb2RlLmlkKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IGRlZXBEaXZlUmVjZW50TW9kZXM6IHJlY2VudC5zbGljZSgwLCAyMCkgfSk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbnNlcnREZWVwRGl2ZVF1ZXJ5KFxuICB0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0LFxuICBxdW90ZU9ubHkgPSBmYWxzZVxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghZG9jdW1lbnQucXVlcnlTZWxlY3RvcignZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGNvbnRlbnQgPSB0YXJnZXQuZ2V0Q29udGVudCgpO1xuICBjb25zdCBxdW90ZWRDb250ZW50ID0gY29udGVudFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsaW5lKSA9PiBgPiAke2xpbmV9YClcbiAgICAuam9pbignXFxuJyk7XG5cbiAgbGV0IHF1ZXJ5OiBzdHJpbmc7XG4gIGxldCBzaG91bGRBdXRvU2VuZCA9IGZhbHNlO1xuXG4gIGlmIChxdW90ZU9ubHkpIHtcbiAgICBxdWVyeSA9IHF1b3RlZENvbnRlbnQgKyAnXFxuXFxuJztcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTx7XG4gICAgICBkZWVwRGl2ZU1vZGVzPzogRGVlcERpdmVNb2RlW107XG4gICAgICBjdXJyZW50RGVlcERpdmVNb2RlSWQ/OiBzdHJpbmc7XG4gICAgfT4oKHJlc29sdmUpID0+IHtcbiAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFxuICAgICAgICBbJ2RlZXBEaXZlTW9kZXMnLCAnY3VycmVudERlZXBEaXZlTW9kZUlkJ10sXG4gICAgICAgIHJlc29sdmUgYXMgKGl0ZW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZFxuICAgICAgKTtcbiAgICB9KTtcbiAgICBjb25zdCBtb2RlcyA9XG4gICAgICByZXN1bHQuZGVlcERpdmVNb2RlcyAmJiByZXN1bHQuZGVlcERpdmVNb2Rlcy5sZW5ndGggPiAwXG4gICAgICAgID8gcmVzdWx0LmRlZXBEaXZlTW9kZXNcbiAgICAgICAgOiBERUZBVUxUX0RFRVBfRElWRV9NT0RFUztcbiAgICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgY29uc3QgdXJsTW9kZUlkID0gdXJsUGFyYW1zLmdldCgnbW9kZV9pZCcpO1xuICAgIGxldCBtb2RlSWQgPSB1cmxNb2RlSWQgfHwgcmVzdWx0LmN1cnJlbnREZWVwRGl2ZU1vZGVJZCB8fCBtb2Rlc1swXT8uaWQ7XG4gICAgaWYgKCFtb2Rlcy5zb21lKChtKSA9PiBtLmlkID09PSBtb2RlSWQpKSBtb2RlSWQgPSBtb2Rlc1swXT8uaWQ7XG4gICAgY29uc3QgbW9kZSA9XG4gICAgICBtb2Rlcy5maW5kKChtKSA9PiBtLmlkID09PSBtb2RlSWQpIHx8XG4gICAgICBtb2Rlc1swXSB8fFxuICAgICAgREVGQVVMVF9ERUVQX0RJVkVfTU9ERVNbMF07XG4gICAgcXVlcnkgPSBxdW90ZWRDb250ZW50ICsgJ1xcblxcbicgKyAobW9kZS5wcm9tcHQgfHwgJ+OBk+OCjOOBq+OBpOOBhOOBpuips+OBl+OBjycpO1xuICAgIHNob3VsZEF1dG9TZW5kID0gdHJ1ZTtcbiAgfVxuXG4gIHdyaXRlVG9UZXh0YXJlYShxdWVyeSwgc2hvdWxkQXV0b1NlbmQpO1xufVxuXG5mdW5jdGlvbiBhZGREZWVwRGl2ZVN0eWxlcygpOiB2b2lkIHtcbiAgY29uc3Qgc3R5bGVJZCA9ICdnZW1pbmktZGVlcC1kaXZlLXN0eWxlcyc7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChzdHlsZUlkKSkgcmV0dXJuO1xuXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSBzdHlsZUlkO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUge1xuICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICB3aWR0aDogMjhweDtcbiAgICAgIGhlaWdodDogMjhweDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBjb2xvcjogIzVmNjM2ODtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzO1xuICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZTpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuMDUpO1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZTpmb2N1cyB7XG4gICAgICBvdXRsaW5lOiAycHggc29saWQgIzFhNzNlODtcbiAgICAgIG91dGxpbmUtb2Zmc2V0OiAycHg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSBzdmcge1xuICAgICAgd2lkdGg6IDE2cHg7XG4gICAgICBoZWlnaHQ6IDE2cHg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbiB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHdpZHRoOiAyOHB4O1xuICAgICAgaGVpZ2h0OiAyOHB4O1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIGNvbG9yOiAjNWY2MzY4O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICBmbGV4LXNocmluazogMDtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGZvbnQtd2VpZ2h0OiBib2xkO1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b246aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjA1KTtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b246Zm9jdXMge1xuICAgICAgb3V0bGluZTogMnB4IHNvbGlkICMxYTczZTg7XG4gICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgIH1cbiAgICBibG9ja3F1b3RlW2RhdGEtcGF0aC10by1ub2RlXSB7XG4gICAgICBwYWRkaW5nLXRvcDogNDBweDtcbiAgICB9XG4gICAgLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleCAhaW1wb3J0YW50O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIHBhZGRpbmc6IDAgOHB4O1xuICAgICAgbWFyZ2luOiAwIDRweDtcbiAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIHZlcnRpY2FsLWFsaWduOiBtaWRkbGU7XG4gICAgfVxuICAgIGJvZHkgPiAuZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGJvdHRvbTogMTAwcHg7XG4gICAgICBsZWZ0OiAzMjBweDtcbiAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgfVxuICAgIC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Igc2VsZWN0IHtcbiAgICAgIHBhZGRpbmc6IDRweCA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjZGFkY2UwO1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGNvbG9yOiAjNWY2MzY4O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgbWF4LXdpZHRoOiAxMDBweDtcbiAgICB9XG4gICAgLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciBzZWxlY3Q6aG92ZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiAjMWE3M2U4O1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgei1pbmRleDogOTk5OTk7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIG1pbi13aWR0aDogMTYwcHg7XG4gICAgICBwYWRkaW5nOiA0cHggMDtcbiAgICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjZGFkY2UwO1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsMCwwLDAuMTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgICAgd2lkdGg6IDEwMCU7XG4gICAgICBwYWRkaW5nOiA3cHggMTRweDtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGNvbG9yOiAjM2M0MDQzO1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtOmhvdmVyLFxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbTpmb2N1cyB7XG4gICAgICBiYWNrZ3JvdW5kOiAjZjFmM2Y0O1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgICBvdXRsaW5lOiBub25lO1xuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmZ1bmN0aW9uIGluamVjdE1vZGVTZWxlY3RvcigpOiB2b2lkIHtcbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJyk7XG4gIGlmIChleGlzdGluZykgZXhpc3RpbmcucmVtb3ZlKCk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoXG4gICAgWydkZWVwRGl2ZU1vZGVzJywgJ2N1cnJlbnREZWVwRGl2ZU1vZGVJZCddLFxuICAgIChyOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICAgICAgY29uc3QgbW9kZXMgPVxuICAgICAgICAoci5kZWVwRGl2ZU1vZGVzIGFzIERlZXBEaXZlTW9kZVtdIHwgdW5kZWZpbmVkKSAmJlxuICAgICAgICAoci5kZWVwRGl2ZU1vZGVzIGFzIERlZXBEaXZlTW9kZVtdKS5sZW5ndGggPiAwXG4gICAgICAgICAgPyAoci5kZWVwRGl2ZU1vZGVzIGFzIERlZXBEaXZlTW9kZVtdKVxuICAgICAgICAgIDogREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM7XG5cbiAgICAgIGNvbnN0IHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgIHdyYXBwZXIuaWQgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJztcbiAgICAgIHdyYXBwZXIuY2xhc3NOYW1lID0gJ2dlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3Rvcic7XG5cbiAgICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NlbGVjdCcpO1xuICAgICAgc2VsZWN0LmlkID0gJ2dlbWluaS1kZWVwLWRpdmUtbW9kZSc7XG4gICAgICBzZWxlY3QudGl0bGUgPSAn5rex5o6Y44KK44Oi44O844OJJztcbiAgICAgIHNlbGVjdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAn5rex5o6Y44KK44Oi44O844OJJyk7XG5cbiAgICAgIG1vZGVzLmZvckVhY2goKG1vZGUpID0+IHtcbiAgICAgICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IG1vZGUuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IG1vZGUuaWQ7XG4gICAgICAgIHNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgICAgfSk7XG5cbiAgICAgIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgY3VycmVudERlZXBEaXZlTW9kZUlkOiBzZWxlY3QudmFsdWUgfSk7XG4gICAgICB9KTtcblxuICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChzZWxlY3QpO1xuXG4gICAgICBjb25zdCBhZGRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODleOCoeOCpOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwi6L+95YqgXCJdJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHRvb2xzQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg4Tjg7zjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlRvb2xcIl0nXG4gICAgICApO1xuICAgICAgY29uc3QgaW5zZXJ0QWZ0ZXIgPSB0b29sc0J1dHRvbiB8fCAoYWRkQnV0dG9uICYmIGFkZEJ1dHRvbi5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsKTtcbiAgICAgIGlmIChpbnNlcnRBZnRlciAmJiBpbnNlcnRBZnRlci5wYXJlbnRFbGVtZW50KSB7XG4gICAgICAgIGluc2VydEFmdGVyLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGluc2VydEFmdGVyLm5leHRTaWJsaW5nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGlucHV0QXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGlucHV0QXJlYSkge1xuICAgICAgICAgIGNvbnN0IHBhcmVudCA9XG4gICAgICAgICAgICBpbnB1dEFyZWEuY2xvc2VzdCgnZm9ybScpIHx8XG4gICAgICAgICAgICBpbnB1dEFyZWEucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudDtcbiAgICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIHBhcmVudC5maXJzdENoaWxkKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3cmFwcGVyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3cmFwcGVyKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgICBjb25zdCB1cmxNb2RlSWQgPSB1cmxQYXJhbXMuZ2V0KCdtb2RlX2lkJyk7XG4gICAgICBsZXQgbW9kZUlkID0gci5jdXJyZW50RGVlcERpdmVNb2RlSWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgaWYgKHVybE1vZGVJZCAmJiBtb2Rlcy5zb21lKChtKSA9PiBtLmlkID09PSB1cmxNb2RlSWQpKSB7XG4gICAgICAgIG1vZGVJZCA9IHVybE1vZGVJZDtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5zZXQoeyBjdXJyZW50RGVlcERpdmVNb2RlSWQ6IHVybE1vZGVJZCB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChtb2RlSWQgJiYgbW9kZXMuc29tZSgobSkgPT4gbS5pZCA9PT0gbW9kZUlkKSkge1xuICAgICAgICBzZWxlY3QudmFsdWUgPSBtb2RlSWQ7XG4gICAgICB9IGVsc2UgaWYgKG1vZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gbW9kZXNbMF0uaWQ7XG4gICAgICB9XG4gICAgfVxuICApO1xufVxuXG5sZXQgZGVlcERpdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVEZWVwRGl2ZSgpOiB2b2lkIHtcbiAgYWRkRGVlcERpdmVTdHlsZXMoKTtcblxuICBjb25zdCB0cnlJbmplY3RNb2RlU2VsZWN0b3IgPSAoKSA9PiB7XG4gICAgY29uc3QgaGFzQnV0dG9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OE44O844OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJUb29sXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCLjg5XjgqHjgqTjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIui/veWKoFwiXSdcbiAgICApO1xuICAgIGlmIChcbiAgICAgIGhhc0J1dHRvbnMgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJylcbiAgICApIHtcbiAgICAgIGluamVjdE1vZGVTZWxlY3RvcigpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRUaW1lb3V0KHRyeUluamVjdE1vZGVTZWxlY3RvciwgNTAwKTtcbiAgICB9XG4gIH07XG4gIHRyeUluamVjdE1vZGVTZWxlY3RvcigpO1xuXG4gIGNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgbmFtZXNwYWNlKSA9PiB7XG4gICAgaWYgKFxuICAgICAgbmFtZXNwYWNlID09PSAnc3luYycgJiZcbiAgICAgIGNoYW5nZXMuZGVlcERpdmVNb2RlcyAmJlxuICAgICAgbG9jYXRpb24uaHJlZi5pbmNsdWRlcygnZ2VtaW5pLmdvb2dsZS5jb20nKSAmJlxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODhOODvOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiVG9vbFwiXSwgZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgICApXG4gICAgKSB7XG4gICAgICBpbmplY3RNb2RlU2VsZWN0b3IoKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xuICAgIGxldCBzaG91bGRVcGRhdGUgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IG11dGF0aW9uIG9mIG11dGF0aW9ucykge1xuICAgICAgaWYgKG11dGF0aW9uLmFkZGVkTm9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgbXV0YXRpb24uYWRkZWROb2Rlcykge1xuICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IG5vZGUgYXMgRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgZWwubWF0Y2hlcz8uKCdbZGF0YS1wYXRoLXRvLW5vZGVdJykgfHxcbiAgICAgICAgICAgICAgZWwucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1wYXRoLXRvLW5vZGVdJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBzaG91bGRVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzaG91bGRVcGRhdGUpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzaG91bGRVcGRhdGUpIHtcbiAgICAgIGlmIChkZWVwRGl2ZVRpbWVyKSBjbGVhclRpbWVvdXQoZGVlcERpdmVUaW1lcik7XG4gICAgICBkZWVwRGl2ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiBhZGREZWVwRGl2ZUJ1dHRvbnMoKSwgNTAwKTtcbiAgICB9XG4gIH0pO1xuXG4gIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiBhZGREZWVwRGl2ZUJ1dHRvbnMoKSwgMTAwMCk7XG59XG4iLCIvLyBNYXAgdmlldyAtIGZpeGVkIHJpZ2h0LXNpZGUgcGFuZWwgc2hvd2luZyBjdXJyZW50IGNoYXQgb3V0bGluZSB3aXRoIHNjcm9sbCBoaWdobGlnaHRcblxubGV0IG1hcE1vZGUgPSBmYWxzZTtcbmNvbnN0IE1BUF9QQU5FTF9JRCA9ICdnZW1pbmktbWFwLXBhbmVsJztcbmNvbnN0IE1BUF9TVFlMRV9JRCA9ICdnZW1pbmktbWFwLXN0eWxlcyc7XG5cbmZ1bmN0aW9uIGluamVjdE1hcFN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9TVFlMRV9JRCkpIHJldHVybjtcbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICBzdHlsZS5pZCA9IE1BUF9TVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgI2dlbWluaS1tYXAtcGFuZWwge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgcmlnaHQ6IDE2cHg7XG4gICAgICB0b3A6IDYwcHg7XG4gICAgICBib3R0b206IDE2cHg7XG4gICAgICB3aWR0aDogMjQwcHg7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0OCwgMjQ5LCAyNTAsIDAuOTUpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAgICAgb3ZlcmZsb3cteTogYXV0bztcbiAgICAgIHotaW5kZXg6IDEwMDtcbiAgICAgIHBhZGRpbmc6IDZweCA0cHg7XG4gICAgICBmb250LWZhbWlseTogaW5oZXJpdDtcbiAgICAgIGJhY2tkcm9wLWZpbHRlcjogYmx1cig4cHgpO1xuICAgIH1cbiAgICAuZGFyay10aGVtZSAjZ2VtaW5pLW1hcC1wYW5lbCB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMyLCAzMywgMzYsIDAuOTUpO1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgYm94LXNoYWRvdzogMCAycHggMTJweCByZ2JhKDAsIDAsIDAsIDAuNCk7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIC5tYXAtaGVhZGVyIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIHVsIHtcbiAgICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgICBtYXJnaW46IDA7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b24ge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgICB3aWR0aDogMTAwJTtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBiYWNrZ3JvdW5kOiBub25lO1xuICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgYm9yZGVyLWxlZnQ6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDAgNnB4IDZweCAwO1xuICAgICAgcGFkZGluZzogNXB4IDEwcHggNXB4IDhweDtcbiAgICAgIG1hcmdpbjogMXB4IDA7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsaW5lLWhlaWdodDogMS4zNTtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgICB3b3JkLWJyZWFrOiBicmVhay13b3JkO1xuICAgICAgb3BhY2l0eTogMC41O1xuICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE1cywgb3BhY2l0eSAwLjE1cywgYm9yZGVyLWNvbG9yIDAuMTVzO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b246aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxMjgsIDEyOCwgMTI4LCAwLjEyKTtcbiAgICAgIG9wYWNpdHk6IDAuODU7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIGxpIGJ1dHRvbi5tYXAtaXRlbS1jdXJyZW50IHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI2LCAxMTUsIDIzMiwgMC4wOCk7XG4gICAgICBib3JkZXItbGVmdC1jb2xvcjogIzFhNzNlODtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uIC5tYXAtdHVybi1pbmRleCB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBtaW4td2lkdGg6IDE4cHg7XG4gICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICBvcGFjaXR5OiAwLjU7XG4gICAgICBtYXJnaW4tcmlnaHQ6IDNweDtcbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5mdW5jdGlvbiBnZXRQcm9tcHRUZXh0KHVzZXJRdWVyeTogRWxlbWVudCk6IHN0cmluZyB7XG4gIGNvbnN0IGhlYWRpbmcgPSB1c2VyUXVlcnkucXVlcnlTZWxlY3RvcignaDEsIGgyLCBoMywgW3JvbGU9XCJoZWFkaW5nXCJdJyk7XG4gIGxldCB0ZXh0ID1cbiAgICAoaGVhZGluZyBhcyBIVE1MRWxlbWVudCk/LnRleHRDb250ZW50Py50cmltKCkgfHxcbiAgICAodXNlclF1ZXJ5IGFzIEhUTUxFbGVtZW50KS50ZXh0Q29udGVudD8udHJpbSgpIHx8XG4gICAgJyc7XG4gIHRleHQgPSB0ZXh0LnJlcGxhY2UoL17jgYLjgarjgZ/jga7jg5fjg63jg7Pjg5fjg4hcXHMqLywgJycpO1xuICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9ePlxccyovLCAnJyk7XG4gIHJldHVybiB0ZXh0LnN1YnN0cmluZygwLCA2MCkgfHwgJyjnqbopJztcbn1cblxuZnVuY3Rpb24gZ2V0Q29udmVyc2F0aW9uQ29udGFpbmVycygpOiBIVE1MRWxlbWVudFtdIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAnaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5ID4gLmNvbnZlcnNhdGlvbi1jb250YWluZXInXG4gICAgKVxuICApO1xufVxuXG5mdW5jdGlvbiBidWlsZE1hcFBhbmVsKCk6IEhUTUxEaXZFbGVtZW50IHtcbiAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgcGFuZWwuaWQgPSBNQVBfUEFORUxfSUQ7XG5cbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGhlYWRlci5jbGFzc05hbWUgPSAnbWFwLWhlYWRlcic7XG4gIGhlYWRlci50ZXh0Q29udGVudCA9ICfjgZPjga7jg4Hjg6Pjg4Pjg4jjga7mtYHjgownO1xuICBwYW5lbC5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gIGNvbnN0IGNvbnRhaW5lcnMgPSBnZXRDb252ZXJzYXRpb25Db250YWluZXJzKCk7XG5cbiAgaWYgKGNvbnRhaW5lcnMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbXB0eS5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDEwcHg7IG9wYWNpdHk6IDAuNDU7IGZvbnQtc2l6ZTogMTJweDsnO1xuICAgIGVtcHR5LnRleHRDb250ZW50ID0gJ+ODgeODo+ODg+ODiOOBjOOBvuOBoOOBguOCiuOBvuOBm+OCkyc7XG4gICAgcGFuZWwuYXBwZW5kQ2hpbGQoZW1wdHkpO1xuICAgIHJldHVybiBwYW5lbDtcbiAgfVxuXG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd1bCcpO1xuXG4gIGNvbnRhaW5lcnMuZm9yRWFjaCgoY29udGFpbmVyLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IHVzZXJRdWVyeSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd1c2VyLXF1ZXJ5Jyk7XG4gICAgaWYgKCF1c2VyUXVlcnkpIHJldHVybjtcblxuICAgIGNvbnN0IHByb21wdFRleHQgPSBnZXRQcm9tcHRUZXh0KHVzZXJRdWVyeSk7XG4gICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuXG4gICAgY29uc3QgaW5kZXhTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgIGluZGV4U3Bhbi5jbGFzc05hbWUgPSAnbWFwLXR1cm4taW5kZXgnO1xuICAgIGluZGV4U3Bhbi50ZXh0Q29udGVudCA9IGAke2luZGV4ICsgMX0uYDtcblxuICAgIGJ0bi5hcHBlbmRDaGlsZChpbmRleFNwYW4pO1xuICAgIGJ0bi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShwcm9tcHRUZXh0KSk7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgY29udGFpbmVyLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ3N0YXJ0JyB9KTtcbiAgICB9KTtcblxuICAgIGxpLmFwcGVuZENoaWxkKGJ0bik7XG4gICAgbGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gIH0pO1xuXG4gIHBhbmVsLmFwcGVuZENoaWxkKGxpc3QpO1xuICByZXR1cm4gcGFuZWw7XG59XG5cbmZ1bmN0aW9uIGdldE1hcEJ1dHRvbnMoKTogSFRNTEJ1dHRvbkVsZW1lbnRbXSB7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgaWYgKCFwYW5lbCkgcmV0dXJuIFtdO1xuICByZXR1cm4gQXJyYXkuZnJvbShwYW5lbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignbGkgYnV0dG9uJykpO1xufVxuXG5sZXQgaW50ZXJzZWN0aW9uT2JzZXJ2ZXI6IEludGVyc2VjdGlvbk9ic2VydmVyIHwgbnVsbCA9IG51bGw7XG5jb25zdCB2aXNpYmxlVHVybnMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuZnVuY3Rpb24gc2V0dXBJbnRlcnNlY3Rpb25PYnNlcnZlcigpOiB2b2lkIHtcbiAgaWYgKGludGVyc2VjdGlvbk9ic2VydmVyKSBpbnRlcnNlY3Rpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gIHZpc2libGVUdXJucy5jbGVhcigpO1xuXG4gIGNvbnN0IGNvbnRhaW5lcnMgPSBnZXRDb252ZXJzYXRpb25Db250YWluZXJzKCk7XG4gIGlmIChjb250YWluZXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIGludGVyc2VjdGlvbk9ic2VydmVyID0gbmV3IEludGVyc2VjdGlvbk9ic2VydmVyKFxuICAgIChlbnRyaWVzKSA9PiB7XG4gICAgICBlbnRyaWVzLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gY29udGFpbmVycy5pbmRleE9mKGVudHJ5LnRhcmdldCBhcyBIVE1MRWxlbWVudCk7XG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybjtcbiAgICAgICAgaWYgKGVudHJ5LmlzSW50ZXJzZWN0aW5nKSB7XG4gICAgICAgICAgdmlzaWJsZVR1cm5zLmFkZChpbmRleCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmlzaWJsZVR1cm5zLmRlbGV0ZShpbmRleCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBidXR0b25zID0gZ2V0TWFwQnV0dG9ucygpO1xuICAgICAgYnV0dG9ucy5mb3JFYWNoKChidG4sIGkpID0+IHtcbiAgICAgICAgYnRuLmNsYXNzTGlzdC50b2dnbGUoJ21hcC1pdGVtLWN1cnJlbnQnLCB2aXNpYmxlVHVybnMuaGFzKGkpKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gICAgICBpZiAocGFuZWwpIHtcbiAgICAgICAgY29uc3QgZmlyc3RIaWdobGlnaHRlZCA9IGJ1dHRvbnMuZmluZCgoXywgaSkgPT4gdmlzaWJsZVR1cm5zLmhhcyhpKSk7XG4gICAgICAgIGlmIChmaXJzdEhpZ2hsaWdodGVkKSB7XG4gICAgICAgICAgZmlyc3RIaWdobGlnaHRlZC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgeyB0aHJlc2hvbGQ6IDAuMTUgfVxuICApO1xuXG4gIGNvbnRhaW5lcnMuZm9yRWFjaCgoYykgPT4gaW50ZXJzZWN0aW9uT2JzZXJ2ZXIhLm9ic2VydmUoYykpO1xufVxuXG5mdW5jdGlvbiBzdG9wSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChpbnRlcnNlY3Rpb25PYnNlcnZlcikge1xuICAgIGludGVyc2VjdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICBpbnRlcnNlY3Rpb25PYnNlcnZlciA9IG51bGw7XG4gIH1cbiAgdmlzaWJsZVR1cm5zLmNsZWFyKCk7XG59XG5cbmxldCBjaGF0T2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcblxuZnVuY3Rpb24gc3RhcnRDaGF0T2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChjaGF0T2JzZXJ2ZXIpIGNoYXRPYnNlcnZlci5kaXNjb25uZWN0KCk7XG5cbiAgY29uc3QgY2hhdEhpc3RvcnkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbmZpbml0ZS1zY3JvbGxlci5jaGF0LWhpc3RvcnknKTtcbiAgaWYgKCFjaGF0SGlzdG9yeSkgcmV0dXJuO1xuXG4gIGxldCBkZWJvdW5jZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG4gIGNoYXRPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICBpZiAoIW1hcE1vZGUpIHJldHVybjtcbiAgICBpZiAoZGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KGRlYm91bmNlVGltZXIpO1xuICAgIGRlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHJlZnJlc2hNYXAoKSwgMzAwKTtcbiAgfSk7XG5cbiAgY2hhdE9ic2VydmVyLm9ic2VydmUoY2hhdEhpc3RvcnksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiBmYWxzZSB9KTtcbn1cblxuZnVuY3Rpb24gc3RvcENoYXRPYnNlcnZlcigpOiB2b2lkIHtcbiAgaWYgKGNoYXRPYnNlcnZlcikge1xuICAgIGNoYXRPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgY2hhdE9ic2VydmVyID0gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWZyZXNoTWFwKCk6IHZvaWQge1xuICBpZiAoIW1hcE1vZGUpIHJldHVybjtcblxuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGNvbnN0IHNhdmVkU2Nyb2xsID0gZXhpc3RpbmcgPyBleGlzdGluZy5zY3JvbGxUb3AgOiAwO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIHN0b3BJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xuXG4gIGNvbnN0IHBhbmVsID0gYnVpbGRNYXBQYW5lbCgpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgcGFuZWwuc2Nyb2xsVG9wID0gc2F2ZWRTY3JvbGw7XG5cbiAgc2V0dXBJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd01hcCgpOiB2b2lkIHtcbiAgaW5qZWN0TWFwU3R5bGVzKCk7XG5cbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIGNvbnN0IHBhbmVsID0gYnVpbGRNYXBQYW5lbCgpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgbWFwTW9kZSA9IHRydWU7XG5cbiAgc2V0dXBJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xuICBzdGFydENoYXRPYnNlcnZlcigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRNYXBNb2RlKCk6IHZvaWQge1xuICBzdG9wQ2hhdE9ic2VydmVyKCk7XG4gIHN0b3BJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xuICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGlmIChwYW5lbCkgcGFuZWwucmVtb3ZlKCk7XG4gIG1hcE1vZGUgPSBmYWxzZTtcbn1cbiIsIi8vIERPTeani+mAoOOCkkFJ44Ko44O844K444Kn44Oz44OI44GM6KqN6K2Y44Gn44GN44KL5b2i5byP44Gn5Ye65YqbXG5cbnR5cGUgRWxlbWVudFR5cGUgPVxuICB8ICd0ZXh0YXJlYSdcbiAgfCAnc2lkZWJhcidcbiAgfCAnc2lkZWJhclRvZ2dsZSdcbiAgfCAnY2hhdEhpc3RvcnknXG4gIHwgJ25ld0NoYXRCdXR0b24nXG4gIHwgJ2NvcHlCdXR0b25zJ1xuICB8ICdjaGF0Q29udGFpbmVyJztcblxuaW50ZXJmYWNlIEZpbmRFbGVtZW50UmVzdWx0IHtcbiAgZWxlbWVudDogRWxlbWVudCB8IG51bGw7XG4gIHNlbGVjdG9yOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgSW50ZXJhY3RpdmVFbGVtZW50IHtcbiAgaW5kZXg6IG51bWJlcjtcbiAgdHlwZTogc3RyaW5nO1xuICByb2xlOiBzdHJpbmc7XG4gIGFyaWFMYWJlbDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGlzVmlzaWJsZTogYm9vbGVhbjtcbiAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbn1cblxuY2xhc3MgRE9NQW5hbHl6ZXIge1xuICBwcml2YXRlIGVsZW1lbnRTZWxlY3RvcnM6IFJlY29yZDxFbGVtZW50VHlwZSwgc3RyaW5nW10+O1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuZWxlbWVudFNlbGVjdG9ycyA9IHtcbiAgICAgIHRleHRhcmVhOiBbXG4gICAgICAgICdbcm9sZT1cInRleHRib3hcIl1bY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScsXG4gICAgICAgICdbYXJpYS1sYWJlbCo9XCLjg5fjg63jg7Pjg5fjg4hcIl0nLFxuICAgICAgICAnLnFsLWVkaXRvci50ZXh0YXJlYScsXG4gICAgICAgICdyaWNoLXRleHRhcmVhIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyxcbiAgICAgIF0sXG4gICAgICBzaWRlYmFyOiBbXG4gICAgICAgICdbcm9sZT1cIm5hdmlnYXRpb25cIl0nLFxuICAgICAgICAnYmFyZC1zaWRlbmF2JyxcbiAgICAgICAgJy5zaWRlLW5hdi1jb250YWluZXInLFxuICAgICAgICAnYXNpZGUnLFxuICAgICAgXSxcbiAgICAgIHNpZGViYXJUb2dnbGU6IFtcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODoeOCpOODs+ODoeODi+ODpeODvFwiXScsXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJNYWluIG1lbnVcIl0nLFxuICAgICAgICAnYnV0dG9uW2RhdGEtdGVzdC1pZD1cInNpZGUtbmF2LW1lbnUtYnV0dG9uXCJdJyxcbiAgICAgIF0sXG4gICAgICBjaGF0SGlzdG9yeTogW1xuICAgICAgICAnLmNvbnZlcnNhdGlvbltyb2xlPVwiYnV0dG9uXCJdJyxcbiAgICAgICAgJ1tkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb25cIl0nLFxuICAgICAgICAnLmNvbnZlcnNhdGlvbi1pdGVtcy1jb250YWluZXIgLmNvbnZlcnNhdGlvbicsXG4gICAgICBdLFxuICAgICAgbmV3Q2hhdEJ1dHRvbjogW1xuICAgICAgICAnYVtocmVmPVwiaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS9hcHBcIl0nLFxuICAgICAgICAnYVthcmlhLWxhYmVsKj1cIuaWsOimj+S9nOaIkFwiXScsXG4gICAgICAgICdbZGF0YS10ZXN0LWlkPVwibmV3LWNoYXQtYnV0dG9uXCJdJyxcbiAgICAgIF0sXG4gICAgICBjb3B5QnV0dG9uczogW1xuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44Kz44OU44O8XCJdJyxcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIkNvcHlcIl0nLFxuICAgICAgICAnLmNvcHktYnV0dG9uJyxcbiAgICAgIF0sXG4gICAgICBjaGF0Q29udGFpbmVyOiBbXG4gICAgICAgICdjaGF0LXdpbmRvdycsXG4gICAgICAgICdtYWluLm1haW4nLFxuICAgICAgICAnLmNvbnZlcnNhdGlvbi1jb250YWluZXInLFxuICAgICAgXSxcbiAgICB9O1xuICB9XG5cbiAgZmluZEVsZW1lbnQodHlwZTogRWxlbWVudFR5cGUpOiBGaW5kRWxlbWVudFJlc3VsdCB7XG4gICAgY29uc3Qgc2VsZWN0b3JzID0gdGhpcy5lbGVtZW50U2VsZWN0b3JzW3R5cGVdIHx8IFtdO1xuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgIGlmIChlbGVtZW50KSByZXR1cm4geyBlbGVtZW50LCBzZWxlY3RvciB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEludmFsaWQgc2VsZWN0b3IsIHNraXBcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgZWxlbWVudDogbnVsbCwgc2VsZWN0b3I6IG51bGwgfTtcbiAgfVxuXG4gIGZpbmRBbGxFbGVtZW50cygpOiBSZWNvcmQ8RWxlbWVudFR5cGUsIEZpbmRFbGVtZW50UmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0ge30gYXMgUmVjb3JkPEVsZW1lbnRUeXBlLCBGaW5kRWxlbWVudFJlc3VsdD47XG4gICAgZm9yIChjb25zdCB0eXBlIGluIHRoaXMuZWxlbWVudFNlbGVjdG9ycykge1xuICAgICAgcmVzdWx0W3R5cGUgYXMgRWxlbWVudFR5cGVdID0gdGhpcy5maW5kRWxlbWVudCh0eXBlIGFzIEVsZW1lbnRUeXBlKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGNhcHR1cmVQYWdlU3RydWN0dXJlKCkge1xuICAgIHJldHVybiB7XG4gICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgdGl0bGU6IGRvY3VtZW50LnRpdGxlLFxuICAgICAgZWxlbWVudHM6IHRoaXMuZmluZEFsbEVsZW1lbnRzKCksXG4gICAgICBpbnRlcmFjdGl2ZUVsZW1lbnRzOiB0aGlzLmdldEludGVyYWN0aXZlRWxlbWVudHMoKSxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIHZpZXdwb3J0OiB7IHdpZHRoOiB3aW5kb3cuaW5uZXJXaWR0aCwgaGVpZ2h0OiB3aW5kb3cuaW5uZXJIZWlnaHQgfSxcbiAgICAgICAgc2Nyb2xsUG9zaXRpb246IHsgeDogd2luZG93LnNjcm9sbFgsIHk6IHdpbmRvdy5zY3JvbGxZIH0sXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICBnZXRJbnRlcmFjdGl2ZUVsZW1lbnRzKCk6IEludGVyYWN0aXZlRWxlbWVudFtdIHtcbiAgICBjb25zdCBlbGVtZW50czogSW50ZXJhY3RpdmVFbGVtZW50W10gPSBbXTtcbiAgICBjb25zdCBzZWxlY3RvciA9XG4gICAgICAnYnV0dG9uLCBhLCBpbnB1dCwgdGV4dGFyZWEsIFtyb2xlPVwiYnV0dG9uXCJdLCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXSc7XG4gICAgY29uc3QgaW50ZXJhY3RpdmVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG5cbiAgICBpbnRlcmFjdGl2ZXMuZm9yRWFjaCgoZWwsIGluZGV4KSA9PiB7XG4gICAgICBpZiAoaW5kZXggPj0gNTApIHJldHVybjtcbiAgICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGlmIChyZWN0LndpZHRoID09PSAwIHx8IHJlY3QuaGVpZ2h0ID09PSAwKSByZXR1cm47XG4gICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgaW5kZXgsXG4gICAgICAgIHR5cGU6IGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgcm9sZTogZWwuZ2V0QXR0cmlidXRlKCdyb2xlJykgfHwgJycsXG4gICAgICAgIGFyaWFMYWJlbDogZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycsXG4gICAgICAgIHRleHQ6IGVsLnRleHRDb250ZW50Py50cmltKCkuc3Vic3RyaW5nKDAsIDUwKSB8fCAnJyxcbiAgICAgICAgZGVzY3JpcHRpb246IGVsLmdldEF0dHJpYnV0ZSgnZGVzY3JpcHRpb24nKSB8fCAnJyxcbiAgICAgICAgaXNWaXNpYmxlOiByZWN0LndpZHRoID4gMCAmJiByZWN0LmhlaWdodCA+IDAsXG4gICAgICAgIHBvc2l0aW9uOiB7IHg6IE1hdGgucm91bmQocmVjdC54KSwgeTogTWF0aC5yb3VuZChyZWN0LnkpIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBlbGVtZW50cztcbiAgfVxuXG4gIGV4cG9ydEZvckFJKCk6IHN0cmluZyB7XG4gICAgY29uc3Qgc3RydWN0dXJlID0gdGhpcy5jYXB0dXJlUGFnZVN0cnVjdHVyZSgpO1xuXG4gICAgbGV0IG91dHB1dCA9IGAjIyBHZW1pbmkgQ2hhdCBQYWdlIFN0cnVjdHVyZVxcblxcbmA7XG4gICAgb3V0cHV0ICs9IGAqKlVSTCoqOiAke3N0cnVjdHVyZS51cmx9XFxuYDtcbiAgICBvdXRwdXQgKz0gYCoqVGl0bGUqKjogJHtzdHJ1Y3R1cmUudGl0bGV9XFxuXFxuYDtcbiAgICBvdXRwdXQgKz0gYCMjIyBNYWluIEVsZW1lbnRzXFxuXFxuYDtcblxuICAgIGZvciAoY29uc3QgW3R5cGUsIGRhdGFdIG9mIE9iamVjdC5lbnRyaWVzKHN0cnVjdHVyZS5lbGVtZW50cykpIHtcbiAgICAgIGlmIChkYXRhLmVsZW1lbnQpIHtcbiAgICAgICAgb3V0cHV0ICs9IGAtICoqJHt0eXBlfSoqOiBcXGAke2RhdGEuc2VsZWN0b3J9XFxgIOKck1xcbmA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQgKz0gYC0gKioke3R5cGV9Kio6IE5vdCBmb3VuZCDinJdcXG5gO1xuICAgICAgfVxuICAgIH1cblxuICAgIG91dHB1dCArPSBgXFxuIyMjIEludGVyYWN0aXZlIEVsZW1lbnRzICgke3N0cnVjdHVyZS5pbnRlcmFjdGl2ZUVsZW1lbnRzLmxlbmd0aH0pXFxuXFxuYDtcbiAgICBzdHJ1Y3R1cmUuaW50ZXJhY3RpdmVFbGVtZW50cy5zbGljZSgwLCAxMCkuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGlmIChlbC50ZXh0KSB7XG4gICAgICAgIG91dHB1dCArPSBgLSBbJHtlbC50eXBlfV0gJHtlbC50ZXh0fSAoJHtlbC5hcmlhTGFiZWwgfHwgZWwucm9sZX0pXFxuYDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH1cblxuICBhc3luYyBjb3B5VG9DbGlwYm9hcmQoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgdGV4dCA9IHRoaXMuZXhwb3J0Rm9yQUkoKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGV4dCk7XG4gICAgICB0aGlzLnNob3dOb3RpZmljYXRpb24oJ+ODmuODvOOCuOani+mAoOOCkuOCr+ODquODg+ODl+ODnOODvOODieOBq+OCs+ODlOODvOOBl+OBvuOBl+OBnycpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLnNob3dOb3RpZmljYXRpb24oJ+OCs+ODlOODvOOBq+WkseaVl+OBl+OBvuOBl+OBnycsICdlcnJvcicpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHNob3dOb3RpZmljYXRpb24obWVzc2FnZTogc3RyaW5nLCB0eXBlOiAnc3VjY2VzcycgfCAnZXJyb3InID0gJ3N1Y2Nlc3MnKTogdm9pZCB7XG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbm90aWZpY2F0aW9uLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICB0b3A6IDIwcHg7XG4gICAgICByaWdodDogMjBweDtcbiAgICAgIGJhY2tncm91bmQ6ICR7dHlwZSA9PT0gJ2Vycm9yJyA/ICcjZjQ0MzM2JyA6ICcjNENBRjUwJ307XG4gICAgICBjb2xvcjogd2hpdGU7XG4gICAgICBwYWRkaW5nOiAxNnB4IDI0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICB6LWluZGV4OiAxMDAwMDtcbiAgICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLDAsMCwwLjMpO1xuICAgICAgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgc2Fucy1zZXJpZjtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGFuaW1hdGlvbjogc2xpZGVJbiAwLjNzIGVhc2Utb3V0O1xuICAgIGA7XG4gICAgbm90aWZpY2F0aW9uLnRleHRDb250ZW50ID0gbWVzc2FnZTtcblxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAgIEBrZXlmcmFtZXMgc2xpZGVJbiB7XG4gICAgICAgIGZyb20geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNDAwcHgpOyBvcGFjaXR5OiAwOyB9XG4gICAgICAgIHRvIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDApOyBvcGFjaXR5OiAxOyB9XG4gICAgICB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG5vdGlmaWNhdGlvbik7XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIG5vdGlmaWNhdGlvbi5zdHlsZS50cmFuc2l0aW9uID0gJ29wYWNpdHkgMC4zcyc7XG4gICAgICBub3RpZmljYXRpb24uc3R5bGUub3BhY2l0eSA9ICcwJztcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gbm90aWZpY2F0aW9uLnJlbW92ZSgpLCAzMDApO1xuICAgIH0sIDMwMDApO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplRE9NQW5hbHl6ZXIoKTogdm9pZCB7XG4gIHdpbmRvdy5kb21BbmFseXplciA9IG5ldyBET01BbmFseXplcigpO1xuICB3aW5kb3cuYW5hbHl6ZVBhZ2UgPSAoKSA9PiB7XG4gICAgY29uc29sZS5sb2cod2luZG93LmRvbUFuYWx5emVyIS5jYXB0dXJlUGFnZVN0cnVjdHVyZSgpKTtcbiAgfTtcbiAgd2luZG93LmNvcHlQYWdlU3RydWN0dXJlID0gKCkgPT4ge1xuICAgIHdpbmRvdy5kb21BbmFseXplciEuY29weVRvQ2xpcGJvYXJkKCk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBpbml0aWFsaXplS2V5Ym9hcmRIYW5kbGVycywgcmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbiB9IGZyb20gJy4uLy4uL3NyYy9rZXlib2FyZCc7XG5pbXBvcnQgeyBpbml0aWFsaXplQ2hhdFBhZ2UgfSBmcm9tICcuLi8uLi9zcmMvY2hhdCc7XG5pbXBvcnQgeyBpbml0aWFsaXplQXV0b2NvbXBsZXRlLCBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlIH0gZnJvbSAnLi4vLi4vc3JjL2F1dG9jb21wbGV0ZSc7XG5pbXBvcnQgeyBpbml0aWFsaXplRGVlcERpdmUgfSBmcm9tICcuLi8uLi9zcmMvZGVlcC1kaXZlJztcbmltcG9ydCB7IGluaXRpYWxpemVFeHBvcnQgfSBmcm9tICcuLi8uLi9zcmMvZXhwb3J0JztcbmltcG9ydCB7IHNob3dNYXAsIHJlc2V0TWFwTW9kZSB9IGZyb20gJy4uLy4uL3NyYy9tYXAnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZVNlYXJjaFBhZ2UsIGlzU2VhcmNoUGFnZSB9IGZyb20gJy4uLy4uL3NyYy9zZWFyY2gnO1xuaW1wb3J0IHsgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi4vLi4vc3JjL2hpc3RvcnknO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZURPTUFuYWx5emVyIH0gZnJvbSAnLi4vLi4vc3JjL2RvbS1hbmFseXplcic7XG5pbXBvcnQgeyBpbml0aWFsaXplUXVpY2tQcm9tcHRzIH0gZnJvbSAnLi4vLi4vc3JjL3F1aWNrLXByb21wdHMnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb250ZW50U2NyaXB0KHtcbiAgbWF0Y2hlczogW1xuICAgICdodHRwczovL2dlbWluaS5nb29nbGUuY29tL2FwcConLFxuICAgICdodHRwczovL2dlbWluaS5nb29nbGUuY29tL3NlYXJjaConLFxuICBdLFxuICBydW5BdDogJ2RvY3VtZW50X2VuZCcsXG5cbiAgbWFpbigpIHtcbiAgICAvLyBFeHBvc2Ugd2luZG93IGdsb2JhbHMgdXNlZCBhY3Jvc3MgbW9kdWxlc1xuICAgIHdpbmRvdy5yZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uID0gcmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbjtcblxuICAgIGluaXRpYWxpemVET01BbmFseXplcigpO1xuICAgIGluaXRpYWxpemUoKTtcbiAgfSxcbn0pO1xuXG5mdW5jdGlvbiBhcHBseUN1c3RvbVN0eWxlcygpOiB2b2lkIHtcbiAgY29uc3Qgc3R5bGVJZCA9ICdnZW1pbmktaW1wcm92ZS11aS1jdXN0b20tc3R5bGVzJztcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3R5bGVJZCk/LnJlbW92ZSgpO1xuXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSBzdHlsZUlkO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZ2Vtcy1saXN0LWNvbnRhaW5lciB7XG4gICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIC5zaWRlLW5hdi1lbnRyeS1jb250YWluZXIge1xuICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgIH1cbiAgICBjaGF0LXdpbmRvdyB7XG4gICAgICBtYXgtd2lkdGg6IHZhcigtLWNoYXQtbWF4LXdpZHRoLCA5MDBweCkgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tcmlnaHQ6IGF1dG8gIWltcG9ydGFudDtcbiAgICB9XG4gICAgLmNvbnZlcnNhdGlvbi1jb250YWluZXIge1xuICAgICAgbWF4LXdpZHRoOiB2YXIoLS1jaGF0LW1heC13aWR0aCwgOTAwcHgpICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tbGVmdDogMCAhaW1wb3J0YW50O1xuICAgICAgbWFyZ2luLXJpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ2hhdFdpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWNoYXQtbWF4LXdpZHRoJywgYCR7d2lkdGh9cHhgKTtcbn1cblxuZnVuY3Rpb24gbG9hZENoYXRXaWR0aCgpOiB2b2lkIHtcbiAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydjaGF0V2lkdGgnXSwgKHJlc3VsdCkgPT4ge1xuICAgIHVwZGF0ZUNoYXRXaWR0aChyZXN1bHQuY2hhdFdpZHRoIHx8IDkwMCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBpbml0aWFsaXplKCk6IHZvaWQge1xuICBsb2FkQ2hhdFdpZHRoKCk7XG4gIGFwcGx5Q3VzdG9tU3R5bGVzKCk7XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgKCkgPT4ge1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICB9KTtcblxuICBsZXQgbGFzdFVybCA9IGxvY2F0aW9uLmhyZWY7XG4gIG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICBjb25zdCBjdXJyZW50VXJsID0gbG9jYXRpb24uaHJlZjtcbiAgICBpZiAoY3VycmVudFVybCAhPT0gbGFzdFVybCkge1xuICAgICAgbGFzdFVybCA9IGN1cnJlbnRVcmw7XG5cbiAgICAgIHdpbmRvdy5yZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uPy4oLTEpO1xuICAgICAgcmVzZXRNYXBNb2RlKCk7XG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpbml0aWFsaXplQXV0b2NvbXBsZXRlKCk7XG4gICAgICAgIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUoKTtcbiAgICAgICAgaWYgKCFpc1NlYXJjaFBhZ2UoKSkge1xuICAgICAgICAgIHNob3dNYXAoKTtcbiAgICAgICAgICBpbml0aWFsaXplUXVpY2tQcm9tcHRzKCk7XG4gICAgICAgIH1cbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dlbWluaS1leHBvcnQtbm90ZS1idXR0b24nKT8ucmVtb3ZlKCk7XG4gICAgICAgIGluaXRpYWxpemVFeHBvcnQoKTtcbiAgICAgIH0sIDE1MDApO1xuICAgIH1cbiAgfSkub2JzZXJ2ZShkb2N1bWVudCwgeyBzdWJ0cmVlOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG5cbiAgaW5pdGlhbGl6ZUtleWJvYXJkSGFuZGxlcnMoKTtcblxuICBpZiAoaXNTZWFyY2hQYWdlKCkpIHtcbiAgICBpbml0aWFsaXplU2VhcmNoUGFnZSgpO1xuICAgIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUoKTtcbiAgfSBlbHNlIHtcbiAgICBpbml0aWFsaXplQ2hhdFBhZ2UoKTtcbiAgICBpbml0aWFsaXplRGVlcERpdmUoKTtcbiAgICBpbml0aWFsaXplUXVpY2tQcm9tcHRzKCk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpbml0aWFsaXplRXhwb3J0KCk7XG4gICAgfSwgMTUwMCk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBzaG93TWFwKCk7XG4gICAgfSwgMTUwMCk7XG4gIH1cblxuICBjaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIG5hbWVzcGFjZSkgPT4ge1xuICAgIGlmIChuYW1lc3BhY2UgPT09ICdzeW5jJyAmJiBjaGFuZ2VzLmNoYXRXaWR0aCkge1xuICAgICAgdXBkYXRlQ2hhdFdpZHRoKGNoYW5nZXMuY2hhdFdpZHRoLm5ld1ZhbHVlKTtcbiAgICAgIGFwcGx5Q3VzdG9tU3R5bGVzKCk7XG4gICAgfVxuICB9KTtcbn1cbiIsIi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLnRzXG5mdW5jdGlvbiBwcmludChtZXRob2QsIC4uLmFyZ3MpIHtcblx0aWYgKGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcInByb2R1Y3Rpb25cIikgcmV0dXJuO1xuXHRpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIG1ldGhvZChgW3d4dF0gJHthcmdzLnNoaWZ0KCl9YCwgLi4uYXJncyk7XG5cdGVsc2UgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG59XG4vKipcbiogV3JhcHBlciBhcm91bmQgYGNvbnNvbGVgIHdpdGggYSBcIlt3eHRdXCIgcHJlZml4XG4qL1xuY29uc3QgbG9nZ2VyID0ge1xuXHRkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuXHRsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG5cdHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuXHRlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGxvZ2dlciB9OyIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgYnJvd3NlciQxIH0gZnJvbSBcIkB3eHQtZGV2L2Jyb3dzZXJcIjtcblxuLy8jcmVnaW9uIHNyYy9icm93c2VyLnRzXG4vKipcbiogQ29udGFpbnMgdGhlIGBicm93c2VyYCBleHBvcnQgd2hpY2ggeW91IHNob3VsZCB1c2UgdG8gYWNjZXNzIHRoZSBleHRlbnNpb24gQVBJcyBpbiB5b3VyIHByb2plY3Q6XG4qIGBgYHRzXG4qIGltcG9ydCB7IGJyb3dzZXIgfSBmcm9tICd3eHQvYnJvd3Nlcic7XG4qXG4qIGJyb3dzZXIucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4qICAgLy8gLi4uXG4qIH0pXG4qIGBgYFxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBicm93c2VyIH07IiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuXG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMudHNcbnZhciBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50ID0gY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcblx0c3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG5cdGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG5cdFx0c3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG5cdFx0dGhpcy5uZXdVcmwgPSBuZXdVcmw7XG5cdFx0dGhpcy5vbGRVcmwgPSBvbGRVcmw7XG5cdH1cbn07XG4vKipcbiogUmV0dXJucyBhbiBldmVudCBuYW1lIHVuaXF1ZSB0byB0aGUgZXh0ZW5zaW9uIGFuZCBjb250ZW50IHNjcmlwdCB0aGF0J3MgcnVubmluZy5cbiovXG5mdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG5cdHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LCBnZXRVbmlxdWVFdmVudE5hbWUgfTsiLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcblxuLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLnRzXG5jb25zdCBzdXBwb3J0c05hdmlnYXRpb25BcGkgPSB0eXBlb2YgZ2xvYmFsVGhpcy5uYXZpZ2F0aW9uPy5hZGRFdmVudExpc3RlbmVyID09PSBcImZ1bmN0aW9uXCI7XG4vKipcbiogQ3JlYXRlIGEgdXRpbCB0aGF0IHdhdGNoZXMgZm9yIFVSTCBjaGFuZ2VzLCBkaXNwYXRjaGluZyB0aGUgY3VzdG9tIGV2ZW50IHdoZW4gZGV0ZWN0ZWQuIFN0b3BzXG4qIHdhdGNoaW5nIHdoZW4gY29udGVudCBzY3JpcHQgaXMgaW52YWxpZGF0ZWQuIFVzZXMgTmF2aWdhdGlvbiBBUEkgd2hlbiBhdmFpbGFibGUsIG90aGVyd2lzZVxuKiBmYWxscyBiYWNrIHRvIHBvbGxpbmcuXG4qL1xuZnVuY3Rpb24gY3JlYXRlTG9jYXRpb25XYXRjaGVyKGN0eCkge1xuXHRsZXQgbGFzdFVybDtcblx0bGV0IHdhdGNoaW5nID0gZmFsc2U7XG5cdHJldHVybiB7IHJ1bigpIHtcblx0XHRpZiAod2F0Y2hpbmcpIHJldHVybjtcblx0XHR3YXRjaGluZyA9IHRydWU7XG5cdFx0bGFzdFVybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG5cdFx0aWYgKHN1cHBvcnRzTmF2aWdhdGlvbkFwaSkgZ2xvYmFsVGhpcy5uYXZpZ2F0aW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJuYXZpZ2F0ZVwiLCAoZXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IG5ld1VybCA9IG5ldyBVUkwoZXZlbnQuZGVzdGluYXRpb24udXJsKTtcblx0XHRcdGlmIChuZXdVcmwuaHJlZiA9PT0gbGFzdFVybC5ocmVmKSByZXR1cm47XG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIGxhc3RVcmwpKTtcblx0XHRcdGxhc3RVcmwgPSBuZXdVcmw7XG5cdFx0fSwgeyBzaWduYWw6IGN0eC5zaWduYWwgfSk7XG5cdFx0ZWxzZSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcblx0XHRcdGlmIChuZXdVcmwuaHJlZiAhPT0gbGFzdFVybC5ocmVmKSB7XG5cdFx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgbGFzdFVybCkpO1xuXHRcdFx0XHRsYXN0VXJsID0gbmV3VXJsO1xuXHRcdFx0fVxuXHRcdH0sIDFlMyk7XG5cdH0gfTtcbn1cblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfTsiLCJpbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2dnZXIubWpzXCI7XG5pbXBvcnQgeyBnZXRVbmlxdWVFdmVudE5hbWUgfSBmcm9tIFwiLi9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLm1qc1wiO1xuaW1wb3J0IHsgY3JlYXRlTG9jYXRpb25XYXRjaGVyIH0gZnJvbSBcIi4vaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci5tanNcIjtcbmltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcblxuLy8jcmVnaW9uIHNyYy91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0LnRzXG4vKipcbiogSW1wbGVtZW50cyBbYEFib3J0Q29udHJvbGxlcmBdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9BYm9ydENvbnRyb2xsZXIpLlxuKiBVc2VkIHRvIGRldGVjdCBhbmQgc3RvcCBjb250ZW50IHNjcmlwdCBjb2RlIHdoZW4gdGhlIHNjcmlwdCBpcyBpbnZhbGlkYXRlZC5cbipcbiogSXQgYWxzbyBwcm92aWRlcyBzZXZlcmFsIHV0aWxpdGllcyBsaWtlIGBjdHguc2V0VGltZW91dGAgYW5kIGBjdHguc2V0SW50ZXJ2YWxgIHRoYXQgc2hvdWxkIGJlIHVzZWQgaW5cbiogY29udGVudCBzY3JpcHRzIGluc3RlYWQgb2YgYHdpbmRvdy5zZXRUaW1lb3V0YCBvciBgd2luZG93LnNldEludGVydmFsYC5cbipcbiogVG8gY3JlYXRlIGNvbnRleHQgZm9yIHRlc3RpbmcsIHlvdSBjYW4gdXNlIHRoZSBjbGFzcydzIGNvbnN0cnVjdG9yOlxuKlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBDb250ZW50U2NyaXB0Q29udGV4dCB9IGZyb20gJ3d4dC91dGlscy9jb250ZW50LXNjcmlwdHMtY29udGV4dCc7XG4qXG4qIHRlc3QoXCJzdG9yYWdlIGxpc3RlbmVyIHNob3VsZCBiZSByZW1vdmVkIHdoZW4gY29udGV4dCBpcyBpbnZhbGlkYXRlZFwiLCAoKSA9PiB7XG4qICAgY29uc3QgY3R4ID0gbmV3IENvbnRlbnRTY3JpcHRDb250ZXh0KCd0ZXN0Jyk7XG4qICAgY29uc3QgaXRlbSA9IHN0b3JhZ2UuZGVmaW5lSXRlbShcImxvY2FsOmNvdW50XCIsIHsgZGVmYXVsdFZhbHVlOiAwIH0pO1xuKiAgIGNvbnN0IHdhdGNoZXIgPSB2aS5mbigpO1xuKlxuKiAgIGNvbnN0IHVud2F0Y2ggPSBpdGVtLndhdGNoKHdhdGNoZXIpO1xuKiAgIGN0eC5vbkludmFsaWRhdGVkKHVud2F0Y2gpOyAvLyBMaXN0ZW4gZm9yIGludmFsaWRhdGUgaGVyZVxuKlxuKiAgIGF3YWl0IGl0ZW0uc2V0VmFsdWUoMSk7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRUaW1lcygxKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFdpdGgoMSwgMCk7XG4qXG4qICAgY3R4Lm5vdGlmeUludmFsaWRhdGVkKCk7IC8vIFVzZSB0aGlzIGZ1bmN0aW9uIHRvIGludmFsaWRhdGUgdGhlIGNvbnRleHRcbiogICBhd2FpdCBpdGVtLnNldFZhbHVlKDIpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkVGltZXMoMSk7XG4qIH0pO1xuKiBgYGBcbiovXG52YXIgQ29udGVudFNjcmlwdENvbnRleHQgPSBjbGFzcyBDb250ZW50U2NyaXB0Q29udGV4dCB7XG5cdHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiKTtcblx0aWQ7XG5cdGFib3J0Q29udHJvbGxlcjtcblx0bG9jYXRpb25XYXRjaGVyID0gY3JlYXRlTG9jYXRpb25XYXRjaGVyKHRoaXMpO1xuXHRjb25zdHJ1Y3Rvcihjb250ZW50U2NyaXB0TmFtZSwgb3B0aW9ucykge1xuXHRcdHRoaXMuY29udGVudFNjcmlwdE5hbWUgPSBjb250ZW50U2NyaXB0TmFtZTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuaWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKTtcblx0XHR0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHR0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG5cdFx0dGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoKTtcblx0fVxuXHRnZXQgc2lnbmFsKCkge1xuXHRcdHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5zaWduYWw7XG5cdH1cblx0YWJvcnQocmVhc29uKSB7XG5cdFx0cmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLmFib3J0KHJlYXNvbik7XG5cdH1cblx0Z2V0IGlzSW52YWxpZCgpIHtcblx0XHRpZiAoYnJvd3Nlci5ydW50aW1lPy5pZCA9PSBudWxsKSB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0cmV0dXJuIHRoaXMuc2lnbmFsLmFib3J0ZWQ7XG5cdH1cblx0Z2V0IGlzVmFsaWQoKSB7XG5cdFx0cmV0dXJuICF0aGlzLmlzSW52YWxpZDtcblx0fVxuXHQvKipcblx0KiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRvIHJlbW92ZSB0aGUgbGlzdGVuZXIuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoY2IpO1xuXHQqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG5cdCogICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcblx0KiB9KVxuXHQqIC8vIC4uLlxuXHQqIHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIoKTtcblx0Ki9cblx0b25JbnZhbGlkYXRlZChjYikge1xuXHRcdHRoaXMuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBjYik7XG5cdFx0cmV0dXJuICgpID0+IHRoaXMuc2lnbmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBjYik7XG5cdH1cblx0LyoqXG5cdCogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG5cdCogYWZ0ZXIgdGhlIGNvbnRleHQgaXMgZXhwaXJlZC5cblx0KlxuXHQqIEBleGFtcGxlXG5cdCogY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcblx0KiAgIGlmIChjdHguaXNJbnZhbGlkKSByZXR1cm4gY3R4LmJsb2NrKCk7XG5cdCpcblx0KiAgIC8vIC4uLlxuXHQqIH1cblx0Ki9cblx0YmxvY2soKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHt9KTtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldEludGVydmFsYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogSW50ZXJ2YWxzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2xlYXJJbnRlcnZhbGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcblx0XHR9LCB0aW1lb3V0KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldFRpbWVvdXRgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBUaW1lb3V0cyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYHNldFRpbWVvdXRgIGZ1bmN0aW9uLlxuXHQqL1xuXHRzZXRUaW1lb3V0KGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhclRpbWVvdXQoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cblx0KiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxBbmltYXRpb25GcmFtZWAgZnVuY3Rpb24uXG5cdCovXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuXHRcdGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcblx0XHR9KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0SWRsZUNhbGxiYWNrYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG5cdCogaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBDYWxsYmFja3MgY2FuIGJlIGNhbmNlbGVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2FuY2VsSWRsZUNhbGxiYWNrYCBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuXHRcdGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcblx0XHR9LCBvcHRpb25zKTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuXHRcdH1cblx0XHR0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLCBoYW5kbGVyLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0c2lnbmFsOiB0aGlzLnNpZ25hbFxuXHRcdH0pO1xuXHR9XG5cdC8qKlxuXHQqIEBpbnRlcm5hbFxuXHQqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuXHQqL1xuXHRub3RpZnlJbnZhbGlkYXRlZCgpIHtcblx0XHR0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcblx0XHRsb2dnZXIuZGVidWcoYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgKTtcblx0fVxuXHRzdG9wT2xkU2NyaXB0cygpIHtcblx0XHRkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsIHsgZGV0YWlsOiB7XG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0gfSkpO1xuXHRcdHdpbmRvdy5wb3N0TWVzc2FnZSh7XG5cdFx0XHR0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0sIFwiKlwiKTtcblx0fVxuXHR2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcblx0XHRjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGV0YWlsPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcblx0XHRjb25zdCBpc0Zyb21TZWxmID0gZXZlbnQuZGV0YWlsPy5tZXNzYWdlSWQgPT09IHRoaXMuaWQ7XG5cdFx0cmV0dXJuIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgIWlzRnJvbVNlbGY7XG5cdH1cblx0bGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCkge1xuXHRcdGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIShldmVudCBpbnN0YW5jZW9mIEN1c3RvbUV2ZW50KSB8fCAhdGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSByZXR1cm47XG5cdFx0XHR0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0fTtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpKTtcblx0fVxufTtcblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBDb250ZW50U2NyaXB0Q29udGV4dCB9OyJdLCJuYW1lcyI6WyJkZWZpbml0aW9uIiwicmVzdWx0IiwiY29udGVudCIsInByaW50IiwibG9nZ2VyIiwiYnJvd3NlciIsIld4dExvY2F0aW9u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
content;