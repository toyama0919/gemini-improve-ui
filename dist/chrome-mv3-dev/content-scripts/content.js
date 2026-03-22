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
    if (event.code === "Home" && !event.metaKey && !event.ctrlKey && !isInInput) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvc2V0dGluZ3MudHMiLCIuLi8uLi8uLi9zcmMvYXV0b2NvbXBsZXRlLnRzIiwiLi4vLi4vLi4vc3JjL2NoYXQudHMiLCIuLi8uLi8uLi9zcmMvaGlzdG9yeS50cyIsIi4uLy4uLy4uL3NyYy9zZWFyY2gudHMiLCIuLi8uLi8uLi9zcmMvZXhwb3J0LnRzIiwiLi4vLi4vLi4vc3JjL3F1aWNrLXByb21wdHMudHMiLCIuLi8uLi8uLi9zcmMva2V5Ym9hcmQudHMiLCIuLi8uLi8uLi9zcmMvZGVlcC1kaXZlLnRzIiwiLi4vLi4vLi4vc3JjL21hcC50cyIsIi4uLy4uLy4uL3NyYy9kb20tYW5hbHl6ZXIudHMiLCIuLi8uLi8uLi9lbnRyeXBvaW50cy9jb250ZW50L2luZGV4LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWNvbnRlbnQtc2NyaXB0LnRzXG5mdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcblx0cmV0dXJuIGRlZmluaXRpb247XG59XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgZGVmaW5lQ29udGVudFNjcmlwdCB9OyIsIi8vIFNldHRpbmdzIG1hbmFnZW1lbnRcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfREVFUF9ESVZFX1BST01QVCA9ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nO1xuXG5sZXQgZGVlcERpdmVQcm9tcHQgPSBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkRGVlcERpdmVQcm9tcHQoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydkZWVwRGl2ZVByb21wdCddLCAocmVzdWx0KSA9PiB7XG4gICAgICBpZiAocmVzdWx0LmRlZXBEaXZlUHJvbXB0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZGVlcERpdmVQcm9tcHQgPSByZXN1bHQuZGVlcERpdmVQcm9tcHQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWVwRGl2ZVByb21wdCA9IERFRkFVTFRfREVFUF9ESVZFX1BST01QVDtcbiAgICAgIH1cbiAgICAgIHJlc29sdmUoZGVlcERpdmVQcm9tcHQpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZXBEaXZlUHJvbXB0KCk6IHN0cmluZyB7XG4gIHJldHVybiBkZWVwRGl2ZVByb21wdCB8fCBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hvcnRjdXRzIHtcbiAgY2hhdDoge1xuICAgIGZvY3VzUXVpY2tQcm9tcHQ6IHN0cmluZztcbiAgICB0b2dnbGVTaWRlYmFyOiBzdHJpbmc7XG4gICAgdG9nZ2xlSGlzdG9yeU1vZGU6IHN0cmluZztcbiAgICBzY3JvbGxVcDogc3RyaW5nO1xuICAgIHNjcm9sbERvd246IHN0cmluZztcbiAgICBoaXN0b3J5VXA6IHN0cmluZztcbiAgICBoaXN0b3J5RG93bjogc3RyaW5nO1xuICAgIGhpc3RvcnlPcGVuOiBzdHJpbmc7XG4gICAgaGlzdG9yeUV4aXQ6IHN0cmluZztcbiAgfTtcbiAgc2VhcmNoOiB7XG4gICAgbW92ZVVwOiBzdHJpbmc7XG4gICAgbW92ZURvd246IHN0cmluZztcbiAgICBvcGVuUmVzdWx0OiBzdHJpbmc7XG4gICAgc2Nyb2xsVXA6IHN0cmluZztcbiAgICBzY3JvbGxEb3duOiBzdHJpbmc7XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NIT1JUQ1VUUzogU2hvcnRjdXRzID0ge1xuICBjaGF0OiB7XG4gICAgZm9jdXNRdWlja1Byb21wdDogJ0luc2VydCcsXG4gICAgdG9nZ2xlU2lkZWJhcjogJ0RlbGV0ZScsXG4gICAgdG9nZ2xlSGlzdG9yeU1vZGU6ICdFbmQnLFxuICAgIHNjcm9sbFVwOiAnUGFnZVVwJyxcbiAgICBzY3JvbGxEb3duOiAnUGFnZURvd24nLFxuICAgIGhpc3RvcnlVcDogJ0Fycm93VXAnLFxuICAgIGhpc3RvcnlEb3duOiAnQXJyb3dEb3duJyxcbiAgICBoaXN0b3J5T3BlbjogJ0VudGVyJyxcbiAgICBoaXN0b3J5RXhpdDogJ0VzY2FwZScsXG4gIH0sXG4gIHNlYXJjaDoge1xuICAgIG1vdmVVcDogJ0Fycm93VXAnLFxuICAgIG1vdmVEb3duOiAnQXJyb3dEb3duJyxcbiAgICBvcGVuUmVzdWx0OiAnRW50ZXInLFxuICAgIHNjcm9sbFVwOiAnUGFnZVVwJyxcbiAgICBzY3JvbGxEb3duOiAnUGFnZURvd24nLFxuICB9LFxufTtcblxubGV0IGN1cnJlbnRTaG9ydGN1dHM6IFNob3J0Y3V0cyB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gbG9hZFNob3J0Y3V0cygpOiBQcm9taXNlPFNob3J0Y3V0cz4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChbJ3Nob3J0Y3V0cyddLCAocmVzdWx0KSA9PiB7XG4gICAgICBpZiAocmVzdWx0LnNob3J0Y3V0cykge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gcmVzdWx0LnNob3J0Y3V0cztcbiAgICAgICAgbWlncmF0ZVNob3J0Y3V0cyhjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX1NIT1JUQ1VUUykpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBtaWdyYXRlU2hvcnRjdXRzKHNob3J0Y3V0czogU2hvcnRjdXRzKTogdm9pZCB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IGNoYXQgPSBzaG9ydGN1dHMuY2hhdCBhcyBhbnk7XG4gIGlmIChjaGF0Lm5hdmlnYXRlVG9TZWFyY2ggJiYgIWNoYXQuZm9jdXNRdWlja1Byb21wdCkge1xuICAgIGNoYXQuZm9jdXNRdWlja1Byb21wdCA9IGNoYXQubmF2aWdhdGVUb1NlYXJjaDtcbiAgICBkZWxldGUgY2hhdC5uYXZpZ2F0ZVRvU2VhcmNoO1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgc2hvcnRjdXRzIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYXZlU2hvcnRjdXRzKHNob3J0Y3V0czogU2hvcnRjdXRzKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgc2hvcnRjdXRzIH0sICgpID0+IHtcbiAgICAgIGN1cnJlbnRTaG9ydGN1dHMgPSBzaG9ydGN1dHM7XG4gICAgICByZXNvbHZlKCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2hvcnRjdXRzKCk6IFNob3J0Y3V0cyB7XG4gIHJldHVybiBjdXJyZW50U2hvcnRjdXRzIHx8IERFRkFVTFRfU0hPUlRDVVRTO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRTaG9ydGN1dHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBzYXZlU2hvcnRjdXRzKEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoREVGQVVMVF9TSE9SVENVVFMpKSk7XG59XG5cbnR5cGUgU2hvcnRjdXRLZXkgPSBzdHJpbmc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Nob3J0Y3V0KGV2ZW50OiBLZXlib2FyZEV2ZW50LCBzaG9ydGN1dEtleTogU2hvcnRjdXRLZXkpOiBib29sZWFuIHtcbiAgY29uc3Qgc2hvcnRjdXRzID0gZ2V0U2hvcnRjdXRzKCk7XG4gIGNvbnN0IGtleXMgPSBzaG9ydGN1dEtleS5zcGxpdCgnLicpO1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICBsZXQgc2hvcnRjdXQ6IGFueSA9IHNob3J0Y3V0cztcbiAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgIHNob3J0Y3V0ID0gc2hvcnRjdXRba2V5XTtcbiAgICBpZiAoIXNob3J0Y3V0KSByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAodHlwZW9mIHNob3J0Y3V0ID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG1ldGFNYXRjaCA9IHNob3J0Y3V0Lm1ldGEgPyBldmVudC5tZXRhS2V5IDogIWV2ZW50Lm1ldGFLZXk7XG4gICAgY29uc3QgY3RybE1hdGNoID0gc2hvcnRjdXQuY3RybCA/IGV2ZW50LmN0cmxLZXkgOiAhZXZlbnQuY3RybEtleTtcbiAgICBjb25zdCBzaGlmdE1hdGNoID0gc2hvcnRjdXQuc2hpZnQgPyBldmVudC5zaGlmdEtleSA6ICFldmVudC5zaGlmdEtleTtcbiAgICByZXR1cm4gKFxuICAgICAgZXZlbnQuY29kZSA9PT0gc2hvcnRjdXQua2V5ICYmIG1ldGFNYXRjaCAmJiBjdHJsTWF0Y2ggJiYgc2hpZnRNYXRjaFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gKFxuICAgIGV2ZW50LmNvZGUgPT09IHNob3J0Y3V0ICYmXG4gICAgIWV2ZW50LmN0cmxLZXkgJiZcbiAgICAhZXZlbnQubWV0YUtleSAmJlxuICAgICFldmVudC5zaGlmdEtleVxuICApO1xufVxuIiwiLy8gQXV0b2NvbXBsZXRlIGZ1bmN0aW9uYWxpdHkgZm9yIEdlbWluaSBjaGF0IHRleHRhcmVhXG5cbmNvbnN0IFJFVFJZX0RFTEFZID0gNTAwO1xuY29uc3QgREVCT1VOQ0VfREVMQVkgPSAzMDA7XG5jb25zdCBEUk9QRE9XTl9NQVJHSU4gPSAxMDtcbmNvbnN0IElURU1fSEVJR0hUID0gNDA7XG5jb25zdCBNSU5fRFJPUERPV05fSEVJR0hUID0gMTAwO1xuXG5sZXQgYXV0b2NvbXBsZXRlTGlzdDogSFRNTERpdkVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBzZWxlY3RlZEluZGV4ID0gLTE7XG5sZXQgY3VycmVudFN1Z2dlc3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xubGV0IGF1dG9jb21wbGV0ZVRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0F1dG9jb21wbGV0ZVZpc2libGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgYXV0b2NvbXBsZXRlTGlzdCAhPT0gbnVsbCAmJlxuICAgIGF1dG9jb21wbGV0ZUxpc3Quc3R5bGUuZGlzcGxheSA9PT0gJ2Jsb2NrJyAmJlxuICAgIGN1cnJlbnRTdWdnZXN0aW9ucy5sZW5ndGggPiAwXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGU6IEV2ZW50KTogdm9pZCB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbn1cblxuZnVuY3Rpb24gbW92ZVNlbGVjdGlvbihkaXJlY3Rpb246ICduZXh0JyB8ICdwcmV2Jyk6IHZvaWQge1xuICBpZiAoZGlyZWN0aW9uID09PSAnbmV4dCcpIHtcbiAgICBzZWxlY3RlZEluZGV4ID1cbiAgICAgIHNlbGVjdGVkSW5kZXggPCAwID8gMCA6IChzZWxlY3RlZEluZGV4ICsgMSkgJSBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdGVkSW5kZXggPVxuICAgICAgc2VsZWN0ZWRJbmRleCA8IDBcbiAgICAgICAgPyBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoIC0gMVxuICAgICAgICA6IHNlbGVjdGVkSW5kZXggPD0gMFxuICAgICAgICAgID8gY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aCAtIDFcbiAgICAgICAgICA6IHNlbGVjdGVkSW5kZXggLSAxO1xuICB9XG4gIHVwZGF0ZVNlbGVjdGVkSXRlbSgpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaEdvb2dsZVN1Z2dlc3Rpb25zKHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGlmICghcXVlcnkgfHwgcXVlcnkudHJpbSgpLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdO1xuICB0cnkge1xuICAgIGNvbnN0IGVuY29kZWRRdWVyeSA9IGVuY29kZVVSSUNvbXBvbmVudChxdWVyeS50cmltKCkpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goXG4gICAgICBgaHR0cHM6Ly93d3cuZ29vZ2xlLmNvLmpwL2NvbXBsZXRlL3NlYXJjaD9vdXRwdXQ9ZmlyZWZveCZobD1qYSZpZT11dGYtOCZvZT11dGYtOCZxPSR7ZW5jb2RlZFF1ZXJ5fWBcbiAgICApO1xuICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgcmV0dXJuIGRhdGFbMV0gfHwgW107XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBbXTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBdXRvY29tcGxldGVEcm9wZG93bigpOiBIVE1MRGl2RWxlbWVudCB7XG4gIGlmIChhdXRvY29tcGxldGVMaXN0KSByZXR1cm4gYXV0b2NvbXBsZXRlTGlzdDtcblxuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGxpc3QuY2xhc3NOYW1lID0gJ2dlbWluaS1hdXRvY29tcGxldGUtbGlzdCc7XG4gIGxpc3Quc3R5bGUuY3NzVGV4dCA9IGBcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgYmFja2dyb3VuZDogd2hpdGU7XG4gICAgYm9yZGVyOiAxcHggc29saWQgI2RkZDtcbiAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsIDAsIDAsIDAuMTUpO1xuICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgei1pbmRleDogMTAwMDA7XG4gICAgZGlzcGxheTogbm9uZTtcbiAgICBtaW4td2lkdGg6IDMwMHB4O1xuICBgO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxpc3QpO1xuICBhdXRvY29tcGxldGVMaXN0ID0gbGlzdDtcbiAgcmV0dXJuIGxpc3Q7XG59XG5cbmZ1bmN0aW9uIHBvc2l0aW9uRHJvcGRvd24oXG4gIGlucHV0RWxlbWVudDogRWxlbWVudCxcbiAgbGlzdDogSFRNTERpdkVsZW1lbnQsXG4gIHN1Z2dlc3Rpb25zOiBzdHJpbmdbXVxuKTogdm9pZCB7XG4gIGNvbnN0IHJlY3QgPSBpbnB1dEVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGxpc3Quc3R5bGUubGVmdCA9IGAke3JlY3QubGVmdH1weGA7XG4gIGxpc3Quc3R5bGUud2lkdGggPSBgJHtyZWN0LndpZHRofXB4YDtcbiAgbGlzdC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblxuICBjb25zdCBzcGFjZUJlbG93ID0gd2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC5ib3R0b20gLSBEUk9QRE9XTl9NQVJHSU47XG4gIGNvbnN0IHNwYWNlQWJvdmUgPSByZWN0LnRvcCAtIERST1BET1dOX01BUkdJTjtcbiAgY29uc3QgbWF4SXRlbXNCZWxvdyA9IE1hdGguZmxvb3Ioc3BhY2VCZWxvdyAvIElURU1fSEVJR0hUKTtcbiAgY29uc3QgbWF4SXRlbXNBYm92ZSA9IE1hdGguZmxvb3Ioc3BhY2VBYm92ZSAvIElURU1fSEVJR0hUKTtcblxuICBpZiAobWF4SXRlbXNCZWxvdyA8IHN1Z2dlc3Rpb25zLmxlbmd0aCAmJiBtYXhJdGVtc0Fib3ZlID4gbWF4SXRlbXNCZWxvdykge1xuICAgIGxpc3Quc3R5bGUuYm90dG9tID0gYCR7d2luZG93LmlubmVySGVpZ2h0IC0gcmVjdC50b3B9cHhgO1xuICAgIGxpc3Quc3R5bGUudG9wID0gJ2F1dG8nO1xuICAgIGxpc3Quc3R5bGUubWF4SGVpZ2h0ID0gYCR7TWF0aC5tYXgoc3BhY2VBYm92ZSwgTUlOX0RST1BET1dOX0hFSUdIVCl9cHhgO1xuICB9IGVsc2Uge1xuICAgIGxpc3Quc3R5bGUudG9wID0gYCR7cmVjdC5ib3R0b219cHhgO1xuICAgIGxpc3Quc3R5bGUuYm90dG9tID0gJ2F1dG8nO1xuICAgIGxpc3Quc3R5bGUubWF4SGVpZ2h0ID0gYCR7TWF0aC5tYXgoc3BhY2VCZWxvdywgTUlOX0RST1BET1dOX0hFSUdIVCl9cHhgO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNob3dBdXRvY29tcGxldGVTdWdnZXN0aW9ucyhcbiAgaW5wdXRFbGVtZW50OiBIVE1MRWxlbWVudCxcbiAgc3VnZ2VzdGlvbnM6IHN0cmluZ1tdXG4pOiB2b2lkIHtcbiAgaWYgKCFzdWdnZXN0aW9ucyB8fCBzdWdnZXN0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaXN0ID0gY3JlYXRlQXV0b2NvbXBsZXRlRHJvcGRvd24oKTtcbiAgbGlzdC5pbm5lckhUTUwgPSAnJztcbiAgY3VycmVudFN1Z2dlc3Rpb25zID0gc3VnZ2VzdGlvbnM7XG4gIHNlbGVjdGVkSW5kZXggPSAtMTtcblxuICBzdWdnZXN0aW9ucy5mb3JFYWNoKChzdWdnZXN0aW9uLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBpdGVtLmNsYXNzTmFtZSA9ICdnZW1pbmktYXV0b2NvbXBsZXRlLWl0ZW0nO1xuICAgIGl0ZW0udGV4dENvbnRlbnQgPSBzdWdnZXN0aW9uO1xuICAgIGl0ZW0uc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgIHBhZGRpbmc6IDEwcHggMTZweDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjZjBmMGYwO1xuICAgIGA7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgICAgc2VsZWN0ZWRJbmRleCA9IGluZGV4O1xuICAgICAgdXBkYXRlU2VsZWN0ZWRJdGVtKCk7XG4gICAgfSk7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIHNlbGVjdFN1Z2dlc3Rpb24oaW5wdXRFbGVtZW50LCBzdWdnZXN0aW9uKTtcbiAgICB9KTtcbiAgICBsaXN0LmFwcGVuZENoaWxkKGl0ZW0pO1xuICB9KTtcblxuICBwb3NpdGlvbkRyb3Bkb3duKGlucHV0RWxlbWVudCwgbGlzdCwgc3VnZ2VzdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk6IHZvaWQge1xuICBpZiAoYXV0b2NvbXBsZXRlTGlzdCkge1xuICAgIGF1dG9jb21wbGV0ZUxpc3Quc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgfVxuICBjdXJyZW50U3VnZ2VzdGlvbnMgPSBbXTtcbiAgc2VsZWN0ZWRJbmRleCA9IC0xO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVTZWxlY3RlZEl0ZW0oKTogdm9pZCB7XG4gIGlmICghYXV0b2NvbXBsZXRlTGlzdCkgcmV0dXJuO1xuICBjb25zdCBpdGVtcyA9IGF1dG9jb21wbGV0ZUxpc3QucXVlcnlTZWxlY3RvckFsbCgnLmdlbWluaS1hdXRvY29tcGxldGUtaXRlbScpO1xuICBpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgIChpdGVtIGFzIEhUTUxFbGVtZW50KS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPVxuICAgICAgaW5kZXggPT09IHNlbGVjdGVkSW5kZXggPyAnI2U4ZjBmZScgOiAndHJhbnNwYXJlbnQnO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc2VsZWN0U3VnZ2VzdGlvbihpbnB1dEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzdWdnZXN0aW9uOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKChpbnB1dEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgJiB7IGNvbnRlbnRFZGl0YWJsZTogc3RyaW5nIH0pLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XG4gICAgd2hpbGUgKGlucHV0RWxlbWVudC5maXJzdENoaWxkKSB7XG4gICAgICBpbnB1dEVsZW1lbnQucmVtb3ZlQ2hpbGQoaW5wdXRFbGVtZW50LmZpcnN0Q2hpbGQpO1xuICAgIH1cbiAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgIHAudGV4dENvbnRlbnQgPSBzdWdnZXN0aW9uO1xuICAgIGlucHV0RWxlbWVudC5hcHBlbmRDaGlsZChwKTtcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcbiAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyhpbnB1dEVsZW1lbnQpO1xuICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICAgIGlucHV0RWxlbWVudC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuICB9IGVsc2Uge1xuICAgIChpbnB1dEVsZW1lbnQgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBzdWdnZXN0aW9uO1xuICAgIGlucHV0RWxlbWVudC5mb2N1cygpO1xuICAgIChpbnB1dEVsZW1lbnQgYXMgSFRNTElucHV0RWxlbWVudCkuc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICBzdWdnZXN0aW9uLmxlbmd0aCxcbiAgICAgIHN1Z2dlc3Rpb24ubGVuZ3RoXG4gICAgKTtcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgfVxuICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICApO1xuICBpZiAoIXRleHRhcmVhKSB7XG4gICAgc2V0VGltZW91dChpbml0aWFsaXplQXV0b2NvbXBsZXRlLCBSRVRSWV9ERUxBWSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGV4dGFyZWEuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAna2V5ZG93bicsXG4gICAgYXN5bmMgKGUpID0+IHtcbiAgICAgIGlmICghZS5pc1RydXN0ZWQgfHwgZS5pc0NvbXBvc2luZykgcmV0dXJuO1xuXG4gICAgICBpZiAoZS5tZXRhS2V5ICYmIGUuY29kZSA9PT0gJ1NwYWNlJykge1xuICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgY29uc3QgdGV4dCA9IHRleHRhcmVhLnRleHRDb250ZW50IHx8ICcnO1xuICAgICAgICBjb25zdCB0cmltbWVkVGV4dCA9IHRleHQudHJpbSgpO1xuICAgICAgICBpZiAodHJpbW1lZFRleHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gYXdhaXQgZmV0Y2hHb29nbGVTdWdnZXN0aW9ucyh0cmltbWVkVGV4dCk7XG4gICAgICAgIHNob3dBdXRvY29tcGxldGVTdWdnZXN0aW9ucyh0ZXh0YXJlYSwgc3VnZ2VzdGlvbnMpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHJldHVybjtcblxuICAgICAgaWYgKGUua2V5ID09PSAnVGFiJyB8fCBlLmtleSA9PT0gJ0Fycm93RG93bicpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIG1vdmVTZWxlY3Rpb24oJ25leHQnKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd1VwJykge1xuICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgbW92ZVNlbGVjdGlvbigncHJldicpO1xuICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgY29uc3QgaW5kZXhUb1NlbGVjdCA9IHNlbGVjdGVkSW5kZXggPj0gMCA/IHNlbGVjdGVkSW5kZXggOiAwO1xuICAgICAgICBzZWxlY3RTdWdnZXN0aW9uKHRleHRhcmVhLCBjdXJyZW50U3VnZ2VzdGlvbnNbaW5kZXhUb1NlbGVjdF0pO1xuICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHRydWVcbiAgKTtcblxuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgaWYgKFxuICAgICAgYXV0b2NvbXBsZXRlTGlzdCAmJlxuICAgICAgIWF1dG9jb21wbGV0ZUxpc3QuY29udGFpbnMoZS50YXJnZXQgYXMgTm9kZSkgJiZcbiAgICAgIGUudGFyZ2V0ICE9PSB0ZXh0YXJlYVxuICAgICkge1xuICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUoKTogdm9pZCB7XG4gIGlmICghd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9zZWFyY2gnKSkgcmV0dXJuO1xuXG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3Qgc2VhcmNoSW5wdXRJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihcbiAgICAgICdpbnB1dFtkYXRhLXRlc3QtaWQ9XCJzZWFyY2gtaW5wdXRcIl0nXG4gICAgKSB8fFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihcbiAgICAgICAgJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdW3BsYWNlaG9sZGVyKj1cIuaknOe0olwiXSdcbiAgICAgICkgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oJ2lucHV0W3R5cGU9XCJ0ZXh0XCJdJyk7XG5cbiAgICBpZiAoc2VhcmNoSW5wdXQpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoc2VhcmNoSW5wdXRJbnRlcnZhbCk7XG5cbiAgICAgIHNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgaWYgKCFlLmlzVHJ1c3RlZCkgcmV0dXJuO1xuICAgICAgICBpZiAoYXV0b2NvbXBsZXRlVGltZW91dCkgY2xlYXJUaW1lb3V0KGF1dG9jb21wbGV0ZVRpbWVvdXQpO1xuXG4gICAgICAgIGNvbnN0IHRleHQgPSBzZWFyY2hJbnB1dC52YWx1ZSB8fCAnJztcbiAgICAgICAgY29uc3QgdHJpbW1lZFRleHQgPSB0ZXh0LnRyaW0oKTtcbiAgICAgICAgaWYgKHRyaW1tZWRUZXh0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGF1dG9jb21wbGV0ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCBjdXJyZW50VHJpbW1lZCA9IChzZWFyY2hJbnB1dC52YWx1ZSB8fCAnJykudHJpbSgpO1xuICAgICAgICAgIGlmIChjdXJyZW50VHJpbW1lZC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IGF3YWl0IGZldGNoR29vZ2xlU3VnZ2VzdGlvbnMoY3VycmVudFRyaW1tZWQpO1xuICAgICAgICAgIHNob3dBdXRvY29tcGxldGVTdWdnZXN0aW9ucyhzZWFyY2hJbnB1dCwgc3VnZ2VzdGlvbnMpO1xuICAgICAgICB9LCBERUJPVU5DRV9ERUxBWSk7XG4gICAgICB9KTtcblxuICAgICAgc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICAgJ2tleWRvd24nLFxuICAgICAgICAoZSkgPT4ge1xuICAgICAgICAgIGlmICghZS5pc1RydXN0ZWQgfHwgZS5pc0NvbXBvc2luZykgcmV0dXJuO1xuICAgICAgICAgIGlmICghaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHJldHVybjtcblxuICAgICAgICAgIGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgICAgIG1vdmVTZWxlY3Rpb24oJ25leHQnKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICAgICAgbW92ZVNlbGVjdGlvbigncHJldicpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgICAgIGlmIChzZWxlY3RlZEluZGV4ID49IDApIHtcbiAgICAgICAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgICAgICAgIHNlbGVjdFN1Z2dlc3Rpb24oc2VhcmNoSW5wdXQsIGN1cnJlbnRTdWdnZXN0aW9uc1tzZWxlY3RlZEluZGV4XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdHJ1ZVxuICAgICAgKTtcblxuICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgYXV0b2NvbXBsZXRlTGlzdCAmJlxuICAgICAgICAgICFhdXRvY29tcGxldGVMaXN0LmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpICYmXG4gICAgICAgICAgZS50YXJnZXQgIT09IHNlYXJjaElucHV0XG4gICAgICAgICkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKHNlYXJjaElucHV0SW50ZXJ2YWwpO1xuICAgIH1cbiAgfSwgNTAwKTtcbn1cbiIsIi8vIENoYXQgVUkgZnVuY3Rpb25hbGl0eSAodGV4dGFyZWEsIHNpZGViYXIsIHNjcm9sbGluZywgY29weSBidXR0b25zKVxuXG5pbXBvcnQgeyBpbml0aWFsaXplQXV0b2NvbXBsZXRlIH0gZnJvbSAnLi9hdXRvY29tcGxldGUnO1xuXG5sZXQgY2FjaGVkQ2hhdEFyZWE6IEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbmxldCBjaGF0QXJlYUNhY2hlVGltZSA9IDA7XG5jb25zdCBDSEFUX0FSRUFfQ0FDSEVfRFVSQVRJT04gPSA1MDAwO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdEFyZWEoKTogRWxlbWVudCB7XG4gIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cbiAgaWYgKGNhY2hlZENoYXRBcmVhICYmIG5vdyAtIGNoYXRBcmVhQ2FjaGVUaW1lIDwgQ0hBVF9BUkVBX0NBQ0hFX0RVUkFUSU9OKSB7XG4gICAgcmV0dXJuIGNhY2hlZENoYXRBcmVhO1xuICB9XG5cbiAgY29uc3QgY2hhdEhpc3RvcnkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbmZpbml0ZS1zY3JvbGxlci5jaGF0LWhpc3RvcnknKTtcbiAgaWYgKGNoYXRIaXN0b3J5ICYmIGNoYXRIaXN0b3J5LnNjcm9sbEhlaWdodCA+IGNoYXRIaXN0b3J5LmNsaWVudEhlaWdodCkge1xuICAgIGNhY2hlZENoYXRBcmVhID0gY2hhdEhpc3Rvcnk7XG4gICAgY2hhdEFyZWFDYWNoZVRpbWUgPSBub3c7XG4gICAgcmV0dXJuIGNoYXRIaXN0b3J5O1xuICB9XG5cbiAgaWYgKFxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxIZWlnaHQgPlxuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHRcbiAgKSB7XG4gICAgY2FjaGVkQ2hhdEFyZWEgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgY2hhdEFyZWFDYWNoZVRpbWUgPSBub3c7XG4gICAgcmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgfVxuXG4gIGNvbnN0IHNlbGVjdG9ycyA9IFtcbiAgICAnaW5maW5pdGUtc2Nyb2xsZXInLFxuICAgICdtYWluW2NsYXNzKj1cIm1haW5cIl0nLFxuICAgICcuY29udmVyc2F0aW9uLWNvbnRhaW5lcicsXG4gICAgJ1tjbGFzcyo9XCJjaGF0LWhpc3RvcnlcIl0nLFxuICAgICdbY2xhc3MqPVwibWVzc2FnZXNcIl0nLFxuICAgICdtYWluJyxcbiAgICAnW2NsYXNzKj1cInNjcm9sbFwiXScsXG4gICAgJ2RpdltjbGFzcyo9XCJjb252ZXJzYXRpb25cIl0nLFxuICBdO1xuXG4gIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgIGlmIChlbGVtZW50ICYmIGVsZW1lbnQuc2Nyb2xsSGVpZ2h0ID4gZWxlbWVudC5jbGllbnRIZWlnaHQpIHtcbiAgICAgIGNhY2hlZENoYXRBcmVhID0gZWxlbWVudDtcbiAgICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgICAgcmV0dXJuIGVsZW1lbnQ7XG4gICAgfVxuICB9XG5cbiAgY2FjaGVkQ2hhdEFyZWEgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICByZXR1cm4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2Nyb2xsQ2hhdEFyZWEoZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogdm9pZCB7XG4gIGNvbnN0IGNoYXRBcmVhID0gZ2V0Q2hhdEFyZWEoKTtcbiAgY29uc3Qgc2Nyb2xsQW1vdW50ID0gd2luZG93LmlubmVySGVpZ2h0ICogMC4xO1xuICBjb25zdCBzY3JvbGxWYWx1ZSA9IGRpcmVjdGlvbiA9PT0gJ3VwJyA/IC1zY3JvbGxBbW91bnQgOiBzY3JvbGxBbW91bnQ7XG5cbiAgaWYgKGNoYXRBcmVhID09PSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgfHwgY2hhdEFyZWEgPT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IHNjcm9sbFZhbHVlLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9IGVsc2Uge1xuICAgIChjaGF0QXJlYSBhcyBIVE1MRWxlbWVudCkuc2Nyb2xsQnkoeyB0b3A6IHNjcm9sbFZhbHVlLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVOZXdDaGF0KCk6IHZvaWQge1xuICBjb25zdCBuZXdDaGF0TGluayA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oXG4gICAgICAnYVtocmVmPVwiaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS9hcHBcIl0nXG4gICAgKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2FyaWEtbGFiZWwqPVwi5paw6KaP5L2c5oiQXCJdJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYVthcmlhLWxhYmVsKj1cIk5ldyBjaGF0XCJdJyk7XG5cbiAgaWYgKG5ld0NoYXRMaW5rKSB7XG4gICAgbmV3Q2hhdExpbmsuY2xpY2soKTtcbiAgICByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBuZXdDaGF0QnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtdGVzdC1pZD1cIm5ldy1jaGF0LWJ1dHRvblwiXScpO1xuICBpZiAobmV3Q2hhdEJ1dHRvbikge1xuICAgIGNvbnN0IGNsaWNrYWJsZSA9XG4gICAgICBuZXdDaGF0QnV0dG9uLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdhLCBidXR0b24nKSB8fFxuICAgICAgKG5ld0NoYXRCdXR0b24gYXMgSFRNTEVsZW1lbnQpO1xuICAgIGNsaWNrYWJsZS5jbGljaygpO1xuICAgIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGxpbmtzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignYSwgYnV0dG9uJykpO1xuICBjb25zdCBuZXdDaGF0QnRuID0gbGlua3MuZmluZChcbiAgICAoZWwpID0+XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ+aWsOimj+S9nOaIkCcpIHx8XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ05ldyBjaGF0JykgfHxcbiAgICAgIGVsLnRleHRDb250ZW50Py5pbmNsdWRlcygn5paw6KaPJylcbiAgKTtcbiAgaWYgKG5ld0NoYXRCdG4pIHtcbiAgICBuZXdDaGF0QnRuLmNsaWNrKCk7XG4gICAgcmVpbml0aWFsaXplQWZ0ZXJOYXZpZ2F0aW9uKCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpOiB2b2lkIHtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSgpO1xuICB9LCAxNTAwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvY3VzVGV4dGFyZWEoKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID1cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgICApIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuXG4gIGlmICghdGV4dGFyZWEpIHJldHVybjtcbiAgdGV4dGFyZWEuZm9jdXMoKTtcblxuICBpZiAodGV4dGFyZWEuY29udGVudEVkaXRhYmxlID09PSAndHJ1ZScpIHtcbiAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0ZXh0YXJlYSk7XG4gICAgcmFuZ2UuY29sbGFwc2UoZmFsc2UpO1xuICAgIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgc2VsPy5hZGRSYW5nZShyYW5nZSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQW5kRm9jdXNUZXh0YXJlYSgpOiB2b2lkIHtcbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAxMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICB3aGlsZSAodGV4dGFyZWEuZmlyc3RDaGlsZCkge1xuICAgICAgICB0ZXh0YXJlYS5yZW1vdmVDaGlsZCh0ZXh0YXJlYS5maXJzdENoaWxkKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgICBwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2JyJykpO1xuICAgICAgdGV4dGFyZWEuYXBwZW5kQ2hpbGQocCk7XG4gICAgICB0ZXh0YXJlYS5mb2N1cygpO1xuICAgICAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICB9XG4gIH0sIDIwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRRdWVyeUZyb21VcmwoKTogdm9pZCB7XG4gIGNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG4gIGNvbnN0IHBhdGggPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWU7XG5cbiAgY29uc3QgaXNOZXdDaGF0ID0gcGF0aCA9PT0gJy9hcHAnIHx8IHBhdGggPT09ICcvYXBwLyc7XG4gIGNvbnN0IHF1ZXJ5ID0gaXNOZXdDaGF0ID8gdXJsUGFyYW1zLmdldCgncScpIDogbnVsbDtcbiAgY29uc3QgcXVlcnlUaHJlYWQgPSB1cmxQYXJhbXMuZ2V0KCdxdCcpO1xuICBjb25zdCB0ZXh0ID0gcXVlcnkgfHwgcXVlcnlUaHJlYWQ7XG4gIGlmICghdGV4dCkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbmQgPSB1cmxQYXJhbXMuZ2V0KCdzZW5kJyk7XG4gIGNvbnN0IHNob3VsZFNlbmQgPSBzZW5kID09PSBudWxsIHx8IHNlbmQgPT09ICd0cnVlJyB8fCBzZW5kID09PSAnMSc7XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAyMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG5cbiAgICAgIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB7XG4gICAgICAgIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuICAgICAgfVxuICAgICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIHAudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgICAgdGV4dGFyZWEuYXBwZW5kQ2hpbGQocCk7XG4gICAgICB0ZXh0YXJlYS5mb2N1cygpO1xuXG4gICAgICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgICBjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG4gICAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICAgICAgcmFuZ2UuY29sbGFwc2UoZmFsc2UpO1xuICAgICAgc2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuXG4gICAgICB0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG4gICAgICBpZiAoc2hvdWxkU2VuZCkge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBjb25zdCBzZW5kQnV0dG9uID1cbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCLpgIHkv6FcIl0nKSB8fFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIlNlbmRcIl0nKSB8fFxuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5zZW5kLWJ1dHRvbicpIHx8XG4gICAgICAgICAgICBBcnJheS5mcm9tKFxuICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uJylcbiAgICAgICAgICAgICkuZmluZChcbiAgICAgICAgICAgICAgKGJ0bikgPT5cbiAgICAgICAgICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCfpgIHkv6EnKSB8fFxuICAgICAgICAgICAgICAgIGJ0bi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8uaW5jbHVkZXMoJ1NlbmQnKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoc2VuZEJ1dHRvbiAmJiAhc2VuZEJ1dHRvbi5kaXNhYmxlZCkge1xuICAgICAgICAgICAgc2VuZEJ1dHRvbi5jbGljaygpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgNTAwKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICB9XG4gIH0sIDIwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c0FjdGlvbkJ1dHRvbihkaXJlY3Rpb246ICd1cCcgfCAnZG93bicpOiBib29sZWFuIHtcbiAgY29uc3QgYWN0aW9uQnV0dG9ucyA9IGdldEFsbEFjdGlvbkJ1dHRvbnMoKTtcbiAgaWYgKGFjdGlvbkJ1dHRvbnMubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuICAgIGFjdGlvbkJ1dHRvbnNbYWN0aW9uQnV0dG9ucy5sZW5ndGggLSAxXS5mb2N1cygpO1xuICB9IGVsc2Uge1xuICAgIGFjdGlvbkJ1dHRvbnNbMF0uZm9jdXMoKTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyhkaXJlY3Rpb246ICd1cCcgfCAnZG93bicpOiBib29sZWFuIHtcbiAgY29uc3QgYWN0aW9uQnV0dG9ucyA9IGdldEFsbEFjdGlvbkJ1dHRvbnMoKTtcbiAgY29uc3QgY3VycmVudEluZGV4ID0gYWN0aW9uQnV0dG9ucy5maW5kSW5kZXgoXG4gICAgKGJ0bikgPT4gYnRuID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50XG4gICk7XG4gIGlmIChjdXJyZW50SW5kZXggPT09IC0xKSByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuICAgIGlmIChjdXJyZW50SW5kZXggPiAwKSB7XG4gICAgICBhY3Rpb25CdXR0b25zW2N1cnJlbnRJbmRleCAtIDFdLmZvY3VzKCk7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKGN1cnJlbnRJbmRleCAtIDEpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2Uge1xuICAgIGlmIChjdXJyZW50SW5kZXggPCBhY3Rpb25CdXR0b25zLmxlbmd0aCAtIDEpIHtcbiAgICAgIGFjdGlvbkJ1dHRvbnNbY3VycmVudEluZGV4ICsgMV0uZm9jdXMoKTtcbiAgICAgIHdpbmRvdy5yZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uPy4oY3VycmVudEluZGV4ICsgMSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFsbEFjdGlvbkJ1dHRvbnMoKTogSFRNTEVsZW1lbnRbXSB7XG4gIGNvbnN0IGFsbEJ1dHRvbnMgPSBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2J1dHRvbi5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSwgYnV0dG9uW2RhdGEtYWN0aW9uPVwiZGVlcC1kaXZlXCJdJ1xuICAgIClcbiAgKTtcblxuICByZXR1cm4gYWxsQnV0dG9ucy5maWx0ZXIoKGJ0bikgPT4ge1xuICAgIGNvbnN0IGNvbnRhaW5lciA9XG4gICAgICBidG4uY2xvc2VzdCgnW2RhdGEtdGVzdC1pZCo9XCJ1c2VyXCJdJykgfHxcbiAgICAgIGJ0bi5jbG9zZXN0KCdbZGF0YS10ZXN0LWlkKj1cInByb21wdFwiXScpIHx8XG4gICAgICBidG4uY2xvc2VzdCgnW2NsYXNzKj1cInVzZXJcIl0nKTtcbiAgICByZXR1cm4gIWNvbnRhaW5lcjtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kU2lkZWJhclRvZ2dsZUJ1dHRvbigpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuICByZXR1cm4gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdbZGF0YS10ZXN0LWlkPVwic2lkZS1uYXYtdG9nZ2xlXCJdJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwi44Oh44OL44Ol44O8XCJdJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwibWVudVwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIk1lbnVcIl0nKVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTaWRlYmFyT3BlbigpOiBib29sZWFuIHtcbiAgY29uc3Qgc2lkZW5hdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ21hdC1zaWRlbmF2Jyk7XG4gIGlmICghc2lkZW5hdikgcmV0dXJuIHRydWU7XG4gIHJldHVybiBzaWRlbmF2LmNsYXNzTGlzdC5jb250YWlucygnbWF0LWRyYXdlci1vcGVuZWQnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZVNpZGViYXIoKTogdm9pZCB7XG4gIGNvbnN0IHRvZ2dsZSA9IGZpbmRTaWRlYmFyVG9nZ2xlQnV0dG9uKCk7XG4gIGlmICh0b2dnbGUpIHRvZ2dsZS5jbGljaygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZUNoYXRQYWdlKCk6IHZvaWQge1xuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBzZXRRdWVyeUZyb21VcmwoKTtcbiAgfSwgMTAwMCk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSgpO1xuICB9LCAxNTAwKTtcblxuICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICBjb25zdCBpc1N0cmVhbWluZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1thcmlhLWJ1c3k9XCJ0cnVlXCJdJyk7XG4gICAgaWYgKGlzU3RyZWFtaW5nKSB7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKC0xKTtcbiAgICB9XG4gIH0pO1xuXG4gIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwge1xuICAgIGF0dHJpYnV0ZXM6IHRydWUsXG4gICAgYXR0cmlidXRlRmlsdGVyOiBbJ2FyaWEtYnVzeSddLFxuICAgIHN1YnRyZWU6IHRydWUsXG4gIH0pO1xufVxuIiwiLy8gQ2hhdCBoaXN0b3J5IHNlbGVjdGlvbiBmdW5jdGlvbmFsaXR5XG5cbmltcG9ydCB7IGNsZWFyQW5kRm9jdXNUZXh0YXJlYSB9IGZyb20gJy4vY2hhdCc7XG5cbmxldCBzZWxlY3RlZEhpc3RvcnlJbmRleCA9IDA7XG5sZXQgaGlzdG9yeVNlbGVjdGlvbk1vZGUgPSBmYWxzZTtcblxuZnVuY3Rpb24gZ2V0SGlzdG9yeUl0ZW1zKCk6IEhUTUxFbGVtZW50W10ge1xuICByZXR1cm4gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICcuY29udmVyc2F0aW9uLWl0ZW1zLWNvbnRhaW5lciAuY29udmVyc2F0aW9uW2RhdGEtdGVzdC1pZD1cImNvbnZlcnNhdGlvblwiXSdcbiAgICApXG4gICk7XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodEhpc3RvcnkoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICBjb25zdCBpdGVtcyA9IGdldEhpc3RvcnlJdGVtcygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgc2VsZWN0ZWRIaXN0b3J5SW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihpbmRleCwgaXRlbXMubGVuZ3RoIC0gMSkpO1xuXG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG5cbiAgY29uc3Qgc2VsZWN0ZWRJdGVtID0gaXRlbXNbc2VsZWN0ZWRIaXN0b3J5SW5kZXhdO1xuICBpZiAoc2VsZWN0ZWRJdGVtKSB7XG4gICAgc2VsZWN0ZWRJdGVtLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICMxYTczZTgnO1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJy0ycHgnO1xuICAgIHNlbGVjdGVkSXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVIaXN0b3J5VXAoKTogdm9pZCB7XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXggLSAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVIaXN0b3J5RG93bigpOiB2b2lkIHtcbiAgaGlnaGxpZ2h0SGlzdG9yeShzZWxlY3RlZEhpc3RvcnlJbmRleCArIDEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3BlblNlbGVjdGVkSGlzdG9yeSgpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCB8fCAhaXRlbXNbc2VsZWN0ZWRIaXN0b3J5SW5kZXhdKSByZXR1cm47XG5cbiAgaXRlbXNbc2VsZWN0ZWRIaXN0b3J5SW5kZXhdLmNsaWNrKCk7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG5cbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcblxuICBjbGVhckFuZEZvY3VzVGV4dGFyZWEoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpOiB2b2lkIHtcbiAgaGlzdG9yeVNlbGVjdGlvbk1vZGUgPSBmYWxzZTtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogdm9pZCB7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gdHJ1ZTtcbiAgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpIHtcbiAgICAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCkuYmx1cigpO1xuICB9XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIGhpc3RvcnlTZWxlY3Rpb25Nb2RlO1xufVxuIiwiLy8gU2VhcmNoIHBhZ2UgZnVuY3Rpb25hbGl0eVxuXG5pbXBvcnQgeyBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUgfSBmcm9tICcuL2hpc3RvcnknO1xuXG5sZXQgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlYXJjaFBhZ2UoKTogYm9vbGVhbiB7XG4gIHJldHVybiB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuc3RhcnRzV2l0aCgnL3NlYXJjaCcpO1xufVxuXG5mdW5jdGlvbiBnZXRTZWFyY2hSZXN1bHRzKCk6IEhUTUxFbGVtZW50W10ge1xuICBsZXQgcmVzdWx0cyA9IEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ3NlYXJjaC1zbmlwcGV0W3RhYmluZGV4PVwiMFwiXScpXG4gICk7XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ3NlYXJjaC1zbmlwcGV0JylcbiAgICApO1xuICB9XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICdkaXYuY29udmVyc2F0aW9uLWNvbnRhaW5lcltyb2xlPVwib3B0aW9uXCJdJ1xuICAgICAgKVxuICAgICk7XG4gIH1cbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmVzdWx0cyA9IEFycmF5LmZyb20oXG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ1tyb2xlPVwib3B0aW9uXCJdLmNvbnZlcnNhdGlvbi1jb250YWluZXInXG4gICAgICApXG4gICAgKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0U2VhcmNoUmVzdWx0KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRTZWFyY2hSZXN1bHRzKCk7XG4gIGlmIChpdGVtcy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICBzZWxlY3RlZFNlYXJjaEluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaW5kZXgsIGl0ZW1zLmxlbmd0aCAtIDEpKTtcblxuICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lID0gJyc7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7XG4gIH0pO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkU2VhcmNoSW5kZXhdO1xuICBpZiAoc2VsZWN0ZWRJdGVtKSB7XG4gICAgc2VsZWN0ZWRJdGVtLnN0eWxlLm91dGxpbmUgPSAnMnB4IHNvbGlkICMxYTczZTgnO1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJy0ycHgnO1xuICAgIHNlbGVjdGVkSXRlbS5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVTZWFyY2hSZXN1bHRVcCgpOiB2b2lkIHtcbiAgaGlnaGxpZ2h0U2VhcmNoUmVzdWx0KHNlbGVjdGVkU2VhcmNoSW5kZXggLSAxKTtcbiAgY29uc3Qgc2VhcmNoSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICApO1xuICBpZiAoc2VhcmNoSW5wdXQpIHNlYXJjaElucHV0LmZvY3VzKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlU2VhcmNoUmVzdWx0RG93bigpOiB2b2lkIHtcbiAgaGlnaGxpZ2h0U2VhcmNoUmVzdWx0KHNlbGVjdGVkU2VhcmNoSW5kZXggKyAxKTtcbiAgY29uc3Qgc2VhcmNoSW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICApO1xuICBpZiAoc2VhcmNoSW5wdXQpIHNlYXJjaElucHV0LmZvY3VzKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQoKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwIHx8ICFpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XSkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkU2VhcmNoSW5kZXhdO1xuXG4gIGNvbnN0IGNsaWNrYWJsZURpdiA9IHNlbGVjdGVkSXRlbS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignZGl2W2pzbG9nXScpO1xuICBpZiAoY2xpY2thYmxlRGl2KSB7XG4gICAgY2xpY2thYmxlRGl2LmNsaWNrKCk7XG4gICAgWydtb3VzZWRvd24nLCAnbW91c2V1cCcsICdjbGljayddLmZvckVhY2goKGV2ZW50VHlwZSkgPT4ge1xuICAgICAgY2xpY2thYmxlRGl2LmRpc3BhdGNoRXZlbnQoXG4gICAgICAgIG5ldyBNb3VzZUV2ZW50KGV2ZW50VHlwZSwgeyB2aWV3OiB3aW5kb3csIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBzZWxlY3RlZEl0ZW0uY2xpY2soKTtcbiAgICB9LCAxMDApO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGxpbmsgPSBzZWxlY3RlZEl0ZW0ucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbaHJlZl0nKTtcbiAgaWYgKGxpbmspIHtcbiAgICBsaW5rLmNsaWNrKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc2VsZWN0ZWRJdGVtLmNsaWNrKCk7XG4gIFsnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnY2xpY2snXS5mb3JFYWNoKChldmVudFR5cGUpID0+IHtcbiAgICBzZWxlY3RlZEl0ZW0uZGlzcGF0Y2hFdmVudChcbiAgICAgIG5ldyBNb3VzZUV2ZW50KGV2ZW50VHlwZSwgeyB2aWV3OiB3aW5kb3csIGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUgfSlcbiAgICApO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVTZWFyY2hQYWdlKCk6IHZvaWQge1xuICBpZiAoIWlzU2VhcmNoUGFnZSgpKSByZXR1cm47XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAxMDtcblxuICBjb25zdCBoaWdobGlnaHRJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHNlYXJjaFJlc3VsdHMgPSBnZXRTZWFyY2hSZXN1bHRzKCk7XG5cbiAgICBpZiAoc2VhcmNoUmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICBzZWxlY3RlZFNlYXJjaEluZGV4ID0gMDtcbiAgICAgIGhpZ2hsaWdodFNlYXJjaFJlc3VsdCgwKTtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaGlnaGxpZ2h0SW50ZXJ2YWwpO1xuICAgIH0gZWxzZSBpZiAoYXR0ZW1wdHMgPj0gbWF4QXR0ZW1wdHMpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaGlnaGxpZ2h0SW50ZXJ2YWwpO1xuICAgIH1cbiAgfSwgNTAwKTtcbn1cblxuZnVuY3Rpb24gbmF2aWdhdGVUb1NlYXJjaFBhZ2UoKTogdm9pZCB7XG4gIGNvbnN0IHNlYXJjaFVybCA9ICcvc2VhcmNoP2hsPWphJztcbiAgaGlzdG9yeS5wdXNoU3RhdGUobnVsbCwgJycsIHNlYXJjaFVybCk7XG4gIHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBQb3BTdGF0ZUV2ZW50KCdwb3BzdGF0ZScsIHsgc3RhdGU6IG51bGwgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlU2VhcmNoUGFnZSgpOiB2b2lkIHtcbiAgaWYgKGlzU2VhcmNoUGFnZSgpKSB7XG4gICAgaGlzdG9yeS5iYWNrKCk7XG4gIH0gZWxzZSB7XG4gICAgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gICAgbmF2aWdhdGVUb1NlYXJjaFBhZ2UoKTtcbiAgfVxufVxuIiwiLy8gQ2hhdCBleHBvcnQgZnVuY3Rpb25hbGl0eSAtIHNhdmVzIGN1cnJlbnQgY29udmVyc2F0aW9uIGFzIFpldHRlbGthc3RlbiBNYXJrZG93blxuXG5jb25zdCBFWFBPUlRfQlVUVE9OX0lEID0gJ2dlbWluaS1leHBvcnQtbm90ZS1idXR0b24nO1xubGV0IGV4cG9ydERpckhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSB8IG51bGwgPSBudWxsO1xuXG4vLyAtLS0gSW5kZXhlZERCIGhlbHBlcnMgLS0tXG5cbmZ1bmN0aW9uIG9wZW5FeHBvcnREQigpOiBQcm9taXNlPElEQkRhdGFiYXNlPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgcmVxID0gaW5kZXhlZERCLm9wZW4oJ2dlbWluaS1leHBvcnQnLCAxKTtcbiAgICByZXEub251cGdyYWRlbmVlZGVkID0gKGUpID0+IHtcbiAgICAgIChlLnRhcmdldCBhcyBJREJPcGVuREJSZXF1ZXN0KS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoJ2hhbmRsZXMnKTtcbiAgICB9O1xuICAgIHJlcS5vbnN1Y2Nlc3MgPSAoZSkgPT4gcmVzb2x2ZSgoZS50YXJnZXQgYXMgSURCT3BlbkRCUmVxdWVzdCkucmVzdWx0KTtcbiAgICByZXEub25lcnJvciA9ICgpID0+IHJlamVjdChyZXEuZXJyb3IpO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U3RvcmVkRGlySGFuZGxlKCk6IFByb21pc2U8RmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSB8IG51bGw+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBkYiA9IGF3YWl0IG9wZW5FeHBvcnREQigpO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaGFuZGxlcycsICdyZWFkb25seScpO1xuICAgICAgY29uc3QgcmVxID0gdHgub2JqZWN0U3RvcmUoJ2hhbmRsZXMnKS5nZXQoJ3NhdmVfZGlyJyk7XG4gICAgICByZXEub25zdWNjZXNzID0gKCkgPT4gcmVzb2x2ZSgocmVxLnJlc3VsdCBhcyBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKSB8fCBudWxsKTtcbiAgICAgIHJlcS5vbmVycm9yID0gKCkgPT4gcmVzb2x2ZShudWxsKTtcbiAgICB9KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RvcmVEaXJIYW5kbGUoaGFuZGxlOiBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGIgPSBhd2FpdCBvcGVuRXhwb3J0REIoKTtcbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKCdoYW5kbGVzJywgJ3JlYWR3cml0ZScpO1xuICAgICAgdHgub2JqZWN0U3RvcmUoJ2hhbmRsZXMnKS5wdXQoaGFuZGxlLCAnc2F2ZV9kaXInKTtcbiAgICAgIHR4Lm9uY29tcGxldGUgPSAoKSA9PiByZXNvbHZlKCk7XG4gICAgICB0eC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KHR4LmVycm9yKTtcbiAgICB9KTtcbiAgfSBjYXRjaCB7XG4gICAgLy8gSWdub3JlIHN0b3JhZ2UgZXJyb3JzXG4gIH1cbn1cblxuLy8gLS0tIERpcmVjdG9yeSBoYW5kbGUgbWFuYWdlbWVudCAtLS1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RXhwb3J0RGlySGFuZGxlKCk6IFByb21pc2U8RmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZT4ge1xuICBpZiAoZXhwb3J0RGlySGFuZGxlKSB7XG4gICAgY29uc3QgcGVybSA9IGF3YWl0IGV4cG9ydERpckhhbmRsZS5xdWVyeVBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAocGVybSA9PT0gJ2dyYW50ZWQnKSByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICB9XG5cbiAgY29uc3Qgc3RvcmVkID0gYXdhaXQgZ2V0U3RvcmVkRGlySGFuZGxlKCk7XG4gIGlmIChzdG9yZWQpIHtcbiAgICBjb25zdCBwZXJtID0gYXdhaXQgc3RvcmVkLnF1ZXJ5UGVybWlzc2lvbih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICAgIGlmIChwZXJtID09PSAnZ3JhbnRlZCcpIHtcbiAgICAgIGV4cG9ydERpckhhbmRsZSA9IHN0b3JlZDtcbiAgICAgIHJldHVybiBleHBvcnREaXJIYW5kbGU7XG4gICAgfVxuICAgIGNvbnN0IG5ld1Blcm0gPSBhd2FpdCBzdG9yZWQucmVxdWVzdFBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAobmV3UGVybSA9PT0gJ2dyYW50ZWQnKSB7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBzdG9yZWQ7XG4gICAgICByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGhhbmRsZSA9IGF3YWl0IHdpbmRvdy5zaG93RGlyZWN0b3J5UGlja2VyKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gIGF3YWl0IHN0b3JlRGlySGFuZGxlKGhhbmRsZSk7XG4gIGV4cG9ydERpckhhbmRsZSA9IGhhbmRsZTtcbiAgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbn1cblxuLy8gLS0tIERPTSB0byBNYXJrZG93biBjb252ZXJzaW9uIC0tLVxuXG5mdW5jdGlvbiBkb21Ub01hcmtkb3duKGVsOiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIGNvbnN0IFNLSVBfVEFHUyA9IG5ldyBTZXQoWydidXR0b24nLCAnc3ZnJywgJ3BhdGgnLCAnbWF0LWljb24nXSk7XG5cbiAgZnVuY3Rpb24gbm9kZVRvTWQobm9kZTogTm9kZSk6IHN0cmluZyB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSByZXR1cm4gbm9kZS50ZXh0Q29udGVudCB8fCAnJztcbiAgICBpZiAobm9kZS5ub2RlVHlwZSAhPT0gTm9kZS5FTEVNRU5UX05PREUpIHJldHVybiAnJztcblxuICAgIGNvbnN0IGVsZW0gPSBub2RlIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IHRhZyA9IGVsZW0udGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKFNLSVBfVEFHUy5oYXModGFnKSkgcmV0dXJuICcnO1xuXG4gICAgY29uc3QgaW5uZXIgPSAoKSA9PiBBcnJheS5mcm9tKGVsZW0uY2hpbGROb2RlcykubWFwKG5vZGVUb01kKS5qb2luKCcnKTtcblxuICAgIGNvbnN0IGhtID0gdGFnLm1hdGNoKC9eaChbMS02XSkkLyk7XG4gICAgaWYgKGhtKSB7XG4gICAgICBjb25zdCBoYXNoZXMgPSAnIycucmVwZWF0KE51bWJlcihobVsxXSkpO1xuICAgICAgY29uc3QgdGV4dCA9IGlubmVyKCkudHJpbSgpO1xuICAgICAgcmV0dXJuIGBcXG4ke2hhc2hlc30gJHt0ZXh0fVxcblxcbmA7XG4gICAgfVxuXG4gICAgc3dpdGNoICh0YWcpIHtcbiAgICAgIGNhc2UgJ3AnOlxuICAgICAgICByZXR1cm4gaW5uZXIoKSArICdcXG5cXG4nO1xuICAgICAgY2FzZSAnYnInOlxuICAgICAgICByZXR1cm4gJ1xcbic7XG4gICAgICBjYXNlICdocic6XG4gICAgICAgIHJldHVybiAnXFxuLS0tXFxuXFxuJztcbiAgICAgIGNhc2UgJ3VsJzpcbiAgICAgIGNhc2UgJ29sJzpcbiAgICAgICAgcmV0dXJuIGlubmVyKCkgKyAnXFxuJztcbiAgICAgIGNhc2UgJ2xpJzoge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gaW5uZXIoKS5yZXBsYWNlKC9cXG4rJC8sICcnKTtcbiAgICAgICAgcmV0dXJuIGAtICR7Y29udGVudH1cXG5gO1xuICAgICAgfVxuICAgICAgY2FzZSAnYic6XG4gICAgICBjYXNlICdzdHJvbmcnOlxuICAgICAgICByZXR1cm4gYCoqJHtpbm5lcigpfSoqYDtcbiAgICAgIGNhc2UgJ2knOlxuICAgICAgY2FzZSAnZW0nOlxuICAgICAgICByZXR1cm4gYCoke2lubmVyKCl9KmA7XG4gICAgICBjYXNlICdjb2RlJzpcbiAgICAgICAgcmV0dXJuIGBcXGAke2lubmVyKCl9XFxgYDtcbiAgICAgIGNhc2UgJ3ByZSc6XG4gICAgICAgIHJldHVybiBgXFxgXFxgXFxgXFxuJHtpbm5lcigpfVxcblxcYFxcYFxcYFxcblxcbmA7XG4gICAgICBjYXNlICd0YWJsZSc6XG4gICAgICAgIHJldHVybiB0YWJsZVRvTWQoZWxlbSkgKyAnXFxuXFxuJztcbiAgICAgIGNhc2UgJ3RoZWFkJzpcbiAgICAgIGNhc2UgJ3Rib2R5JzpcbiAgICAgIGNhc2UgJ3RyJzpcbiAgICAgIGNhc2UgJ3RkJzpcbiAgICAgIGNhc2UgJ3RoJzpcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIGlubmVyKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdGFibGVUb01kKHRhYmxlOiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gICAgY29uc3Qgcm93cyA9IEFycmF5LmZyb20odGFibGUucXVlcnlTZWxlY3RvckFsbCgndHInKSk7XG4gICAgaWYgKHJvd3MubGVuZ3RoID09PSAwKSByZXR1cm4gJyc7XG5cbiAgICBjb25zdCBnZXRDZWxscyA9IChyb3c6IEVsZW1lbnQpID0+XG4gICAgICBBcnJheS5mcm9tKHJvdy5xdWVyeVNlbGVjdG9yQWxsKCd0ZCwgdGgnKSkubWFwKChjZWxsKSA9PlxuICAgICAgICBBcnJheS5mcm9tKGNlbGwuY2hpbGROb2RlcylcbiAgICAgICAgICAubWFwKG5vZGVUb01kKVxuICAgICAgICAgIC5qb2luKCcnKVxuICAgICAgICAgIC5yZXBsYWNlKC9cXG4rL2csICcgJylcbiAgICAgICAgICAudHJpbSgpXG4gICAgICApO1xuXG4gICAgY29uc3QgW2hlYWRlclJvdywgLi4uYm9keVJvd3NdID0gcm93cztcbiAgICBjb25zdCBoZWFkZXJzID0gZ2V0Q2VsbHMoaGVhZGVyUm93KTtcbiAgICBjb25zdCBzZXBhcmF0b3IgPSBoZWFkZXJzLm1hcCgoKSA9PiAnLS0tJyk7XG5cbiAgICByZXR1cm4gW1xuICAgICAgYHwgJHtoZWFkZXJzLmpvaW4oJyB8ICcpfSB8YCxcbiAgICAgIGB8ICR7c2VwYXJhdG9yLmpvaW4oJyB8ICcpfSB8YCxcbiAgICAgIC4uLmJvZHlSb3dzLm1hcCgocikgPT4gYHwgJHtnZXRDZWxscyhyKS5qb2luKCcgfCAnKX0gfGApLFxuICAgIF0uam9pbignXFxuJyk7XG4gIH1cblxuICByZXR1cm4gQXJyYXkuZnJvbShlbC5jaGlsZE5vZGVzKVxuICAgIC5tYXAobm9kZVRvTWQpXG4gICAgLmpvaW4oJycpXG4gICAgLnJlcGxhY2UoL1xcbnszLH0vZywgJ1xcblxcbicpXG4gICAgLnRyaW0oKTtcbn1cblxuLy8gLS0tIFRleHQgY2xlYW51cCAtLS1cblxuY29uc3QgQVJUSUZBQ1RfUEFUVEVSTlMgPSBbXG4gIC9eWyvvvItdJC8sXG4gIC9eR29vZ2xlIOOCueODl+ODrOODg+ODieOCt+ODvOODiOOBq+OCqOOCr+OCueODneODvOODiCQvLFxuICAvXkdvb2dsZSBTaGVldHMg44Gr44Ko44Kv44K544Od44O844OIJC8sXG4gIC9eRXhwb3J0IHRvIFNoZWV0cyQvLFxuXTtcblxuZnVuY3Rpb24gY2xlYW5Nb2RlbFRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHRleHRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLmZpbHRlcigobGluZSkgPT4gIUFSVElGQUNUX1BBVFRFUk5TLnNvbWUoKHApID0+IHAudGVzdChsaW5lLnRyaW0oKSkpKVxuICAgIC5qb2luKCdcXG4nKVxuICAgIC5yZXBsYWNlKC9cXG57Myx9L2csICdcXG5cXG4nKVxuICAgIC50cmltKCk7XG59XG5cbi8vIC0tLSBTY3JvbGwgdG8gbG9hZCBhbGwgbWVzc2FnZXMgLS0tXG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRBbGxNZXNzYWdlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc2Nyb2xsZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5J1xuICApO1xuICBpZiAoIXNjcm9sbGVyKSByZXR1cm47XG5cbiAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbign44Oh44OD44K744O844K444KS6Kqt44G/6L6844G/5LitLi4uJyk7XG5cbiAgbGV0IHByZXZDb3VudCA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMzA7IGkrKykge1xuICAgIHNjcm9sbGVyLnNjcm9sbFRvcCA9IDA7XG4gICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgNDAwKSk7XG4gICAgY29uc3QgY291bnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd1c2VyLXF1ZXJ5JykubGVuZ3RoO1xuICAgIGlmIChjb3VudCA9PT0gcHJldkNvdW50KSBicmVhaztcbiAgICBwcmV2Q291bnQgPSBjb3VudDtcbiAgfVxuXG4gIHNjcm9sbGVyLnNjcm9sbFRvcCA9IHNjcm9sbGVyLnNjcm9sbEhlaWdodDtcbn1cblxuLy8gLS0tIENoYXQgY29udGVudCBleHRyYWN0aW9uIC0tLVxuXG5pbnRlcmZhY2UgQ2hhdCB7XG4gIHVzZXI6IHN0cmluZztcbiAgbW9kZWw6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gZXh0cmFjdENoYXRDb250ZW50KCk6IENoYXRbXSB7XG4gIGNvbnN0IHVzZXJRdWVyaWVzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCd1c2VyLXF1ZXJ5JykpO1xuICBjb25zdCBtb2RlbFJlc3BvbnNlcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnbW9kZWwtcmVzcG9uc2UnKSk7XG5cbiAgY29uc3QgY2hhdHM6IENoYXRbXSA9IFtdO1xuICBjb25zdCBsZW4gPSBNYXRoLm1pbih1c2VyUXVlcmllcy5sZW5ndGgsIG1vZGVsUmVzcG9uc2VzLmxlbmd0aCk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGNvbnN0IHVzZXJUZXh0ID0gQXJyYXkuZnJvbShcbiAgICAgIHVzZXJRdWVyaWVzW2ldLnF1ZXJ5U2VsZWN0b3JBbGwoJy5xdWVyeS10ZXh0LWxpbmUnKVxuICAgIClcbiAgICAgIC5tYXAoKGVsKSA9PiAoZWwgYXMgSFRNTEVsZW1lbnQpLmlubmVyVGV4dC50cmltKCkpXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbignXFxuJyk7XG5cbiAgICBjb25zdCBtYXJrZG93bkVsID0gbW9kZWxSZXNwb25zZXNbaV0ucXVlcnlTZWxlY3RvcihcbiAgICAgICdtZXNzYWdlLWNvbnRlbnQgLm1hcmtkb3duJ1xuICAgICkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IHJhd01vZGVsVGV4dCA9IG1hcmtkb3duRWxcbiAgICAgID8gZG9tVG9NYXJrZG93bihtYXJrZG93bkVsKS50cmltKClcbiAgICAgIDogdW5kZWZpbmVkO1xuICAgIGNvbnN0IG1vZGVsVGV4dCA9IHJhd01vZGVsVGV4dCA/IGNsZWFuTW9kZWxUZXh0KHJhd01vZGVsVGV4dCkgOiAnJztcblxuICAgIGlmICh1c2VyVGV4dCB8fCBtb2RlbFRleHQpIHtcbiAgICAgIGNoYXRzLnB1c2goeyB1c2VyOiB1c2VyVGV4dCB8fCAnJywgbW9kZWw6IG1vZGVsVGV4dCB8fCAnJyB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gY2hhdHM7XG59XG5cbmZ1bmN0aW9uIGdldENoYXRJZCgpOiBzdHJpbmcge1xuICByZXR1cm4gbG9jYXRpb24ucGF0aG5hbWUuc3BsaXQoJy8nKS5wb3AoKSB8fCAndW5rbm93bic7XG59XG5cbi8vIC0tLSBZQU1MIGdlbmVyYXRpb24gKFpldHRlbGthc3RlbiBmb3JtYXQpIC0tLVxuXG5mdW5jdGlvbiB5YW1sUXVvdGUoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuICdcIicgKyBzLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpICsgJ1wiJztcbn1cblxuZnVuY3Rpb24geWFtbEJsb2NrKHRleHQ6IHN0cmluZywgaW5kZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdGV4dFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsaW5lKSA9PiAobGluZSA9PT0gJycgPyAnJyA6IGluZGVudCArIGxpbmUpKVxuICAgIC5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVNYXJrZG93bihjaGF0czogQ2hhdFtdKToge1xuICBtYXJrZG93bjogc3RyaW5nO1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xufSB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IHBhZCA9IChuOiBudW1iZXIpID0+IFN0cmluZyhuKS5wYWRTdGFydCgyLCAnMCcpO1xuICBjb25zdCBkYXRlU3RyID0gYCR7bm93LmdldEZ1bGxZZWFyKCl9LSR7cGFkKG5vdy5nZXRNb250aCgpICsgMSl9LSR7cGFkKG5vdy5nZXREYXRlKCkpfWA7XG4gIGNvbnN0IHRpbWVTdHIgPSBgJHtkYXRlU3RyfVQke3BhZChub3cuZ2V0SG91cnMoKSl9OiR7cGFkKG5vdy5nZXRNaW51dGVzKCkpfToke3BhZChub3cuZ2V0U2Vjb25kcygpKX1gO1xuICBjb25zdCBpZCA9IHRpbWVTdHIucmVwbGFjZSgvWy06VF0vZywgJycpO1xuXG4gIGNvbnN0IGNvbnZlcnNhdGlvblRpdGxlID0gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnW2RhdGEtdGVzdC1pZD1cImNvbnZlcnNhdGlvbi10aXRsZVwiXSdcbiAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbFxuICApPy5pbm5lclRleHQ/LnRyaW0oKTtcbiAgY29uc3QgZmlyc3RVc2VyTGluZXMgPSAoY2hhdHNbMF0/LnVzZXIgfHwgJycpXG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAoKGwpID0+IGwudHJpbSgpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IGZhbGxiYWNrVGl0bGUgPVxuICAgIGZpcnN0VXNlckxpbmVzLmZpbmQoKGwpID0+ICEvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGwpKSB8fFxuICAgIGZpcnN0VXNlckxpbmVzWzBdIHx8XG4gICAgJ0dlbWluaSBjaGF0JztcbiAgY29uc3QgdGl0bGUgPSAoY29udmVyc2F0aW9uVGl0bGUgfHwgZmFsbGJhY2tUaXRsZSkuc2xpY2UoMCwgNjApO1xuXG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXG4gICAgYGlkOiAke3lhbWxRdW90ZShjaGF0SWQpfWAsXG4gICAgYHRpdGxlOiAke3lhbWxRdW90ZSgnR2VtaW5pOiAnICsgdGl0bGUpfWAsXG4gICAgYGRhdGU6ICR7eWFtbFF1b3RlKHRpbWVTdHIpfWAsXG4gICAgYHNvdXJjZTogJHt5YW1sUXVvdGUobG9jYXRpb24uaHJlZil9YCxcbiAgICAndGFnczonLFxuICAgICcgIC0gZ2VtaW5pJyxcbiAgICAnICAtIGZsZWV0aW5nJyxcbiAgICAnY2hhdHM6JyxcbiAgXTtcblxuICBmb3IgKGNvbnN0IHR1cm4gb2YgY2hhdHMpIHtcbiAgICBsaW5lcy5wdXNoKCcgIC0gcTogfCcpO1xuICAgIGxpbmVzLnB1c2goeWFtbEJsb2NrKHR1cm4udXNlciwgJyAgICAgICcpKTtcbiAgICBsaW5lcy5wdXNoKCcgICAgYTogfCcpO1xuICAgIGxpbmVzLnB1c2goeWFtbEJsb2NrKHR1cm4ubW9kZWwsICcgICAgICAnKSk7XG4gIH1cblxuXG4gIHJldHVybiB7IG1hcmtkb3duOiBsaW5lcy5qb2luKCdcXG4nKSwgaWQsIHRpdGxlIH07XG59XG5cbi8vIC0tLSBGaWxlIHNhdmUgLS0tXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzYXZlTm90ZShmb3JjZVBpY2tEaXIgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuICBhd2FpdCBsb2FkQWxsTWVzc2FnZXMoKTtcblxuICBjb25zdCBjaGF0cyA9IGV4dHJhY3RDaGF0Q29udGVudCgpO1xuICBpZiAoY2hhdHMubGVuZ3RoID09PSAwKSB7XG4gICAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbign5L+d5a2Y44Gn44GN44KL5Lya6Kmx44GM6KaL44Gk44GL44KK44G+44Gb44KTJywgJ2Vycm9yJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IGRpckhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZTtcbiAgdHJ5IHtcbiAgICBpZiAoZm9yY2VQaWNrRGlyKSB7XG4gICAgICBjb25zdCBoYW5kbGUgPSBhd2FpdCB3aW5kb3cuc2hvd0RpcmVjdG9yeVBpY2tlcih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICAgICAgYXdhaXQgc3RvcmVEaXJIYW5kbGUoaGFuZGxlKTtcbiAgICAgIGV4cG9ydERpckhhbmRsZSA9IGhhbmRsZTtcbiAgICAgIGRpckhhbmRsZSA9IGhhbmRsZTtcbiAgICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oYOS/neWtmOWFiOOCkuWkieabtDogJHtoYW5kbGUubmFtZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlySGFuZGxlID0gYXdhaXQgZ2V0RXhwb3J0RGlySGFuZGxlKCk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB7IG1hcmtkb3duLCB0aXRsZSB9ID0gZ2VuZXJhdGVNYXJrZG93bihjaGF0cyk7XG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBjb25zdCBzYWZlVGl0bGUgPSB0aXRsZVxuICAgIC5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fF0vZywgJycpXG4gICAgLnJlcGxhY2UoL1xccysvZywgJy0nKVxuICAgIC5zbGljZSgwLCA0MCk7XG4gIGNvbnN0IGZpbGVuYW1lID0gYGdlbWluaS0ke3NhZmVUaXRsZX0tJHtjaGF0SWR9LnlhbWxgO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgaW5ib3hIYW5kbGUgPSBhd2FpdCBkaXJIYW5kbGUuZ2V0RGlyZWN0b3J5SGFuZGxlKCdpbmJveCcsIHtcbiAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBjb25zdCBmaWxlSGFuZGxlID0gYXdhaXQgaW5ib3hIYW5kbGUuZ2V0RmlsZUhhbmRsZShmaWxlbmFtZSwge1xuICAgICAgY3JlYXRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGNvbnN0IHdyaXRhYmxlID0gYXdhaXQgZmlsZUhhbmRsZS5jcmVhdGVXcml0YWJsZSgpO1xuICAgIGF3YWl0IHdyaXRhYmxlLndyaXRlKG1hcmtkb3duKTtcbiAgICBhd2FpdCB3cml0YWJsZS5jbG9zZSgpO1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oYOS/neWtmOOBl+OBvuOBl+OBnzogaW5ib3gvJHtmaWxlbmFtZX1gKTtcbiAgfSBjYXRjaCB7XG4gICAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbign5L+d5a2Y44Gr5aSx5pWX44GX44G+44GX44GfJywgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLy8gLS0tIFVJIC0tLVxuXG5mdW5jdGlvbiBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKFxuICBtZXNzYWdlOiBzdHJpbmcsXG4gIHR5cGU6ICdzdWNjZXNzJyB8ICdlcnJvcicgPSAnc3VjY2Vzcydcbik6IHZvaWQge1xuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnZW1pbmktZXhwb3J0LW5vdGlmaWNhdGlvbicpO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGVsLmlkID0gJ2dlbWluaS1leHBvcnQtbm90aWZpY2F0aW9uJztcbiAgZWwuc3R5bGUuY3NzVGV4dCA9IGBcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgYm90dG9tOiAyNHB4O1xuICAgIHJpZ2h0OiAyNHB4O1xuICAgIGJhY2tncm91bmQ6ICR7dHlwZSA9PT0gJ2Vycm9yJyA/ICcjYzYyODI4JyA6ICcjMWI1ZTIwJ307XG4gICAgY29sb3I6IHdoaXRlO1xuICAgIHBhZGRpbmc6IDEycHggMjBweDtcbiAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgei1pbmRleDogMTAwMDA7XG4gICAgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgc2Fucy1zZXJpZjtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsMCwwLDAuMyk7XG4gIGA7XG4gIGVsLnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7XG4gIHNldFRpbWVvdXQoKCkgPT4gZWwucmVtb3ZlKCksIDMwMDApO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVFeHBvcnRCdXR0b24oKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChFWFBPUlRfQlVUVE9OX0lEKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGlucHV0QXJlYSA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQtYXJlYS12MicpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQtY29udGFpbmVyJyk7XG4gIGlmICghaW5wdXRBcmVhKSByZXR1cm47XG5cbiAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIGJ0bi5pZCA9IEVYUE9SVF9CVVRUT05fSUQ7XG4gIGJ0bi50aXRsZSA9XG4gICAgJ1NhdmUgYXMgWmV0dGVsa2FzdGVuIG5vdGVcXG5TaGlmdCvjgq/jg6rjg4Pjgq/jgafkv53lrZjlhYjjgpLlpInmm7QnO1xuICBidG4udGV4dENvbnRlbnQgPSAn8J+SviBTYXZlIG5vdGUnO1xuICBidG4uc3R5bGUuY3NzVGV4dCA9IGBcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgYm90dG9tOiAxMDBweDtcbiAgICByaWdodDogMjRweDtcbiAgICBiYWNrZ3JvdW5kOiAjMWE3M2U4O1xuICAgIGNvbG9yOiB3aGl0ZTtcbiAgICBib3JkZXI6IG5vbmU7XG4gICAgYm9yZGVyLXJhZGl1czogMjBweDtcbiAgICBwYWRkaW5nOiA4cHggMTZweDtcbiAgICBmb250LXNpemU6IDEzcHg7XG4gICAgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgc2Fucy1zZXJpZjtcbiAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgei1pbmRleDogOTk5OTtcbiAgICBib3gtc2hhZG93OiAwIDJweCA4cHggcmdiYSgwLDAsMCwwLjI1KTtcbiAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMnM7XG4gIGA7XG5cbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZW50ZXInLCAoKSA9PiB7XG4gICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzE1NTdiMCc7XG4gIH0pO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICcjMWE3M2U4JztcbiAgfSk7XG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiBzYXZlTm90ZShlLnNoaWZ0S2V5KSk7XG5cbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChidG4pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZUV4cG9ydCgpOiB2b2lkIHtcbiAgY29uc3QgY2hhdElkID0gZ2V0Q2hhdElkKCk7XG4gIGlmICghY2hhdElkIHx8IGNoYXRJZCA9PT0gJ2FwcCcpIHJldHVybjtcbiAgY3JlYXRlRXhwb3J0QnV0dG9uKCk7XG59XG4iLCJjb25zdCBTRUxFQ1RPUl9JRCA9ICdnZW1pbmktcXVpY2stcHJvbXB0LXNlbGVjdG9yJztcbmNvbnN0IFBMQUNFSE9MREVSID0gJy0tIOOCr+OCpOODg+OCryAtLSc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1FVSUNLX1BST01QVFMgPSBbXG4gICfjgZPjgZPjgb7jgafjga7lhoXlrrnjgpLjgb7jgajjgoHjgaYnLFxuICAn57aa44GN44KS5pWZ44GI44GmJyxcbiAgJ+OCguOBo+OBqOips+OBl+OBj+aVmeOBiOOBpicsXG4gICflhbfkvZPkvovjgpLmjJnjgZLjgaYnLFxuXTtcblxubGV0IHF1aWNrUHJvbXB0czogc3RyaW5nW10gPSBbLi4uREVGQVVMVF9RVUlDS19QUk9NUFRTXTtcblxuZnVuY3Rpb24gbG9hZFF1aWNrUHJvbXB0cygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsncXVpY2tQcm9tcHRzJ10sIChyZXN1bHQpID0+IHtcbiAgICAgIGlmIChyZXN1bHQucXVpY2tQcm9tcHRzICYmIHJlc3VsdC5xdWlja1Byb21wdHMubGVuZ3RoID4gMCkge1xuICAgICAgICBxdWlja1Byb21wdHMgPSByZXN1bHQucXVpY2tQcm9tcHRzO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShxdWlja1Byb21wdHMpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmluZFRleHRhcmVhKCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG4gIHJldHVybiAoXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKVxuICApO1xufVxuXG5mdW5jdGlvbiBmaW5kU2VuZEJ1dHRvbigpOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwge1xuICByZXR1cm4gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFxuICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIumAgeS/oVwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VuZFwiXSdcbiAgICApIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5zZW5kLWJ1dHRvbicpIHx8XG4gICAgQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uJykpLmZpbmQoXG4gICAgICAoYnRuKSA9PlxuICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCfpgIHkv6EnKSB8fFxuICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCdTZW5kJylcbiAgICApIHx8XG4gICAgbnVsbFxuICApO1xufVxuXG5mdW5jdGlvbiB3cml0ZUFuZFNlbmQodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID0gZmluZFRleHRhcmVhKCk7XG4gIGlmICghdGV4dGFyZWEpIHJldHVybjtcblxuICB3aGlsZSAodGV4dGFyZWEuZmlyc3RDaGlsZCkgdGV4dGFyZWEucmVtb3ZlQ2hpbGQodGV4dGFyZWEuZmlyc3RDaGlsZCk7XG5cbiAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgcC50ZXh0Q29udGVudCA9IHRleHQ7XG4gIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICB0ZXh0YXJlYS5mb2N1cygpO1xuXG4gIGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGNvbnN0IHNlbmRCdXR0b24gPSBmaW5kU2VuZEJ1dHRvbigpO1xuICAgIGlmIChzZW5kQnV0dG9uICYmICFzZW5kQnV0dG9uLmRpc2FibGVkKSBzZW5kQnV0dG9uLmNsaWNrKCk7XG4gIH0sIDIwMCk7XG59XG5cbmZ1bmN0aW9uIGluamVjdFNlbGVjdG9yKCk6IHZvaWQge1xuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNFTEVDVE9SX0lEKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHdyYXBwZXIuaWQgPSBTRUxFQ1RPUl9JRDtcbiAgd3JhcHBlci5jbGFzc05hbWUgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJztcblxuICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzZWxlY3QnKTtcbiAgc2VsZWN0LnRpdGxlID0gJ+OCr+OCpOODg+OCr+ODl+ODreODs+ODl+ODiCc7XG4gIHNlbGVjdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAn44Kv44Kk44OD44Kv44OX44Ot44Oz44OX44OIJyk7XG5cbiAgY29uc3QgcGxhY2Vob2xkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgcGxhY2Vob2xkZXIudmFsdWUgPSAnJztcbiAgcGxhY2Vob2xkZXIudGV4dENvbnRlbnQgPSBQTEFDRUhPTERFUjtcbiAgcGxhY2Vob2xkZXIuZGlzYWJsZWQgPSB0cnVlO1xuICBwbGFjZWhvbGRlci5zZWxlY3RlZCA9IHRydWU7XG4gIHNlbGVjdC5hcHBlbmRDaGlsZChwbGFjZWhvbGRlcik7XG5cbiAgcXVpY2tQcm9tcHRzLmZvckVhY2goKHByb21wdCkgPT4ge1xuICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgIG9wdGlvbi52YWx1ZSA9IHByb21wdDtcbiAgICBvcHRpb24udGV4dENvbnRlbnQgPSBwcm9tcHQubGVuZ3RoID4gMjAgPyBwcm9tcHQuc3Vic3RyaW5nKDAsIDE4KSArICfigKYnIDogcHJvbXB0O1xuICAgIG9wdGlvbi50aXRsZSA9IHByb21wdDtcbiAgICBzZWxlY3QuYXBwZW5kQ2hpbGQob3B0aW9uKTtcbiAgfSk7XG5cbiAgc2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICBjb25zdCB0ZXh0ID0gc2VsZWN0LnZhbHVlO1xuICAgIGlmICh0ZXh0KSB7XG4gICAgICB3cml0ZUFuZFNlbmQodGV4dCk7XG4gICAgICBzZWxlY3Quc2VsZWN0ZWRJbmRleCA9IDA7XG4gICAgfVxuICB9KTtcblxuICB3cmFwcGVyLmFwcGVuZENoaWxkKHNlbGVjdCk7XG5cbiAgY29uc3QgZGVlcERpdmVTZWxlY3RvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3InKTtcbiAgaWYgKGRlZXBEaXZlU2VsZWN0b3I/LnBhcmVudEVsZW1lbnQpIHtcbiAgICBkZWVwRGl2ZVNlbGVjdG9yLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGRlZXBEaXZlU2VsZWN0b3IubmV4dFNpYmxpbmcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IHRyYWlsaW5nID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy50cmFpbGluZy1hY3Rpb25zLXdyYXBwZXInKTtcbiAgaWYgKHRyYWlsaW5nKSB7XG4gICAgY29uc3QgbW9kZWxQaWNrZXIgPSB0cmFpbGluZy5xdWVyeVNlbGVjdG9yKCcubW9kZWwtcGlja2VyLWNvbnRhaW5lcicpO1xuICAgIGlmIChtb2RlbFBpY2tlcikge1xuICAgICAgdHJhaWxpbmcuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIG1vZGVsUGlja2VyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhaWxpbmcuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIHRyYWlsaW5nLmZpcnN0Q2hpbGQpO1xuICAgIH1cbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCB0ZXh0YXJlYSA9IGZpbmRUZXh0YXJlYSgpO1xuICBjb25zdCBpbnB1dEZpZWxkID0gdGV4dGFyZWE/LmNsb3Nlc3QoJy50ZXh0LWlucHV0LWZpZWxkJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICBpZiAoaW5wdXRGaWVsZCkge1xuICAgIGlucHV0RmllbGQuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvY3VzUXVpY2tQcm9tcHRTZWxlY3RvcigpOiB2b2lkIHtcbiAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNFTEVDVE9SX0lEKTtcbiAgY29uc3Qgc2VsZWN0ID0gd3JhcHBlcj8ucXVlcnlTZWxlY3Rvcignc2VsZWN0Jyk7XG4gIGlmIChzZWxlY3QpIHtcbiAgICBzZWxlY3QuZm9jdXMoKTtcbiAgICBzZWxlY3Quc2hvd1BpY2tlcj8uKCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUXVpY2tQcm9tcHRGb2N1c2VkKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gZG9jdW1lbnQuYWN0aXZlRWxlbWVudD8uY2xvc2VzdChgIyR7U0VMRUNUT1JfSUR9YCkgIT09IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplUXVpY2tQcm9tcHRzKCk6IHZvaWQge1xuICBsb2FkUXVpY2tQcm9tcHRzKCkudGhlbigoKSA9PiB7XG4gICAgbGV0IGF0dGVtcHRzID0gMDtcbiAgICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGF0dGVtcHRzKys7XG4gICAgICBpZiAoZmluZFRleHRhcmVhKCkpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gaW5qZWN0U2VsZWN0b3IoKSwgNTAwKTtcbiAgICAgIH0gZWxzZSBpZiAoYXR0ZW1wdHMgPj0gMTUpIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICB9XG4gICAgfSwgNTAwKTtcbiAgfSk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBuYW1lc3BhY2UpID0+IHtcbiAgICBpZiAobmFtZXNwYWNlID09PSAnc3luYycgJiYgY2hhbmdlcy5xdWlja1Byb21wdHMpIHtcbiAgICAgIHF1aWNrUHJvbXB0cyA9IGNoYW5nZXMucXVpY2tQcm9tcHRzLm5ld1ZhbHVlIHx8IFsuLi5ERUZBVUxUX1FVSUNLX1BST01QVFNdO1xuICAgICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFNFTEVDVE9SX0lEKSkgaW5qZWN0U2VsZWN0b3IoKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiLy8gS2V5Ym9hcmQgZXZlbnQgaGFuZGxlcnNcblxuaW1wb3J0IHsgaXNTaG9ydGN1dCwgbG9hZFNob3J0Y3V0cywgZ2V0U2hvcnRjdXRzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XG5pbXBvcnQgeyBpc0F1dG9jb21wbGV0ZVZpc2libGUgfSBmcm9tICcuL2F1dG9jb21wbGV0ZSc7XG5pbXBvcnQge1xuICBzY3JvbGxDaGF0QXJlYSxcbiAgZm9jdXNUZXh0YXJlYSxcbiAgdG9nZ2xlU2lkZWJhcixcbiAgZ2V0QWxsQWN0aW9uQnV0dG9ucyxcbiAgZm9jdXNBY3Rpb25CdXR0b24sXG4gIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyxcbn0gZnJvbSAnLi9jaGF0JztcbmltcG9ydCB7XG4gIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUsXG4gIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgbW92ZUhpc3RvcnlVcCxcbiAgbW92ZUhpc3RvcnlEb3duLFxuICBvcGVuU2VsZWN0ZWRIaXN0b3J5LFxufSBmcm9tICcuL2hpc3RvcnknO1xuaW1wb3J0IHtcbiAgaXNTZWFyY2hQYWdlLFxuICBtb3ZlU2VhcmNoUmVzdWx0VXAsXG4gIG1vdmVTZWFyY2hSZXN1bHREb3duLFxuICBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQsXG59IGZyb20gJy4vc2VhcmNoJztcbmltcG9ydCB7IHNhdmVOb3RlIH0gZnJvbSAnLi9leHBvcnQnO1xuaW1wb3J0IHsgZm9jdXNRdWlja1Byb21wdFNlbGVjdG9yLCBpc1F1aWNrUHJvbXB0Rm9jdXNlZCB9IGZyb20gJy4vcXVpY2stcHJvbXB0cyc7XG5cbmxldCBsYXN0Rm9jdXNlZEFjdGlvbkJ1dHRvbkluZGV4ID0gLTE7XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgbGFzdEZvY3VzZWRBY3Rpb25CdXR0b25JbmRleCA9IGluZGV4O1xufVxuXG5mdW5jdGlvbiBoYW5kbGVTZWFyY2hQYWdlS2V5ZG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuICBpZiAoaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHtcbiAgICBpZiAoXG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd1VwJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRW50ZXInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdUYWInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFc2NhcGUnXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2gubW92ZVVwJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgIG1vdmVTZWFyY2hSZXN1bHRVcCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2gubW92ZURvd24nKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgbW92ZVNlYXJjaFJlc3VsdERvd24oKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLm9wZW5SZXN1bHQnKSkge1xuICAgIGlmIChldmVudC5pc0NvbXBvc2luZykgcmV0dXJuIGZhbHNlO1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgb3BlblNlbGVjdGVkU2VhcmNoUmVzdWx0KCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5zY3JvbGxVcCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IC13aW5kb3cuaW5uZXJIZWlnaHQgKiAwLjgsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5zY3JvbGxEb3duJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHdpbmRvdy5zY3JvbGxCeSh7IHRvcDogd2luZG93LmlubmVySGVpZ2h0ICogMC44LCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3Qgc2hvcnRjdXRzID0gZ2V0U2hvcnRjdXRzKCk7XG4gIGNvbnN0IGNoYXRLZXlzID0gT2JqZWN0LnZhbHVlcyhzaG9ydGN1dHMuY2hhdCk7XG4gIGlmIChjaGF0S2V5cy5pbmNsdWRlcyhldmVudC5jb2RlKSkgcmV0dXJuIHRydWU7XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVDaGF0UGFnZUtleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcbiAgY29uc3QgaXNJbklucHV0ID0gKGV2ZW50LnRhcmdldCBhcyBFbGVtZW50KS5tYXRjaGVzKFxuICAgICdpbnB1dCwgdGV4dGFyZWEsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJ1xuICApO1xuXG4gIGlmIChpc0F1dG9jb21wbGV0ZVZpc2libGUoKSkge1xuICAgIGlmIChcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0Fycm93VXAnIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd0Rvd24nIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFbnRlcicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ1RhYicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0VzY2FwZSdcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBpZiAoZXZlbnQuY29kZSA9PT0gJ0hvbWUnICYmICFldmVudC5tZXRhS2V5ICYmICFldmVudC5jdHJsS2V5ICYmICFpc0luSW5wdXQpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHNhdmVOb3RlKGV2ZW50LnNoaWZ0S2V5KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChldmVudC5jdHJsS2V5ICYmIGV2ZW50LnNoaWZ0S2V5ICYmIGV2ZW50LmNvZGUgPT09ICdLZXlEJykge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgd2luZG93LmRvbUFuYWx5emVyPy5jb3B5VG9DbGlwYm9hcmQoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5mb2N1c1F1aWNrUHJvbXB0JykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmIChpc1F1aWNrUHJvbXB0Rm9jdXNlZCgpKSB7XG4gICAgICBmb2N1c1RleHRhcmVhKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvY3VzUXVpY2tQcm9tcHRTZWxlY3RvcigpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC50b2dnbGVTaWRlYmFyJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHRvZ2dsZVNpZGViYXIoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC50b2dnbGVIaXN0b3J5TW9kZScpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gICAgY29uc3QgaGFzUmVzcG9uc2VzID0gYWN0aW9uQnV0dG9ucy5sZW5ndGggPiAwO1xuXG4gICAgaWYgKGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKSkge1xuICAgICAgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gICAgICBmb2N1c1RleHRhcmVhKCk7XG4gICAgfSBlbHNlIGlmIChpc0luSW5wdXQpIHtcbiAgICAgIGlmIChoYXNSZXNwb25zZXMpIHtcbiAgICAgICAgbGV0IHRhcmdldEluZGV4ID0gbGFzdEZvY3VzZWRBY3Rpb25CdXR0b25JbmRleDtcbiAgICAgICAgaWYgKHRhcmdldEluZGV4IDwgMCB8fCB0YXJnZXRJbmRleCA+PSBhY3Rpb25CdXR0b25zLmxlbmd0aCkge1xuICAgICAgICAgIHRhcmdldEluZGV4ID0gYWN0aW9uQnV0dG9ucy5sZW5ndGggLSAxO1xuICAgICAgICB9XG4gICAgICAgIGFjdGlvbkJ1dHRvbnNbdGFyZ2V0SW5kZXhdLmZvY3VzKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbnRlckhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBjb25zdCBpc0FjdGlvbkJ1dHRvbiA9XG4gICAgICAgIGZvY3VzZWRFbGVtZW50ICYmXG4gICAgICAgIChmb2N1c2VkRWxlbWVudC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdkZWVwLWRpdmUtYnV0dG9uLWlubGluZScpIHx8XG4gICAgICAgICAgZm9jdXNlZEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicpID09PSAnZGVlcC1kaXZlJyk7XG4gICAgICBpZiAoaXNBY3Rpb25CdXR0b24pIHtcbiAgICAgICAgY29uc3QgY3VycmVudEluZGV4ID0gYWN0aW9uQnV0dG9ucy5maW5kSW5kZXgoXG4gICAgICAgICAgKGJ0bikgPT4gYnRuID09PSBmb2N1c2VkRWxlbWVudFxuICAgICAgICApO1xuICAgICAgICBpZiAoY3VycmVudEluZGV4ICE9PSAtMSkgbGFzdEZvY3VzZWRBY3Rpb25CdXR0b25JbmRleCA9IGN1cnJlbnRJbmRleDtcbiAgICAgICAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9jdXNUZXh0YXJlYSgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkgJiYgaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeUV4aXQnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuc2Nyb2xsVXAnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgc2Nyb2xsQ2hhdEFyZWEoJ3VwJyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuc2Nyb2xsRG93bicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBzY3JvbGxDaGF0QXJlYSgnZG93bicpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKSkge1xuICAgIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG1vdmVIaXN0b3J5VXAoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeURvd24nKSkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG1vdmVIaXN0b3J5RG93bigpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5T3BlbicpKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgb3BlblNlbGVjdGVkSGlzdG9yeSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgICFpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkgJiZcbiAgICBpc0luSW5wdXQgJiZcbiAgICAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykgfHwgaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeURvd24nKSlcbiAgKSB7XG4gICAgY29uc3QgdGV4dGFyZWEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgICApO1xuICAgIGlmICh0ZXh0YXJlYSAmJiB0ZXh0YXJlYS50ZXh0Q29udGVudD8udHJpbSgpID09PSAnJykge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpID8gJ3VwJyA6ICdkb3duJztcbiAgICAgIGZvY3VzQWN0aW9uQnV0dG9uKGRpcmVjdGlvbik7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIWlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKSAmJiAhaXNJbklucHV0KSB7XG4gICAgY29uc3QgZm9jdXNlZEVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBjb25zdCBpc0FjdGlvbkJ1dHRvbiA9XG4gICAgICBmb2N1c2VkRWxlbWVudCAmJlxuICAgICAgKGZvY3VzZWRFbGVtZW50LmNsYXNzTGlzdD8uY29udGFpbnMoJ2RlZXAtZGl2ZS1idXR0b24taW5saW5lJykgfHxcbiAgICAgICAgZm9jdXNlZEVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicpID09PSAnZGVlcC1kaXZlJyk7XG5cbiAgICBpZiAoaXNBY3Rpb25CdXR0b24pIHtcbiAgICAgIGlmIChcbiAgICAgICAgaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykgfHxcbiAgICAgICAgaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeURvd24nKVxuICAgICAgKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpID8gJ3VwJyA6ICdkb3duJztcbiAgICAgICAgbW92ZUJldHdlZW5BY3Rpb25CdXR0b25zKGRpcmVjdGlvbik7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dSaWdodCcgfHwgZXZlbnQua2V5ID09PSAnQXJyb3dMZWZ0Jykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5T3BlbicpKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGZvY3VzZWRFbGVtZW50LmNsaWNrKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuY29uc3QgS0VZQk9BUkRfSEFORExFUl9LRVkgPSAnX19nZW1pbmlLZXlib2FyZEhhbmRsZXJWZXJzaW9uJztcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVLZXlib2FyZEhhbmRsZXJzKCk6IHZvaWQge1xuICBjb25zdCB2ZXJzaW9uID0gRGF0ZS5ub3coKS50b1N0cmluZygpO1xuICAoZG9jdW1lbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW0tFWUJPQVJEX0hBTkRMRVJfS0VZXSA9IHZlcnNpb247XG5cbiAgbG9hZFNob3J0Y3V0cygpLnRoZW4oKCkgPT4ge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAna2V5ZG93bicsXG4gICAgICAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKChkb2N1bWVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbS0VZQk9BUkRfSEFORExFUl9LRVldICE9PSB2ZXJzaW9uKSByZXR1cm47XG4gICAgICAgIGlmIChpc1NlYXJjaFBhZ2UoKSkge1xuICAgICAgICAgIGhhbmRsZVNlYXJjaFBhZ2VLZXlkb3duKGV2ZW50KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaGFuZGxlQ2hhdFBhZ2VLZXlkb3duKGV2ZW50KTtcbiAgICAgIH0sXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfSk7XG59XG4iLCIvLyBEZWVwIGRpdmUgZnVuY3Rpb25hbGl0eSBmb3IgR2VtaW5pIHJlc3BvbnNlc1xuXG5pbnRlcmZhY2UgRGVlcERpdmVNb2RlIHtcbiAgaWQ6IHN0cmluZztcbiAgcHJvbXB0Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRGVlcERpdmVUYXJnZXQge1xuICB0eXBlOiAnc2VjdGlvbicgfCAndGFibGUnIHwgJ2Jsb2NrcXVvdGUnIHwgJ2xpc3QnIHwgJ2NoaWxkJyB8ICdvcnBoYW4nO1xuICBlbGVtZW50OiBIVE1MRWxlbWVudDtcbiAgZ2V0Q29udGVudDogKCkgPT4gc3RyaW5nO1xuICBleHBhbmRCdXR0b25JZD86IHN0cmluZztcbn1cblxuY29uc3QgREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM6IERlZXBEaXZlTW9kZVtdID0gW1xuICB7IGlkOiAnZGVmYXVsdCcsIHByb21wdDogJ+OBk+OCjOOBq+OBpOOBhOOBpuips+OBl+OBjycgfSxcbl07XG5cbmNvbnN0IFNFU1NJT05fSUQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHIoMiwgOSk7XG5cbmZ1bmN0aW9uIGFkZERlZXBEaXZlQnV0dG9ucygpOiB2b2lkIHtcbiAgY29uc3QgcmVzcG9uc2VDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1hcmtkb3duLW1haW4tcGFuZWwnKTtcbiAgaWYgKHJlc3BvbnNlQ29udGFpbmVycy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICByZXNwb25zZUNvbnRhaW5lcnMuZm9yRWFjaCgocmVzcG9uc2VDb250YWluZXIpID0+IHtcbiAgICBjb25zdCB0YXJnZXRzOiBEZWVwRGl2ZVRhcmdldFtdID0gW107XG5cbiAgICBjb25zdCBoZWFkaW5ncyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2gxW2RhdGEtcGF0aC10by1ub2RlXSwgaDJbZGF0YS1wYXRoLXRvLW5vZGVdLCBoM1tkYXRhLXBhdGgtdG8tbm9kZV0sIGg0W2RhdGEtcGF0aC10by1ub2RlXSwgaDVbZGF0YS1wYXRoLXRvLW5vZGVdLCBoNltkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgKTtcbiAgICBjb25zdCBoYXNIZWFkaW5ncyA9IGhlYWRpbmdzLmxlbmd0aCA+IDA7XG5cbiAgICBpZiAoaGFzSGVhZGluZ3MpIHtcbiAgICAgIGhlYWRpbmdzLmZvckVhY2goKGhlYWRpbmcpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBoZWFkaW5nLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuZ2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykgPT09IFNFU1NJT05fSUQpIHJldHVybjtcbiAgICAgICAgICBoZWFkaW5nLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSwgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJykuZm9yRWFjaCgoYikgPT4gYi5yZW1vdmUoKSk7XG4gICAgICAgIH1cbiAgICAgICAgdGFyZ2V0cy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnc2VjdGlvbicsXG4gICAgICAgICAgZWxlbWVudDogaGVhZGluZyxcbiAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRTZWN0aW9uQ29udGVudChoZWFkaW5nKSxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgdGFibGVzID0gcmVzcG9uc2VDb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICd0YWJsZVtkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgICApO1xuICAgICAgdGFibGVzLmZvckVhY2goKHRhYmxlKSA9PiB7XG4gICAgICAgIGNvbnN0IHdyYXBwZXIgPSB0YWJsZS5jbG9zZXN0PEhUTUxFbGVtZW50PignLnRhYmxlLWJsb2NrLWNvbXBvbmVudCcpO1xuICAgICAgICBpZiAod3JhcHBlcikge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gd3JhcHBlci5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKTtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGlmIChleGlzdGluZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5pdGlhbGl6ZWQnKSA9PT0gU0VTU0lPTl9JRCkgcmV0dXJuO1xuICAgICAgICAgICAgZXhpc3RpbmcucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiAndGFibGUnLFxuICAgICAgICAgICAgZWxlbWVudDogd3JhcHBlcixcbiAgICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGdldFRhYmxlQ29udGVudCh0YWJsZSksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBoL2hyIOOBq+WxnuOBleOBquOBhOWtpOeri+auteiQveODluODreODg+OCr++8iOWFiOmgreODu+acq+WwvuOBquOBqe+8ieOCkuOCv+ODvOOCsuODg+ODiOOBq+i/veWKoFxuICAgICAgY29uc3Qgb3JwaGFuR3JvdXBzID0gZ2V0T3JwaGFuUGFyYWdyYXBoR3JvdXBzKHJlc3BvbnNlQ29udGFpbmVyIGFzIEhUTUxFbGVtZW50LCBoZWFkaW5ncyk7XG4gICAgICBvcnBoYW5Hcm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBncm91cC5hbmNob3IucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgIGlmIChleGlzdGluZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5pdGlhbGl6ZWQnKSA9PT0gU0VTU0lPTl9JRCkgcmV0dXJuO1xuICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ29ycGhhbicsXG4gICAgICAgICAgZWxlbWVudDogZ3JvdXAuYW5jaG9yLFxuICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGdyb3VwLmVsZW1lbnRzLm1hcCgoZWwpID0+IGVsLnRleHRDb250ZW50Py50cmltKCkgPz8gJycpLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG5cXG4nKSxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdGFibGVzID0gcmVzcG9uc2VDb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICd0YWJsZVtkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgICApO1xuICAgICAgdGFibGVzLmZvckVhY2goKHRhYmxlKSA9PiB7XG4gICAgICAgIGNvbnN0IHdyYXBwZXIgPSB0YWJsZS5jbG9zZXN0PEhUTUxFbGVtZW50PignLnRhYmxlLWJsb2NrLWNvbXBvbmVudCcpO1xuICAgICAgICBpZiAod3JhcHBlcikge1xuICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gd3JhcHBlci5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKTtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGlmIChleGlzdGluZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5pdGlhbGl6ZWQnKSA9PT0gU0VTU0lPTl9JRCkgcmV0dXJuO1xuICAgICAgICAgICAgZXhpc3RpbmcucmVtb3ZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiAndGFibGUnLFxuICAgICAgICAgICAgZWxlbWVudDogd3JhcHBlcixcbiAgICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGdldFRhYmxlQ29udGVudCh0YWJsZSksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBibG9ja3F1b3RlcyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnYmxvY2txdW90ZVtkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgICApO1xuICAgICAgYmxvY2txdW90ZXMuZm9yRWFjaCgoYmxvY2txdW90ZSkgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGJsb2NrcXVvdGUucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgIGlmIChleGlzdGluZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5pdGlhbGl6ZWQnKSA9PT0gU0VTU0lPTl9JRCkgcmV0dXJuO1xuICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ2Jsb2NrcXVvdGUnLFxuICAgICAgICAgIGVsZW1lbnQ6IGJsb2NrcXVvdGUsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gYmxvY2txdW90ZS50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnLFxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBsaXN0cyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnb2xbZGF0YS1wYXRoLXRvLW5vZGVdLCB1bFtkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgICApO1xuICAgICAgbGlzdHMuZm9yRWFjaCgobGlzdCkgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGxpc3QucXVlcnlTZWxlY3RvcignOnNjb3BlID4gLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgIGlmIChleGlzdGluZy5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5pdGlhbGl6ZWQnKSA9PT0gU0VTU0lPTl9JRCkgcmV0dXJuO1xuICAgICAgICAgIGxpc3QucXVlcnlTZWxlY3RvckFsbCgnLmRlZXAtZGl2ZS1idXR0b24taW5saW5lLCAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b24nKS5mb3JFYWNoKChiKSA9PiBiLnJlbW92ZSgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBwYXJlbnQgPSBsaXN0LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgIGxldCBpc05lc3RlZCA9IGZhbHNlO1xuICAgICAgICB3aGlsZSAocGFyZW50ICYmIHBhcmVudCAhPT0gcmVzcG9uc2VDb250YWluZXIpIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAocGFyZW50LnRhZ05hbWUgPT09ICdPTCcgfHwgcGFyZW50LnRhZ05hbWUgPT09ICdVTCcpICYmXG4gICAgICAgICAgICBwYXJlbnQuaGFzQXR0cmlidXRlKCdkYXRhLXBhdGgtdG8tbm9kZScpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBpc05lc3RlZCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgICAgcGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzTmVzdGVkKSByZXR1cm47XG5cbiAgICAgICAgdGFyZ2V0cy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnbGlzdCcsXG4gICAgICAgICAgZWxlbWVudDogbGlzdCxcbiAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRMaXN0Q29udGVudChsaXN0KSxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0YXJnZXRzLmZvckVhY2goKHRhcmdldCkgPT4gYWRkRGVlcERpdmVCdXR0b24odGFyZ2V0KSk7XG4gIH0pO1xufVxuXG5pbnRlcmZhY2UgT3JwaGFuR3JvdXAge1xuICBhbmNob3I6IEhUTUxFbGVtZW50O1xuICBlbGVtZW50czogSFRNTEVsZW1lbnRbXTtcbn1cblxuZnVuY3Rpb24gZ2V0T3JwaGFuUGFyYWdyYXBoR3JvdXBzKFxuICBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuICBoZWFkaW5nczogTm9kZUxpc3RPZjxIVE1MRWxlbWVudD5cbik6IE9ycGhhbkdyb3VwW10ge1xuICBjb25zdCBoZWFkaW5nU2V0ID0gbmV3IFNldChBcnJheS5mcm9tKGhlYWRpbmdzKSk7XG4gIGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pIGFzIEhUTUxFbGVtZW50W107XG4gIGNvbnN0IGdyb3VwczogT3JwaGFuR3JvdXBbXSA9IFtdO1xuICBsZXQgY3VycmVudDogSFRNTEVsZW1lbnRbXSA9IFtdO1xuICAvLyDnm7TliY3jga7ljLrliIfjgorjgYxo44K/44Kw44GL44Gp44GG44GL77yIaOOCv+OCsOebtOW+jOOBrnDjga/jgrvjgq/jgrfjg6fjg7PmnKzmlofjgarjga7jgadvcnBoYW7jgafjga/jgarjgYTvvIlcbiAgbGV0IHByZXZCcmVha2VyV2FzSGVhZGluZyA9IGZhbHNlO1xuXG4gIGNvbnN0IGZsdXNoID0gKGFmdGVySGVhZGluZzogYm9vbGVhbikgPT4ge1xuICAgIGlmIChjdXJyZW50Lmxlbmd0aCA+IDAgJiYgIWFmdGVySGVhZGluZykge1xuICAgICAgZ3JvdXBzLnB1c2goeyBhbmNob3I6IGN1cnJlbnRbMF0sIGVsZW1lbnRzOiBbLi4uY3VycmVudF0gfSk7XG4gICAgfVxuICAgIGN1cnJlbnQgPSBbXTtcbiAgfTtcblxuICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgY29uc3QgdGFnID0gY2hpbGQudGFnTmFtZTtcbiAgICBjb25zdCBpc1BhcmFncmFwaCA9IHRhZyA9PT0gJ1AnO1xuICAgIGNvbnN0IGlzSGVhZGluZyA9XG4gICAgICBoZWFkaW5nU2V0LmhhcyhjaGlsZCkgfHxcbiAgICAgIHRhZyA9PT0gJ0gxJyB8fCB0YWcgPT09ICdIMicgfHwgdGFnID09PSAnSDMnIHx8XG4gICAgICB0YWcgPT09ICdINCcgfHwgdGFnID09PSAnSDUnIHx8IHRhZyA9PT0gJ0g2JztcbiAgICBjb25zdCBpc0hyID0gdGFnID09PSAnSFInO1xuXG4gICAgaWYgKGlzSGVhZGluZykge1xuICAgICAgZmx1c2gocHJldkJyZWFrZXJXYXNIZWFkaW5nKTtcbiAgICAgIHByZXZCcmVha2VyV2FzSGVhZGluZyA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChpc0hyKSB7XG4gICAgICBmbHVzaChwcmV2QnJlYWtlcldhc0hlYWRpbmcpO1xuICAgICAgcHJldkJyZWFrZXJXYXNIZWFkaW5nID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChpc1BhcmFncmFwaCkge1xuICAgICAgY3VycmVudC5wdXNoKGNoaWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gdWwvb2wvdGFibGUvYmxvY2txdW90ZSDnrYnjga/jgrDjg6vjg7zjg5fjgpLljLrliIfjgovjgaDjgZHjgaflj47pm4bjgZfjgarjgYRcbiAgICAgIGZsdXNoKHByZXZCcmVha2VyV2FzSGVhZGluZyk7XG4gICAgICBwcmV2QnJlYWtlcldhc0hlYWRpbmcgPSBmYWxzZTtcbiAgICB9XG4gIH1cbiAgZmx1c2gocHJldkJyZWFrZXJXYXNIZWFkaW5nKTtcblxuICByZXR1cm4gZ3JvdXBzO1xufVxuXG5mdW5jdGlvbiBnZXRTZWN0aW9uQ29udGVudChoZWFkaW5nOiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIGxldCBjb250ZW50ID0gKGhlYWRpbmcudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJykgKyAnXFxuXFxuJztcbiAgbGV0IGN1cnJlbnQgPSBoZWFkaW5nLm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cbiAgd2hpbGUgKGN1cnJlbnQgJiYgIWN1cnJlbnQubWF0Y2hlcygnaDEsIGgyLCBoMywgaDQsIGg1LCBoNiwgaHInKSkge1xuICAgIGlmIChjdXJyZW50LmNsYXNzTGlzdC5jb250YWlucygndGFibGUtYmxvY2stY29tcG9uZW50JykpIHtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29udGVudCArPSAoY3VycmVudC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnKSArICdcXG5cXG4nO1xuICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gIH1cblxuICByZXR1cm4gY29udGVudC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGdldFRhYmxlQ29udGVudCh0YWJsZTogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBsZXQgY29udGVudCA9ICcnO1xuICBjb25zdCByb3dzID0gdGFibGUucXVlcnlTZWxlY3RvckFsbDxIVE1MVGFibGVSb3dFbGVtZW50PigndHInKTtcblxuICByb3dzLmZvckVhY2goKHJvdywgcm93SW5kZXgpID0+IHtcbiAgICBjb25zdCBjZWxscyA9IHJvdy5xdWVyeVNlbGVjdG9yQWxsKCd0ZCwgdGgnKTtcbiAgICBjb25zdCBjZWxsVGV4dHMgPSBBcnJheS5mcm9tKGNlbGxzKS5tYXAoKGNlbGwpID0+XG4gICAgICBjZWxsLnRleHRDb250ZW50Py50cmltKCkgPz8gJydcbiAgICApO1xuICAgIGNvbnRlbnQgKz0gJ3wgJyArIGNlbGxUZXh0cy5qb2luKCcgfCAnKSArICcgfFxcbic7XG4gICAgaWYgKHJvd0luZGV4ID09PSAwKSB7XG4gICAgICBjb250ZW50ICs9ICd8ICcgKyBjZWxsVGV4dHMubWFwKCgpID0+ICctLS0nKS5qb2luKCcgfCAnKSArICcgfFxcbic7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gY29udGVudC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGdldExpc3RDb250ZW50KGxpc3Q6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgcmV0dXJuIGxpc3QudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJztcbn1cblxudHlwZSBEZWVwRGl2ZUJ1dHRvbkVsZW1lbnQgPSBIVE1MQnV0dG9uRWxlbWVudCAmIHtcbiAgX2RlZXBEaXZlVGFyZ2V0PzogRGVlcERpdmVUYXJnZXQ7XG59O1xuXG5mdW5jdGlvbiBhZGREZWVwRGl2ZUJ1dHRvbih0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0KTogdm9pZCB7XG4gIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpIGFzIERlZXBEaXZlQnV0dG9uRWxlbWVudDtcbiAgYnV0dG9uLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtYnV0dG9uLWlubGluZSc7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnRGVlcCBkaXZlIGludG8gdGhpcyBjb250ZW50Jyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2RlZXAtZGl2ZScpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJywgU0VTU0lPTl9JRCk7XG4gIGJ1dHRvbi50aXRsZSA9ICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnO1xuICBidXR0b24uX2RlZXBEaXZlVGFyZ2V0ID0gdGFyZ2V0O1xuXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzE2Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAyNCAyNCcpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdmaWxsJywgJ2N1cnJlbnRDb2xvcicpO1xuICBjb25zdCBwYXRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdwYXRoJyk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdkJywgJ00xOSAxNWwtNiA2LTEuNS0xLjVMMTUgMTZINFY5aDJ2NWg5bC0zLjUtMy41TDEzIDlsNiA2eicpO1xuICBzdmcuYXBwZW5kQ2hpbGQocGF0aCk7XG4gIGJ1dHRvbi5hcHBlbmRDaGlsZChzdmcpO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaW5zZXJ0RGVlcERpdmVRdWVyeSh0YXJnZXQsIGUuY3RybEtleSk7XG4gIH0pO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiAhZS5hbHRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5KSB7XG4gICAgICBjb25zdCBleHBhbmRCdG4gPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJyk7XG4gICAgICBpZiAoZXhwYW5kQnRuKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgdG9nZ2xlRXhwYW5kKHRhcmdldCwgZXhwYW5kQnRuKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dMZWZ0JyAmJiAhZS5hbHRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5KSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnKSkge1xuICAgICAgICBoaWRlVGVtcGxhdGVQb3B1cCgpO1xuICAgICAgICBidXR0b24uZm9jdXMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNob3dUZW1wbGF0ZVBvcHVwKGJ1dHRvbiwgdGFyZ2V0KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGxldCBleHBhbmRCdXR0b246IEhUTUxCdXR0b25FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGlmICh0YXJnZXQudHlwZSA9PT0gJ3NlY3Rpb24nIHx8IHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICBleHBhbmRCdXR0b24gPSBjcmVhdGVFeHBhbmRCdXR0b24odGFyZ2V0KTtcbiAgfVxuXG4gIGlmICh0YXJnZXQudHlwZSA9PT0gJ3NlY3Rpb24nKSB7XG4gICAgdGFyZ2V0LmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgdGFyZ2V0LmVsZW1lbnQuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLmdhcCA9ICc4cHgnO1xuICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gICAgaWYgKGV4cGFuZEJ1dHRvbikgdGFyZ2V0LmVsZW1lbnQuYXBwZW5kQ2hpbGQoZXhwYW5kQnV0dG9uKTtcbiAgfSBlbHNlIGlmICh0YXJnZXQudHlwZSA9PT0gJ3RhYmxlJykge1xuICAgIGNvbnN0IGZvb3RlciA9IHRhcmdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcudGFibGUtZm9vdGVyJyk7XG4gICAgaWYgKGZvb3Rlcikge1xuICAgICAgY29uc3QgY29weUJ1dHRvbiA9IGZvb3Rlci5xdWVyeVNlbGVjdG9yKCcuY29weS1idXR0b24nKTtcbiAgICAgIGlmIChjb3B5QnV0dG9uKSB7XG4gICAgICAgIGZvb3Rlci5pbnNlcnRCZWZvcmUoYnV0dG9uLCBjb3B5QnV0dG9uKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvb3Rlci5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0YXJnZXQudHlwZSA9PT0gJ2Jsb2NrcXVvdGUnKSB7XG4gICAgdGFyZ2V0LmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuICAgIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgYnV0dG9uLnN0eWxlLnRvcCA9ICc4cHgnO1xuICAgIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICc4cHgnO1xuICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdvcnBoYW4nKSB7XG4gICAgdGFyZ2V0LmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuICAgIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgYnV0dG9uLnN0eWxlLnRvcCA9ICcwJztcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnMCc7XG4gICAgdGFyZ2V0LmVsZW1lbnQuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgfSBlbHNlIGlmICh0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgdGFyZ2V0LmVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuICAgIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgYnV0dG9uLnN0eWxlLnRvcCA9ICcwJztcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnMCc7XG4gICAgdGFyZ2V0LmVsZW1lbnQuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICBpZiAoZXhwYW5kQnV0dG9uKSB7XG4gICAgICBleHBhbmRCdXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgICAgZXhwYW5kQnV0dG9uLnN0eWxlLnRvcCA9ICcwJztcbiAgICAgIGV4cGFuZEJ1dHRvbi5zdHlsZS5yaWdodCA9ICczMnB4JztcbiAgICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGV4cGFuZEJ1dHRvbik7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUV4cGFuZEJ1dHRvbih0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0KTogSFRNTEJ1dHRvbkVsZW1lbnQge1xuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgYnV0dG9uLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbic7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnRXhwYW5kIHRvIHNlbGVjdCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdleHBhbmQnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTtcbiAgYnV0dG9uLnRpdGxlID0gJ0V4cGFuZCB0byBzZWxlY3QnO1xuICBidXR0b24udGV4dENvbnRlbnQgPSAnKyc7XG4gIGJ1dHRvbi5zdHlsZS5mb250U2l6ZSA9ICcxNHB4JztcbiAgYnV0dG9uLnN0eWxlLmZvbnRXZWlnaHQgPSAnYm9sZCc7XG5cbiAgYnV0dG9uLmRhdGFzZXQudGFyZ2V0SWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHIoMiwgOSk7XG4gIHRhcmdldC5leHBhbmRCdXR0b25JZCA9IGJ1dHRvbi5kYXRhc2V0LnRhcmdldElkO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgdG9nZ2xlRXhwYW5kKHRhcmdldCwgYnV0dG9uKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGJ1dHRvbjtcbn1cblxuZnVuY3Rpb24gdG9nZ2xlRXhwYW5kKHRhcmdldDogRGVlcERpdmVUYXJnZXQsIGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3QgaXNFeHBhbmRlZCA9IGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJykgPT09ICdjb2xsYXBzZSc7XG5cbiAgaWYgKGlzRXhwYW5kZWQpIHtcbiAgICBjb2xsYXBzZUNoaWxkQnV0dG9ucyh0YXJnZXQpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2V4cGFuZCcpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnRXhwYW5kIHRvIHNlbGVjdCcpO1xuICAgIGJ1dHRvbi50aXRsZSA9ICdFeHBhbmQgdG8gc2VsZWN0JztcbiAgICBidXR0b24udGV4dENvbnRlbnQgPSAnKyc7XG4gIH0gZWxzZSB7XG4gICAgZXhwYW5kQ2hpbGRCdXR0b25zKHRhcmdldCk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnY29sbGFwc2UnKTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0NvbGxhcHNlJyk7XG4gICAgYnV0dG9uLnRpdGxlID0gJ0NvbGxhcHNlJztcbiAgICBidXR0b24udGV4dENvbnRlbnQgPSAnLSc7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXhwYW5kQ2hpbGRCdXR0b25zKHRhcmdldDogRGVlcERpdmVUYXJnZXQpOiB2b2lkIHtcbiAgaWYgKHRhcmdldC50eXBlID09PSAnc2VjdGlvbicpIHtcbiAgICBjb25zdCBoZWFkaW5nID0gdGFyZ2V0LmVsZW1lbnQ7XG4gICAgbGV0IGN1cnJlbnQgPSBoZWFkaW5nLm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cbiAgICB3aGlsZSAoY3VycmVudCAmJiAhY3VycmVudC5tYXRjaGVzKCdoMSwgaDIsIGgzLCBoNCwgaDUsIGg2LCBocicpKSB7XG4gICAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGN1cnJlbnQudGFnTmFtZSA9PT0gJ1AnICYmICFjdXJyZW50LnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJykpIHtcbiAgICAgICAgYWRkQ2hpbGRCdXR0b24oY3VycmVudCk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIChjdXJyZW50LnRhZ05hbWUgPT09ICdVTCcgfHwgY3VycmVudC50YWdOYW1lID09PSAnT0wnKSAmJlxuICAgICAgICBjdXJyZW50Lmhhc0F0dHJpYnV0ZSgnZGF0YS1wYXRoLXRvLW5vZGUnKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGl0ZW1zID0gY3VycmVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignOnNjb3BlID4gbGknKTtcbiAgICAgICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgICAgIGlmICghaXRlbS5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpKSB7XG4gICAgICAgICAgICBhZGRDaGlsZEJ1dHRvbihpdGVtKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdsaXN0Jykge1xuICAgIGNvbnN0IGl0ZW1zID0gdGFyZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJzpzY29wZSA+IGxpJyk7XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgaWYgKCFpdGVtLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJykpIHtcbiAgICAgICAgYWRkQ2hpbGRCdXR0b24oaXRlbSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkQ2hpbGRCdXR0b24oZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cbiAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUgZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbic7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnRGVlcCBkaXZlIGludG8gdGhpcyBjb250ZW50Jyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2RlZXAtZGl2ZScpO1xuICBidXR0b24udGl0bGUgPSAnRGVlcCBkaXZlIGludG8gdGhpcyBjb250ZW50JztcbiAgYnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgYnV0dG9uLnN0eWxlLnRvcCA9ICcwJztcbiAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzAnO1xuXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzE2Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAyNCAyNCcpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdmaWxsJywgJ2N1cnJlbnRDb2xvcicpO1xuICBjb25zdCBwYXRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdwYXRoJyk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdkJywgJ00xOSAxNWwtNiA2LTEuNS0xLjVMMTUgMTZINFY5aDJ2NWg5bC0zLjUtMy41TDEzIDlsNiA2eicpO1xuICBzdmcuYXBwZW5kQ2hpbGQocGF0aCk7XG4gIGJ1dHRvbi5hcHBlbmRDaGlsZChzdmcpO1xuXG4gIGNvbnN0IGNoaWxkVGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCA9IHtcbiAgICB0eXBlOiAnY2hpbGQnLFxuICAgIGVsZW1lbnQsXG4gICAgZ2V0Q29udGVudDogKCkgPT4gZWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnLFxuICB9O1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaW5zZXJ0RGVlcERpdmVRdWVyeShjaGlsZFRhcmdldCwgZS5jdHJsS2V5KTtcbiAgfSk7XG5cbiAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcgJiYgIWUuYWx0S2V5ICYmICFlLmN0cmxLZXkgJiYgIWUubWV0YUtleSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJykpIHtcbiAgICAgICAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcbiAgICAgICAgYnV0dG9uLmZvY3VzKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzaG93VGVtcGxhdGVQb3B1cChidXR0b24sIGNoaWxkVGFyZ2V0KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbn1cblxuZnVuY3Rpb24gY29sbGFwc2VDaGlsZEJ1dHRvbnModGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIGNvbnN0IGhlYWRpbmcgPSB0YXJnZXQuZWxlbWVudDtcbiAgICBsZXQgY3VycmVudCA9IGhlYWRpbmcubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICB3aGlsZSAoY3VycmVudCAmJiAhY3VycmVudC5tYXRjaGVzKCdoMSwgaDIsIGgzLCBoNCwgaDUsIGg2LCBocicpKSB7XG4gICAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY3VycmVudFxuICAgICAgICAucXVlcnlTZWxlY3RvckFsbCgnLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKVxuICAgICAgICAuZm9yRWFjaCgoYnRuKSA9PiBidG4ucmVtb3ZlKCkpO1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdsaXN0Jykge1xuICAgIHRhcmdldC5lbGVtZW50XG4gICAgICAucXVlcnlTZWxlY3RvckFsbCgnLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKVxuICAgICAgLmZvckVhY2goKGJ0bikgPT4gYnRuLnJlbW92ZSgpKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzaG93VGVtcGxhdGVQb3B1cChcbiAgYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCxcbiAgdGFyZ2V0OiBEZWVwRGl2ZVRhcmdldFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGhpZGVUZW1wbGF0ZVBvcHVwKCk7XG5cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8e1xuICAgIGRlZXBEaXZlTW9kZXM/OiBEZWVwRGl2ZU1vZGVbXTtcbiAgICBjdXJyZW50RGVlcERpdmVNb2RlSWQ/OiBzdHJpbmc7XG4gICAgZGVlcERpdmVSZWNlbnRNb2Rlcz86IHN0cmluZ1tdO1xuICB9PigocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFxuICAgICAgWydkZWVwRGl2ZU1vZGVzJywgJ2N1cnJlbnREZWVwRGl2ZU1vZGVJZCcsICdkZWVwRGl2ZVJlY2VudE1vZGVzJ10sXG4gICAgICByZXNvbHZlIGFzIChpdGVtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHZvaWRcbiAgICApO1xuICB9KTtcblxuICBjb25zdCBtb2RlcyA9XG4gICAgcmVzdWx0LmRlZXBEaXZlTW9kZXMgJiYgcmVzdWx0LmRlZXBEaXZlTW9kZXMubGVuZ3RoID4gMFxuICAgICAgPyByZXN1bHQuZGVlcERpdmVNb2Rlc1xuICAgICAgOiBERUZBVUxUX0RFRVBfRElWRV9NT0RFUztcblxuICBjb25zdCByZWNlbnRJZHMgPSByZXN1bHQuZGVlcERpdmVSZWNlbnRNb2RlcyB8fCBbXTtcbiAgY29uc3Qgc29ydGVkID0gWy4uLm1vZGVzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgY29uc3QgYWkgPSByZWNlbnRJZHMuaW5kZXhPZihhLmlkKTtcbiAgICBjb25zdCBiaSA9IHJlY2VudElkcy5pbmRleE9mKGIuaWQpO1xuICAgIGlmIChhaSA9PT0gLTEgJiYgYmkgPT09IC0xKSByZXR1cm4gMDtcbiAgICBpZiAoYWkgPT09IC0xKSByZXR1cm4gMTtcbiAgICBpZiAoYmkgPT09IC0xKSByZXR1cm4gLTE7XG4gICAgcmV0dXJuIGFpIC0gYmk7XG4gIH0pO1xuXG4gIGNvbnN0IHBvcHVwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHBvcHVwLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnO1xuICBwb3B1cC5pZCA9ICdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnO1xuICBwb3B1cC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWVudScpO1xuXG4gIGNvbnN0IG1ha2VJdGVtID0gKFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgaGludDogc3RyaW5nLFxuICAgIG9uQ2xpY2s6ICgpID0+IHZvaWRcbiAgKTogSFRNTEJ1dHRvbkVsZW1lbnQgPT4ge1xuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICBpdGVtLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtdGVtcGxhdGUtaXRlbSc7XG4gICAgaXRlbS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWVudWl0ZW0nKTtcbiAgICBpdGVtLnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgaWYgKGhpbnQpIGl0ZW0udGl0bGUgPSBoaW50O1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgfSk7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcbiAgICAgIG9uQ2xpY2soKTtcbiAgICB9KTtcbiAgICByZXR1cm4gaXRlbTtcbiAgfTtcblxuICBzb3J0ZWQuZm9yRWFjaCgobW9kZSkgPT4ge1xuICAgIHBvcHVwLmFwcGVuZENoaWxkKFxuICAgICAgbWFrZUl0ZW0obW9kZS5pZCwgbW9kZS5wcm9tcHQgfHwgJycsICgpID0+IGRvSW5zZXJ0UXVlcnkodGFyZ2V0LCBtb2RlKSlcbiAgICApO1xuICB9KTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBvcHVwKTtcblxuICBjb25zdCByZWN0ID0gYnV0dG9uLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBwb3B1cFcgPSAxNjA7XG4gIGxldCBsZWZ0ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFg7XG4gIGlmIChsZWZ0ICsgcG9wdXBXID4gd2luZG93LmlubmVyV2lkdGggLSA4KSB7XG4gICAgbGVmdCA9IHdpbmRvdy5pbm5lcldpZHRoIC0gcG9wdXBXIC0gODtcbiAgfVxuICBwb3B1cC5zdHlsZS50b3AgPSBgJHtyZWN0LmJvdHRvbSArIHdpbmRvdy5zY3JvbGxZICsgNH1weGA7XG4gIHBvcHVwLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblxuICBjb25zdCBpdGVtcyA9IEFycmF5LmZyb20oXG4gICAgcG9wdXAucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJy5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbScpXG4gICk7XG4gIGxldCBmb2N1c0luZGV4ID0gMDtcbiAgaXRlbXNbMF0/LmZvY3VzKCk7XG5cbiAgcG9wdXAuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJyB8fCBlLmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGhpZGVUZW1wbGF0ZVBvcHVwKCk7XG4gICAgICBidXR0b24uZm9jdXMoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dEb3duJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZm9jdXNJbmRleCA9IChmb2N1c0luZGV4ICsgMSkgJSBpdGVtcy5sZW5ndGg7XG4gICAgICBpdGVtc1tmb2N1c0luZGV4XS5mb2N1cygpO1xuICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd1VwJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZm9jdXNJbmRleCA9IChmb2N1c0luZGV4IC0gMSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGg7XG4gICAgICBpdGVtc1tmb2N1c0luZGV4XS5mb2N1cygpO1xuICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdUYWInKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBpZiAoZS5zaGlmdEtleSkge1xuICAgICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgfVxuICAgICAgaXRlbXNbZm9jdXNJbmRleF0uZm9jdXMoKTtcbiAgICB9XG4gIH0pO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGlkZVRlbXBsYXRlUG9wdXAsIHsgb25jZTogdHJ1ZSB9KTtcbiAgfSwgMCk7XG59XG5cbmZ1bmN0aW9uIGhpZGVUZW1wbGF0ZVBvcHVwKCk6IHZvaWQge1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJyk/LnJlbW92ZSgpO1xufVxuXG5mdW5jdGlvbiB3cml0ZVRvVGV4dGFyZWEocXVlcnk6IHN0cmluZywgYXV0b1NlbmQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgY29uc3QgdGV4dGFyZWEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICk7XG4gIGlmICghdGV4dGFyZWEpIHJldHVybjtcblxuICB3aGlsZSAodGV4dGFyZWEuZmlyc3RDaGlsZCkgdGV4dGFyZWEucmVtb3ZlQ2hpbGQodGV4dGFyZWEuZmlyc3RDaGlsZCk7XG5cbiAgcXVlcnkuc3BsaXQoJ1xcbicpLmZvckVhY2goKGxpbmUpID0+IHtcbiAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgIGlmIChsaW5lLnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIHAuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnInKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHAudGV4dENvbnRlbnQgPSBsaW5lO1xuICAgIH1cbiAgICB0ZXh0YXJlYS5hcHBlbmRDaGlsZChwKTtcbiAgfSk7XG5cbiAgdGV4dGFyZWEuZm9jdXMoKTtcbiAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICBjb25zdCBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG4gIHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0ZXh0YXJlYSk7XG4gIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgc2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgc2VsPy5hZGRSYW5nZShyYW5nZSk7XG4gIHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cbiAgaWYgKGF1dG9TZW5kKSB7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zdCBzZW5kQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLpgIHkv6FcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlNlbmRcIl0nXG4gICAgICApO1xuICAgICAgaWYgKHNlbmRCdXR0b24gJiYgIXNlbmRCdXR0b24uZGlzYWJsZWQpIHNlbmRCdXR0b24uY2xpY2soKTtcbiAgICB9LCAxMDApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGRvSW5zZXJ0UXVlcnkodGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCwgbW9kZTogRGVlcERpdmVNb2RlKTogdm9pZCB7XG4gIGNvbnN0IGNvbnRlbnQgPSB0YXJnZXQuZ2V0Q29udGVudCgpO1xuICBjb25zdCBxdW90ZWRDb250ZW50ID0gY29udGVudFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsaW5lKSA9PiBgPiAke2xpbmV9YClcbiAgICAuam9pbignXFxuJyk7XG4gIGNvbnN0IHF1ZXJ5ID0gcXVvdGVkQ29udGVudCArICdcXG5cXG4nICsgKG1vZGUucHJvbXB0IHx8ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nKTtcbiAgd3JpdGVUb1RleHRhcmVhKHF1ZXJ5LCB0cnVlKTtcblxuICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChbJ2RlZXBEaXZlUmVjZW50TW9kZXMnXSwgKHIpID0+IHtcbiAgICBjb25zdCByZWNlbnQgPSAoKHIuZGVlcERpdmVSZWNlbnRNb2RlcyBhcyBzdHJpbmdbXSkgfHwgW10pLmZpbHRlcihcbiAgICAgIChpZCkgPT4gaWQgIT09IG1vZGUuaWRcbiAgICApO1xuICAgIHJlY2VudC51bnNoaWZ0KG1vZGUuaWQpO1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgZGVlcERpdmVSZWNlbnRNb2RlczogcmVjZW50LnNsaWNlKDAsIDIwKSB9KTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGluc2VydERlZXBEaXZlUXVlcnkoXG4gIHRhcmdldDogRGVlcERpdmVUYXJnZXQsXG4gIHF1b3RlT25seSA9IGZhbHNlXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXScpKSByZXR1cm47XG5cbiAgY29uc3QgY29udGVudCA9IHRhcmdldC5nZXRDb250ZW50KCk7XG4gIGNvbnN0IHF1b3RlZENvbnRlbnQgPSBjb250ZW50XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAoKGxpbmUpID0+IGA+ICR7bGluZX1gKVxuICAgIC5qb2luKCdcXG4nKTtcblxuICBsZXQgcXVlcnk6IHN0cmluZztcbiAgbGV0IHNob3VsZEF1dG9TZW5kID0gZmFsc2U7XG5cbiAgaWYgKHF1b3RlT25seSkge1xuICAgIHF1ZXJ5ID0gcXVvdGVkQ29udGVudCArICdcXG5cXG4nO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPHtcbiAgICAgIGRlZXBEaXZlTW9kZXM/OiBEZWVwRGl2ZU1vZGVbXTtcbiAgICAgIGN1cnJlbnREZWVwRGl2ZU1vZGVJZD86IHN0cmluZztcbiAgICB9PigocmVzb2x2ZSkgPT4ge1xuICAgICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoXG4gICAgICAgIFsnZGVlcERpdmVNb2RlcycsICdjdXJyZW50RGVlcERpdmVNb2RlSWQnXSxcbiAgICAgICAgcmVzb2x2ZSBhcyAoaXRlbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB2b2lkXG4gICAgICApO1xuICAgIH0pO1xuICAgIGNvbnN0IG1vZGVzID1cbiAgICAgIHJlc3VsdC5kZWVwRGl2ZU1vZGVzICYmIHJlc3VsdC5kZWVwRGl2ZU1vZGVzLmxlbmd0aCA+IDBcbiAgICAgICAgPyByZXN1bHQuZGVlcERpdmVNb2Rlc1xuICAgICAgICA6IERFRkFVTFRfREVFUF9ESVZFX01PREVTO1xuICAgIGNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKTtcbiAgICBjb25zdCB1cmxNb2RlSWQgPSB1cmxQYXJhbXMuZ2V0KCdtb2RlX2lkJyk7XG4gICAgbGV0IG1vZGVJZCA9IHVybE1vZGVJZCB8fCByZXN1bHQuY3VycmVudERlZXBEaXZlTW9kZUlkIHx8IG1vZGVzWzBdPy5pZDtcbiAgICBpZiAoIW1vZGVzLnNvbWUoKG0pID0+IG0uaWQgPT09IG1vZGVJZCkpIG1vZGVJZCA9IG1vZGVzWzBdPy5pZDtcbiAgICBjb25zdCBtb2RlID1cbiAgICAgIG1vZGVzLmZpbmQoKG0pID0+IG0uaWQgPT09IG1vZGVJZCkgfHxcbiAgICAgIG1vZGVzWzBdIHx8XG4gICAgICBERUZBVUxUX0RFRVBfRElWRV9NT0RFU1swXTtcbiAgICBxdWVyeSA9IHF1b3RlZENvbnRlbnQgKyAnXFxuXFxuJyArIChtb2RlLnByb21wdCB8fCAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJyk7XG4gICAgc2hvdWxkQXV0b1NlbmQgPSB0cnVlO1xuICB9XG5cbiAgd3JpdGVUb1RleHRhcmVhKHF1ZXJ5LCBzaG91bGRBdXRvU2VuZCk7XG59XG5cbmZ1bmN0aW9uIGFkZERlZXBEaXZlU3R5bGVzKCk6IHZvaWQge1xuICBjb25zdCBzdHlsZUlkID0gJ2dlbWluaS1kZWVwLWRpdmUtc3R5bGVzJztcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHN0eWxlSWQpKSByZXR1cm47XG5cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICBzdHlsZS5pZCA9IHN0eWxlSWQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHdpZHRoOiAyOHB4O1xuICAgICAgaGVpZ2h0OiAyOHB4O1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIGNvbG9yOiAjNWY2MzY4O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICBmbGV4LXNocmluazogMDtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1idXR0b24taW5saW5lOmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG4gICAgICBjb2xvcjogIzFhNzNlODtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1idXR0b24taW5saW5lOmZvY3VzIHtcbiAgICAgIG91dGxpbmU6IDJweCBzb2xpZCAjMWE3M2U4O1xuICAgICAgb3V0bGluZS1vZmZzZXQ6IDJweDtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1idXR0b24taW5saW5lIHN2ZyB7XG4gICAgICB3aWR0aDogMTZweDtcbiAgICAgIGhlaWdodDogMTZweDtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgd2lkdGg6IDI4cHg7XG4gICAgICBoZWlnaHQ6IDI4cHg7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTRweDtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgY29sb3I6ICM1ZjYzNjg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycztcbiAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgZm9udC13ZWlnaHQ6IGJvbGQ7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbjpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuMDUpO1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbjpmb2N1cyB7XG4gICAgICBvdXRsaW5lOiAycHggc29saWQgIzFhNzNlODtcbiAgICAgIG91dGxpbmUtb2Zmc2V0OiAycHg7XG4gICAgfVxuICAgIGJsb2NrcXVvdGVbZGF0YS1wYXRoLXRvLW5vZGVdIHtcbiAgICAgIHBhZGRpbmctdG9wOiA0MHB4O1xuICAgIH1cbiAgICAuZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4ICFpbXBvcnRhbnQ7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAgcGFkZGluZzogMCA4cHg7XG4gICAgICBtYXJnaW46IDAgNHB4O1xuICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgdmVydGljYWwtYWxpZ246IG1pZGRsZTtcbiAgICB9XG4gICAgYm9keSA+IC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Ige1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgYm90dG9tOiAxMDBweDtcbiAgICAgIGxlZnQ6IDMyMHB4O1xuICAgICAgei1pbmRleDogOTk5OTtcbiAgICB9XG4gICAgLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciBzZWxlY3Qge1xuICAgICAgcGFkZGluZzogNHB4IDhweDtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkICNkYWRjZTA7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgY29sb3I6ICM1ZjYzNjg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBtYXgtd2lkdGg6IDEwMHB4O1xuICAgIH1cbiAgICAuZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yIHNlbGVjdDpob3ZlciB7XG4gICAgICBib3JkZXItY29sb3I6ICMxYTczZTg7XG4gICAgICBjb2xvcjogIzFhNzNlODtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS10ZW1wbGF0ZS1wb3B1cCB7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICB6LWluZGV4OiA5OTk5OTtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgbWluLXdpZHRoOiAxNjBweDtcbiAgICAgIHBhZGRpbmc6IDRweCAwO1xuICAgICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkICNkYWRjZTA7XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwwLDAsMC4xNSk7XG4gICAgICBvdXRsaW5lOiBub25lO1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW0ge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgICB3aWR0aDogMTAwJTtcbiAgICAgIHBhZGRpbmc6IDdweCAxNHB4O1xuICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgICAgY29sb3I6ICMzYzQwNDM7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB3aGl0ZS1zcGFjZTogbm93cmFwO1xuICAgICAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgICAgIHRleHQtb3ZlcmZsb3c6IGVsbGlwc2lzO1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW06aG92ZXIsXG4gICAgLmRlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtOmZvY3VzIHtcbiAgICAgIGJhY2tncm91bmQ6ICNmMWYzZjQ7XG4gICAgICBjb2xvcjogIzFhNzNlODtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0TW9kZVNlbGVjdG9yKCk6IHZvaWQge1xuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3InKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcbiAgICBbJ2RlZXBEaXZlTW9kZXMnLCAnY3VycmVudERlZXBEaXZlTW9kZUlkJ10sXG4gICAgKHI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG4gICAgICBjb25zdCBtb2RlcyA9XG4gICAgICAgIChyLmRlZXBEaXZlTW9kZXMgYXMgRGVlcERpdmVNb2RlW10gfCB1bmRlZmluZWQpICYmXG4gICAgICAgIChyLmRlZXBEaXZlTW9kZXMgYXMgRGVlcERpdmVNb2RlW10pLmxlbmd0aCA+IDBcbiAgICAgICAgICA/IChyLmRlZXBEaXZlTW9kZXMgYXMgRGVlcERpdmVNb2RlW10pXG4gICAgICAgICAgOiBERUZBVUxUX0RFRVBfRElWRV9NT0RFUztcblxuICAgICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgd3JhcHBlci5pZCA9ICdnZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3InO1xuICAgICAgd3JhcHBlci5jbGFzc05hbWUgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJztcblxuICAgICAgY29uc3Qgc2VsZWN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2VsZWN0Jyk7XG4gICAgICBzZWxlY3QuaWQgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlJztcbiAgICAgIHNlbGVjdC50aXRsZSA9ICfmt7Hmjpjjgorjg6Ljg7zjg4knO1xuICAgICAgc2VsZWN0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICfmt7Hmjpjjgorjg6Ljg7zjg4knKTtcblxuICAgICAgbW9kZXMuZm9yRWFjaCgobW9kZSkgPT4ge1xuICAgICAgICBjb25zdCBvcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0aW9uLnZhbHVlID0gbW9kZS5pZDtcbiAgICAgICAgb3B0aW9uLnRleHRDb250ZW50ID0gbW9kZS5pZDtcbiAgICAgICAgc2VsZWN0LmFwcGVuZENoaWxkKG9wdGlvbik7XG4gICAgICB9KTtcblxuICAgICAgc2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5zZXQoeyBjdXJyZW50RGVlcERpdmVNb2RlSWQ6IHNlbGVjdC52YWx1ZSB9KTtcbiAgICAgIH0pO1xuXG4gICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKHNlbGVjdCk7XG5cbiAgICAgIGNvbnN0IGFkZEJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OV44Kh44Kk44OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCLov73liqBcIl0nXG4gICAgICApO1xuICAgICAgY29uc3QgdG9vbHNCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODhOODvOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiVG9vbFwiXSdcbiAgICAgICk7XG4gICAgICBjb25zdCBpbnNlcnRBZnRlciA9IHRvb2xzQnV0dG9uIHx8IChhZGRCdXR0b24gJiYgYWRkQnV0dG9uLm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGwpO1xuICAgICAgaWYgKGluc2VydEFmdGVyICYmIGluc2VydEFmdGVyLnBhcmVudEVsZW1lbnQpIHtcbiAgICAgICAgaW5zZXJ0QWZ0ZXIucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUod3JhcHBlciwgaW5zZXJ0QWZ0ZXIubmV4dFNpYmxpbmcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgaW5wdXRBcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAgICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICAgICApO1xuICAgICAgICBpZiAoaW5wdXRBcmVhKSB7XG4gICAgICAgICAgY29uc3QgcGFyZW50ID1cbiAgICAgICAgICAgIGlucHV0QXJlYS5jbG9zZXN0KCdmb3JtJykgfHxcbiAgICAgICAgICAgIGlucHV0QXJlYS5wYXJlbnRFbGVtZW50Py5wYXJlbnRFbGVtZW50O1xuICAgICAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUod3JhcHBlciwgcGFyZW50LmZpcnN0Q2hpbGQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdyYXBwZXIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdyYXBwZXIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKTtcbiAgICAgIGNvbnN0IHVybE1vZGVJZCA9IHVybFBhcmFtcy5nZXQoJ21vZGVfaWQnKTtcbiAgICAgIGxldCBtb2RlSWQgPSByLmN1cnJlbnREZWVwRGl2ZU1vZGVJZCBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICBpZiAodXJsTW9kZUlkICYmIG1vZGVzLnNvbWUoKG0pID0+IG0uaWQgPT09IHVybE1vZGVJZCkpIHtcbiAgICAgICAgbW9kZUlkID0gdXJsTW9kZUlkO1xuICAgICAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IGN1cnJlbnREZWVwRGl2ZU1vZGVJZDogdXJsTW9kZUlkIH0pO1xuICAgICAgfVxuICAgICAgaWYgKG1vZGVJZCAmJiBtb2Rlcy5zb21lKChtKSA9PiBtLmlkID09PSBtb2RlSWQpKSB7XG4gICAgICAgIHNlbGVjdC52YWx1ZSA9IG1vZGVJZDtcbiAgICAgIH0gZWxzZSBpZiAobW9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBzZWxlY3QudmFsdWUgPSBtb2Rlc1swXS5pZDtcbiAgICAgIH1cbiAgICB9XG4gICk7XG59XG5cbmxldCBkZWVwRGl2ZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZURlZXBEaXZlKCk6IHZvaWQge1xuICBhZGREZWVwRGl2ZVN0eWxlcygpO1xuXG4gIGNvbnN0IHRyeUluamVjdE1vZGVTZWxlY3RvciA9ICgpID0+IHtcbiAgICBjb25zdCBoYXNCdXR0b25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcbiAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg4Tjg7zjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlRvb2xcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIuODleOCoeOCpOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwi6L+95YqgXCJdJ1xuICAgICk7XG4gICAgaWYgKFxuICAgICAgaGFzQnV0dG9ucyB8fFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nKVxuICAgICkge1xuICAgICAgaW5qZWN0TW9kZVNlbGVjdG9yKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNldFRpbWVvdXQodHJ5SW5qZWN0TW9kZVNlbGVjdG9yLCA1MDApO1xuICAgIH1cbiAgfTtcbiAgdHJ5SW5qZWN0TW9kZVNlbGVjdG9yKCk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBuYW1lc3BhY2UpID0+IHtcbiAgICBpZiAoXG4gICAgICBuYW1lc3BhY2UgPT09ICdzeW5jJyAmJlxuICAgICAgY2hhbmdlcy5kZWVwRGl2ZU1vZGVzICYmXG4gICAgICBsb2NhdGlvbi5ocmVmLmluY2x1ZGVzKCdnZW1pbmkuZ29vZ2xlLmNvbScpICYmXG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OE44O844OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJUb29sXCJdLCBkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgICAgIClcbiAgICApIHtcbiAgICAgIGluamVjdE1vZGVTZWxlY3RvcigpO1xuICAgIH1cbiAgfSk7XG5cbiAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgbGV0IHNob3VsZFVwZGF0ZSA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgbXV0YXRpb24gb2YgbXV0YXRpb25zKSB7XG4gICAgICBpZiAobXV0YXRpb24uYWRkZWROb2Rlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBtdXRhdGlvbi5hZGRlZE5vZGVzKSB7XG4gICAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IGVsID0gbm9kZSBhcyBFbGVtZW50O1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICBlbC5tYXRjaGVzPy4oJ1tkYXRhLXBhdGgtdG8tbm9kZV0nKSB8fFxuICAgICAgICAgICAgICBlbC5xdWVyeVNlbGVjdG9yPy4oJ1tkYXRhLXBhdGgtdG8tbm9kZV0nKVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIHNob3VsZFVwZGF0ZSA9IHRydWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHNob3VsZFVwZGF0ZSkgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHNob3VsZFVwZGF0ZSkge1xuICAgICAgaWYgKGRlZXBEaXZlVGltZXIpIGNsZWFyVGltZW91dChkZWVwRGl2ZVRpbWVyKTtcbiAgICAgIGRlZXBEaXZlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IGFkZERlZXBEaXZlQnV0dG9ucygpLCA1MDApO1xuICAgIH1cbiAgfSk7XG5cbiAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcblxuICBzZXRUaW1lb3V0KCgpID0+IGFkZERlZXBEaXZlQnV0dG9ucygpLCAxMDAwKTtcbn1cbiIsIi8vIE1hcCB2aWV3IC0gZml4ZWQgcmlnaHQtc2lkZSBwYW5lbCBzaG93aW5nIGN1cnJlbnQgY2hhdCBvdXRsaW5lIHdpdGggc2Nyb2xsIGhpZ2hsaWdodFxuXG5sZXQgbWFwTW9kZSA9IGZhbHNlO1xuY29uc3QgTUFQX1BBTkVMX0lEID0gJ2dlbWluaS1tYXAtcGFuZWwnO1xuY29uc3QgTUFQX1NUWUxFX0lEID0gJ2dlbWluaS1tYXAtc3R5bGVzJztcblxuZnVuY3Rpb24gaW5qZWN0TWFwU3R5bGVzKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1NUWUxFX0lEKSkgcmV0dXJuO1xuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gIHN0eWxlLmlkID0gTUFQX1NUWUxFX0lEO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICByaWdodDogMTZweDtcbiAgICAgIHRvcDogNjBweDtcbiAgICAgIGJvdHRvbTogMTZweDtcbiAgICAgIHdpZHRoOiAyNDBweDtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjQ4LCAyNDksIDI1MCwgMC45NSk7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDAsIDAsIDAsIDAuMSk7XG4gICAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xuICAgICAgYm94LXNoYWRvdzogMCAycHggMTJweCByZ2JhKDAsIDAsIDAsIDAuMSk7XG4gICAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgICAgei1pbmRleDogMTAwO1xuICAgICAgcGFkZGluZzogNnB4IDRweDtcbiAgICAgIGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuICAgICAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDhweCk7XG4gICAgfVxuICAgIC5kYXJrLXRoZW1lICNnZW1pbmktbWFwLXBhbmVsIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMzIsIDMzLCAzNiwgMC45NSk7XG4gICAgICBib3JkZXItY29sb3I6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xMik7XG4gICAgICBib3gtc2hhZG93OiAwIDJweCAxMnB4IHJnYmEoMCwgMCwgMCwgMC40KTtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgLm1hcC1oZWFkZXIge1xuICAgICAgZGlzcGxheTogbm9uZTtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgdWwge1xuICAgICAgbGlzdC1zdHlsZTogbm9uZTtcbiAgICAgIG1hcmdpbjogMDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIGxpIGJ1dHRvbiB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIGJhY2tncm91bmQ6IG5vbmU7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBib3JkZXItbGVmdDogMnB4IHNvbGlkIHRyYW5zcGFyZW50O1xuICAgICAgYm9yZGVyLXJhZGl1czogMCA2cHggNnB4IDA7XG4gICAgICBwYWRkaW5nOiA1cHggMTBweCA1cHggOHB4O1xuICAgICAgbWFyZ2luOiAxcHggMDtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIGZvbnQtc2l6ZTogMTVweDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjM1O1xuICAgICAgY29sb3I6IGluaGVyaXQ7XG4gICAgICBmb250LWZhbWlseTogaW5oZXJpdDtcbiAgICAgIHdvcmQtYnJlYWs6IGJyZWFrLXdvcmQ7XG4gICAgICBvcGFjaXR5OiAwLjU7XG4gICAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kIDAuMTVzLCBvcGFjaXR5IDAuMTVzLCBib3JkZXItY29sb3IgMC4xNXM7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIGxpIGJ1dHRvbjpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDEyOCwgMTI4LCAxMjgsIDAuMTIpO1xuICAgICAgb3BhY2l0eTogMC44NTtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uLm1hcC1pdGVtLWN1cnJlbnQge1xuICAgICAgb3BhY2l0eTogMTtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjYsIDExNSwgMjMyLCAwLjA4KTtcbiAgICAgIGJvcmRlci1sZWZ0LWNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b24gLm1hcC10dXJuLWluZGV4IHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgIG1pbi13aWR0aDogMThweDtcbiAgICAgIGZvbnQtc2l6ZTogMTBweDtcbiAgICAgIG9wYWNpdHk6IDAuNTtcbiAgICAgIG1hcmdpbi1yaWdodDogM3B4O1xuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmZ1bmN0aW9uIGdldFByb21wdFRleHQodXNlclF1ZXJ5OiBFbGVtZW50KTogc3RyaW5nIHtcbiAgY29uc3QgaGVhZGluZyA9IHVzZXJRdWVyeS5xdWVyeVNlbGVjdG9yKCdoMSwgaDIsIGgzLCBbcm9sZT1cImhlYWRpbmdcIl0nKTtcbiAgbGV0IHRleHQgPVxuICAgIChoZWFkaW5nIGFzIEhUTUxFbGVtZW50KT8udGV4dENvbnRlbnQ/LnRyaW0oKSB8fFxuICAgICh1c2VyUXVlcnkgYXMgSFRNTEVsZW1lbnQpLnRleHRDb250ZW50Py50cmltKCkgfHxcbiAgICAnJztcbiAgdGV4dCA9IHRleHQucmVwbGFjZSgvXuOBguOBquOBn+OBruODl+ODreODs+ODl+ODiFxccyovLCAnJyk7XG4gIHRleHQgPSB0ZXh0LnJlcGxhY2UoL14+XFxzKi8sICcnKTtcbiAgcmV0dXJuIHRleHQuc3Vic3RyaW5nKDAsIDYwKSB8fCAnKOepuiknO1xufVxuXG5mdW5jdGlvbiBnZXRDb252ZXJzYXRpb25Db250YWluZXJzKCk6IEhUTUxFbGVtZW50W10ge1xuICByZXR1cm4gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICdpbmZpbml0ZS1zY3JvbGxlci5jaGF0LWhpc3RvcnkgPiAuY29udmVyc2F0aW9uLWNvbnRhaW5lcidcbiAgICApXG4gICk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkTWFwUGFuZWwoKTogSFRNTERpdkVsZW1lbnQge1xuICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBwYW5lbC5pZCA9IE1BUF9QQU5FTF9JRDtcblxuICBjb25zdCBoZWFkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgaGVhZGVyLmNsYXNzTmFtZSA9ICdtYXAtaGVhZGVyJztcbiAgaGVhZGVyLnRleHRDb250ZW50ID0gJ+OBk+OBruODgeODo+ODg+ODiOOBrua1geOCjCc7XG4gIHBhbmVsLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cbiAgY29uc3QgY29udGFpbmVycyA9IGdldENvbnZlcnNhdGlvbkNvbnRhaW5lcnMoKTtcblxuICBpZiAoY29udGFpbmVycy5sZW5ndGggPT09IDApIHtcbiAgICBjb25zdCBlbXB0eSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGVtcHR5LnN0eWxlLmNzc1RleHQgPSAncGFkZGluZzogMTBweDsgb3BhY2l0eTogMC40NTsgZm9udC1zaXplOiAxMnB4Oyc7XG4gICAgZW1wdHkudGV4dENvbnRlbnQgPSAn44OB44Oj44OD44OI44GM44G+44Gg44GC44KK44G+44Gb44KTJztcbiAgICBwYW5lbC5hcHBlbmRDaGlsZChlbXB0eSk7XG4gICAgcmV0dXJuIHBhbmVsO1xuICB9XG5cbiAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3VsJyk7XG5cbiAgY29udGFpbmVycy5mb3JFYWNoKChjb250YWluZXIsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgdXNlclF1ZXJ5ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJ3VzZXItcXVlcnknKTtcbiAgICBpZiAoIXVzZXJRdWVyeSkgcmV0dXJuO1xuXG4gICAgY29uc3QgcHJvbXB0VGV4dCA9IGdldFByb21wdFRleHQodXNlclF1ZXJ5KTtcbiAgICBjb25zdCBsaSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG4gICAgY29uc3QgYnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG5cbiAgICBjb25zdCBpbmRleFNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgaW5kZXhTcGFuLmNsYXNzTmFtZSA9ICdtYXAtdHVybi1pbmRleCc7XG4gICAgaW5kZXhTcGFuLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfS5gO1xuXG4gICAgYnRuLmFwcGVuZENoaWxkKGluZGV4U3Bhbik7XG4gICAgYnRuLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHByb21wdFRleHQpKTtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBjb250YWluZXIuc2Nyb2xsSW50b1ZpZXcoeyBiZWhhdmlvcjogJ3Ntb290aCcsIGJsb2NrOiAnc3RhcnQnIH0pO1xuICAgIH0pO1xuXG4gICAgbGkuYXBwZW5kQ2hpbGQoYnRuKTtcbiAgICBsaXN0LmFwcGVuZENoaWxkKGxpKTtcbiAgfSk7XG5cbiAgcGFuZWwuYXBwZW5kQ2hpbGQobGlzdCk7XG4gIHJldHVybiBwYW5lbDtcbn1cblxuZnVuY3Rpb24gZ2V0TWFwQnV0dG9ucygpOiBIVE1MQnV0dG9uRWxlbWVudFtdIHtcbiAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBpZiAoIXBhbmVsKSByZXR1cm4gW107XG4gIHJldHVybiBBcnJheS5mcm9tKHBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdsaSBidXR0b24nKSk7XG59XG5cbmxldCBpbnRlcnNlY3Rpb25PYnNlcnZlcjogSW50ZXJzZWN0aW9uT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcbmNvbnN0IHZpc2libGVUdXJucyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5mdW5jdGlvbiBzZXR1cEludGVyc2VjdGlvbk9ic2VydmVyKCk6IHZvaWQge1xuICBpZiAoaW50ZXJzZWN0aW9uT2JzZXJ2ZXIpIGludGVyc2VjdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgdmlzaWJsZVR1cm5zLmNsZWFyKCk7XG5cbiAgY29uc3QgY29udGFpbmVycyA9IGdldENvbnZlcnNhdGlvbkNvbnRhaW5lcnMoKTtcbiAgaWYgKGNvbnRhaW5lcnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgaW50ZXJzZWN0aW9uT2JzZXJ2ZXIgPSBuZXcgSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoXG4gICAgKGVudHJpZXMpID0+IHtcbiAgICAgIGVudHJpZXMuZm9yRWFjaCgoZW50cnkpID0+IHtcbiAgICAgICAgY29uc3QgaW5kZXggPSBjb250YWluZXJzLmluZGV4T2YoZW50cnkudGFyZ2V0IGFzIEhUTUxFbGVtZW50KTtcbiAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgcmV0dXJuO1xuICAgICAgICBpZiAoZW50cnkuaXNJbnRlcnNlY3RpbmcpIHtcbiAgICAgICAgICB2aXNpYmxlVHVybnMuYWRkKGluZGV4KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2aXNpYmxlVHVybnMuZGVsZXRlKGluZGV4KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGJ1dHRvbnMgPSBnZXRNYXBCdXR0b25zKCk7XG4gICAgICBidXR0b25zLmZvckVhY2goKGJ0biwgaSkgPT4ge1xuICAgICAgICBidG4uY2xhc3NMaXN0LnRvZ2dsZSgnbWFwLWl0ZW0tY3VycmVudCcsIHZpc2libGVUdXJucy5oYXMoaSkpO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgICAgIGlmIChwYW5lbCkge1xuICAgICAgICBjb25zdCBmaXJzdEhpZ2hsaWdodGVkID0gYnV0dG9ucy5maW5kKChfLCBpKSA9PiB2aXNpYmxlVHVybnMuaGFzKGkpKTtcbiAgICAgICAgaWYgKGZpcnN0SGlnaGxpZ2h0ZWQpIHtcbiAgICAgICAgICBmaXJzdEhpZ2hsaWdodGVkLnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICduZWFyZXN0JywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICB7IHRocmVzaG9sZDogMC4xNSB9XG4gICk7XG5cbiAgY29udGFpbmVycy5mb3JFYWNoKChjKSA9PiBpbnRlcnNlY3Rpb25PYnNlcnZlciEub2JzZXJ2ZShjKSk7XG59XG5cbmZ1bmN0aW9uIHN0b3BJbnRlcnNlY3Rpb25PYnNlcnZlcigpOiB2b2lkIHtcbiAgaWYgKGludGVyc2VjdGlvbk9ic2VydmVyKSB7XG4gICAgaW50ZXJzZWN0aW9uT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgIGludGVyc2VjdGlvbk9ic2VydmVyID0gbnVsbDtcbiAgfVxuICB2aXNpYmxlVHVybnMuY2xlYXIoKTtcbn1cblxubGV0IGNoYXRPYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBzdGFydENoYXRPYnNlcnZlcigpOiB2b2lkIHtcbiAgaWYgKGNoYXRPYnNlcnZlcikgY2hhdE9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcblxuICBjb25zdCBjaGF0SGlzdG9yeSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2luZmluaXRlLXNjcm9sbGVyLmNoYXQtaGlzdG9yeScpO1xuICBpZiAoIWNoYXRIaXN0b3J5KSByZXR1cm47XG5cbiAgbGV0IGRlYm91bmNlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbiAgY2hhdE9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgIGlmICghbWFwTW9kZSkgcmV0dXJuO1xuICAgIGlmIChkZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQoZGVib3VuY2VUaW1lcik7XG4gICAgZGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcmVmcmVzaE1hcCgpLCAzMDApO1xuICB9KTtcblxuICBjaGF0T2JzZXJ2ZXIub2JzZXJ2ZShjaGF0SGlzdG9yeSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IGZhbHNlIH0pO1xufVxuXG5mdW5jdGlvbiBzdG9wQ2hhdE9ic2VydmVyKCk6IHZvaWQge1xuICBpZiAoY2hhdE9ic2VydmVyKSB7XG4gICAgY2hhdE9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICBjaGF0T2JzZXJ2ZXIgPSBudWxsO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlZnJlc2hNYXAoKTogdm9pZCB7XG4gIGlmICghbWFwTW9kZSkgcmV0dXJuO1xuXG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgY29uc3Qgc2F2ZWRTY3JvbGwgPSBleGlzdGluZyA/IGV4aXN0aW5nLnNjcm9sbFRvcCA6IDA7XG4gIGlmIChleGlzdGluZykgZXhpc3RpbmcucmVtb3ZlKCk7XG5cbiAgc3RvcEludGVyc2VjdGlvbk9ic2VydmVyKCk7XG5cbiAgY29uc3QgcGFuZWwgPSBidWlsZE1hcFBhbmVsKCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICBwYW5lbC5zY3JvbGxUb3AgPSBzYXZlZFNjcm9sbDtcblxuICBzZXR1cEludGVyc2VjdGlvbk9ic2VydmVyKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG93TWFwKCk6IHZvaWQge1xuICBpbmplY3RNYXBTdHlsZXMoKTtcblxuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGlmIChleGlzdGluZykgZXhpc3RpbmcucmVtb3ZlKCk7XG5cbiAgY29uc3QgcGFuZWwgPSBidWlsZE1hcFBhbmVsKCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuICBtYXBNb2RlID0gdHJ1ZTtcblxuICBzZXR1cEludGVyc2VjdGlvbk9ic2VydmVyKCk7XG4gIHN0YXJ0Q2hhdE9ic2VydmVyKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNldE1hcE1vZGUoKTogdm9pZCB7XG4gIHN0b3BDaGF0T2JzZXJ2ZXIoKTtcbiAgc3RvcEludGVyc2VjdGlvbk9ic2VydmVyKCk7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgaWYgKHBhbmVsKSBwYW5lbC5yZW1vdmUoKTtcbiAgbWFwTW9kZSA9IGZhbHNlO1xufVxuIiwiLy8gRE9N5qeL6YCg44KSQUnjgqjjg7zjgrjjgqfjg7Pjg4jjgYzoqo3orZjjgafjgY3jgovlvaLlvI/jgaflh7rliptcblxudHlwZSBFbGVtZW50VHlwZSA9XG4gIHwgJ3RleHRhcmVhJ1xuICB8ICdzaWRlYmFyJ1xuICB8ICdzaWRlYmFyVG9nZ2xlJ1xuICB8ICdjaGF0SGlzdG9yeSdcbiAgfCAnbmV3Q2hhdEJ1dHRvbidcbiAgfCAnY29weUJ1dHRvbnMnXG4gIHwgJ2NoYXRDb250YWluZXInO1xuXG5pbnRlcmZhY2UgRmluZEVsZW1lbnRSZXN1bHQge1xuICBlbGVtZW50OiBFbGVtZW50IHwgbnVsbDtcbiAgc2VsZWN0b3I6IHN0cmluZyB8IG51bGw7XG59XG5cbmludGVyZmFjZSBJbnRlcmFjdGl2ZUVsZW1lbnQge1xuICBpbmRleDogbnVtYmVyO1xuICB0eXBlOiBzdHJpbmc7XG4gIHJvbGU6IHN0cmluZztcbiAgYXJpYUxhYmVsOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgaXNWaXNpYmxlOiBib29sZWFuO1xuICBwb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xufVxuXG5jbGFzcyBET01BbmFseXplciB7XG4gIHByaXZhdGUgZWxlbWVudFNlbGVjdG9yczogUmVjb3JkPEVsZW1lbnRUeXBlLCBzdHJpbmdbXT47XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5lbGVtZW50U2VsZWN0b3JzID0ge1xuICAgICAgdGV4dGFyZWE6IFtcbiAgICAgICAgJ1tyb2xlPVwidGV4dGJveFwiXVtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyxcbiAgICAgICAgJ1thcmlhLWxhYmVsKj1cIuODl+ODreODs+ODl+ODiFwiXScsXG4gICAgICAgICcucWwtZWRpdG9yLnRleHRhcmVhJyxcbiAgICAgICAgJ3JpY2gtdGV4dGFyZWEgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nLFxuICAgICAgXSxcbiAgICAgIHNpZGViYXI6IFtcbiAgICAgICAgJ1tyb2xlPVwibmF2aWdhdGlvblwiXScsXG4gICAgICAgICdiYXJkLXNpZGVuYXYnLFxuICAgICAgICAnLnNpZGUtbmF2LWNvbnRhaW5lcicsXG4gICAgICAgICdhc2lkZScsXG4gICAgICBdLFxuICAgICAgc2lkZWJhclRvZ2dsZTogW1xuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44Oh44Kk44Oz44Oh44OL44Ol44O8XCJdJyxcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIk1haW4gbWVudVwiXScsXG4gICAgICAgICdidXR0b25bZGF0YS10ZXN0LWlkPVwic2lkZS1uYXYtbWVudS1idXR0b25cIl0nLFxuICAgICAgXSxcbiAgICAgIGNoYXRIaXN0b3J5OiBbXG4gICAgICAgICcuY29udmVyc2F0aW9uW3JvbGU9XCJidXR0b25cIl0nLFxuICAgICAgICAnW2RhdGEtdGVzdC1pZD1cImNvbnZlcnNhdGlvblwiXScsXG4gICAgICAgICcuY29udmVyc2F0aW9uLWl0ZW1zLWNvbnRhaW5lciAuY29udmVyc2F0aW9uJyxcbiAgICAgIF0sXG4gICAgICBuZXdDaGF0QnV0dG9uOiBbXG4gICAgICAgICdhW2hyZWY9XCJodHRwczovL2dlbWluaS5nb29nbGUuY29tL2FwcFwiXScsXG4gICAgICAgICdhW2FyaWEtbGFiZWwqPVwi5paw6KaP5L2c5oiQXCJdJyxcbiAgICAgICAgJ1tkYXRhLXRlc3QtaWQ9XCJuZXctY2hhdC1idXR0b25cIl0nLFxuICAgICAgXSxcbiAgICAgIGNvcHlCdXR0b25zOiBbXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjgrPjg5Tjg7xcIl0nLFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiQ29weVwiXScsXG4gICAgICAgICcuY29weS1idXR0b24nLFxuICAgICAgXSxcbiAgICAgIGNoYXRDb250YWluZXI6IFtcbiAgICAgICAgJ2NoYXQtd2luZG93JyxcbiAgICAgICAgJ21haW4ubWFpbicsXG4gICAgICAgICcuY29udmVyc2F0aW9uLWNvbnRhaW5lcicsXG4gICAgICBdLFxuICAgIH07XG4gIH1cblxuICBmaW5kRWxlbWVudCh0eXBlOiBFbGVtZW50VHlwZSk6IEZpbmRFbGVtZW50UmVzdWx0IHtcbiAgICBjb25zdCBzZWxlY3RvcnMgPSB0aGlzLmVsZW1lbnRTZWxlY3RvcnNbdHlwZV0gfHwgW107XG4gICAgZm9yIChjb25zdCBzZWxlY3RvciBvZiBzZWxlY3RvcnMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICAgICAgaWYgKGVsZW1lbnQpIHJldHVybiB7IGVsZW1lbnQsIHNlbGVjdG9yIH07XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gSW52YWxpZCBzZWxlY3Rvciwgc2tpcFxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4geyBlbGVtZW50OiBudWxsLCBzZWxlY3RvcjogbnVsbCB9O1xuICB9XG5cbiAgZmluZEFsbEVsZW1lbnRzKCk6IFJlY29yZDxFbGVtZW50VHlwZSwgRmluZEVsZW1lbnRSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSB7fSBhcyBSZWNvcmQ8RWxlbWVudFR5cGUsIEZpbmRFbGVtZW50UmVzdWx0PjtcbiAgICBmb3IgKGNvbnN0IHR5cGUgaW4gdGhpcy5lbGVtZW50U2VsZWN0b3JzKSB7XG4gICAgICByZXN1bHRbdHlwZSBhcyBFbGVtZW50VHlwZV0gPSB0aGlzLmZpbmRFbGVtZW50KHR5cGUgYXMgRWxlbWVudFR5cGUpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgY2FwdHVyZVBhZ2VTdHJ1Y3R1cmUoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgIHVybDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICB0aXRsZTogZG9jdW1lbnQudGl0bGUsXG4gICAgICBlbGVtZW50czogdGhpcy5maW5kQWxsRWxlbWVudHMoKSxcbiAgICAgIGludGVyYWN0aXZlRWxlbWVudHM6IHRoaXMuZ2V0SW50ZXJhY3RpdmVFbGVtZW50cygpLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgdmlld3BvcnQ6IHsgd2lkdGg6IHdpbmRvdy5pbm5lcldpZHRoLCBoZWlnaHQ6IHdpbmRvdy5pbm5lckhlaWdodCB9LFxuICAgICAgICBzY3JvbGxQb3NpdGlvbjogeyB4OiB3aW5kb3cuc2Nyb2xsWCwgeTogd2luZG93LnNjcm9sbFkgfSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIGdldEludGVyYWN0aXZlRWxlbWVudHMoKTogSW50ZXJhY3RpdmVFbGVtZW50W10ge1xuICAgIGNvbnN0IGVsZW1lbnRzOiBJbnRlcmFjdGl2ZUVsZW1lbnRbXSA9IFtdO1xuICAgIGNvbnN0IHNlbGVjdG9yID1cbiAgICAgICdidXR0b24sIGEsIGlucHV0LCB0ZXh0YXJlYSwgW3JvbGU9XCJidXR0b25cIl0sIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJztcbiAgICBjb25zdCBpbnRlcmFjdGl2ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcblxuICAgIGludGVyYWN0aXZlcy5mb3JFYWNoKChlbCwgaW5kZXgpID0+IHtcbiAgICAgIGlmIChpbmRleCA+PSA1MCkgcmV0dXJuO1xuICAgICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgaWYgKHJlY3Qud2lkdGggPT09IDAgfHwgcmVjdC5oZWlnaHQgPT09IDApIHJldHVybjtcbiAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICBpbmRleCxcbiAgICAgICAgdHlwZTogZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSB8fCAnJyxcbiAgICAgICAgYXJpYUxhYmVsOiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyxcbiAgICAgICAgdGV4dDogZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5zdWJzdHJpbmcoMCwgNTApIHx8ICcnLFxuICAgICAgICBkZXNjcmlwdGlvbjogZWwuZ2V0QXR0cmlidXRlKCdkZXNjcmlwdGlvbicpIHx8ICcnLFxuICAgICAgICBpc1Zpc2libGU6IHJlY3Qud2lkdGggPiAwICYmIHJlY3QuaGVpZ2h0ID4gMCxcbiAgICAgICAgcG9zaXRpb246IHsgeDogTWF0aC5yb3VuZChyZWN0LngpLCB5OiBNYXRoLnJvdW5kKHJlY3QueSkgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGVsZW1lbnRzO1xuICB9XG5cbiAgZXhwb3J0Rm9yQUkoKTogc3RyaW5nIHtcbiAgICBjb25zdCBzdHJ1Y3R1cmUgPSB0aGlzLmNhcHR1cmVQYWdlU3RydWN0dXJlKCk7XG5cbiAgICBsZXQgb3V0cHV0ID0gYCMjIEdlbWluaSBDaGF0IFBhZ2UgU3RydWN0dXJlXFxuXFxuYDtcbiAgICBvdXRwdXQgKz0gYCoqVVJMKio6ICR7c3RydWN0dXJlLnVybH1cXG5gO1xuICAgIG91dHB1dCArPSBgKipUaXRsZSoqOiAke3N0cnVjdHVyZS50aXRsZX1cXG5cXG5gO1xuICAgIG91dHB1dCArPSBgIyMjIE1haW4gRWxlbWVudHNcXG5cXG5gO1xuXG4gICAgZm9yIChjb25zdCBbdHlwZSwgZGF0YV0gb2YgT2JqZWN0LmVudHJpZXMoc3RydWN0dXJlLmVsZW1lbnRzKSkge1xuICAgICAgaWYgKGRhdGEuZWxlbWVudCkge1xuICAgICAgICBvdXRwdXQgKz0gYC0gKioke3R5cGV9Kio6IFxcYCR7ZGF0YS5zZWxlY3Rvcn1cXGAg4pyTXFxuYDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dCArPSBgLSAqKiR7dHlwZX0qKjogTm90IGZvdW5kIOKcl1xcbmA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgb3V0cHV0ICs9IGBcXG4jIyMgSW50ZXJhY3RpdmUgRWxlbWVudHMgKCR7c3RydWN0dXJlLmludGVyYWN0aXZlRWxlbWVudHMubGVuZ3RofSlcXG5cXG5gO1xuICAgIHN0cnVjdHVyZS5pbnRlcmFjdGl2ZUVsZW1lbnRzLnNsaWNlKDAsIDEwKS5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgaWYgKGVsLnRleHQpIHtcbiAgICAgICAgb3V0cHV0ICs9IGAtIFske2VsLnR5cGV9XSAke2VsLnRleHR9ICgke2VsLmFyaWFMYWJlbCB8fCBlbC5yb2xlfSlcXG5gO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIG91dHB1dDtcbiAgfVxuXG4gIGFzeW5jIGNvcHlUb0NsaXBib2FyZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCB0ZXh0ID0gdGhpcy5leHBvcnRGb3JBSSgpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0KTtcbiAgICAgIHRoaXMuc2hvd05vdGlmaWNhdGlvbign44Oa44O844K45qeL6YCg44KS44Kv44Oq44OD44OX44Oc44O844OJ44Gr44Kz44OU44O844GX44G+44GX44GfJyk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRoaXMuc2hvd05vdGlmaWNhdGlvbign44Kz44OU44O844Gr5aSx5pWX44GX44G+44GX44GfJywgJ2Vycm9yJyk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgc2hvd05vdGlmaWNhdGlvbihtZXNzYWdlOiBzdHJpbmcsIHR5cGU6ICdzdWNjZXNzJyB8ICdlcnJvcicgPSAnc3VjY2VzcycpOiB2b2lkIHtcbiAgICBjb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBub3RpZmljYXRpb24uc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIHRvcDogMjBweDtcbiAgICAgIHJpZ2h0OiAyMHB4O1xuICAgICAgYmFja2dyb3VuZDogJHt0eXBlID09PSAnZXJyb3InID8gJyNmNDQzMzYnIDogJyM0Q0FGNTAnfTtcbiAgICAgIGNvbG9yOiB3aGl0ZTtcbiAgICAgIHBhZGRpbmc6IDE2cHggMjRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIHotaW5kZXg6IDEwMDAwO1xuICAgICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsMCwwLDAuMyk7XG4gICAgICBmb250LWZhbWlseTogc3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBzYW5zLXNlcmlmO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgYW5pbWF0aW9uOiBzbGlkZUluIDAuM3MgZWFzZS1vdXQ7XG4gICAgYDtcbiAgICBub3RpZmljYXRpb24udGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgQGtleWZyYW1lcyBzbGlkZUluIHtcbiAgICAgICAgZnJvbSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCg0MDBweCk7IG9wYWNpdHk6IDA7IH1cbiAgICAgICAgdG8geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7IG9wYWNpdHk6IDE7IH1cbiAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobm90aWZpY2F0aW9uKTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgbm90aWZpY2F0aW9uLnN0eWxlLnRyYW5zaXRpb24gPSAnb3BhY2l0eSAwLjNzJztcbiAgICAgIG5vdGlmaWNhdGlvbi5zdHlsZS5vcGFjaXR5ID0gJzAnO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBub3RpZmljYXRpb24ucmVtb3ZlKCksIDMwMCk7XG4gICAgfSwgMzAwMCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVET01BbmFseXplcigpOiB2b2lkIHtcbiAgd2luZG93LmRvbUFuYWx5emVyID0gbmV3IERPTUFuYWx5emVyKCk7XG4gIHdpbmRvdy5hbmFseXplUGFnZSA9ICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyh3aW5kb3cuZG9tQW5hbHl6ZXIhLmNhcHR1cmVQYWdlU3RydWN0dXJlKCkpO1xuICB9O1xuICB3aW5kb3cuY29weVBhZ2VTdHJ1Y3R1cmUgPSAoKSA9PiB7XG4gICAgd2luZG93LmRvbUFuYWx5emVyIS5jb3B5VG9DbGlwYm9hcmQoKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IGluaXRpYWxpemVLZXlib2FyZEhhbmRsZXJzLCByZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vc3JjL2tleWJvYXJkJztcbmltcG9ydCB7IGluaXRpYWxpemVDaGF0UGFnZSB9IGZyb20gJy4uLy4uL3NyYy9jaGF0JztcbmltcG9ydCB7IGluaXRpYWxpemVBdXRvY29tcGxldGUsIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUgfSBmcm9tICcuLi8uLi9zcmMvYXV0b2NvbXBsZXRlJztcbmltcG9ydCB7IGluaXRpYWxpemVEZWVwRGl2ZSB9IGZyb20gJy4uLy4uL3NyYy9kZWVwLWRpdmUnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZUV4cG9ydCB9IGZyb20gJy4uLy4uL3NyYy9leHBvcnQnO1xuaW1wb3J0IHsgc2hvd01hcCwgcmVzZXRNYXBNb2RlIH0gZnJvbSAnLi4vLi4vc3JjL21hcCc7XG5pbXBvcnQgeyBpbml0aWFsaXplU2VhcmNoUGFnZSwgaXNTZWFyY2hQYWdlIH0gZnJvbSAnLi4vLi4vc3JjL3NlYXJjaCc7XG5pbXBvcnQgeyBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUgfSBmcm9tICcuLi8uLi9zcmMvaGlzdG9yeSc7XG5pbXBvcnQgeyBpbml0aWFsaXplRE9NQW5hbHl6ZXIgfSBmcm9tICcuLi8uLi9zcmMvZG9tLWFuYWx5emVyJztcbmltcG9ydCB7IGluaXRpYWxpemVRdWlja1Byb21wdHMgfSBmcm9tICcuLi8uLi9zcmMvcXVpY2stcHJvbXB0cyc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbXG4gICAgJ2h0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwKicsXG4gICAgJ2h0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vc2VhcmNoKicsXG4gIF0sXG4gIHJ1bkF0OiAnZG9jdW1lbnRfZW5kJyxcblxuICBtYWluKCkge1xuICAgIC8vIEV4cG9zZSB3aW5kb3cgZ2xvYmFscyB1c2VkIGFjcm9zcyBtb2R1bGVzXG4gICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24gPSByZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uO1xuXG4gICAgaW5pdGlhbGl6ZURPTUFuYWx5emVyKCk7XG4gICAgaW5pdGlhbGl6ZSgpO1xuICB9LFxufSk7XG5cbmZ1bmN0aW9uIGFwcGx5Q3VzdG9tU3R5bGVzKCk6IHZvaWQge1xuICBjb25zdCBzdHlsZUlkID0gJ2dlbWluaS1pbXByb3ZlLXVpLWN1c3RvbS1zdHlsZXMnO1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChzdHlsZUlkKT8ucmVtb3ZlKCk7XG5cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICBzdHlsZS5pZCA9IHN0eWxlSWQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5nZW1zLWxpc3QtY29udGFpbmVyIHtcbiAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICB9XG4gICAgLnNpZGUtbmF2LWVudHJ5LWNvbnRhaW5lciB7XG4gICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIGNoYXQtd2luZG93IHtcbiAgICAgIG1heC13aWR0aDogdmFyKC0tY2hhdC1tYXgtd2lkdGgsIDkwMHB4KSAhaW1wb3J0YW50O1xuICAgICAgbWFyZ2luLWxlZnQ6IDAgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1yaWdodDogYXV0byAhaW1wb3J0YW50O1xuICAgIH1cbiAgICAuY29udmVyc2F0aW9uLWNvbnRhaW5lciB7XG4gICAgICBtYXgtd2lkdGg6IHZhcigtLWNoYXQtbWF4LXdpZHRoLCA5MDBweCkgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tcmlnaHQ6IGF1dG8gIWltcG9ydGFudDtcbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDaGF0V2lkdGgod2lkdGg6IG51bWJlcik6IHZvaWQge1xuICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tY2hhdC1tYXgtd2lkdGgnLCBgJHt3aWR0aH1weGApO1xufVxuXG5mdW5jdGlvbiBsb2FkQ2hhdFdpZHRoKCk6IHZvaWQge1xuICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChbJ2NoYXRXaWR0aCddLCAocmVzdWx0KSA9PiB7XG4gICAgdXBkYXRlQ2hhdFdpZHRoKHJlc3VsdC5jaGF0V2lkdGggfHwgOTAwKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGluaXRpYWxpemUoKTogdm9pZCB7XG4gIGxvYWRDaGF0V2lkdGgoKTtcbiAgYXBwbHlDdXN0b21TdHlsZXMoKTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9wc3RhdGUnLCAoKSA9PiB7XG4gICAgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gIH0pO1xuXG4gIGxldCBsYXN0VXJsID0gbG9jYXRpb24uaHJlZjtcbiAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgIGNvbnN0IGN1cnJlbnRVcmwgPSBsb2NhdGlvbi5ocmVmO1xuICAgIGlmIChjdXJyZW50VXJsICE9PSBsYXN0VXJsKSB7XG4gICAgICBsYXN0VXJsID0gY3VycmVudFVybDtcblxuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LigtMSk7XG4gICAgICByZXNldE1hcE1vZGUoKTtcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgICAgICAgaW5pdGlhbGl6ZVNlYXJjaEF1dG9jb21wbGV0ZSgpO1xuICAgICAgICBpZiAoIWlzU2VhcmNoUGFnZSgpKSB7XG4gICAgICAgICAgc2hvd01hcCgpO1xuICAgICAgICAgIGluaXRpYWxpemVRdWlja1Byb21wdHMoKTtcbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2VtaW5pLWV4cG9ydC1ub3RlLWJ1dHRvbicpPy5yZW1vdmUoKTtcbiAgICAgICAgaW5pdGlhbGl6ZUV4cG9ydCgpO1xuICAgICAgfSwgMTUwMCk7XG4gICAgfVxuICB9KS5vYnNlcnZlKGRvY3VtZW50LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcblxuICBpbml0aWFsaXplS2V5Ym9hcmRIYW5kbGVycygpO1xuXG4gIGlmIChpc1NlYXJjaFBhZ2UoKSkge1xuICAgIGluaXRpYWxpemVTZWFyY2hQYWdlKCk7XG4gICAgaW5pdGlhbGl6ZVNlYXJjaEF1dG9jb21wbGV0ZSgpO1xuICB9IGVsc2Uge1xuICAgIGluaXRpYWxpemVDaGF0UGFnZSgpO1xuICAgIGluaXRpYWxpemVEZWVwRGl2ZSgpO1xuICAgIGluaXRpYWxpemVRdWlja1Byb21wdHMoKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGluaXRpYWxpemVFeHBvcnQoKTtcbiAgICB9LCAxNTAwKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHNob3dNYXAoKTtcbiAgICB9LCAxNTAwKTtcbiAgfVxuXG4gIGNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgbmFtZXNwYWNlKSA9PiB7XG4gICAgaWYgKG5hbWVzcGFjZSA9PT0gJ3N5bmMnICYmIGNoYW5nZXMuY2hhdFdpZHRoKSB7XG4gICAgICB1cGRhdGVDaGF0V2lkdGgoY2hhbmdlcy5jaGF0V2lkdGgubmV3VmFsdWUpO1xuICAgICAgYXBwbHlDdXN0b21TdHlsZXMoKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9sb2dnZXIudHNcbmZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuXHRpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG5cdGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikgbWV0aG9kKGBbd3h0XSAke2FyZ3Muc2hpZnQoKX1gLCAuLi5hcmdzKTtcblx0ZWxzZSBtZXRob2QoXCJbd3h0XVwiLCAuLi5hcmdzKTtcbn1cbi8qKlxuKiBXcmFwcGVyIGFyb3VuZCBgY29uc29sZWAgd2l0aCBhIFwiW3d4dF1cIiBwcmVmaXhcbiovXG5jb25zdCBsb2dnZXIgPSB7XG5cdGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG5cdGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcblx0d2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG5cdGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgbG9nZ2VyIH07IiwiLy8gI3JlZ2lvbiBzbmlwcGV0XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IGdsb2JhbFRoaXMuYnJvd3Nlcj8ucnVudGltZT8uaWRcbiAgPyBnbG9iYWxUaGlzLmJyb3dzZXJcbiAgOiBnbG9iYWxUaGlzLmNocm9tZTtcbi8vICNlbmRyZWdpb24gc25pcHBldFxuIiwiaW1wb3J0IHsgYnJvd3NlciBhcyBicm93c2VyJDEgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuXG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvbiBBUElzIGluIHlvdXIgcHJvamVjdDpcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSlcbiogYGBgXG4qIEBtb2R1bGUgd3h0L2Jyb3dzZXJcbiovXG5jb25zdCBicm93c2VyID0gYnJvd3NlciQxO1xuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGJyb3dzZXIgfTsiLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5cbi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy50c1xudmFyIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgPSBjbGFzcyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IGV4dGVuZHMgRXZlbnQge1xuXHRzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcblx0Y29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcblx0XHRzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcblx0XHR0aGlzLm5ld1VybCA9IG5ld1VybDtcblx0XHR0aGlzLm9sZFVybCA9IG9sZFVybDtcblx0fVxufTtcbi8qKlxuKiBSZXR1cm5zIGFuIGV2ZW50IG5hbWUgdW5pcXVlIHRvIHRoZSBleHRlbnNpb24gYW5kIGNvbnRlbnQgc2NyaXB0IHRoYXQncyBydW5uaW5nLlxuKi9cbmZ1bmN0aW9uIGdldFVuaXF1ZUV2ZW50TmFtZShldmVudE5hbWUpIHtcblx0cmV0dXJuIGAke2Jyb3dzZXI/LnJ1bnRpbWU/LmlkfToke2ltcG9ydC5tZXRhLmVudi5FTlRSWVBPSU5UfToke2V2ZW50TmFtZX1gO1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQsIGdldFVuaXF1ZUV2ZW50TmFtZSB9OyIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuXG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIudHNcbmNvbnN0IHN1cHBvcnRzTmF2aWdhdGlvbkFwaSA9IHR5cGVvZiBnbG9iYWxUaGlzLm5hdmlnYXRpb24/LmFkZEV2ZW50TGlzdGVuZXIgPT09IFwiZnVuY3Rpb25cIjtcbi8qKlxuKiBDcmVhdGUgYSB1dGlsIHRoYXQgd2F0Y2hlcyBmb3IgVVJMIGNoYW5nZXMsIGRpc3BhdGNoaW5nIHRoZSBjdXN0b20gZXZlbnQgd2hlbiBkZXRlY3RlZC4gU3RvcHNcbiogd2F0Y2hpbmcgd2hlbiBjb250ZW50IHNjcmlwdCBpcyBpbnZhbGlkYXRlZC4gVXNlcyBOYXZpZ2F0aW9uIEFQSSB3aGVuIGF2YWlsYWJsZSwgb3RoZXJ3aXNlXG4qIGZhbGxzIGJhY2sgdG8gcG9sbGluZy5cbiovXG5mdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG5cdGxldCBsYXN0VXJsO1xuXHRsZXQgd2F0Y2hpbmcgPSBmYWxzZTtcblx0cmV0dXJuIHsgcnVuKCkge1xuXHRcdGlmICh3YXRjaGluZykgcmV0dXJuO1xuXHRcdHdhdGNoaW5nID0gdHJ1ZTtcblx0XHRsYXN0VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcblx0XHRpZiAoc3VwcG9ydHNOYXZpZ2F0aW9uQXBpKSBnbG9iYWxUaGlzLm5hdmlnYXRpb24uYWRkRXZlbnRMaXN0ZW5lcihcIm5hdmlnYXRlXCIsIChldmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VXJsID0gbmV3IFVSTChldmVudC5kZXN0aW5hdGlvbi51cmwpO1xuXHRcdFx0aWYgKG5ld1VybC5ocmVmID09PSBsYXN0VXJsLmhyZWYpIHJldHVybjtcblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgbGFzdFVybCkpO1xuXHRcdFx0bGFzdFVybCA9IG5ld1VybDtcblx0XHR9LCB7IHNpZ25hbDogY3R4LnNpZ25hbCB9KTtcblx0XHRlbHNlIGN0eC5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuXHRcdFx0aWYgKG5ld1VybC5ocmVmICE9PSBsYXN0VXJsLmhyZWYpIHtcblx0XHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBsYXN0VXJsKSk7XG5cdFx0XHRcdGxhc3RVcmwgPSBuZXdVcmw7XG5cdFx0XHR9XG5cdFx0fSwgMWUzKTtcblx0fSB9O1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9OyIsImltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuL2ludGVybmFsL2xvZ2dlci5tanNcIjtcbmltcG9ydCB7IGdldFVuaXF1ZUV2ZW50TmFtZSB9IGZyb20gXCIuL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuXG4vLyNyZWdpb24gc3JjL3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQudHNcbi8qKlxuKiBJbXBsZW1lbnRzIFtgQWJvcnRDb250cm9sbGVyYF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0Fib3J0Q29udHJvbGxlcikuXG4qIFVzZWQgdG8gZGV0ZWN0IGFuZCBzdG9wIGNvbnRlbnQgc2NyaXB0IGNvZGUgd2hlbiB0aGUgc2NyaXB0IGlzIGludmFsaWRhdGVkLlxuKlxuKiBJdCBhbHNvIHByb3ZpZGVzIHNldmVyYWwgdXRpbGl0aWVzIGxpa2UgYGN0eC5zZXRUaW1lb3V0YCBhbmQgYGN0eC5zZXRJbnRlcnZhbGAgdGhhdCBzaG91bGQgYmUgdXNlZCBpblxuKiBjb250ZW50IHNjcmlwdHMgaW5zdGVhZCBvZiBgd2luZG93LnNldFRpbWVvdXRgIG9yIGB3aW5kb3cuc2V0SW50ZXJ2YWxgLlxuKlxuKiBUbyBjcmVhdGUgY29udGV4dCBmb3IgdGVzdGluZywgeW91IGNhbiB1c2UgdGhlIGNsYXNzJ3MgY29uc3RydWN0b3I6XG4qXG4qIGBgYHRzXG4qIGltcG9ydCB7IENvbnRlbnRTY3JpcHRDb250ZXh0IH0gZnJvbSAnd3h0L3V0aWxzL2NvbnRlbnQtc2NyaXB0cy1jb250ZXh0JztcbipcbiogdGVzdChcInN0b3JhZ2UgbGlzdGVuZXIgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiBjb250ZXh0IGlzIGludmFsaWRhdGVkXCIsICgpID0+IHtcbiogICBjb25zdCBjdHggPSBuZXcgQ29udGVudFNjcmlwdENvbnRleHQoJ3Rlc3QnKTtcbiogICBjb25zdCBpdGVtID0gc3RvcmFnZS5kZWZpbmVJdGVtKFwibG9jYWw6Y291bnRcIiwgeyBkZWZhdWx0VmFsdWU6IDAgfSk7XG4qICAgY29uc3Qgd2F0Y2hlciA9IHZpLmZuKCk7XG4qXG4qICAgY29uc3QgdW53YXRjaCA9IGl0ZW0ud2F0Y2god2F0Y2hlcik7XG4qICAgY3R4Lm9uSW52YWxpZGF0ZWQodW53YXRjaCk7IC8vIExpc3RlbiBmb3IgaW52YWxpZGF0ZSBoZXJlXG4qXG4qICAgYXdhaXQgaXRlbS5zZXRWYWx1ZSgxKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFRpbWVzKDEpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkV2l0aCgxLCAwKTtcbipcbiogICBjdHgubm90aWZ5SW52YWxpZGF0ZWQoKTsgLy8gVXNlIHRoaXMgZnVuY3Rpb24gdG8gaW52YWxpZGF0ZSB0aGUgY29udGV4dFxuKiAgIGF3YWl0IGl0ZW0uc2V0VmFsdWUoMik7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRUaW1lcygxKTtcbiogfSk7XG4qIGBgYFxuKi9cbnZhciBDb250ZW50U2NyaXB0Q29udGV4dCA9IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcblx0c3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCIpO1xuXHRpZDtcblx0YWJvcnRDb250cm9sbGVyO1xuXHRsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG5cdGNvbnN0cnVjdG9yKGNvbnRlbnRTY3JpcHROYW1lLCBvcHRpb25zKSB7XG5cdFx0dGhpcy5jb250ZW50U2NyaXB0TmFtZSA9IGNvbnRlbnRTY3JpcHROYW1lO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5pZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpO1xuXHRcdHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcblx0XHR0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cygpO1xuXHR9XG5cdGdldCBzaWduYWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcblx0fVxuXHRhYm9ydChyZWFzb24pIHtcblx0XHRyZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcblx0fVxuXHRnZXQgaXNJbnZhbGlkKCkge1xuXHRcdGlmIChicm93c2VyLnJ1bnRpbWU/LmlkID09IG51bGwpIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcblx0fVxuXHRnZXQgaXNWYWxpZCgpIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuXHR9XG5cdC8qKlxuXHQqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpcyBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cblx0KlxuXHQqIEBleGFtcGxlXG5cdCogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG5cdCogY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcblx0KiAgIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIoY2IpO1xuXHQqIH0pXG5cdCogLy8gLi4uXG5cdCogcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lcigpO1xuXHQqL1xuXHRvbkludmFsaWRhdGVkKGNiKSB7XG5cdFx0dGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcblx0XHRyZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcblx0fVxuXHQvKipcblx0KiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IHNob3VsZG4ndCBydW5cblx0KiBhZnRlciB0aGUgY29udGV4dCBpcyBleHBpcmVkLlxuXHQqXG5cdCogQGV4YW1wbGVcblx0KiBjb25zdCBnZXRWYWx1ZUZyb21TdG9yYWdlID0gYXN5bmMgKCkgPT4ge1xuXHQqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcblx0KlxuXHQqICAgLy8gLi4uXG5cdCogfVxuXHQqL1xuXHRibG9jaygpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge30pO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0SW50ZXJ2YWxgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBJbnRlcnZhbHMgY2FuIGJlIGNsZWFyZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjbGVhckludGVydmFsYCBmdW5jdGlvbi5cblx0Ki9cblx0c2V0SW50ZXJ2YWwoaGFuZGxlciwgdGltZW91dCkge1xuXHRcdGNvbnN0IGlkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhckludGVydmFsKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0VGltZW91dGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIFRpbWVvdXRzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgc2V0VGltZW91dGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldFRpbWVvdXQoaGFuZGxlciwgdGltZW91dCkge1xuXHRcdGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFyVGltZW91dChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuXHQqIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbEFuaW1hdGlvbkZyYW1lYCBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNhbGxiYWNrKSB7XG5cdFx0Y29uc3QgaWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKC4uLmFyZ3MpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuXHRcdH0pO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxBbmltYXRpb25GcmFtZShpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RJZGxlQ2FsbGJhY2tgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cblx0KiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxJZGxlQ2FsbGJhY2tgIGZ1bmN0aW9uLlxuXHQqL1xuXHRyZXF1ZXN0SWRsZUNhbGxiYWNrKGNhbGxiYWNrLCBvcHRpb25zKSB7XG5cdFx0Y29uc3QgaWQgPSByZXF1ZXN0SWRsZUNhbGxiYWNrKCguLi5hcmdzKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuc2lnbmFsLmFib3J0ZWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuXHRcdH0sIG9wdGlvbnMpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxJZGxlQ2FsbGJhY2soaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0YWRkRXZlbnRMaXN0ZW5lcih0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpIHtcblx0XHRpZiAodHlwZSA9PT0gXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIikge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgdGhpcy5sb2NhdGlvbldhdGNoZXIucnVuKCk7XG5cdFx0fVxuXHRcdHRhcmdldC5hZGRFdmVudExpc3RlbmVyPy4odHlwZS5zdGFydHNXaXRoKFwid3h0OlwiKSA/IGdldFVuaXF1ZUV2ZW50TmFtZSh0eXBlKSA6IHR5cGUsIGhhbmRsZXIsIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRzaWduYWw6IHRoaXMuc2lnbmFsXG5cdFx0fSk7XG5cdH1cblx0LyoqXG5cdCogQGludGVybmFsXG5cdCogQWJvcnQgdGhlIGFib3J0IGNvbnRyb2xsZXIgYW5kIGV4ZWN1dGUgYWxsIGBvbkludmFsaWRhdGVkYCBsaXN0ZW5lcnMuXG5cdCovXG5cdG5vdGlmeUludmFsaWRhdGVkKCkge1xuXHRcdHRoaXMuYWJvcnQoXCJDb250ZW50IHNjcmlwdCBjb250ZXh0IGludmFsaWRhdGVkXCIpO1xuXHRcdGxvZ2dlci5kZWJ1ZyhgQ29udGVudCBzY3JpcHQgXCIke3RoaXMuY29udGVudFNjcmlwdE5hbWV9XCIgY29udGV4dCBpbnZhbGlkYXRlZGApO1xuXHR9XG5cdHN0b3BPbGRTY3JpcHRzKCkge1xuXHRcdGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgeyBkZXRhaWw6IHtcblx0XHRcdGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuXHRcdFx0bWVzc2FnZUlkOiB0aGlzLmlkXG5cdFx0fSB9KSk7XG5cdFx0d2luZG93LnBvc3RNZXNzYWdlKHtcblx0XHRcdHR5cGU6IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSxcblx0XHRcdGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuXHRcdFx0bWVzc2FnZUlkOiB0aGlzLmlkXG5cdFx0fSwgXCIqXCIpO1xuXHR9XG5cdHZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkge1xuXHRcdGNvbnN0IGlzU2FtZUNvbnRlbnRTY3JpcHQgPSBldmVudC5kZXRhaWw/LmNvbnRlbnRTY3JpcHROYW1lID09PSB0aGlzLmNvbnRlbnRTY3JpcHROYW1lO1xuXHRcdGNvbnN0IGlzRnJvbVNlbGYgPSBldmVudC5kZXRhaWw/Lm1lc3NhZ2VJZCA9PT0gdGhpcy5pZDtcblx0XHRyZXR1cm4gaXNTYW1lQ29udGVudFNjcmlwdCAmJiAhaXNGcm9tU2VsZjtcblx0fVxuXHRsaXN0ZW5Gb3JOZXdlclNjcmlwdHMoKSB7XG5cdFx0Y29uc3QgY2IgPSAoZXZlbnQpID0+IHtcblx0XHRcdGlmICghKGV2ZW50IGluc3RhbmNlb2YgQ3VzdG9tRXZlbnQpIHx8ICF0aGlzLnZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkpIHJldHVybjtcblx0XHRcdHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcblx0XHR9O1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLCBjYik7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLCBjYikpO1xuXHR9XG59O1xuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IENvbnRlbnRTY3JpcHRDb250ZXh0IH07Il0sIm5hbWVzIjpbImRlZmluaXRpb24iLCJyZXN1bHQiLCJjb250ZW50IiwicHJpbnQiLCJsb2dnZXIiLCJicm93c2Vy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
content;