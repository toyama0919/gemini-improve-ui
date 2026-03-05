var content = (function() {
  "use strict";
  function defineContentScript(definition2) {
    return definition2;
  }
  const DEFAULT_SHORTCUTS = {
    chat: {
      navigateToSearch: "Insert",
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
        } else {
          currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
        }
        resolve(currentShortcuts);
      });
    });
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
    const path = window.location.pathname;
    if (path !== "/app" && path !== "/app/") return;
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q");
    if (!query) return;
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
        p.textContent = query;
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
  function navigateToSearchPage() {
    const searchUrl = "/search?hl=ja";
    history.pushState(null, "", searchUrl);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }
  function toggleSearchPage() {
    if (isSearchPage()) {
      history.back();
    } else {
      exitHistorySelectionMode();
      navigateToSearchPage();
    }
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
    if (isShortcut(event, "chat.navigateToSearch")) {
      event.preventDefault();
      toggleSearchPage();
      return true;
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
    if (isShortcut(event, "chat.navigateToSearch")) {
      event.preventDefault();
      toggleSearchPage();
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
          event.preventDefault();
          const expandButton = focusedElement._expandButton;
          const target = focusedElement._deepDiveTarget;
          if (expandButton && target) {
            const isExpanded = expandButton.getAttribute("data-action") === "collapse";
            if (event.key === "ArrowRight" && !isExpanded) {
              expandButton.click();
            } else if (event.key === "ArrowLeft" && isExpanded) {
              expandButton.click();
            }
          }
          return true;
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
  function initializeKeyboardHandlers() {
    loadShortcuts().then(() => {
      document.addEventListener(
        "keydown",
        (event) => {
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
            if (existing.hasAttribute("data-initialized")) return;
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
              if (existing.hasAttribute("data-initialized")) return;
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
            if (existing.hasAttribute("data-initialized")) return;
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
              if (existing.hasAttribute("data-initialized")) return;
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
            if (existing.hasAttribute("data-initialized")) return;
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
            if (existing.hasAttribute("data-initialized")) return;
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
    button.setAttribute("data-initialized", "1");
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
        e.preventDefault();
        e.stopPropagation();
        if (button._popupClosedAt && Date.now() - button._popupClosedAt < 300) {
          return;
        }
        const expandBtn = button._expandButton;
        if (expandBtn && expandBtn.getAttribute("data-action") === "expand") {
          toggleExpand(target, expandBtn);
          return;
        }
        showTemplatePopup(button, target);
      }
    });
    let expandButton = null;
    if (target.type === "section" || target.type === "list") {
      expandButton = createExpandButton(target);
      button._expandButton = expandButton;
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
      if (e.key === "ArrowRight" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        showTemplatePopup(button, childTarget);
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
      if (e.key === "Escape" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        button._popupClosedAt = Date.now();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvc2V0dGluZ3MudHMiLCIuLi8uLi8uLi9zcmMvYXV0b2NvbXBsZXRlLnRzIiwiLi4vLi4vLi4vc3JjL2NoYXQudHMiLCIuLi8uLi8uLi9zcmMvaGlzdG9yeS50cyIsIi4uLy4uLy4uL3NyYy9zZWFyY2gudHMiLCIuLi8uLi8uLi9zcmMvZXhwb3J0LnRzIiwiLi4vLi4vLi4vc3JjL2tleWJvYXJkLnRzIiwiLi4vLi4vLi4vc3JjL2RlZXAtZGl2ZS50cyIsIi4uLy4uLy4uL3NyYy9tYXAudHMiLCIuLi8uLi8uLi9zcmMvZG9tLWFuYWx5emVyLnRzIiwiLi4vLi4vLi4vZW50cnlwb2ludHMvY29udGVudC9pbmRleC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0Lm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyNyZWdpb24gc3JjL3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC50c1xuZnVuY3Rpb24gZGVmaW5lQ29udGVudFNjcmlwdChkZWZpbml0aW9uKSB7XG5cdHJldHVybiBkZWZpbml0aW9uO1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUNvbnRlbnRTY3JpcHQgfTsiLCIvLyBTZXR0aW5ncyBtYW5hZ2VtZW50XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQgPSAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJztcblxubGV0IGRlZXBEaXZlUHJvbXB0ID0gREVGQVVMVF9ERUVQX0RJVkVfUFJPTVBUO1xuXG5leHBvcnQgZnVuY3Rpb24gbG9hZERlZXBEaXZlUHJvbXB0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsnZGVlcERpdmVQcm9tcHQnXSwgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5kZWVwRGl2ZVByb21wdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlZXBEaXZlUHJvbXB0ID0gcmVzdWx0LmRlZXBEaXZlUHJvbXB0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVlcERpdmVQcm9tcHQgPSBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG4gICAgICB9XG4gICAgICByZXNvbHZlKGRlZXBEaXZlUHJvbXB0KTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWVwRGl2ZVByb21wdCgpOiBzdHJpbmcge1xuICByZXR1cm4gZGVlcERpdmVQcm9tcHQgfHwgREVGQVVMVF9ERUVQX0RJVkVfUFJPTVBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNob3J0Y3V0cyB7XG4gIGNoYXQ6IHtcbiAgICBuYXZpZ2F0ZVRvU2VhcmNoOiBzdHJpbmc7XG4gICAgdG9nZ2xlU2lkZWJhcjogc3RyaW5nO1xuICAgIHRvZ2dsZUhpc3RvcnlNb2RlOiBzdHJpbmc7XG4gICAgc2Nyb2xsVXA6IHN0cmluZztcbiAgICBzY3JvbGxEb3duOiBzdHJpbmc7XG4gICAgaGlzdG9yeVVwOiBzdHJpbmc7XG4gICAgaGlzdG9yeURvd246IHN0cmluZztcbiAgICBoaXN0b3J5T3Blbjogc3RyaW5nO1xuICAgIGhpc3RvcnlFeGl0OiBzdHJpbmc7XG4gIH07XG4gIHNlYXJjaDoge1xuICAgIG1vdmVVcDogc3RyaW5nO1xuICAgIG1vdmVEb3duOiBzdHJpbmc7XG4gICAgb3BlblJlc3VsdDogc3RyaW5nO1xuICAgIHNjcm9sbFVwOiBzdHJpbmc7XG4gICAgc2Nyb2xsRG93bjogc3RyaW5nO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TSE9SVENVVFM6IFNob3J0Y3V0cyA9IHtcbiAgY2hhdDoge1xuICAgIG5hdmlnYXRlVG9TZWFyY2g6ICdJbnNlcnQnLFxuICAgIHRvZ2dsZVNpZGViYXI6ICdEZWxldGUnLFxuICAgIHRvZ2dsZUhpc3RvcnlNb2RlOiAnRW5kJyxcbiAgICBzY3JvbGxVcDogJ1BhZ2VVcCcsXG4gICAgc2Nyb2xsRG93bjogJ1BhZ2VEb3duJyxcbiAgICBoaXN0b3J5VXA6ICdBcnJvd1VwJyxcbiAgICBoaXN0b3J5RG93bjogJ0Fycm93RG93bicsXG4gICAgaGlzdG9yeU9wZW46ICdFbnRlcicsXG4gICAgaGlzdG9yeUV4aXQ6ICdFc2NhcGUnLFxuICB9LFxuICBzZWFyY2g6IHtcbiAgICBtb3ZlVXA6ICdBcnJvd1VwJyxcbiAgICBtb3ZlRG93bjogJ0Fycm93RG93bicsXG4gICAgb3BlblJlc3VsdDogJ0VudGVyJyxcbiAgICBzY3JvbGxVcDogJ1BhZ2VVcCcsXG4gICAgc2Nyb2xsRG93bjogJ1BhZ2VEb3duJyxcbiAgfSxcbn07XG5cbmxldCBjdXJyZW50U2hvcnRjdXRzOiBTaG9ydGN1dHMgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTaG9ydGN1dHMoKTogUHJvbWlzZTxTaG9ydGN1dHM+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydzaG9ydGN1dHMnXSwgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5zaG9ydGN1dHMpIHtcbiAgICAgICAgY3VycmVudFNob3J0Y3V0cyA9IHJlc3VsdC5zaG9ydGN1dHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX1NIT1JUQ1VUUykpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVNob3J0Y3V0cyhzaG9ydGN1dHM6IFNob3J0Y3V0cyk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IHNob3J0Y3V0cyB9LCAoKSA9PiB7XG4gICAgICBjdXJyZW50U2hvcnRjdXRzID0gc2hvcnRjdXRzO1xuICAgICAgcmVzb2x2ZSgpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNob3J0Y3V0cygpOiBTaG9ydGN1dHMge1xuICByZXR1cm4gY3VycmVudFNob3J0Y3V0cyB8fCBERUZBVUxUX1NIT1JUQ1VUUztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0U2hvcnRjdXRzKCk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gc2F2ZVNob3J0Y3V0cyhKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KERFRkFVTFRfU0hPUlRDVVRTKSkpO1xufVxuXG50eXBlIFNob3J0Y3V0S2V5ID0gc3RyaW5nO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTaG9ydGN1dChldmVudDogS2V5Ym9hcmRFdmVudCwgc2hvcnRjdXRLZXk6IFNob3J0Y3V0S2V5KTogYm9vbGVhbiB7XG4gIGNvbnN0IHNob3J0Y3V0cyA9IGdldFNob3J0Y3V0cygpO1xuICBjb25zdCBrZXlzID0gc2hvcnRjdXRLZXkuc3BsaXQoJy4nKTtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgbGV0IHNob3J0Y3V0OiBhbnkgPSBzaG9ydGN1dHM7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBzaG9ydGN1dCA9IHNob3J0Y3V0W2tleV07XG4gICAgaWYgKCFzaG9ydGN1dCkgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBzaG9ydGN1dCA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBtZXRhTWF0Y2ggPSBzaG9ydGN1dC5tZXRhID8gZXZlbnQubWV0YUtleSA6ICFldmVudC5tZXRhS2V5O1xuICAgIGNvbnN0IGN0cmxNYXRjaCA9IHNob3J0Y3V0LmN0cmwgPyBldmVudC5jdHJsS2V5IDogIWV2ZW50LmN0cmxLZXk7XG4gICAgY29uc3Qgc2hpZnRNYXRjaCA9IHNob3J0Y3V0LnNoaWZ0ID8gZXZlbnQuc2hpZnRLZXkgOiAhZXZlbnQuc2hpZnRLZXk7XG4gICAgcmV0dXJuIChcbiAgICAgIGV2ZW50LmNvZGUgPT09IHNob3J0Y3V0LmtleSAmJiBtZXRhTWF0Y2ggJiYgY3RybE1hdGNoICYmIHNoaWZ0TWF0Y2hcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICBldmVudC5jb2RlID09PSBzaG9ydGN1dCAmJlxuICAgICFldmVudC5jdHJsS2V5ICYmXG4gICAgIWV2ZW50Lm1ldGFLZXkgJiZcbiAgICAhZXZlbnQuc2hpZnRLZXlcbiAgKTtcbn1cbiIsIi8vIEF1dG9jb21wbGV0ZSBmdW5jdGlvbmFsaXR5IGZvciBHZW1pbmkgY2hhdCB0ZXh0YXJlYVxuXG5jb25zdCBSRVRSWV9ERUxBWSA9IDUwMDtcbmNvbnN0IERFQk9VTkNFX0RFTEFZID0gMzAwO1xuY29uc3QgRFJPUERPV05fTUFSR0lOID0gMTA7XG5jb25zdCBJVEVNX0hFSUdIVCA9IDQwO1xuY29uc3QgTUlOX0RST1BET1dOX0hFSUdIVCA9IDEwMDtcblxubGV0IGF1dG9jb21wbGV0ZUxpc3Q6IEhUTUxEaXZFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2VsZWN0ZWRJbmRleCA9IC0xO1xubGV0IGN1cnJlbnRTdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcbmxldCBhdXRvY29tcGxldGVUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRvY29tcGxldGVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIGF1dG9jb21wbGV0ZUxpc3QgIT09IG51bGwgJiZcbiAgICBhdXRvY29tcGxldGVMaXN0LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jaycgJiZcbiAgICBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoID4gMFxuICApO1xufVxuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlOiBFdmVudCk6IHZvaWQge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG59XG5cbmZ1bmN0aW9uIG1vdmVTZWxlY3Rpb24oZGlyZWN0aW9uOiAnbmV4dCcgfCAncHJldicpOiB2b2lkIHtcbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ25leHQnKSB7XG4gICAgc2VsZWN0ZWRJbmRleCA9XG4gICAgICBzZWxlY3RlZEluZGV4IDwgMCA/IDAgOiAoc2VsZWN0ZWRJbmRleCArIDEpICUgY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RlZEluZGV4ID1cbiAgICAgIHNlbGVjdGVkSW5kZXggPCAwXG4gICAgICAgID8gY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aCAtIDFcbiAgICAgICAgOiBzZWxlY3RlZEluZGV4IDw9IDBcbiAgICAgICAgICA/IGN1cnJlbnRTdWdnZXN0aW9ucy5sZW5ndGggLSAxXG4gICAgICAgICAgOiBzZWxlY3RlZEluZGV4IC0gMTtcbiAgfVxuICB1cGRhdGVTZWxlY3RlZEl0ZW0oKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hHb29nbGVTdWdnZXN0aW9ucyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBpZiAoIXF1ZXJ5IHx8IHF1ZXJ5LnRyaW0oKS5sZW5ndGggPT09IDApIHJldHVybiBbXTtcbiAgdHJ5IHtcbiAgICBjb25zdCBlbmNvZGVkUXVlcnkgPSBlbmNvZGVVUklDb21wb25lbnQocXVlcnkudHJpbSgpKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxuICAgICAgYGh0dHBzOi8vd3d3Lmdvb2dsZS5jby5qcC9jb21wbGV0ZS9zZWFyY2g/b3V0cHV0PWZpcmVmb3gmaGw9amEmaWU9dXRmLTgmb2U9dXRmLTgmcT0ke2VuY29kZWRRdWVyeX1gXG4gICAgKTtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHJldHVybiBkYXRhWzFdIHx8IFtdO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gW107XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b2NvbXBsZXRlRHJvcGRvd24oKTogSFRNTERpdkVsZW1lbnQge1xuICBpZiAoYXV0b2NvbXBsZXRlTGlzdCkgcmV0dXJuIGF1dG9jb21wbGV0ZUxpc3Q7XG5cbiAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBsaXN0LmNsYXNzTmFtZSA9ICdnZW1pbmktYXV0b2NvbXBsZXRlLWxpc3QnO1xuICBsaXN0LnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJhY2tncm91bmQ6IHdoaXRlO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7XG4gICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcbiAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgIHotaW5kZXg6IDEwMDAwO1xuICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgbWluLXdpZHRoOiAzMDBweDtcbiAgYDtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaXN0KTtcbiAgYXV0b2NvbXBsZXRlTGlzdCA9IGxpc3Q7XG4gIHJldHVybiBsaXN0O1xufVxuXG5mdW5jdGlvbiBwb3NpdGlvbkRyb3Bkb3duKFxuICBpbnB1dEVsZW1lbnQ6IEVsZW1lbnQsXG4gIGxpc3Q6IEhUTUxEaXZFbGVtZW50LFxuICBzdWdnZXN0aW9uczogc3RyaW5nW11cbik6IHZvaWQge1xuICBjb25zdCByZWN0ID0gaW5wdXRFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBsaXN0LnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnR9cHhgO1xuICBsaXN0LnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG4gIGxpc3Quc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgY29uc3Qgc3BhY2VCZWxvdyA9IHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuYm90dG9tIC0gRFJPUERPV05fTUFSR0lOO1xuICBjb25zdCBzcGFjZUFib3ZlID0gcmVjdC50b3AgLSBEUk9QRE9XTl9NQVJHSU47XG4gIGNvbnN0IG1heEl0ZW1zQmVsb3cgPSBNYXRoLmZsb29yKHNwYWNlQmVsb3cgLyBJVEVNX0hFSUdIVCk7XG4gIGNvbnN0IG1heEl0ZW1zQWJvdmUgPSBNYXRoLmZsb29yKHNwYWNlQWJvdmUgLyBJVEVNX0hFSUdIVCk7XG5cbiAgaWYgKG1heEl0ZW1zQmVsb3cgPCBzdWdnZXN0aW9ucy5sZW5ndGggJiYgbWF4SXRlbXNBYm92ZSA+IG1heEl0ZW1zQmVsb3cpIHtcbiAgICBsaXN0LnN0eWxlLmJvdHRvbSA9IGAke3dpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QudG9wfXB4YDtcbiAgICBsaXN0LnN0eWxlLnRvcCA9ICdhdXRvJztcbiAgICBsaXN0LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KHNwYWNlQWJvdmUsIE1JTl9EUk9QRE9XTl9IRUlHSFQpfXB4YDtcbiAgfSBlbHNlIHtcbiAgICBsaXN0LnN0eWxlLnRvcCA9IGAke3JlY3QuYm90dG9tfXB4YDtcbiAgICBsaXN0LnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcbiAgICBsaXN0LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KHNwYWNlQmVsb3csIE1JTl9EUk9QRE9XTl9IRUlHSFQpfXB4YDtcbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoXG4gIGlucHV0RWxlbWVudDogSFRNTEVsZW1lbnQsXG4gIHN1Z2dlc3Rpb25zOiBzdHJpbmdbXVxuKTogdm9pZCB7XG4gIGlmICghc3VnZ2VzdGlvbnMgfHwgc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbGlzdCA9IGNyZWF0ZUF1dG9jb21wbGV0ZURyb3Bkb3duKCk7XG4gIGxpc3QuaW5uZXJIVE1MID0gJyc7XG4gIGN1cnJlbnRTdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zO1xuICBzZWxlY3RlZEluZGV4ID0gLTE7XG5cbiAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbiwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaXRlbS5jbGFzc05hbWUgPSAnZ2VtaW5pLWF1dG9jb21wbGV0ZS1pdGVtJztcbiAgICBpdGVtLnRleHRDb250ZW50ID0gc3VnZ2VzdGlvbjtcbiAgICBpdGVtLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICBwYWRkaW5nOiAxMHB4IDE2cHg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2YwZjBmMDtcbiAgICBgO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgIHNlbGVjdGVkSW5kZXggPSBpbmRleDtcbiAgICAgIHVwZGF0ZVNlbGVjdGVkSXRlbSgpO1xuICAgIH0pO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBzZWxlY3RTdWdnZXN0aW9uKGlucHV0RWxlbWVudCwgc3VnZ2VzdGlvbik7XG4gICAgfSk7XG4gICAgbGlzdC5hcHBlbmRDaGlsZChpdGVtKTtcbiAgfSk7XG5cbiAgcG9zaXRpb25Ecm9wZG93bihpbnB1dEVsZW1lbnQsIGxpc3QsIHN1Z2dlc3Rpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpOiB2b2lkIHtcbiAgaWYgKGF1dG9jb21wbGV0ZUxpc3QpIHtcbiAgICBhdXRvY29tcGxldGVMaXN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gIH1cbiAgY3VycmVudFN1Z2dlc3Rpb25zID0gW107XG4gIHNlbGVjdGVkSW5kZXggPSAtMTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU2VsZWN0ZWRJdGVtKCk6IHZvaWQge1xuICBpZiAoIWF1dG9jb21wbGV0ZUxpc3QpIHJldHVybjtcbiAgY29uc3QgaXRlbXMgPSBhdXRvY29tcGxldGVMaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5nZW1pbmktYXV0b2NvbXBsZXRlLWl0ZW0nKTtcbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAoaXRlbSBhcyBIVE1MRWxlbWVudCkuc3R5bGUuYmFja2dyb3VuZENvbG9yID1cbiAgICAgIGluZGV4ID09PSBzZWxlY3RlZEluZGV4ID8gJyNlOGYwZmUnIDogJ3RyYW5zcGFyZW50JztcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNlbGVjdFN1Z2dlc3Rpb24oaW5wdXRFbGVtZW50OiBIVE1MRWxlbWVudCwgc3VnZ2VzdGlvbjogc3RyaW5nKTogdm9pZCB7XG4gIGlmICgoaW5wdXRFbGVtZW50IGFzIEhUTUxFbGVtZW50ICYgeyBjb250ZW50RWRpdGFibGU6IHN0cmluZyB9KS5jb250ZW50RWRpdGFibGUgPT09ICd0cnVlJykge1xuICAgIHdoaWxlIChpbnB1dEVsZW1lbnQuZmlyc3RDaGlsZCkge1xuICAgICAgaW5wdXRFbGVtZW50LnJlbW92ZUNoaWxkKGlucHV0RWxlbWVudC5maXJzdENoaWxkKTtcbiAgICB9XG4gICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICBwLnRleHRDb250ZW50ID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dEVsZW1lbnQuYXBwZW5kQ2hpbGQocCk7XG4gICAgaW5wdXRFbGVtZW50LmZvY3VzKCk7XG4gICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHMoaW5wdXRFbGVtZW50KTtcbiAgICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gICAgc2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgfSBlbHNlIHtcbiAgICAoaW5wdXRFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcbiAgICAoaW5wdXRFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgc3VnZ2VzdGlvbi5sZW5ndGgsXG4gICAgICBzdWdnZXN0aW9uLmxlbmd0aFxuICAgICk7XG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIH1cbiAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplQXV0b2NvbXBsZXRlKCk6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgKTtcbiAgaWYgKCF0ZXh0YXJlYSkge1xuICAgIHNldFRpbWVvdXQoaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSwgUkVUUllfREVMQVkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRleHRhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgJ2tleWRvd24nLFxuICAgIGFzeW5jIChlKSA9PiB7XG4gICAgICBpZiAoIWUuaXNUcnVzdGVkIHx8IGUuaXNDb21wb3NpbmcpIHJldHVybjtcblxuICAgICAgaWYgKGUubWV0YUtleSAmJiBlLmNvZGUgPT09ICdTcGFjZScpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIGNvbnN0IHRleHQgPSB0ZXh0YXJlYS50ZXh0Q29udGVudCB8fCAnJztcbiAgICAgICAgY29uc3QgdHJpbW1lZFRleHQgPSB0ZXh0LnRyaW0oKTtcbiAgICAgICAgaWYgKHRyaW1tZWRUZXh0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IGF3YWl0IGZldGNoR29vZ2xlU3VnZ2VzdGlvbnModHJpbW1lZFRleHQpO1xuICAgICAgICBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnModGV4dGFyZWEsIHN1Z2dlc3Rpb25zKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSByZXR1cm47XG5cbiAgICAgIGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICBtb3ZlU2VsZWN0aW9uKCduZXh0Jyk7XG4gICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIG1vdmVTZWxlY3Rpb24oJ3ByZXYnKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIGNvbnN0IGluZGV4VG9TZWxlY3QgPSBzZWxlY3RlZEluZGV4ID49IDAgPyBzZWxlY3RlZEluZGV4IDogMDtcbiAgICAgICAgc2VsZWN0U3VnZ2VzdGlvbih0ZXh0YXJlYSwgY3VycmVudFN1Z2dlc3Rpb25zW2luZGV4VG9TZWxlY3RdKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICB0cnVlXG4gICk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGlmIChcbiAgICAgIGF1dG9jb21wbGV0ZUxpc3QgJiZcbiAgICAgICFhdXRvY29tcGxldGVMaXN0LmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpICYmXG4gICAgICBlLnRhcmdldCAhPT0gdGV4dGFyZWFcbiAgICApIHtcbiAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlKCk6IHZvaWQge1xuICBpZiAoIXdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZS5zdGFydHNXaXRoKCcvc2VhcmNoJykpIHJldHVybjtcblxuICBsZXQgYXR0ZW1wdHMgPSAwO1xuICBjb25zdCBtYXhBdHRlbXB0cyA9IDEwO1xuXG4gIGNvbnN0IHNlYXJjaElucHV0SW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICAgICkgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICAgICdpbnB1dFt0eXBlPVwidGV4dFwiXVtwbGFjZWhvbGRlcio9XCLmpJzntKJcIl0nXG4gICAgICApIHx8XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KCdpbnB1dFt0eXBlPVwidGV4dFwiXScpO1xuXG4gICAgaWYgKHNlYXJjaElucHV0KSB7XG4gICAgICBjbGVhckludGVydmFsKHNlYXJjaElucHV0SW50ZXJ2YWwpO1xuXG4gICAgICBzZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgIGlmICghZS5pc1RydXN0ZWQpIHJldHVybjtcbiAgICAgICAgaWYgKGF1dG9jb21wbGV0ZVRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvY29tcGxldGVUaW1lb3V0KTtcblxuICAgICAgICBjb25zdCB0ZXh0ID0gc2VhcmNoSW5wdXQudmFsdWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IHRyaW1tZWRUZXh0ID0gdGV4dC50cmltKCk7XG4gICAgICAgIGlmICh0cmltbWVkVGV4dC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhdXRvY29tcGxldGVUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgY3VycmVudFRyaW1tZWQgPSAoc2VhcmNoSW5wdXQudmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICBpZiAoY3VycmVudFRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBhd2FpdCBmZXRjaEdvb2dsZVN1Z2dlc3Rpb25zKGN1cnJlbnRUcmltbWVkKTtcbiAgICAgICAgICBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoc2VhcmNoSW5wdXQsIHN1Z2dlc3Rpb25zKTtcbiAgICAgICAgfSwgREVCT1VOQ0VfREVMQVkpO1xuICAgICAgfSk7XG5cbiAgICAgIHNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdrZXlkb3duJyxcbiAgICAgICAgKGUpID0+IHtcbiAgICAgICAgICBpZiAoIWUuaXNUcnVzdGVkIHx8IGUuaXNDb21wb3NpbmcpIHJldHVybjtcbiAgICAgICAgICBpZiAoIWlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSByZXR1cm47XG5cbiAgICAgICAgICBpZiAoZS5rZXkgPT09ICdUYWInIHx8IGUua2V5ID09PSAnQXJyb3dEb3duJykge1xuICAgICAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgICAgICBtb3ZlU2VsZWN0aW9uKCduZXh0Jyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93VXAnKSB7XG4gICAgICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgICAgIG1vdmVTZWxlY3Rpb24oJ3ByZXYnKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWRJbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICAgICAgICBzZWxlY3RTdWdnZXN0aW9uKHNlYXJjaElucHV0LCBjdXJyZW50U3VnZ2VzdGlvbnNbc2VsZWN0ZWRJbmRleF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRydWVcbiAgICAgICk7XG5cbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGF1dG9jb21wbGV0ZUxpc3QgJiZcbiAgICAgICAgICAhYXV0b2NvbXBsZXRlTGlzdC5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSAmJlxuICAgICAgICAgIGUudGFyZ2V0ICE9PSBzZWFyY2hJbnB1dFxuICAgICAgICApIHtcbiAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChzZWFyY2hJbnB1dEludGVydmFsKTtcbiAgICB9XG4gIH0sIDUwMCk7XG59XG4iLCIvLyBDaGF0IFVJIGZ1bmN0aW9uYWxpdHkgKHRleHRhcmVhLCBzaWRlYmFyLCBzY3JvbGxpbmcsIGNvcHkgYnV0dG9ucylcblxuaW1wb3J0IHsgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSB9IGZyb20gJy4vYXV0b2NvbXBsZXRlJztcblxubGV0IGNhY2hlZENoYXRBcmVhOiBFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2hhdEFyZWFDYWNoZVRpbWUgPSAwO1xuY29uc3QgQ0hBVF9BUkVBX0NBQ0hFX0RVUkFUSU9OID0gNTAwMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRBcmVhKCk6IEVsZW1lbnQge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gIGlmIChjYWNoZWRDaGF0QXJlYSAmJiBub3cgLSBjaGF0QXJlYUNhY2hlVGltZSA8IENIQVRfQVJFQV9DQUNIRV9EVVJBVElPTikge1xuICAgIHJldHVybiBjYWNoZWRDaGF0QXJlYTtcbiAgfVxuXG4gIGNvbnN0IGNoYXRIaXN0b3J5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5Jyk7XG4gIGlmIChjaGF0SGlzdG9yeSAmJiBjaGF0SGlzdG9yeS5zY3JvbGxIZWlnaHQgPiBjaGF0SGlzdG9yeS5jbGllbnRIZWlnaHQpIHtcbiAgICBjYWNoZWRDaGF0QXJlYSA9IGNoYXRIaXN0b3J5O1xuICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgIHJldHVybiBjaGF0SGlzdG9yeTtcbiAgfVxuXG4gIGlmIChcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsSGVpZ2h0ID5cbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0XG4gICkge1xuICAgIGNhY2hlZENoYXRBcmVhID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgIHJldHVybiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIH1cblxuICBjb25zdCBzZWxlY3RvcnMgPSBbXG4gICAgJ2luZmluaXRlLXNjcm9sbGVyJyxcbiAgICAnbWFpbltjbGFzcyo9XCJtYWluXCJdJyxcbiAgICAnLmNvbnZlcnNhdGlvbi1jb250YWluZXInLFxuICAgICdbY2xhc3MqPVwiY2hhdC1oaXN0b3J5XCJdJyxcbiAgICAnW2NsYXNzKj1cIm1lc3NhZ2VzXCJdJyxcbiAgICAnbWFpbicsXG4gICAgJ1tjbGFzcyo9XCJzY3JvbGxcIl0nLFxuICAgICdkaXZbY2xhc3MqPVwiY29udmVyc2F0aW9uXCJdJyxcbiAgXTtcblxuICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICBpZiAoZWxlbWVudCAmJiBlbGVtZW50LnNjcm9sbEhlaWdodCA+IGVsZW1lbnQuY2xpZW50SGVpZ2h0KSB7XG4gICAgICBjYWNoZWRDaGF0QXJlYSA9IGVsZW1lbnQ7XG4gICAgICBjaGF0QXJlYUNhY2hlVGltZSA9IG5vdztcbiAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH1cbiAgfVxuXG4gIGNhY2hlZENoYXRBcmVhID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICBjaGF0QXJlYUNhY2hlVGltZSA9IG5vdztcbiAgcmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjcm9sbENoYXRBcmVhKGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJyk6IHZvaWQge1xuICBjb25zdCBjaGF0QXJlYSA9IGdldENoYXRBcmVhKCk7XG4gIGNvbnN0IHNjcm9sbEFtb3VudCA9IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuMTtcbiAgY29uc3Qgc2Nyb2xsVmFsdWUgPSBkaXJlY3Rpb24gPT09ICd1cCcgPyAtc2Nyb2xsQW1vdW50IDogc2Nyb2xsQW1vdW50O1xuXG4gIGlmIChjaGF0QXJlYSA9PT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGNoYXRBcmVhID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgd2luZG93LnNjcm9sbEJ5KHsgdG9wOiBzY3JvbGxWYWx1ZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgfSBlbHNlIHtcbiAgICAoY2hhdEFyZWEgYXMgSFRNTEVsZW1lbnQpLnNjcm9sbEJ5KHsgdG9wOiBzY3JvbGxWYWx1ZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTmV3Q2hhdCgpOiB2b2lkIHtcbiAgY29uc3QgbmV3Q2hhdExpbmsgPVxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KFxuICAgICAgJ2FbaHJlZj1cImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwXCJdJ1xuICAgICkgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYVthcmlhLWxhYmVsKj1cIuaWsOimj+S9nOaIkFwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbYXJpYS1sYWJlbCo9XCJOZXcgY2hhdFwiXScpO1xuXG4gIGlmIChuZXdDaGF0TGluaykge1xuICAgIG5ld0NoYXRMaW5rLmNsaWNrKCk7XG4gICAgcmVpbml0aWFsaXplQWZ0ZXJOYXZpZ2F0aW9uKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbmV3Q2hhdEJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRlc3QtaWQ9XCJuZXctY2hhdC1idXR0b25cIl0nKTtcbiAgaWYgKG5ld0NoYXRCdXR0b24pIHtcbiAgICBjb25zdCBjbGlja2FibGUgPVxuICAgICAgbmV3Q2hhdEJ1dHRvbi5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYSwgYnV0dG9uJykgfHxcbiAgICAgIChuZXdDaGF0QnV0dG9uIGFzIEhUTUxFbGVtZW50KTtcbiAgICBjbGlja2FibGUuY2xpY2soKTtcbiAgICByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaW5rcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2EsIGJ1dHRvbicpKTtcbiAgY29uc3QgbmV3Q2hhdEJ0biA9IGxpbmtzLmZpbmQoXG4gICAgKGVsKSA9PlxuICAgICAgZWwudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCfmlrDopo/kvZzmiJAnKSB8fFxuICAgICAgZWwudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdOZXcgY2hhdCcpIHx8XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ+aWsOimjycpXG4gICk7XG4gIGlmIChuZXdDaGF0QnRuKSB7XG4gICAgbmV3Q2hhdEJ0bi5jbGljaygpO1xuICAgIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTogdm9pZCB7XG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgfSwgMTUwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c1RleHRhcmVhKCk6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcblxuICBpZiAoIXRleHRhcmVhKSByZXR1cm47XG4gIHRleHRhcmVhLmZvY3VzKCk7XG5cbiAgaWYgKHRleHRhcmVhLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XG4gICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckFuZEZvY3VzVGV4dGFyZWEoKTogdm9pZCB7XG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICk7XG5cbiAgICBpZiAodGV4dGFyZWEpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgd2hpbGUgKHRleHRhcmVhLmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgdGV4dGFyZWEucmVtb3ZlQ2hpbGQodGV4dGFyZWEuZmlyc3RDaGlsZCk7XG4gICAgICB9XG4gICAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgcC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdicicpKTtcbiAgICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICAgICAgdGV4dGFyZWEuZm9jdXMoKTtcbiAgICAgIHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgfVxuICB9LCAyMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0UXVlcnlGcm9tVXJsKCk6IHZvaWQge1xuICBjb25zdCBwYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xuICBpZiAocGF0aCAhPT0gJy9hcHAnICYmIHBhdGggIT09ICcvYXBwLycpIHJldHVybjtcblxuICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICBjb25zdCBxdWVyeSA9IHVybFBhcmFtcy5nZXQoJ3EnKTtcbiAgaWYgKCFxdWVyeSkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbmQgPSB1cmxQYXJhbXMuZ2V0KCdzZW5kJyk7XG4gIGNvbnN0IHNob3VsZFNlbmQgPSBzZW5kID09PSBudWxsIHx8IHNlbmQgPT09ICd0cnVlJyB8fCBzZW5kID09PSAnMSc7XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAyMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG5cbiAgICAgIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB7XG4gICAgICAgIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuICAgICAgfVxuICAgICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIHAudGV4dENvbnRlbnQgPSBxdWVyeTtcbiAgICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICAgICAgdGV4dGFyZWEuZm9jdXMoKTtcblxuICAgICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgICAgcmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHRleHRhcmVhKTtcbiAgICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICAgIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcblxuICAgICAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuICAgICAgaWYgKHNob3VsZFNlbmQpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc2VuZEJ1dHRvbiA9XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwi6YCB5L+hXCJdJykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCJTZW5kXCJdJykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24uc2VuZC1idXR0b24nKSB8fFxuICAgICAgICAgICAgQXJyYXkuZnJvbShcbiAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbicpXG4gICAgICAgICAgICApLmZpbmQoXG4gICAgICAgICAgICAgIChidG4pID0+XG4gICAgICAgICAgICAgICAgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpPy5pbmNsdWRlcygn6YCB5L+hJykgfHxcbiAgICAgICAgICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCdTZW5kJylcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHNlbmRCdXR0b24gJiYgIXNlbmRCdXR0b24uZGlzYWJsZWQpIHtcbiAgICAgICAgICAgIHNlbmRCdXR0b24uY2xpY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDUwMCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgfVxuICB9LCAyMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9jdXNBY3Rpb25CdXR0b24oZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gIGlmIChhY3Rpb25CdXR0b25zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChkaXJlY3Rpb24gPT09ICd1cCcpIHtcbiAgICBhY3Rpb25CdXR0b25zW2FjdGlvbkJ1dHRvbnMubGVuZ3RoIC0gMV0uZm9jdXMoKTtcbiAgfSBlbHNlIHtcbiAgICBhY3Rpb25CdXR0b25zWzBdLmZvY3VzKCk7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlQmV0d2VlbkFjdGlvbkJ1dHRvbnMoZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gIGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KFxuICAgIChidG4pID0+IGJ0biA9PT0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudFxuICApO1xuICBpZiAoY3VycmVudEluZGV4ID09PSAtMSkgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChkaXJlY3Rpb24gPT09ICd1cCcpIHtcbiAgICBpZiAoY3VycmVudEluZGV4ID4gMCkge1xuICAgICAgYWN0aW9uQnV0dG9uc1tjdXJyZW50SW5kZXggLSAxXS5mb2N1cygpO1xuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LihjdXJyZW50SW5kZXggLSAxKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoY3VycmVudEluZGV4IDwgYWN0aW9uQnV0dG9ucy5sZW5ndGggLSAxKSB7XG4gICAgICBhY3Rpb25CdXR0b25zW2N1cnJlbnRJbmRleCArIDFdLmZvY3VzKCk7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKGN1cnJlbnRJbmRleCArIDEpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxBY3Rpb25CdXR0b25zKCk6IEhUTUxFbGVtZW50W10ge1xuICBjb25zdCBhbGxCdXR0b25zID0gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICdidXR0b24uZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUsIGJ1dHRvbltkYXRhLWFjdGlvbj1cImRlZXAtZGl2ZVwiXSdcbiAgICApXG4gICk7XG5cbiAgcmV0dXJuIGFsbEJ1dHRvbnMuZmlsdGVyKChidG4pID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPVxuICAgICAgYnRuLmNsb3Nlc3QoJ1tkYXRhLXRlc3QtaWQqPVwidXNlclwiXScpIHx8XG4gICAgICBidG4uY2xvc2VzdCgnW2RhdGEtdGVzdC1pZCo9XCJwcm9tcHRcIl0nKSB8fFxuICAgICAgYnRuLmNsb3Nlc3QoJ1tjbGFzcyo9XCJ1c2VyXCJdJyk7XG4gICAgcmV0dXJuICFjb250YWluZXI7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZFNpZGViYXJUb2dnbGVCdXR0b24oKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgcmV0dXJuIChcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtdGVzdC1pZD1cInNpZGUtbmF2LXRvZ2dsZVwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODoeODi+ODpeODvFwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIm1lbnVcIl0nKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCJNZW51XCJdJylcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2lkZWJhck9wZW4oKTogYm9vbGVhbiB7XG4gIGNvbnN0IHNpZGVuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtYXQtc2lkZW5hdicpO1xuICBpZiAoIXNpZGVuYXYpIHJldHVybiB0cnVlO1xuICByZXR1cm4gc2lkZW5hdi5jbGFzc0xpc3QuY29udGFpbnMoJ21hdC1kcmF3ZXItb3BlbmVkJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVTaWRlYmFyKCk6IHZvaWQge1xuICBjb25zdCB0b2dnbGUgPSBmaW5kU2lkZWJhclRvZ2dsZUJ1dHRvbigpO1xuICBpZiAodG9nZ2xlKSB0b2dnbGUuY2xpY2soKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVDaGF0UGFnZSgpOiB2b2lkIHtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgc2V0UXVlcnlGcm9tVXJsKCk7XG4gIH0sIDEwMDApO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgfSwgMTUwMCk7XG5cbiAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgY29uc3QgaXNTdHJlYW1pbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1idXN5PVwidHJ1ZVwiXScpO1xuICAgIGlmIChpc1N0cmVhbWluZykge1xuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LigtMSk7XG4gICAgfVxuICB9KTtcblxuICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHtcbiAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgIGF0dHJpYnV0ZUZpbHRlcjogWydhcmlhLWJ1c3knXSxcbiAgICBzdWJ0cmVlOiB0cnVlLFxuICB9KTtcbn1cbiIsIi8vIENoYXQgaGlzdG9yeSBzZWxlY3Rpb24gZnVuY3Rpb25hbGl0eVxuXG5pbXBvcnQgeyBjbGVhckFuZEZvY3VzVGV4dGFyZWEgfSBmcm9tICcuL2NoYXQnO1xuXG5sZXQgc2VsZWN0ZWRIaXN0b3J5SW5kZXggPSAwO1xubGV0IGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGdldEhpc3RvcnlJdGVtcygpOiBIVE1MRWxlbWVudFtdIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAnLmNvbnZlcnNhdGlvbi1pdGVtcy1jb250YWluZXIgLmNvbnZlcnNhdGlvbltkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb25cIl0nXG4gICAgKVxuICApO1xufVxuXG5mdW5jdGlvbiBoaWdobGlnaHRIaXN0b3J5KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIHNlbGVjdGVkSGlzdG9yeUluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaW5kZXgsIGl0ZW1zLmxlbmd0aCAtIDEpKTtcblxuICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lID0gJyc7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7XG4gIH0pO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XTtcbiAgaWYgKHNlbGVjdGVkSXRlbSkge1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjMWE3M2U4JztcbiAgICBzZWxlY3RlZEl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICctMnB4JztcbiAgICBzZWxlY3RlZEl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlSGlzdG9yeVVwKCk6IHZvaWQge1xuICBoaWdobGlnaHRIaXN0b3J5KHNlbGVjdGVkSGlzdG9yeUluZGV4IC0gMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlSGlzdG9yeURvd24oKTogdm9pZCB7XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXggKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5TZWxlY3RlZEhpc3RvcnkoKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0SGlzdG9yeUl0ZW1zKCk7XG4gIGlmIChpdGVtcy5sZW5ndGggPT09IDAgfHwgIWl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XSkgcmV0dXJuO1xuXG4gIGl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XS5jbGljaygpO1xuICBoaXN0b3J5U2VsZWN0aW9uTW9kZSA9IGZhbHNlO1xuXG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG5cbiAgY2xlYXJBbmRGb2N1c1RleHRhcmVhKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogdm9pZCB7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0SGlzdG9yeUl0ZW1zKCk7XG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbnRlckhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk6IHZvaWQge1xuICBoaXN0b3J5U2VsZWN0aW9uTW9kZSA9IHRydWU7XG4gIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50KSB7XG4gICAgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmJsdXIoKTtcbiAgfVxuICBoaWdobGlnaHRIaXN0b3J5KHNlbGVjdGVkSGlzdG9yeUluZGV4KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiBoaXN0b3J5U2VsZWN0aW9uTW9kZTtcbn1cbiIsIi8vIFNlYXJjaCBwYWdlIGZ1bmN0aW9uYWxpdHlcblxuaW1wb3J0IHsgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi9oaXN0b3J5JztcblxubGV0IHNlbGVjdGVkU2VhcmNoSW5kZXggPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTZWFyY2hQYWdlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9zZWFyY2gnKTtcbn1cblxuZnVuY3Rpb24gZ2V0U2VhcmNoUmVzdWx0cygpOiBIVE1MRWxlbWVudFtdIHtcbiAgbGV0IHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdzZWFyY2gtc25pcHBldFt0YWJpbmRleD1cIjBcIl0nKVxuICApO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICByZXN1bHRzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdzZWFyY2gtc25pcHBldCcpXG4gICAgKTtcbiAgfVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICByZXN1bHRzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnZGl2LmNvbnZlcnNhdGlvbi1jb250YWluZXJbcm9sZT1cIm9wdGlvblwiXSdcbiAgICAgIClcbiAgICApO1xuICB9XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICdbcm9sZT1cIm9wdGlvblwiXS5jb252ZXJzYXRpb24tY29udGFpbmVyJ1xuICAgICAgKVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGluZGV4LCBpdGVtcy5sZW5ndGggLSAxKSk7XG5cbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcblxuICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XTtcbiAgaWYgKHNlbGVjdGVkSXRlbSkge1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjMWE3M2U4JztcbiAgICBzZWxlY3RlZEl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICctMnB4JztcbiAgICBzZWxlY3RlZEl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlU2VhcmNoUmVzdWx0VXAoKTogdm9pZCB7XG4gIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChzZWxlY3RlZFNlYXJjaEluZGV4IC0gMSk7XG4gIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2lucHV0W2RhdGEtdGVzdC1pZD1cInNlYXJjaC1pbnB1dFwiXSdcbiAgKTtcbiAgaWYgKHNlYXJjaElucHV0KSBzZWFyY2hJbnB1dC5mb2N1cygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW92ZVNlYXJjaFJlc3VsdERvd24oKTogdm9pZCB7XG4gIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChzZWxlY3RlZFNlYXJjaEluZGV4ICsgMSk7XG4gIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2lucHV0W2RhdGEtdGVzdC1pZD1cInNlYXJjaC1pbnB1dFwiXSdcbiAgKTtcbiAgaWYgKHNlYXJjaElucHV0KSBzZWFyY2hJbnB1dC5mb2N1cygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3BlblNlbGVjdGVkU2VhcmNoUmVzdWx0KCk6IHZvaWQge1xuICBjb25zdCBpdGVtcyA9IGdldFNlYXJjaFJlc3VsdHMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCB8fCAhaXRlbXNbc2VsZWN0ZWRTZWFyY2hJbmRleF0pIHJldHVybjtcblxuICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XTtcblxuICBjb25zdCBjbGlja2FibGVEaXYgPSBzZWxlY3RlZEl0ZW0ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2Rpdltqc2xvZ10nKTtcbiAgaWYgKGNsaWNrYWJsZURpdikge1xuICAgIGNsaWNrYWJsZURpdi5jbGljaygpO1xuICAgIFsnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnY2xpY2snXS5mb3JFYWNoKChldmVudFR5cGUpID0+IHtcbiAgICAgIGNsaWNrYWJsZURpdi5kaXNwYXRjaEV2ZW50KFxuICAgICAgICBuZXcgTW91c2VFdmVudChldmVudFR5cGUsIHsgdmlldzogd2luZG93LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pXG4gICAgICApO1xuICAgIH0pO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2VsZWN0ZWRJdGVtLmNsaWNrKCk7XG4gICAgfSwgMTAwKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaW5rID0gc2VsZWN0ZWRJdGVtLnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2hyZWZdJyk7XG4gIGlmIChsaW5rKSB7XG4gICAgbGluay5jbGljaygpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHNlbGVjdGVkSXRlbS5jbGljaygpO1xuICBbJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2NsaWNrJ10uZm9yRWFjaCgoZXZlbnRUeXBlKSA9PiB7XG4gICAgc2VsZWN0ZWRJdGVtLmRpc3BhdGNoRXZlbnQoXG4gICAgICBuZXcgTW91c2VFdmVudChldmVudFR5cGUsIHsgdmlldzogd2luZG93LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pXG4gICAgKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplU2VhcmNoUGFnZSgpOiB2b2lkIHtcbiAgaWYgKCFpc1NlYXJjaFBhZ2UoKSkgcmV0dXJuO1xuXG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3QgaGlnaGxpZ2h0SW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCBzZWFyY2hSZXN1bHRzID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuXG4gICAgaWYgKHNlYXJjaFJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IDA7XG4gICAgICBoaWdobGlnaHRTZWFyY2hSZXN1bHQoMCk7XG4gICAgICBjbGVhckludGVydmFsKGhpZ2hsaWdodEludGVydmFsKTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGhpZ2hsaWdodEludGVydmFsKTtcbiAgICB9XG4gIH0sIDUwMCk7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRlVG9TZWFyY2hQYWdlKCk6IHZvaWQge1xuICBjb25zdCBzZWFyY2hVcmwgPSAnL3NlYXJjaD9obD1qYSc7XG4gIGhpc3RvcnkucHVzaFN0YXRlKG51bGwsICcnLCBzZWFyY2hVcmwpO1xuICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgUG9wU3RhdGVFdmVudCgncG9wc3RhdGUnLCB7IHN0YXRlOiBudWxsIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZVNlYXJjaFBhZ2UoKTogdm9pZCB7XG4gIGlmIChpc1NlYXJjaFBhZ2UoKSkge1xuICAgIGhpc3RvcnkuYmFjaygpO1xuICB9IGVsc2Uge1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgIG5hdmlnYXRlVG9TZWFyY2hQYWdlKCk7XG4gIH1cbn1cbiIsIi8vIENoYXQgZXhwb3J0IGZ1bmN0aW9uYWxpdHkgLSBzYXZlcyBjdXJyZW50IGNvbnZlcnNhdGlvbiBhcyBaZXR0ZWxrYXN0ZW4gTWFya2Rvd25cblxuY29uc3QgRVhQT1JUX0JVVFRPTl9JRCA9ICdnZW1pbmktZXhwb3J0LW5vdGUtYnV0dG9uJztcbmxldCBleHBvcnREaXJIYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgfCBudWxsID0gbnVsbDtcblxuLy8gLS0tIEluZGV4ZWREQiBoZWxwZXJzIC0tLVxuXG5mdW5jdGlvbiBvcGVuRXhwb3J0REIoKTogUHJvbWlzZTxJREJEYXRhYmFzZT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IGluZGV4ZWREQi5vcGVuKCdnZW1pbmktZXhwb3J0JywgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IChlKSA9PiB7XG4gICAgICAoZS50YXJnZXQgYXMgSURCT3BlbkRCUmVxdWVzdCkucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdoYW5kbGVzJyk7XG4gICAgfTtcbiAgICByZXEub25zdWNjZXNzID0gKGUpID0+IHJlc29sdmUoKGUudGFyZ2V0IGFzIElEQk9wZW5EQlJlcXVlc3QpLnJlc3VsdCk7XG4gICAgcmVxLm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxLmVycm9yKTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0b3JlZERpckhhbmRsZSgpOiBQcm9taXNlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGIgPSBhd2FpdCBvcGVuRXhwb3J0REIoKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2hhbmRsZXMnLCAncmVhZG9ubHknKTtcbiAgICAgIGNvbnN0IHJlcSA9IHR4Lm9iamVjdFN0b3JlKCdoYW5kbGVzJykuZ2V0KCdzYXZlX2RpcicpO1xuICAgICAgcmVxLm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUoKHJlcS5yZXN1bHQgYXMgRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSkgfHwgbnVsbCk7XG4gICAgICByZXEub25lcnJvciA9ICgpID0+IHJlc29sdmUobnVsbCk7XG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0b3JlRGlySGFuZGxlKGhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGRiID0gYXdhaXQgb3BlbkV4cG9ydERCKCk7XG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaGFuZGxlcycsICdyZWFkd3JpdGUnKTtcbiAgICAgIHR4Lm9iamVjdFN0b3JlKCdoYW5kbGVzJykucHV0KGhhbmRsZSwgJ3NhdmVfZGlyJyk7XG4gICAgICB0eC5vbmNvbXBsZXRlID0gKCkgPT4gcmVzb2x2ZSgpO1xuICAgICAgdHgub25lcnJvciA9ICgpID0+IHJlamVjdCh0eC5lcnJvcik7XG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIElnbm9yZSBzdG9yYWdlIGVycm9yc1xuICB9XG59XG5cbi8vIC0tLSBEaXJlY3RvcnkgaGFuZGxlIG1hbmFnZW1lbnQgLS0tXG5cbmFzeW5jIGZ1bmN0aW9uIGdldEV4cG9ydERpckhhbmRsZSgpOiBQcm9taXNlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU+IHtcbiAgaWYgKGV4cG9ydERpckhhbmRsZSkge1xuICAgIGNvbnN0IHBlcm0gPSBhd2FpdCBleHBvcnREaXJIYW5kbGUucXVlcnlQZXJtaXNzaW9uKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gICAgaWYgKHBlcm0gPT09ICdncmFudGVkJykgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbiAgfVxuXG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZERpckhhbmRsZSgpO1xuICBpZiAoc3RvcmVkKSB7XG4gICAgY29uc3QgcGVybSA9IGF3YWl0IHN0b3JlZC5xdWVyeVBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAocGVybSA9PT0gJ2dyYW50ZWQnKSB7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBzdG9yZWQ7XG4gICAgICByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICAgIH1cbiAgICBjb25zdCBuZXdQZXJtID0gYXdhaXQgc3RvcmVkLnJlcXVlc3RQZXJtaXNzaW9uKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gICAgaWYgKG5ld1Blcm0gPT09ICdncmFudGVkJykge1xuICAgICAgZXhwb3J0RGlySGFuZGxlID0gc3RvcmVkO1xuICAgICAgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGUgPSBhd2FpdCB3aW5kb3cuc2hvd0RpcmVjdG9yeVBpY2tlcih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICBhd2FpdCBzdG9yZURpckhhbmRsZShoYW5kbGUpO1xuICBleHBvcnREaXJIYW5kbGUgPSBoYW5kbGU7XG4gIHJldHVybiBleHBvcnREaXJIYW5kbGU7XG59XG5cbi8vIC0tLSBET00gdG8gTWFya2Rvd24gY29udmVyc2lvbiAtLS1cblxuZnVuY3Rpb24gZG9tVG9NYXJrZG93bihlbDogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBjb25zdCBTS0lQX1RBR1MgPSBuZXcgU2V0KFsnYnV0dG9uJywgJ3N2ZycsICdwYXRoJywgJ21hdC1pY29uJ10pO1xuXG4gIGZ1bmN0aW9uIG5vZGVUb01kKG5vZGU6IE5vZGUpOiBzdHJpbmcge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkgcmV0dXJuIG5vZGUudGV4dENvbnRlbnQgfHwgJyc7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgIT09IE5vZGUuRUxFTUVOVF9OT0RFKSByZXR1cm4gJyc7XG5cbiAgICBjb25zdCBlbGVtID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCB0YWcgPSBlbGVtLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmIChTS0lQX1RBR1MuaGFzKHRhZykpIHJldHVybiAnJztcblxuICAgIGNvbnN0IGlubmVyID0gKCkgPT4gQXJyYXkuZnJvbShlbGVtLmNoaWxkTm9kZXMpLm1hcChub2RlVG9NZCkuam9pbignJyk7XG5cbiAgICBjb25zdCBobSA9IHRhZy5tYXRjaCgvXmgoWzEtNl0pJC8pO1xuICAgIGlmIChobSkge1xuICAgICAgY29uc3QgaGFzaGVzID0gJyMnLnJlcGVhdChOdW1iZXIoaG1bMV0pKTtcbiAgICAgIGNvbnN0IHRleHQgPSBpbm5lcigpLnRyaW0oKTtcbiAgICAgIHJldHVybiBgXFxuJHtoYXNoZXN9ICR7dGV4dH1cXG5cXG5gO1xuICAgIH1cblxuICAgIHN3aXRjaCAodGFnKSB7XG4gICAgICBjYXNlICdwJzpcbiAgICAgICAgcmV0dXJuIGlubmVyKCkgKyAnXFxuXFxuJztcbiAgICAgIGNhc2UgJ2JyJzpcbiAgICAgICAgcmV0dXJuICdcXG4nO1xuICAgICAgY2FzZSAnaHInOlxuICAgICAgICByZXR1cm4gJ1xcbi0tLVxcblxcbic7XG4gICAgICBjYXNlICd1bCc6XG4gICAgICBjYXNlICdvbCc6XG4gICAgICAgIHJldHVybiBpbm5lcigpICsgJ1xcbic7XG4gICAgICBjYXNlICdsaSc6IHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGlubmVyKCkucmVwbGFjZSgvXFxuKyQvLCAnJyk7XG4gICAgICAgIHJldHVybiBgLSAke2NvbnRlbnR9XFxuYDtcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2InOlxuICAgICAgY2FzZSAnc3Ryb25nJzpcbiAgICAgICAgcmV0dXJuIGAqKiR7aW5uZXIoKX0qKmA7XG4gICAgICBjYXNlICdpJzpcbiAgICAgIGNhc2UgJ2VtJzpcbiAgICAgICAgcmV0dXJuIGAqJHtpbm5lcigpfSpgO1xuICAgICAgY2FzZSAnY29kZSc6XG4gICAgICAgIHJldHVybiBgXFxgJHtpbm5lcigpfVxcYGA7XG4gICAgICBjYXNlICdwcmUnOlxuICAgICAgICByZXR1cm4gYFxcYFxcYFxcYFxcbiR7aW5uZXIoKX1cXG5cXGBcXGBcXGBcXG5cXG5gO1xuICAgICAgY2FzZSAndGFibGUnOlxuICAgICAgICByZXR1cm4gdGFibGVUb01kKGVsZW0pICsgJ1xcblxcbic7XG4gICAgICBjYXNlICd0aGVhZCc6XG4gICAgICBjYXNlICd0Ym9keSc6XG4gICAgICBjYXNlICd0cic6XG4gICAgICBjYXNlICd0ZCc6XG4gICAgICBjYXNlICd0aCc6XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBpbm5lcigpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRhYmxlVG9NZCh0YWJsZTogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKHRhYmxlLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyJykpO1xuICAgIGlmIChyb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuXG4gICAgY29uc3QgZ2V0Q2VsbHMgPSAocm93OiBFbGVtZW50KSA9PlxuICAgICAgQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbCgndGQsIHRoJykpLm1hcCgoY2VsbCkgPT5cbiAgICAgICAgQXJyYXkuZnJvbShjZWxsLmNoaWxkTm9kZXMpXG4gICAgICAgICAgLm1hcChub2RlVG9NZClcbiAgICAgICAgICAuam9pbignJylcbiAgICAgICAgICAucmVwbGFjZSgvXFxuKy9nLCAnICcpXG4gICAgICAgICAgLnRyaW0oKVxuICAgICAgKTtcblxuICAgIGNvbnN0IFtoZWFkZXJSb3csIC4uLmJvZHlSb3dzXSA9IHJvd3M7XG4gICAgY29uc3QgaGVhZGVycyA9IGdldENlbGxzKGhlYWRlclJvdyk7XG4gICAgY29uc3Qgc2VwYXJhdG9yID0gaGVhZGVycy5tYXAoKCkgPT4gJy0tLScpO1xuXG4gICAgcmV0dXJuIFtcbiAgICAgIGB8ICR7aGVhZGVycy5qb2luKCcgfCAnKX0gfGAsXG4gICAgICBgfCAke3NlcGFyYXRvci5qb2luKCcgfCAnKX0gfGAsXG4gICAgICAuLi5ib2R5Um93cy5tYXAoKHIpID0+IGB8ICR7Z2V0Q2VsbHMocikuam9pbignIHwgJyl9IHxgKSxcbiAgICBdLmpvaW4oJ1xcbicpO1xuICB9XG5cbiAgcmV0dXJuIEFycmF5LmZyb20oZWwuY2hpbGROb2RlcylcbiAgICAubWFwKG5vZGVUb01kKVxuICAgIC5qb2luKCcnKVxuICAgIC5yZXBsYWNlKC9cXG57Myx9L2csICdcXG5cXG4nKVxuICAgIC50cmltKCk7XG59XG5cbi8vIC0tLSBUZXh0IGNsZWFudXAgLS0tXG5cbmNvbnN0IEFSVElGQUNUX1BBVFRFUk5TID0gW1xuICAvXlsr77yLXSQvLFxuICAvXkdvb2dsZSDjgrnjg5fjg6zjg4Pjg4njgrfjg7zjg4jjgavjgqjjgq/jgrnjg53jg7zjg4gkLyxcbiAgL15Hb29nbGUgU2hlZXRzIOOBq+OCqOOCr+OCueODneODvOODiCQvLFxuICAvXkV4cG9ydCB0byBTaGVldHMkLyxcbl07XG5cbmZ1bmN0aW9uIGNsZWFuTW9kZWxUZXh0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB0ZXh0XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5maWx0ZXIoKGxpbmUpID0+ICFBUlRJRkFDVF9QQVRURVJOUy5zb21lKChwKSA9PiBwLnRlc3QobGluZS50cmltKCkpKSlcbiAgICAuam9pbignXFxuJylcbiAgICAucmVwbGFjZSgvXFxuezMsfS9nLCAnXFxuXFxuJylcbiAgICAudHJpbSgpO1xufVxuXG4vLyAtLS0gU2Nyb2xsIHRvIGxvYWQgYWxsIG1lc3NhZ2VzIC0tLVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkQWxsTWVzc2FnZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHNjcm9sbGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2luZmluaXRlLXNjcm9sbGVyLmNoYXQtaGlzdG9yeSdcbiAgKTtcbiAgaWYgKCFzY3JvbGxlcikgcmV0dXJuO1xuXG4gIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+ODoeODg+OCu+ODvOOCuOOCkuiqreOBv+i+vOOBv+S4rS4uLicpO1xuXG4gIGxldCBwcmV2Q291bnQgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDMwOyBpKyspIHtcbiAgICBzY3JvbGxlci5zY3JvbGxUb3AgPSAwO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDQwMCkpO1xuICAgIGNvbnN0IGNvdW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndXNlci1xdWVyeScpLmxlbmd0aDtcbiAgICBpZiAoY291bnQgPT09IHByZXZDb3VudCkgYnJlYWs7XG4gICAgcHJldkNvdW50ID0gY291bnQ7XG4gIH1cblxuICBzY3JvbGxlci5zY3JvbGxUb3AgPSBzY3JvbGxlci5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIC0tLSBDaGF0IGNvbnRlbnQgZXh0cmFjdGlvbiAtLS1cblxuaW50ZXJmYWNlIENoYXQge1xuICB1c2VyOiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RDaGF0Q29udGVudCgpOiBDaGF0W10ge1xuICBjb25zdCB1c2VyUXVlcmllcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndXNlci1xdWVyeScpKTtcbiAgY29uc3QgbW9kZWxSZXNwb25zZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ21vZGVsLXJlc3BvbnNlJykpO1xuXG4gIGNvbnN0IGNoYXRzOiBDaGF0W10gPSBbXTtcbiAgY29uc3QgbGVuID0gTWF0aC5taW4odXNlclF1ZXJpZXMubGVuZ3RoLCBtb2RlbFJlc3BvbnNlcy5sZW5ndGgpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCB1c2VyVGV4dCA9IEFycmF5LmZyb20oXG4gICAgICB1c2VyUXVlcmllc1tpXS5xdWVyeVNlbGVjdG9yQWxsKCcucXVlcnktdGV4dC1saW5lJylcbiAgICApXG4gICAgICAubWFwKChlbCkgPT4gKGVsIGFzIEhUTUxFbGVtZW50KS5pbm5lclRleHQudHJpbSgpKVxuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oJ1xcbicpO1xuXG4gICAgY29uc3QgbWFya2Rvd25FbCA9IG1vZGVsUmVzcG9uc2VzW2ldLnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnbWVzc2FnZS1jb250ZW50IC5tYXJrZG93bidcbiAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBjb25zdCByYXdNb2RlbFRleHQgPSBtYXJrZG93bkVsXG4gICAgICA/IGRvbVRvTWFya2Rvd24obWFya2Rvd25FbCkudHJpbSgpXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBtb2RlbFRleHQgPSByYXdNb2RlbFRleHQgPyBjbGVhbk1vZGVsVGV4dChyYXdNb2RlbFRleHQpIDogJyc7XG5cbiAgICBpZiAodXNlclRleHQgfHwgbW9kZWxUZXh0KSB7XG4gICAgICBjaGF0cy5wdXNoKHsgdXNlcjogdXNlclRleHQgfHwgJycsIG1vZGVsOiBtb2RlbFRleHQgfHwgJycgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGNoYXRzO1xufVxuXG5mdW5jdGlvbiBnZXRDaGF0SWQoKTogc3RyaW5nIHtcbiAgcmV0dXJuIGxvY2F0aW9uLnBhdGhuYW1lLnNwbGl0KCcvJykucG9wKCkgfHwgJ3Vua25vd24nO1xufVxuXG4vLyAtLS0gWUFNTCBnZW5lcmF0aW9uIChaZXR0ZWxrYXN0ZW4gZm9ybWF0KSAtLS1cblxuZnVuY3Rpb24geWFtbFF1b3RlKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAnXCInICsgcy5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKSArICdcIic7XG59XG5cbmZ1bmN0aW9uIHlhbWxCbG9jayh0ZXh0OiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHRleHRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcCgobGluZSkgPT4gKGxpbmUgPT09ICcnID8gJycgOiBpbmRlbnQgKyBsaW5lKSlcbiAgICAuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlTWFya2Rvd24oY2hhdHM6IENoYXRbXSk6IHtcbiAgbWFya2Rvd246IHN0cmluZztcbiAgaWQ6IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbn0ge1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICBjb25zdCBwYWQgPSAobjogbnVtYmVyKSA9PiBTdHJpbmcobikucGFkU3RhcnQoMiwgJzAnKTtcbiAgY29uc3QgZGF0ZVN0ciA9IGAke25vdy5nZXRGdWxsWWVhcigpfS0ke3BhZChub3cuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChub3cuZ2V0RGF0ZSgpKX1gO1xuICBjb25zdCB0aW1lU3RyID0gYCR7ZGF0ZVN0cn1UJHtwYWQobm93LmdldEhvdXJzKCkpfToke3BhZChub3cuZ2V0TWludXRlcygpKX06JHtwYWQobm93LmdldFNlY29uZHMoKSl9YDtcbiAgY29uc3QgaWQgPSB0aW1lU3RyLnJlcGxhY2UoL1stOlRdL2csICcnKTtcblxuICBjb25zdCBjb252ZXJzYXRpb25UaXRsZSA9IChcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgJ1tkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb24tdGl0bGVcIl0nXG4gICAgKSBhcyBIVE1MRWxlbWVudCB8IG51bGxcbiAgKT8uaW5uZXJUZXh0Py50cmltKCk7XG4gIGNvbnN0IGZpcnN0VXNlckxpbmVzID0gKGNoYXRzWzBdPy51c2VyIHx8ICcnKVxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsKSA9PiBsLnRyaW0oKSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBmYWxsYmFja1RpdGxlID1cbiAgICBmaXJzdFVzZXJMaW5lcy5maW5kKChsKSA9PiAhL15odHRwcz86XFwvXFwvL2kudGVzdChsKSkgfHxcbiAgICBmaXJzdFVzZXJMaW5lc1swXSB8fFxuICAgICdHZW1pbmkgY2hhdCc7XG4gIGNvbnN0IHRpdGxlID0gKGNvbnZlcnNhdGlvblRpdGxlIHx8IGZhbGxiYWNrVGl0bGUpLnNsaWNlKDAsIDYwKTtcblxuICBjb25zdCBjaGF0SWQgPSBnZXRDaGF0SWQoKTtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgIGBpZDogJHt5YW1sUXVvdGUoY2hhdElkKX1gLFxuICAgIGB0aXRsZTogJHt5YW1sUXVvdGUoJ0dlbWluaTogJyArIHRpdGxlKX1gLFxuICAgIGBkYXRlOiAke3lhbWxRdW90ZSh0aW1lU3RyKX1gLFxuICAgIGBzb3VyY2U6ICR7eWFtbFF1b3RlKGxvY2F0aW9uLmhyZWYpfWAsXG4gICAgJ3RhZ3M6JyxcbiAgICAnICAtIGdlbWluaScsXG4gICAgJyAgLSBmbGVldGluZycsXG4gICAgJ2NoYXRzOicsXG4gIF07XG5cbiAgZm9yIChjb25zdCB0dXJuIG9mIGNoYXRzKSB7XG4gICAgbGluZXMucHVzaCgnICAtIHE6IHwnKTtcbiAgICBsaW5lcy5wdXNoKHlhbWxCbG9jayh0dXJuLnVzZXIsICcgICAgICAnKSk7XG4gICAgbGluZXMucHVzaCgnICAgIGE6IHwnKTtcbiAgICBsaW5lcy5wdXNoKHlhbWxCbG9jayh0dXJuLm1vZGVsLCAnICAgICAgJykpO1xuICB9XG5cblxuICByZXR1cm4geyBtYXJrZG93bjogbGluZXMuam9pbignXFxuJyksIGlkLCB0aXRsZSB9O1xufVxuXG4vLyAtLS0gRmlsZSBzYXZlIC0tLVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZU5vdGUoZm9yY2VQaWNrRGlyID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgbG9hZEFsbE1lc3NhZ2VzKCk7XG5cbiAgY29uc3QgY2hhdHMgPSBleHRyYWN0Q2hhdENvbnRlbnQoKTtcbiAgaWYgKGNoYXRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+S/neWtmOOBp+OBjeOCi+S8muipseOBjOimi+OBpOOBi+OCiuOBvuOBm+OCkycsICdlcnJvcicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBkaXJIYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU7XG4gIHRyeSB7XG4gICAgaWYgKGZvcmNlUGlja0Rpcikge1xuICAgICAgY29uc3QgaGFuZGxlID0gYXdhaXQgd2luZG93LnNob3dEaXJlY3RvcnlQaWNrZXIoeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICAgIGF3YWl0IHN0b3JlRGlySGFuZGxlKGhhbmRsZSk7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBoYW5kbGU7XG4gICAgICBkaXJIYW5kbGUgPSBoYW5kbGU7XG4gICAgICBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKGDkv53lrZjlhYjjgpLlpInmm7Q6ICR7aGFuZGxlLm5hbWV9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpckhhbmRsZSA9IGF3YWl0IGdldEV4cG9ydERpckhhbmRsZSgpO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBtYXJrZG93biwgdGl0bGUgfSA9IGdlbmVyYXRlTWFya2Rvd24oY2hhdHMpO1xuICBjb25zdCBjaGF0SWQgPSBnZXRDaGF0SWQoKTtcbiAgY29uc3Qgc2FmZVRpdGxlID0gdGl0bGVcbiAgICAucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdL2csICcnKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csICctJylcbiAgICAuc2xpY2UoMCwgNDApO1xuICBjb25zdCBmaWxlbmFtZSA9IGBnZW1pbmktJHtzYWZlVGl0bGV9LSR7Y2hhdElkfS55YW1sYDtcblxuICB0cnkge1xuICAgIGNvbnN0IGluYm94SGFuZGxlID0gYXdhaXQgZGlySGFuZGxlLmdldERpcmVjdG9yeUhhbmRsZSgnaW5ib3gnLCB7XG4gICAgICBjcmVhdGU6IHRydWUsXG4gICAgfSk7XG4gICAgY29uc3QgZmlsZUhhbmRsZSA9IGF3YWl0IGluYm94SGFuZGxlLmdldEZpbGVIYW5kbGUoZmlsZW5hbWUsIHtcbiAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBjb25zdCB3cml0YWJsZSA9IGF3YWl0IGZpbGVIYW5kbGUuY3JlYXRlV3JpdGFibGUoKTtcbiAgICBhd2FpdCB3cml0YWJsZS53cml0ZShtYXJrZG93bik7XG4gICAgYXdhaXQgd3JpdGFibGUuY2xvc2UoKTtcbiAgICBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKGDkv53lrZjjgZfjgb7jgZfjgZ86IGluYm94LyR7ZmlsZW5hbWV9YCk7XG4gIH0gY2F0Y2gge1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+S/neWtmOOBq+WkseaVl+OBl+OBvuOBl+OBnycsICdlcnJvcicpO1xuICB9XG59XG5cbi8vIC0tLSBVSSAtLS1cblxuZnVuY3Rpb24gc2hvd0V4cG9ydE5vdGlmaWNhdGlvbihcbiAgbWVzc2FnZTogc3RyaW5nLFxuICB0eXBlOiAnc3VjY2VzcycgfCAnZXJyb3InID0gJ3N1Y2Nlc3MnXG4pOiB2b2lkIHtcbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2VtaW5pLWV4cG9ydC1ub3RpZmljYXRpb24nKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBlbC5pZCA9ICdnZW1pbmktZXhwb3J0LW5vdGlmaWNhdGlvbic7XG4gIGVsLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJvdHRvbTogMjRweDtcbiAgICByaWdodDogMjRweDtcbiAgICBiYWNrZ3JvdW5kOiAke3R5cGUgPT09ICdlcnJvcicgPyAnI2M2MjgyOCcgOiAnIzFiNWUyMCd9O1xuICAgIGNvbG9yOiB3aGl0ZTtcbiAgICBwYWRkaW5nOiAxMnB4IDIwcHg7XG4gICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgIHotaW5kZXg6IDEwMDAwO1xuICAgIGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIHNhbnMtc2VyaWY7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLDAsMCwwLjMpO1xuICBgO1xuICBlbC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWwpO1xuICBzZXRUaW1lb3V0KCgpID0+IGVsLnJlbW92ZSgpLCAzMDAwKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRXhwb3J0QnV0dG9uKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoRVhQT1JUX0JVVFRPTl9JRCkpIHJldHVybjtcblxuICBjb25zdCBpbnB1dEFyZWEgPVxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LWFyZWEtdjInKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LWNvbnRhaW5lcicpO1xuICBpZiAoIWlucHV0QXJlYSkgcmV0dXJuO1xuXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBidG4uaWQgPSBFWFBPUlRfQlVUVE9OX0lEO1xuICBidG4udGl0bGUgPVxuICAgICdTYXZlIGFzIFpldHRlbGthc3RlbiBub3RlXFxuU2hpZnQr44Kv44Oq44OD44Kv44Gn5L+d5a2Y5YWI44KS5aSJ5pu0JztcbiAgYnRuLnRleHRDb250ZW50ID0gJ/Cfkr4gU2F2ZSBub3RlJztcbiAgYnRuLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJvdHRvbTogMTAwcHg7XG4gICAgcmlnaHQ6IDI0cHg7XG4gICAgYmFja2dyb3VuZDogIzFhNzNlODtcbiAgICBjb2xvcjogd2hpdGU7XG4gICAgYm9yZGVyOiBub25lO1xuICAgIGJvcmRlci1yYWRpdXM6IDIwcHg7XG4gICAgcGFkZGluZzogOHB4IDE2cHg7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIHNhbnMtc2VyaWY7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIHotaW5kZXg6IDk5OTk7XG4gICAgYm94LXNoYWRvdzogMCAycHggOHB4IHJnYmEoMCwwLDAsMC4yNSk7XG4gICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjJzO1xuICBgO1xuXG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyMxNTU3YjAnO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzFhNzNlOCc7XG4gIH0pO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gc2F2ZU5vdGUoZS5zaGlmdEtleSkpO1xuXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYnRuKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVFeHBvcnQoKTogdm9pZCB7XG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBpZiAoIWNoYXRJZCB8fCBjaGF0SWQgPT09ICdhcHAnKSByZXR1cm47XG4gIGNyZWF0ZUV4cG9ydEJ1dHRvbigpO1xufVxuIiwiLy8gS2V5Ym9hcmQgZXZlbnQgaGFuZGxlcnNcblxuaW1wb3J0IHsgaXNTaG9ydGN1dCwgbG9hZFNob3J0Y3V0cywgZ2V0U2hvcnRjdXRzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XG5pbXBvcnQgeyBpc0F1dG9jb21wbGV0ZVZpc2libGUgfSBmcm9tICcuL2F1dG9jb21wbGV0ZSc7XG5pbXBvcnQge1xuICBzY3JvbGxDaGF0QXJlYSxcbiAgZm9jdXNUZXh0YXJlYSxcbiAgdG9nZ2xlU2lkZWJhcixcbiAgZ2V0QWxsQWN0aW9uQnV0dG9ucyxcbiAgZm9jdXNBY3Rpb25CdXR0b24sXG4gIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyxcbn0gZnJvbSAnLi9jaGF0JztcbmltcG9ydCB7XG4gIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUsXG4gIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgbW92ZUhpc3RvcnlVcCxcbiAgbW92ZUhpc3RvcnlEb3duLFxuICBvcGVuU2VsZWN0ZWRIaXN0b3J5LFxufSBmcm9tICcuL2hpc3RvcnknO1xuaW1wb3J0IHtcbiAgaXNTZWFyY2hQYWdlLFxuICB0b2dnbGVTZWFyY2hQYWdlLFxuICBtb3ZlU2VhcmNoUmVzdWx0VXAsXG4gIG1vdmVTZWFyY2hSZXN1bHREb3duLFxuICBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQsXG59IGZyb20gJy4vc2VhcmNoJztcbmltcG9ydCB7IHNhdmVOb3RlIH0gZnJvbSAnLi9leHBvcnQnO1xuXG5sZXQgbGFzdEZvY3VzZWRBY3Rpb25CdXR0b25JbmRleCA9IC0xO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbihpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gIGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXggPSBpbmRleDtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU2VhcmNoUGFnZUtleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcbiAgaWYgKGlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSB7XG4gICAgaWYgKFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dVcCcgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0Fycm93RG93bicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0VudGVyJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnVGFiJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRXNjYXBlJ1xuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5uYXZpZ2F0ZVRvU2VhcmNoJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHRvZ2dsZVNlYXJjaFBhZ2UoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLm1vdmVVcCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbiAgICBtb3ZlU2VhcmNoUmVzdWx0VXAoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLm1vdmVEb3duJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgIG1vdmVTZWFyY2hSZXN1bHREb3duKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5vcGVuUmVzdWx0JykpIHtcbiAgICBpZiAoZXZlbnQuaXNDb21wb3NpbmcpIHJldHVybiBmYWxzZTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgIG9wZW5TZWxlY3RlZFNlYXJjaFJlc3VsdCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2guc2Nyb2xsVXAnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgd2luZG93LnNjcm9sbEJ5KHsgdG9wOiAtd2luZG93LmlubmVySGVpZ2h0ICogMC44LCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2guc2Nyb2xsRG93bicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuOCwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IHNob3J0Y3V0cyA9IGdldFNob3J0Y3V0cygpO1xuICBjb25zdCBjaGF0S2V5cyA9IE9iamVjdC52YWx1ZXMoc2hvcnRjdXRzLmNoYXQpO1xuICBpZiAoY2hhdEtleXMuaW5jbHVkZXMoZXZlbnQuY29kZSkpIHJldHVybiB0cnVlO1xuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlQ2hhdFBhZ2VLZXlkb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGlzSW5JbnB1dCA9IChldmVudC50YXJnZXQgYXMgRWxlbWVudCkubWF0Y2hlcyhcbiAgICAnaW5wdXQsIHRleHRhcmVhLCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXSdcbiAgKTtcblxuICBpZiAoaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHtcbiAgICBpZiAoXG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd1VwJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRW50ZXInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdUYWInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFc2NhcGUnXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKGV2ZW50LmNvZGUgPT09ICdIb21lJyAmJiAhZXZlbnQubWV0YUtleSAmJiAhZXZlbnQuY3RybEtleSAmJiAhaXNJbklucHV0KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBzYXZlTm90ZShldmVudC5zaGlmdEtleSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoZXZlbnQuY3RybEtleSAmJiBldmVudC5zaGlmdEtleSAmJiBldmVudC5jb2RlID09PSAnS2V5RCcpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHdpbmRvdy5kb21BbmFseXplcj8uY29weVRvQ2xpcGJvYXJkKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQubmF2aWdhdGVUb1NlYXJjaCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB0b2dnbGVTZWFyY2hQYWdlKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQudG9nZ2xlU2lkZWJhcicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB0b2dnbGVTaWRlYmFyKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQudG9nZ2xlSGlzdG9yeU1vZGUnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICBjb25zdCBhY3Rpb25CdXR0b25zID0gZ2V0QWxsQWN0aW9uQnV0dG9ucygpO1xuICAgIGNvbnN0IGhhc1Jlc3BvbnNlcyA9IGFjdGlvbkJ1dHRvbnMubGVuZ3RoID4gMDtcblxuICAgIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkpIHtcbiAgICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgZm9jdXNUZXh0YXJlYSgpO1xuICAgIH0gZWxzZSBpZiAoaXNJbklucHV0KSB7XG4gICAgICBpZiAoaGFzUmVzcG9uc2VzKSB7XG4gICAgICAgIGxldCB0YXJnZXRJbmRleCA9IGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXg7XG4gICAgICAgIGlmICh0YXJnZXRJbmRleCA8IDAgfHwgdGFyZ2V0SW5kZXggPj0gYWN0aW9uQnV0dG9ucy5sZW5ndGgpIHtcbiAgICAgICAgICB0YXJnZXRJbmRleCA9IGFjdGlvbkJ1dHRvbnMubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgICAgICBhY3Rpb25CdXR0b25zW3RhcmdldEluZGV4XS5mb2N1cygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmb2N1c2VkRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29uc3QgaXNBY3Rpb25CdXR0b24gPVxuICAgICAgICBmb2N1c2VkRWxlbWVudCAmJlxuICAgICAgICAoZm9jdXNlZEVsZW1lbnQuY2xhc3NMaXN0Py5jb250YWlucygnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKSB8fFxuICAgICAgICAgIGZvY3VzZWRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2RlZXAtZGl2ZScpO1xuICAgICAgaWYgKGlzQWN0aW9uQnV0dG9uKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KFxuICAgICAgICAgIChidG4pID0+IGJ0biA9PT0gZm9jdXNlZEVsZW1lbnRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCAhPT0gLTEpIGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXggPSBjdXJyZW50SW5kZXg7XG4gICAgICAgIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzVGV4dGFyZWEoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlFeGl0JykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnNjcm9sbFVwJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHNjcm9sbENoYXRBcmVhKCd1cCcpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnNjcm9sbERvd24nKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgc2Nyb2xsQ2hhdEFyZWEoJ2Rvd24nKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkpIHtcbiAgICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtb3ZlSGlzdG9yeVVwKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtb3ZlSGlzdG9yeURvd24oKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeU9wZW4nKSkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG9wZW5TZWxlY3RlZEhpc3RvcnkoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAhaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmXG4gICAgaXNJbklucHV0ICYmXG4gICAgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpIHx8IGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJykpXG4gICkge1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcbiAgICBpZiAodGV4dGFyZWEgJiYgdGV4dGFyZWEudGV4dENvbnRlbnQ/LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBkaXJlY3Rpb24gPSBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSA/ICd1cCcgOiAnZG93bic7XG4gICAgICBmb2N1c0FjdGlvbkJ1dHRvbihkaXJlY3Rpb24pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkgJiYgIWlzSW5JbnB1dCkge1xuICAgIGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgaXNBY3Rpb25CdXR0b24gPVxuICAgICAgZm9jdXNlZEVsZW1lbnQgJiZcbiAgICAgIChmb2N1c2VkRWxlbWVudC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdkZWVwLWRpdmUtYnV0dG9uLWlubGluZScpIHx8XG4gICAgICAgIGZvY3VzZWRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2RlZXAtZGl2ZScpO1xuXG4gICAgaWYgKGlzQWN0aW9uQnV0dG9uKSB7XG4gICAgICBpZiAoXG4gICAgICAgIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpIHx8XG4gICAgICAgIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJylcbiAgICAgICkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSA/ICd1cCcgOiAnZG93bic7XG4gICAgICAgIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyhkaXJlY3Rpb24pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnIHx8IGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgZXhwYW5kQnV0dG9uID0gKGZvY3VzZWRFbGVtZW50IGFzIGFueSkuX2V4cGFuZEJ1dHRvbiBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gKGZvY3VzZWRFbGVtZW50IGFzIGFueSkuX2RlZXBEaXZlVGFyZ2V0O1xuICAgICAgICBpZiAoZXhwYW5kQnV0dG9uICYmIHRhcmdldCkge1xuICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPVxuICAgICAgICAgICAgZXhwYW5kQnV0dG9uLmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2NvbGxhcHNlJztcbiAgICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dSaWdodCcgJiYgIWlzRXhwYW5kZWQpIHtcbiAgICAgICAgICAgIGV4cGFuZEJ1dHRvbi5jbGljaygpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dMZWZ0JyAmJiBpc0V4cGFuZGVkKSB7XG4gICAgICAgICAgICBleHBhbmRCdXR0b24uY2xpY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5T3BlbicpKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGZvY3VzZWRFbGVtZW50LmNsaWNrKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVLZXlib2FyZEhhbmRsZXJzKCk6IHZvaWQge1xuICBsb2FkU2hvcnRjdXRzKCkudGhlbigoKSA9PiB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICdrZXlkb3duJyxcbiAgICAgIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoaXNTZWFyY2hQYWdlKCkpIHtcbiAgICAgICAgICBoYW5kbGVTZWFyY2hQYWdlS2V5ZG93bihldmVudCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGhhbmRsZUNoYXRQYWdlS2V5ZG93bihldmVudCk7XG4gICAgICB9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH0pO1xufVxuIiwiLy8gRGVlcCBkaXZlIGZ1bmN0aW9uYWxpdHkgZm9yIEdlbWluaSByZXNwb25zZXNcblxuaW50ZXJmYWNlIERlZXBEaXZlTW9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHByb21wdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIERlZXBEaXZlVGFyZ2V0IHtcbiAgdHlwZTogJ3NlY3Rpb24nIHwgJ3RhYmxlJyB8ICdibG9ja3F1b3RlJyB8ICdsaXN0JyB8ICdjaGlsZCcgfCAnb3JwaGFuJztcbiAgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG4gIGdldENvbnRlbnQ6ICgpID0+IHN0cmluZztcbiAgZXhwYW5kQnV0dG9uSWQ/OiBzdHJpbmc7XG59XG5cbmNvbnN0IERFRkFVTFRfREVFUF9ESVZFX01PREVTOiBEZWVwRGl2ZU1vZGVbXSA9IFtcbiAgeyBpZDogJ2RlZmF1bHQnLCBwcm9tcHQ6ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nIH0sXG5dO1xuXG5mdW5jdGlvbiBhZGREZWVwRGl2ZUJ1dHRvbnMoKTogdm9pZCB7XG4gIGNvbnN0IHJlc3BvbnNlQ29udGFpbmVycyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tYXJrZG93bi1tYWluLXBhbmVsJyk7XG4gIGlmIChyZXNwb25zZUNvbnRhaW5lcnMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgcmVzcG9uc2VDb250YWluZXJzLmZvckVhY2goKHJlc3BvbnNlQ29udGFpbmVyKSA9PiB7XG4gICAgY29uc3QgdGFyZ2V0czogRGVlcERpdmVUYXJnZXRbXSA9IFtdO1xuXG4gICAgY29uc3QgaGVhZGluZ3MgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICdoMVtkYXRhLXBhdGgtdG8tbm9kZV0sIGgyW2RhdGEtcGF0aC10by1ub2RlXSwgaDNbZGF0YS1wYXRoLXRvLW5vZGVdLCBoNFtkYXRhLXBhdGgtdG8tbm9kZV0sIGg1W2RhdGEtcGF0aC10by1ub2RlXSwgaDZbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICk7XG4gICAgY29uc3QgaGFzSGVhZGluZ3MgPSBoZWFkaW5ncy5sZW5ndGggPiAwO1xuXG4gICAgaWYgKGhhc0hlYWRpbmdzKSB7XG4gICAgICBoZWFkaW5ncy5mb3JFYWNoKChoZWFkaW5nKSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gaGVhZGluZy5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nLmhhc0F0dHJpYnV0ZSgnZGF0YS1pbml0aWFsaXplZCcpKSByZXR1cm47XG4gICAgICAgICAgaGVhZGluZy5xdWVyeVNlbGVjdG9yQWxsKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUsIC5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbicpLmZvckVhY2goKGIpID0+IGIucmVtb3ZlKCkpO1xuICAgICAgICB9XG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ3NlY3Rpb24nLFxuICAgICAgICAgIGVsZW1lbnQ6IGhlYWRpbmcsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0U2VjdGlvbkNvbnRlbnQoaGVhZGluZyksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHRhYmxlcyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAndGFibGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIHRhYmxlcy5mb3JFYWNoKCh0YWJsZSkgPT4ge1xuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGFibGUuY2xvc2VzdDxIVE1MRWxlbWVudD4oJy50YWJsZS1ibG9jay1jb21wb25lbnQnKTtcbiAgICAgICAgaWYgKHdyYXBwZXIpIHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHdyYXBwZXIucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ3RhYmxlJyxcbiAgICAgICAgICAgIGVsZW1lbnQ6IHdyYXBwZXIsXG4gICAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRUYWJsZUNvbnRlbnQodGFibGUpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaC9ociDjgavlsZ7jgZXjgarjgYTlraTnq4vmrrXokL3jg5bjg63jg4Pjgq/vvIjlhYjpoK3jg7vmnKvlsL7jgarjganvvInjgpLjgr/jg7zjgrLjg4Pjg4jjgavov73liqBcbiAgICAgIGNvbnN0IG9ycGhhbkdyb3VwcyA9IGdldE9ycGhhblBhcmFncmFwaEdyb3VwcyhyZXNwb25zZUNvbnRhaW5lciBhcyBIVE1MRWxlbWVudCwgaGVhZGluZ3MpO1xuICAgICAgb3JwaGFuR3JvdXBzLmZvckVhY2goKGdyb3VwKSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gZ3JvdXAuYW5jaG9yLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdvcnBoYW4nLFxuICAgICAgICAgIGVsZW1lbnQ6IGdyb3VwLmFuY2hvcixcbiAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBncm91cC5lbGVtZW50cy5tYXAoKGVsKSA9PiBlbC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnKS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuXFxuJyksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlcyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAndGFibGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIHRhYmxlcy5mb3JFYWNoKCh0YWJsZSkgPT4ge1xuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGFibGUuY2xvc2VzdDxIVE1MRWxlbWVudD4oJy50YWJsZS1ibG9jay1jb21wb25lbnQnKTtcbiAgICAgICAgaWYgKHdyYXBwZXIpIHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHdyYXBwZXIucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ3RhYmxlJyxcbiAgICAgICAgICAgIGVsZW1lbnQ6IHdyYXBwZXIsXG4gICAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRUYWJsZUNvbnRlbnQodGFibGUpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgYmxvY2txdW90ZXMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ2Jsb2NrcXVvdGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGJsb2NrcXVvdGVzLmZvckVhY2goKGJsb2NrcXVvdGUpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBibG9ja3F1b3RlLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdibG9ja3F1b3RlJyxcbiAgICAgICAgICBlbGVtZW50OiBibG9ja3F1b3RlLFxuICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGJsb2NrcXVvdGUudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJyxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgbGlzdHMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ29sW2RhdGEtcGF0aC10by1ub2RlXSwgdWxbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGxpc3RzLmZvckVhY2goKGxpc3QpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBsaXN0LnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICBsaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSwgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJykuZm9yRWFjaCgoYikgPT4gYi5yZW1vdmUoKSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcGFyZW50ID0gbGlzdC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBsZXQgaXNOZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgd2hpbGUgKHBhcmVudCAmJiBwYXJlbnQgIT09IHJlc3BvbnNlQ29udGFpbmVyKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHBhcmVudC50YWdOYW1lID09PSAnT0wnIHx8IHBhcmVudC50YWdOYW1lID09PSAnVUwnKSAmJlxuICAgICAgICAgICAgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZGF0YS1wYXRoLXRvLW5vZGUnKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgaXNOZXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc05lc3RlZCkgcmV0dXJuO1xuXG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ2xpc3QnLFxuICAgICAgICAgIGVsZW1lbnQ6IGxpc3QsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0TGlzdENvbnRlbnQobGlzdCksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGFyZ2V0cy5mb3JFYWNoKCh0YXJnZXQpID0+IGFkZERlZXBEaXZlQnV0dG9uKHRhcmdldCkpO1xuICB9KTtcbn1cblxuaW50ZXJmYWNlIE9ycGhhbkdyb3VwIHtcbiAgYW5jaG9yOiBIVE1MRWxlbWVudDtcbiAgZWxlbWVudHM6IEhUTUxFbGVtZW50W107XG59XG5cbmZ1bmN0aW9uIGdldE9ycGhhblBhcmFncmFwaEdyb3VwcyhcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcbiAgaGVhZGluZ3M6IE5vZGVMaXN0T2Y8SFRNTEVsZW1lbnQ+XG4pOiBPcnBoYW5Hcm91cFtdIHtcbiAgY29uc3QgaGVhZGluZ1NldCA9IG5ldyBTZXQoQXJyYXkuZnJvbShoZWFkaW5ncykpO1xuICBjb25zdCBjaGlsZHJlbiA9IEFycmF5LmZyb20oY29udGFpbmVyLmNoaWxkcmVuKSBhcyBIVE1MRWxlbWVudFtdO1xuICBjb25zdCBncm91cHM6IE9ycGhhbkdyb3VwW10gPSBbXTtcbiAgbGV0IGN1cnJlbnQ6IEhUTUxFbGVtZW50W10gPSBbXTtcbiAgLy8g55u05YmN44Gu5Yy65YiH44KK44GMaOOCv+OCsOOBi+OBqeOBhuOBi++8iGjjgr/jgrDnm7Tlvozjga5w44Gv44K744Kv44K344On44Oz5pys5paH44Gq44Gu44Gnb3JwaGFu44Gn44Gv44Gq44GE77yJXG4gIGxldCBwcmV2QnJlYWtlcldhc0hlYWRpbmcgPSBmYWxzZTtcblxuICBjb25zdCBmbHVzaCA9IChhZnRlckhlYWRpbmc6IGJvb2xlYW4pID0+IHtcbiAgICBpZiAoY3VycmVudC5sZW5ndGggPiAwICYmICFhZnRlckhlYWRpbmcpIHtcbiAgICAgIGdyb3Vwcy5wdXNoKHsgYW5jaG9yOiBjdXJyZW50WzBdLCBlbGVtZW50czogWy4uLmN1cnJlbnRdIH0pO1xuICAgIH1cbiAgICBjdXJyZW50ID0gW107XG4gIH07XG5cbiAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgIGNvbnN0IHRhZyA9IGNoaWxkLnRhZ05hbWU7XG4gICAgY29uc3QgaXNQYXJhZ3JhcGggPSB0YWcgPT09ICdQJztcbiAgICBjb25zdCBpc0hlYWRpbmcgPVxuICAgICAgaGVhZGluZ1NldC5oYXMoY2hpbGQpIHx8XG4gICAgICB0YWcgPT09ICdIMScgfHwgdGFnID09PSAnSDInIHx8IHRhZyA9PT0gJ0gzJyB8fFxuICAgICAgdGFnID09PSAnSDQnIHx8IHRhZyA9PT0gJ0g1JyB8fCB0YWcgPT09ICdINic7XG4gICAgY29uc3QgaXNIciA9IHRhZyA9PT0gJ0hSJztcblxuICAgIGlmIChpc0hlYWRpbmcpIHtcbiAgICAgIGZsdXNoKHByZXZCcmVha2VyV2FzSGVhZGluZyk7XG4gICAgICBwcmV2QnJlYWtlcldhc0hlYWRpbmcgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaXNIcikge1xuICAgICAgZmx1c2gocHJldkJyZWFrZXJXYXNIZWFkaW5nKTtcbiAgICAgIHByZXZCcmVha2VyV2FzSGVhZGluZyA9IGZhbHNlO1xuICAgIH0gZWxzZSBpZiAoaXNQYXJhZ3JhcGgpIHtcbiAgICAgIGN1cnJlbnQucHVzaChjaGlsZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHVsL29sL3RhYmxlL2Jsb2NrcXVvdGUg562J44Gv44Kw44Or44O844OX44KS5Yy65YiH44KL44Gg44GR44Gn5Y+O6ZuG44GX44Gq44GEXG4gICAgICBmbHVzaChwcmV2QnJlYWtlcldhc0hlYWRpbmcpO1xuICAgICAgcHJldkJyZWFrZXJXYXNIZWFkaW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZsdXNoKHByZXZCcmVha2VyV2FzSGVhZGluZyk7XG5cbiAgcmV0dXJuIGdyb3Vwcztcbn1cblxuZnVuY3Rpb24gZ2V0U2VjdGlvbkNvbnRlbnQoaGVhZGluZzogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBsZXQgY29udGVudCA9IChoZWFkaW5nLnRleHRDb250ZW50Py50cmltKCkgPz8gJycpICsgJ1xcblxcbic7XG4gIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXG4gIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnRlbnQgKz0gKGN1cnJlbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJykgKyAnXFxuXFxuJztcbiAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICB9XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUYWJsZUNvbnRlbnQodGFibGU6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgbGV0IGNvbnRlbnQgPSAnJztcbiAgY29uc3Qgcm93cyA9IHRhYmxlLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTFRhYmxlUm93RWxlbWVudD4oJ3RyJyk7XG5cbiAgcm93cy5mb3JFYWNoKChyb3csIHJvd0luZGV4KSA9PiB7XG4gICAgY29uc3QgY2VsbHMgPSByb3cucXVlcnlTZWxlY3RvckFsbCgndGQsIHRoJyk7XG4gICAgY29uc3QgY2VsbFRleHRzID0gQXJyYXkuZnJvbShjZWxscykubWFwKChjZWxsKSA9PlxuICAgICAgY2VsbC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnXG4gICAgKTtcbiAgICBjb250ZW50ICs9ICd8ICcgKyBjZWxsVGV4dHMuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIGlmIChyb3dJbmRleCA9PT0gMCkge1xuICAgICAgY29udGVudCArPSAnfCAnICsgY2VsbFRleHRzLm1hcCgoKSA9PiAnLS0tJykuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRMaXN0Q29udGVudChsaXN0OiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIHJldHVybiBsaXN0LnRleHRDb250ZW50Py50cmltKCkgPz8gJyc7XG59XG5cbnR5cGUgRGVlcERpdmVCdXR0b25FbGVtZW50ID0gSFRNTEJ1dHRvbkVsZW1lbnQgJiB7XG4gIF9kZWVwRGl2ZVRhcmdldD86IERlZXBEaXZlVGFyZ2V0O1xuICBfZXhwYW5kQnV0dG9uPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gIF9wb3B1cENsb3NlZEF0PzogbnVtYmVyO1xufTtcblxuZnVuY3Rpb24gYWRkRGVlcERpdmVCdXR0b24odGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSBhcyBEZWVwRGl2ZUJ1dHRvbkVsZW1lbnQ7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdkZWVwLWRpdmUnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1pbml0aWFsaXplZCcsICcxJyk7XG4gIGJ1dHRvbi50aXRsZSA9ICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnO1xuICBidXR0b24uX2RlZXBEaXZlVGFyZ2V0ID0gdGFyZ2V0O1xuXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzE2Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAyNCAyNCcpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdmaWxsJywgJ2N1cnJlbnRDb2xvcicpO1xuICBjb25zdCBwYXRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdwYXRoJyk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdkJywgJ00xOSAxNWwtNiA2LTEuNS0xLjVMMTUgMTZINFY5aDJ2NWg5bC0zLjUtMy41TDEzIDlsNiA2eicpO1xuICBzdmcuYXBwZW5kQ2hpbGQocGF0aCk7XG4gIGJ1dHRvbi5hcHBlbmRDaGlsZChzdmcpO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaW5zZXJ0RGVlcERpdmVRdWVyeSh0YXJnZXQsIGUuY3RybEtleSk7XG4gIH0pO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiAhZS5hbHRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5KSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgaWYgKGJ1dHRvbi5fcG9wdXBDbG9zZWRBdCAmJiBEYXRlLm5vdygpIC0gYnV0dG9uLl9wb3B1cENsb3NlZEF0IDwgMzAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGFuZEJ0biA9IGJ1dHRvbi5fZXhwYW5kQnV0dG9uO1xuICAgICAgaWYgKGV4cGFuZEJ0biAmJiBleHBhbmRCdG4uZ2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicpID09PSAnZXhwYW5kJykge1xuICAgICAgICB0b2dnbGVFeHBhbmQodGFyZ2V0LCBleHBhbmRCdG4pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzaG93VGVtcGxhdGVQb3B1cChidXR0b24sIHRhcmdldCk7XG4gICAgfVxuICB9KTtcblxuICBsZXQgZXhwYW5kQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJyB8fCB0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgZXhwYW5kQnV0dG9uID0gY3JlYXRlRXhwYW5kQnV0dG9uKHRhcmdldCk7XG4gICAgYnV0dG9uLl9leHBhbmRCdXR0b24gPSBleHBhbmRCdXR0b247XG4gIH1cblxuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5nYXAgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIGlmIChleHBhbmRCdXR0b24pIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGV4cGFuZEJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICd0YWJsZScpIHtcbiAgICBjb25zdCBmb290ZXIgPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnRhYmxlLWZvb3RlcicpO1xuICAgIGlmIChmb290ZXIpIHtcbiAgICAgIGNvbnN0IGNvcHlCdXR0b24gPSBmb290ZXIucXVlcnlTZWxlY3RvcignLmNvcHktYnV0dG9uJyk7XG4gICAgICBpZiAoY29weUJ1dHRvbikge1xuICAgICAgICBmb290ZXIuaW5zZXJ0QmVmb3JlKGJ1dHRvbiwgY29weUJ1dHRvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb290ZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdibG9ja3F1b3RlJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnOHB4JztcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnb3JwaGFuJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzAnO1xuICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdsaXN0Jykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gICAgYnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzAnO1xuICAgIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG4gICAgaWYgKGV4cGFuZEJ1dHRvbikge1xuICAgICAgZXhwYW5kQnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICAgIGV4cGFuZEJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gICAgICBleHBhbmRCdXR0b24uc3R5bGUucmlnaHQgPSAnMzJweCc7XG4gICAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChleHBhbmRCdXR0b24pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVFeHBhbmRCdXR0b24odGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IEhUTUxCdXR0b25FbGVtZW50IHtcbiAgY29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLWV4cGFuZC1idXR0b24nO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0V4cGFuZCB0byBzZWxlY3QnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnZXhwYW5kJyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7XG4gIGJ1dHRvbi50aXRsZSA9ICdFeHBhbmQgdG8gc2VsZWN0JztcbiAgYnV0dG9uLnRleHRDb250ZW50ID0gJysnO1xuICBidXR0b24uc3R5bGUuZm9udFNpemUgPSAnMTRweCc7XG4gIGJ1dHRvbi5zdHlsZS5mb250V2VpZ2h0ID0gJ2JvbGQnO1xuXG4gIGJ1dHRvbi5kYXRhc2V0LnRhcmdldElkID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyKDIsIDkpO1xuICB0YXJnZXQuZXhwYW5kQnV0dG9uSWQgPSBidXR0b24uZGF0YXNldC50YXJnZXRJZDtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHRvZ2dsZUV4cGFuZCh0YXJnZXQsIGJ1dHRvbik7XG4gIH0pO1xuXG4gIHJldHVybiBidXR0b247XG59XG5cbmZ1bmN0aW9uIHRvZ2dsZUV4cGFuZCh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0LCBidXR0b246IEhUTUxCdXR0b25FbGVtZW50KTogdm9pZCB7XG4gIGNvbnN0IGlzRXhwYW5kZWQgPSBidXR0b24uZ2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicpID09PSAnY29sbGFwc2UnO1xuXG4gIGlmIChpc0V4cGFuZGVkKSB7XG4gICAgY29sbGFwc2VDaGlsZEJ1dHRvbnModGFyZ2V0KTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdleHBhbmQnKTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0V4cGFuZCB0byBzZWxlY3QnKTtcbiAgICBidXR0b24udGl0bGUgPSAnRXhwYW5kIHRvIHNlbGVjdCc7XG4gICAgYnV0dG9uLnRleHRDb250ZW50ID0gJysnO1xuICB9IGVsc2Uge1xuICAgIGV4cGFuZENoaWxkQnV0dG9ucyh0YXJnZXQpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2NvbGxhcHNlJyk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdDb2xsYXBzZScpO1xuICAgIGJ1dHRvbi50aXRsZSA9ICdDb2xsYXBzZSc7XG4gICAgYnV0dG9uLnRleHRDb250ZW50ID0gJy0nO1xuICB9XG59XG5cbmZ1bmN0aW9uIGV4cGFuZENoaWxkQnV0dG9ucyh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0KTogdm9pZCB7XG4gIGlmICh0YXJnZXQudHlwZSA9PT0gJ3NlY3Rpb24nKSB7XG4gICAgY29uc3QgaGVhZGluZyA9IHRhcmdldC5lbGVtZW50O1xuICAgIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXG4gICAgd2hpbGUgKGN1cnJlbnQgJiYgIWN1cnJlbnQubWF0Y2hlcygnaDEsIGgyLCBoMywgaDQsIGg1LCBoNiwgaHInKSkge1xuICAgICAgaWYgKGN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0YWJsZS1ibG9jay1jb21wb25lbnQnKSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChjdXJyZW50LnRhZ05hbWUgPT09ICdQJyAmJiAhY3VycmVudC5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpKSB7XG4gICAgICAgIGFkZENoaWxkQnV0dG9uKGN1cnJlbnQpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAoY3VycmVudC50YWdOYW1lID09PSAnVUwnIHx8IGN1cnJlbnQudGFnTmFtZSA9PT0gJ09MJykgJiZcbiAgICAgICAgY3VycmVudC5oYXNBdHRyaWJ1dGUoJ2RhdGEtcGF0aC10by1ub2RlJylcbiAgICAgICkge1xuICAgICAgICBjb25zdCBpdGVtcyA9IGN1cnJlbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJzpzY29wZSA+IGxpJyk7XG4gICAgICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgICAgICBpZiAoIWl0ZW0ucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKSkge1xuICAgICAgICAgICAgYWRkQ2hpbGRCdXR0b24oaXRlbSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRhcmdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCc6c2NvcGUgPiBsaScpO1xuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGlmICghaXRlbS5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpKSB7XG4gICAgICAgIGFkZENoaWxkQnV0dG9uKGl0ZW0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGFkZENoaWxkQnV0dG9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG4gIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBidXR0b24uY2xhc3NOYW1lID0gJ2RlZXAtZGl2ZS1idXR0b24taW5saW5lIGRlZXAtZGl2ZS1jaGlsZC1idXR0b24nO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdkZWVwLWRpdmUnKTtcbiAgYnV0dG9uLnRpdGxlID0gJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCc7XG4gIGJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gIGJ1dHRvbi5zdHlsZS50b3AgPSAnMCc7XG4gIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwJztcblxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd3aWR0aCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTYnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgMjQgMjQnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdjdXJyZW50Q29sb3InKTtcbiAgY29uc3QgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnZCcsICdNMTkgMTVsLTYgNi0xLjUtMS41TDE1IDE2SDRWOWgydjVoOWwtMy41LTMuNUwxMyA5bDYgNnonKTtcbiAgc3ZnLmFwcGVuZENoaWxkKHBhdGgpO1xuICBidXR0b24uYXBwZW5kQ2hpbGQoc3ZnKTtcblxuICBjb25zdCBjaGlsZFRhcmdldDogRGVlcERpdmVUYXJnZXQgPSB7XG4gICAgdHlwZTogJ2NoaWxkJyxcbiAgICBlbGVtZW50LFxuICAgIGdldENvbnRlbnQ6ICgpID0+IGVsZW1lbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJyxcbiAgfTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGluc2VydERlZXBEaXZlUXVlcnkoY2hpbGRUYXJnZXQsIGUuY3RybEtleSk7XG4gIH0pO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiAhZS5hbHRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5KSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgc2hvd1RlbXBsYXRlUG9wdXAoYnV0dG9uLCBjaGlsZFRhcmdldCk7XG4gICAgfVxuICB9KTtcblxuICBlbGVtZW50LmFwcGVuZENoaWxkKGJ1dHRvbik7XG59XG5cbmZ1bmN0aW9uIGNvbGxhcHNlQ2hpbGRCdXR0b25zKHRhcmdldDogRGVlcERpdmVUYXJnZXQpOiB2b2lkIHtcbiAgaWYgKHRhcmdldC50eXBlID09PSAnc2VjdGlvbicpIHtcbiAgICBjb25zdCBoZWFkaW5nID0gdGFyZ2V0LmVsZW1lbnQ7XG4gICAgbGV0IGN1cnJlbnQgPSBoZWFkaW5nLm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgd2hpbGUgKGN1cnJlbnQgJiYgIWN1cnJlbnQubWF0Y2hlcygnaDEsIGgyLCBoMywgaDQsIGg1LCBoNiwgaHInKSkge1xuICAgICAgaWYgKGN1cnJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCd0YWJsZS1ibG9jay1jb21wb25lbnQnKSkge1xuICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGN1cnJlbnRcbiAgICAgICAgLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJylcbiAgICAgICAgLmZvckVhY2goKGJ0bikgPT4gYnRuLnJlbW92ZSgpKTtcbiAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICB0YXJnZXQuZWxlbWVudFxuICAgICAgLnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJylcbiAgICAgIC5mb3JFYWNoKChidG4pID0+IGJ0bi5yZW1vdmUoKSk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gc2hvd1RlbXBsYXRlUG9wdXAoXG4gIGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQsXG4gIHRhcmdldDogRGVlcERpdmVUYXJnZXRcbik6IFByb21pc2U8dm9pZD4ge1xuICBoaWRlVGVtcGxhdGVQb3B1cCgpO1xuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPHtcbiAgICBkZWVwRGl2ZU1vZGVzPzogRGVlcERpdmVNb2RlW107XG4gICAgY3VycmVudERlZXBEaXZlTW9kZUlkPzogc3RyaW5nO1xuICAgIGRlZXBEaXZlUmVjZW50TW9kZXM/OiBzdHJpbmdbXTtcbiAgfT4oKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcbiAgICAgIFsnZGVlcERpdmVNb2RlcycsICdjdXJyZW50RGVlcERpdmVNb2RlSWQnLCAnZGVlcERpdmVSZWNlbnRNb2RlcyddLFxuICAgICAgcmVzb2x2ZSBhcyAoaXRlbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB2b2lkXG4gICAgKTtcbiAgfSk7XG5cbiAgY29uc3QgbW9kZXMgPVxuICAgIHJlc3VsdC5kZWVwRGl2ZU1vZGVzICYmIHJlc3VsdC5kZWVwRGl2ZU1vZGVzLmxlbmd0aCA+IDBcbiAgICAgID8gcmVzdWx0LmRlZXBEaXZlTW9kZXNcbiAgICAgIDogREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM7XG5cbiAgY29uc3QgcmVjZW50SWRzID0gcmVzdWx0LmRlZXBEaXZlUmVjZW50TW9kZXMgfHwgW107XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5tb2Rlc10uc29ydCgoYSwgYikgPT4ge1xuICAgIGNvbnN0IGFpID0gcmVjZW50SWRzLmluZGV4T2YoYS5pZCk7XG4gICAgY29uc3QgYmkgPSByZWNlbnRJZHMuaW5kZXhPZihiLmlkKTtcbiAgICBpZiAoYWkgPT09IC0xICYmIGJpID09PSAtMSkgcmV0dXJuIDA7XG4gICAgaWYgKGFpID09PSAtMSkgcmV0dXJuIDE7XG4gICAgaWYgKGJpID09PSAtMSkgcmV0dXJuIC0xO1xuICAgIHJldHVybiBhaSAtIGJpO1xuICB9KTtcblxuICBjb25zdCBwb3B1cCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBwb3B1cC5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJztcbiAgcG9wdXAuaWQgPSAnZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwJztcbiAgcG9wdXAuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnUnKTtcblxuICBjb25zdCBtYWtlSXRlbSA9IChcbiAgICBsYWJlbDogc3RyaW5nLFxuICAgIGhpbnQ6IHN0cmluZyxcbiAgICBvbkNsaWNrOiAoKSA9PiB2b2lkXG4gICk6IEhUTUxCdXR0b25FbGVtZW50ID0+IHtcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gICAgaXRlbS5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW0nO1xuICAgIGl0ZW0uc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnVpdGVtJyk7XG4gICAgaXRlbS50ZXh0Q29udGVudCA9IGxhYmVsO1xuICAgIGlmIChoaW50KSBpdGVtLnRpdGxlID0gaGludDtcbiAgICBpdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIH0pO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGhpZGVUZW1wbGF0ZVBvcHVwKCk7XG4gICAgICBvbkNsaWNrKCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGl0ZW07XG4gIH07XG5cbiAgc29ydGVkLmZvckVhY2goKG1vZGUpID0+IHtcbiAgICBwb3B1cC5hcHBlbmRDaGlsZChcbiAgICAgIG1ha2VJdGVtKG1vZGUuaWQsIG1vZGUucHJvbXB0IHx8ICcnLCAoKSA9PiBkb0luc2VydFF1ZXJ5KHRhcmdldCwgbW9kZSkpXG4gICAgKTtcbiAgfSk7XG5cbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwb3B1cCk7XG5cbiAgY29uc3QgcmVjdCA9IGJ1dHRvbi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgY29uc3QgcG9wdXBXID0gMTYwO1xuICBsZXQgbGVmdCA9IHJlY3QubGVmdCArIHdpbmRvdy5zY3JvbGxYO1xuICBpZiAobGVmdCArIHBvcHVwVyA+IHdpbmRvdy5pbm5lcldpZHRoIC0gOCkge1xuICAgIGxlZnQgPSB3aW5kb3cuaW5uZXJXaWR0aCAtIHBvcHVwVyAtIDg7XG4gIH1cbiAgcG9wdXAuc3R5bGUudG9wID0gYCR7cmVjdC5ib3R0b20gKyB3aW5kb3cuc2Nyb2xsWSArIDR9cHhgO1xuICBwb3B1cC5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cbiAgY29uc3QgaXRlbXMgPSBBcnJheS5mcm9tKFxuICAgIHBvcHVwLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW0nKVxuICApO1xuICBsZXQgZm9jdXNJbmRleCA9IDA7XG4gIGl0ZW1zWzBdPy5mb2N1cygpO1xuXG4gIHBvcHVwLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xuICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScgfHwgZS5rZXkgPT09ICdBcnJvd0xlZnQnIHx8IGUua2V5ID09PSAnQXJyb3dSaWdodCcpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIChidXR0b24gYXMgRGVlcERpdmVCdXR0b25FbGVtZW50KS5fcG9wdXBDbG9zZWRBdCA9IERhdGUubm93KCk7XG4gICAgICBoaWRlVGVtcGxhdGVQb3B1cCgpO1xuICAgICAgYnV0dG9uLmZvY3VzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93RG93bicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCArIDEpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgaXRlbXNbZm9jdXNJbmRleF0uZm9jdXMoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgaXRlbXNbZm9jdXNJbmRleF0uZm9jdXMoKTtcbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnVGFiJykge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgaWYgKGUuc2hpZnRLZXkpIHtcbiAgICAgICAgZm9jdXNJbmRleCA9IChmb2N1c0luZGV4IC0gMSArIGl0ZW1zLmxlbmd0aCkgJSBpdGVtcy5sZW5ndGg7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggKyAxKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIH1cbiAgICAgIGl0ZW1zW2ZvY3VzSW5kZXhdLmZvY3VzKCk7XG4gICAgfVxuICB9KTtcblxuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhpZGVUZW1wbGF0ZVBvcHVwLCB7IG9uY2U6IHRydWUgfSk7XG4gIH0sIDApO1xufVxuXG5mdW5jdGlvbiBoaWRlVGVtcGxhdGVQb3B1cCgpOiB2b2lkIHtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlZXAtZGl2ZS10ZW1wbGF0ZS1wb3B1cCcpPy5yZW1vdmUoKTtcbn1cblxuZnVuY3Rpb24gd3JpdGVUb1RleHRhcmVhKHF1ZXJ5OiBzdHJpbmcsIGF1dG9TZW5kOiBib29sZWFuKTogdm9pZCB7XG4gIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICApO1xuICBpZiAoIXRleHRhcmVhKSByZXR1cm47XG5cbiAgd2hpbGUgKHRleHRhcmVhLmZpcnN0Q2hpbGQpIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuXG4gIHF1ZXJ5LnNwbGl0KCdcXG4nKS5mb3JFYWNoKChsaW5lKSA9PiB7XG4gICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICBpZiAobGluZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2JyJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwLnRleHRDb250ZW50ID0gbGluZTtcbiAgICB9XG4gICAgdGV4dGFyZWEuYXBwZW5kQ2hpbGQocCk7XG4gIH0pO1xuXG4gIHRleHRhcmVhLmZvY3VzKCk7XG4gIGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXG4gIGlmIChhdXRvU2VuZCkge1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc3Qgc2VuZEJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi6YCB5L+hXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJTZW5kXCJdJ1xuICAgICAgKTtcbiAgICAgIGlmIChzZW5kQnV0dG9uICYmICFzZW5kQnV0dG9uLmRpc2FibGVkKSBzZW5kQnV0dG9uLmNsaWNrKCk7XG4gICAgfSwgMTAwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkb0luc2VydFF1ZXJ5KHRhcmdldDogRGVlcERpdmVUYXJnZXQsIG1vZGU6IERlZXBEaXZlTW9kZSk6IHZvaWQge1xuICBjb25zdCBjb250ZW50ID0gdGFyZ2V0LmdldENvbnRlbnQoKTtcbiAgY29uc3QgcXVvdGVkQ29udGVudCA9IGNvbnRlbnRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcCgobGluZSkgPT4gYD4gJHtsaW5lfWApXG4gICAgLmpvaW4oJ1xcbicpO1xuICBjb25zdCBxdWVyeSA9IHF1b3RlZENvbnRlbnQgKyAnXFxuXFxuJyArIChtb2RlLnByb21wdCB8fCAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJyk7XG4gIHdyaXRlVG9UZXh0YXJlYShxdWVyeSwgdHJ1ZSk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydkZWVwRGl2ZVJlY2VudE1vZGVzJ10sIChyKSA9PiB7XG4gICAgY29uc3QgcmVjZW50ID0gKChyLmRlZXBEaXZlUmVjZW50TW9kZXMgYXMgc3RyaW5nW10pIHx8IFtdKS5maWx0ZXIoXG4gICAgICAoaWQpID0+IGlkICE9PSBtb2RlLmlkXG4gICAgKTtcbiAgICByZWNlbnQudW5zaGlmdChtb2RlLmlkKTtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IGRlZXBEaXZlUmVjZW50TW9kZXM6IHJlY2VudC5zbGljZSgwLCAyMCkgfSk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbnNlcnREZWVwRGl2ZVF1ZXJ5KFxuICB0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0LFxuICBxdW90ZU9ubHkgPSBmYWxzZVxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGlmICghZG9jdW1lbnQucXVlcnlTZWxlY3RvcignZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nKSkgcmV0dXJuO1xuXG4gIGNvbnN0IGNvbnRlbnQgPSB0YXJnZXQuZ2V0Q29udGVudCgpO1xuICBjb25zdCBxdW90ZWRDb250ZW50ID0gY29udGVudFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsaW5lKSA9PiBgPiAke2xpbmV9YClcbiAgICAuam9pbignXFxuJyk7XG5cbiAgbGV0IHF1ZXJ5OiBzdHJpbmc7XG4gIGxldCBzaG91bGRBdXRvU2VuZCA9IGZhbHNlO1xuXG4gIGlmIChxdW90ZU9ubHkpIHtcbiAgICBxdWVyeSA9IHF1b3RlZENvbnRlbnQgKyAnXFxuXFxuJztcbiAgfSBlbHNlIHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTx7XG4gICAgICBkZWVwRGl2ZU1vZGVzPzogRGVlcERpdmVNb2RlW107XG4gICAgICBjdXJyZW50RGVlcERpdmVNb2RlSWQ/OiBzdHJpbmc7XG4gICAgfT4oKHJlc29sdmUpID0+IHtcbiAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFxuICAgICAgICBbJ2RlZXBEaXZlTW9kZXMnLCAnY3VycmVudERlZXBEaXZlTW9kZUlkJ10sXG4gICAgICAgIHJlc29sdmUgYXMgKGl0ZW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZFxuICAgICAgKTtcbiAgICB9KTtcbiAgICBjb25zdCBtb2RlcyA9XG4gICAgICByZXN1bHQuZGVlcERpdmVNb2RlcyAmJiByZXN1bHQuZGVlcERpdmVNb2Rlcy5sZW5ndGggPiAwXG4gICAgICAgID8gcmVzdWx0LmRlZXBEaXZlTW9kZXNcbiAgICAgICAgOiBERUZBVUxUX0RFRVBfRElWRV9NT0RFUztcbiAgICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgY29uc3QgdXJsTW9kZUlkID0gdXJsUGFyYW1zLmdldCgnbW9kZV9pZCcpO1xuICAgIGxldCBtb2RlSWQgPSB1cmxNb2RlSWQgfHwgcmVzdWx0LmN1cnJlbnREZWVwRGl2ZU1vZGVJZCB8fCBtb2Rlc1swXT8uaWQ7XG4gICAgaWYgKCFtb2Rlcy5zb21lKChtKSA9PiBtLmlkID09PSBtb2RlSWQpKSBtb2RlSWQgPSBtb2Rlc1swXT8uaWQ7XG4gICAgY29uc3QgbW9kZSA9XG4gICAgICBtb2Rlcy5maW5kKChtKSA9PiBtLmlkID09PSBtb2RlSWQpIHx8XG4gICAgICBtb2Rlc1swXSB8fFxuICAgICAgREVGQVVMVF9ERUVQX0RJVkVfTU9ERVNbMF07XG4gICAgcXVlcnkgPSBxdW90ZWRDb250ZW50ICsgJ1xcblxcbicgKyAobW9kZS5wcm9tcHQgfHwgJ+OBk+OCjOOBq+OBpOOBhOOBpuips+OBl+OBjycpO1xuICAgIHNob3VsZEF1dG9TZW5kID0gdHJ1ZTtcbiAgfVxuXG4gIHdyaXRlVG9UZXh0YXJlYShxdWVyeSwgc2hvdWxkQXV0b1NlbmQpO1xufVxuXG5mdW5jdGlvbiBhZGREZWVwRGl2ZVN0eWxlcygpOiB2b2lkIHtcbiAgY29uc3Qgc3R5bGVJZCA9ICdnZW1pbmktZGVlcC1kaXZlLXN0eWxlcyc7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChzdHlsZUlkKSkgcmV0dXJuO1xuXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSBzdHlsZUlkO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUge1xuICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICB3aWR0aDogMjhweDtcbiAgICAgIGhlaWdodDogMjhweDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBjb2xvcjogIzVmNjM2ODtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzO1xuICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZTpob3ZlciB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDAsIDAsIDAsIDAuMDUpO1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZTpmb2N1cyB7XG4gICAgICBvdXRsaW5lOiAycHggc29saWQgIzFhNzNlODtcbiAgICAgIG91dGxpbmUtb2Zmc2V0OiAycHg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSBzdmcge1xuICAgICAgd2lkdGg6IDE2cHg7XG4gICAgICBoZWlnaHQ6IDE2cHg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtZXhwYW5kLWJ1dHRvbiB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgICAgIHdpZHRoOiAyOHB4O1xuICAgICAgaGVpZ2h0OiAyOHB4O1xuICAgICAgcGFkZGluZzogMDtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDE0cHg7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIGNvbG9yOiAjNWY2MzY4O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgdHJhbnNpdGlvbjogYWxsIDAuMnM7XG4gICAgICBmbGV4LXNocmluazogMDtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGZvbnQtd2VpZ2h0OiBib2xkO1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b246aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjA1KTtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b246Zm9jdXMge1xuICAgICAgb3V0bGluZTogMnB4IHNvbGlkICMxYTczZTg7XG4gICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgIH1cbiAgICBibG9ja3F1b3RlW2RhdGEtcGF0aC10by1ub2RlXSB7XG4gICAgICBwYWRkaW5nLXRvcDogNDBweDtcbiAgICB9XG4gICAgLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleCAhaW1wb3J0YW50O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIHBhZGRpbmc6IDAgOHB4O1xuICAgICAgbWFyZ2luOiAwIDRweDtcbiAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIHZlcnRpY2FsLWFsaWduOiBtaWRkbGU7XG4gICAgfVxuICAgIGJvZHkgPiAuZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIGJvdHRvbTogMTAwcHg7XG4gICAgICBsZWZ0OiAzMjBweDtcbiAgICAgIHotaW5kZXg6IDk5OTk7XG4gICAgfVxuICAgIC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Igc2VsZWN0IHtcbiAgICAgIHBhZGRpbmc6IDRweCA4cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjZGFkY2UwO1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYmFja2dyb3VuZDogI2ZmZjtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGNvbG9yOiAjNWY2MzY4O1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgbWF4LXdpZHRoOiAxMDBweDtcbiAgICB9XG4gICAgLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciBzZWxlY3Q6aG92ZXIge1xuICAgICAgYm9yZGVyLWNvbG9yOiAjMWE3M2U4O1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgei1pbmRleDogOTk5OTk7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIG1pbi13aWR0aDogMTYwcHg7XG4gICAgICBwYWRkaW5nOiA0cHggMDtcbiAgICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjZGFkY2UwO1xuICAgICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsMCwwLDAuMTUpO1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgICAgd2lkdGg6IDEwMCU7XG4gICAgICBwYWRkaW5nOiA3cHggMTRweDtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGNvbG9yOiAjM2M0MDQzO1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgd2hpdGUtc3BhY2U6IG5vd3JhcDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICB0ZXh0LW92ZXJmbG93OiBlbGxpcHNpcztcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtOmhvdmVyLFxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbTpmb2N1cyB7XG4gICAgICBiYWNrZ3JvdW5kOiAjZjFmM2Y0O1xuICAgICAgY29sb3I6ICMxYTczZTg7XG4gICAgICBvdXRsaW5lOiBub25lO1xuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmZ1bmN0aW9uIGluamVjdE1vZGVTZWxlY3RvcigpOiB2b2lkIHtcbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJyk7XG4gIGlmIChleGlzdGluZykgZXhpc3RpbmcucmVtb3ZlKCk7XG5cbiAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoXG4gICAgWydkZWVwRGl2ZU1vZGVzJywgJ2N1cnJlbnREZWVwRGl2ZU1vZGVJZCddLFxuICAgIChyOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICAgICAgY29uc3QgbW9kZXMgPVxuICAgICAgICAoci5kZWVwRGl2ZU1vZGVzIGFzIERlZXBEaXZlTW9kZVtdIHwgdW5kZWZpbmVkKSAmJlxuICAgICAgICAoci5kZWVwRGl2ZU1vZGVzIGFzIERlZXBEaXZlTW9kZVtdKS5sZW5ndGggPiAwXG4gICAgICAgICAgPyAoci5kZWVwRGl2ZU1vZGVzIGFzIERlZXBEaXZlTW9kZVtdKVxuICAgICAgICAgIDogREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM7XG5cbiAgICAgIGNvbnN0IHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgIHdyYXBwZXIuaWQgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yJztcbiAgICAgIHdyYXBwZXIuY2xhc3NOYW1lID0gJ2dlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3Rvcic7XG5cbiAgICAgIGNvbnN0IHNlbGVjdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NlbGVjdCcpO1xuICAgICAgc2VsZWN0LmlkID0gJ2dlbWluaS1kZWVwLWRpdmUtbW9kZSc7XG4gICAgICBzZWxlY3QudGl0bGUgPSAn5rex5o6Y44KK44Oi44O844OJJztcbiAgICAgIHNlbGVjdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAn5rex5o6Y44KK44Oi44O844OJJyk7XG5cbiAgICAgIG1vZGVzLmZvckVhY2goKG1vZGUpID0+IHtcbiAgICAgICAgY29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IG1vZGUuaWQ7XG4gICAgICAgIG9wdGlvbi50ZXh0Q29udGVudCA9IG1vZGUuaWQ7XG4gICAgICAgIHNlbGVjdC5hcHBlbmRDaGlsZChvcHRpb24pO1xuICAgICAgfSk7XG5cbiAgICAgIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgY3VycmVudERlZXBEaXZlTW9kZUlkOiBzZWxlY3QudmFsdWUgfSk7XG4gICAgICB9KTtcblxuICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChzZWxlY3QpO1xuXG4gICAgICBjb25zdCBhZGRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODleOCoeOCpOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwi6L+95YqgXCJdJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHRvb2xzQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg4Tjg7zjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlRvb2xcIl0nXG4gICAgICApO1xuICAgICAgY29uc3QgaW5zZXJ0QWZ0ZXIgPSB0b29sc0J1dHRvbiB8fCAoYWRkQnV0dG9uICYmIGFkZEJ1dHRvbi5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsKTtcbiAgICAgIGlmIChpbnNlcnRBZnRlciAmJiBpbnNlcnRBZnRlci5wYXJlbnRFbGVtZW50KSB7XG4gICAgICAgIGluc2VydEFmdGVyLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGluc2VydEFmdGVyLm5leHRTaWJsaW5nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGlucHV0QXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGlucHV0QXJlYSkge1xuICAgICAgICAgIGNvbnN0IHBhcmVudCA9XG4gICAgICAgICAgICBpbnB1dEFyZWEuY2xvc2VzdCgnZm9ybScpIHx8XG4gICAgICAgICAgICBpbnB1dEFyZWEucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudDtcbiAgICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgICBwYXJlbnQuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIHBhcmVudC5maXJzdENoaWxkKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3cmFwcGVyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3cmFwcGVyKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCk7XG4gICAgICBjb25zdCB1cmxNb2RlSWQgPSB1cmxQYXJhbXMuZ2V0KCdtb2RlX2lkJyk7XG4gICAgICBsZXQgbW9kZUlkID0gci5jdXJyZW50RGVlcERpdmVNb2RlSWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgaWYgKHVybE1vZGVJZCAmJiBtb2Rlcy5zb21lKChtKSA9PiBtLmlkID09PSB1cmxNb2RlSWQpKSB7XG4gICAgICAgIG1vZGVJZCA9IHVybE1vZGVJZDtcbiAgICAgICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5zZXQoeyBjdXJyZW50RGVlcERpdmVNb2RlSWQ6IHVybE1vZGVJZCB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChtb2RlSWQgJiYgbW9kZXMuc29tZSgobSkgPT4gbS5pZCA9PT0gbW9kZUlkKSkge1xuICAgICAgICBzZWxlY3QudmFsdWUgPSBtb2RlSWQ7XG4gICAgICB9IGVsc2UgaWYgKG1vZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gbW9kZXNbMF0uaWQ7XG4gICAgICB9XG4gICAgfVxuICApO1xufVxuXG5sZXQgZGVlcERpdmVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVEZWVwRGl2ZSgpOiB2b2lkIHtcbiAgYWRkRGVlcERpdmVTdHlsZXMoKTtcblxuICBjb25zdCB0cnlJbmplY3RNb2RlU2VsZWN0b3IgPSAoKSA9PiB7XG4gICAgY29uc3QgaGFzQnV0dG9ucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OE44O844OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJUb29sXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCLjg5XjgqHjgqTjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIui/veWKoFwiXSdcbiAgICApO1xuICAgIGlmIChcbiAgICAgIGhhc0J1dHRvbnMgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJylcbiAgICApIHtcbiAgICAgIGluamVjdE1vZGVTZWxlY3RvcigpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZXRUaW1lb3V0KHRyeUluamVjdE1vZGVTZWxlY3RvciwgNTAwKTtcbiAgICB9XG4gIH07XG4gIHRyeUluamVjdE1vZGVTZWxlY3RvcigpO1xuXG4gIGNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgbmFtZXNwYWNlKSA9PiB7XG4gICAgaWYgKFxuICAgICAgbmFtZXNwYWNlID09PSAnc3luYycgJiZcbiAgICAgIGNoYW5nZXMuZGVlcERpdmVNb2RlcyAmJlxuICAgICAgbG9jYXRpb24uaHJlZi5pbmNsdWRlcygnZ2VtaW5pLmdvb2dsZS5jb20nKSAmJlxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODhOODvOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiVG9vbFwiXSwgZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgICApXG4gICAgKSB7XG4gICAgICBpbmplY3RNb2RlU2VsZWN0b3IoKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xuICAgIGxldCBzaG91bGRVcGRhdGUgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IG11dGF0aW9uIG9mIG11dGF0aW9ucykge1xuICAgICAgaWYgKG11dGF0aW9uLmFkZGVkTm9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgbXV0YXRpb24uYWRkZWROb2Rlcykge1xuICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IG5vZGUgYXMgRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgZWwubWF0Y2hlcz8uKCdbZGF0YS1wYXRoLXRvLW5vZGVdJykgfHxcbiAgICAgICAgICAgICAgZWwucXVlcnlTZWxlY3Rvcj8uKCdbZGF0YS1wYXRoLXRvLW5vZGVdJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICBzaG91bGRVcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzaG91bGRVcGRhdGUpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzaG91bGRVcGRhdGUpIHtcbiAgICAgIGlmIChkZWVwRGl2ZVRpbWVyKSBjbGVhclRpbWVvdXQoZGVlcERpdmVUaW1lcik7XG4gICAgICBkZWVwRGl2ZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiBhZGREZWVwRGl2ZUJ1dHRvbnMoKSwgNTAwKTtcbiAgICB9XG4gIH0pO1xuXG4gIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiBhZGREZWVwRGl2ZUJ1dHRvbnMoKSwgMTAwMCk7XG59XG4iLCIvLyBNYXAgdmlldyAtIGZpeGVkIHJpZ2h0LXNpZGUgcGFuZWwgc2hvd2luZyBjdXJyZW50IGNoYXQgb3V0bGluZSB3aXRoIHNjcm9sbCBoaWdobGlnaHRcblxubGV0IG1hcE1vZGUgPSBmYWxzZTtcbmNvbnN0IE1BUF9QQU5FTF9JRCA9ICdnZW1pbmktbWFwLXBhbmVsJztcbmNvbnN0IE1BUF9TVFlMRV9JRCA9ICdnZW1pbmktbWFwLXN0eWxlcyc7XG5cbmZ1bmN0aW9uIGluamVjdE1hcFN0eWxlcygpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9TVFlMRV9JRCkpIHJldHVybjtcbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICBzdHlsZS5pZCA9IE1BUF9TVFlMRV9JRDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgI2dlbWluaS1tYXAtcGFuZWwge1xuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgcmlnaHQ6IDE2cHg7XG4gICAgICB0b3A6IDYwcHg7XG4gICAgICBib3R0b206IDE2cHg7XG4gICAgICB3aWR0aDogMjQwcHg7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0OCwgMjQ5LCAyNTAsIDAuOTUpO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTJweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAgICAgb3ZlcmZsb3cteTogYXV0bztcbiAgICAgIHotaW5kZXg6IDEwMDtcbiAgICAgIHBhZGRpbmc6IDZweCA0cHg7XG4gICAgICBmb250LWZhbWlseTogaW5oZXJpdDtcbiAgICAgIGJhY2tkcm9wLWZpbHRlcjogYmx1cig4cHgpO1xuICAgIH1cbiAgICAuZGFyay10aGVtZSAjZ2VtaW5pLW1hcC1wYW5lbCB7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDMyLCAzMywgMzYsIDAuOTUpO1xuICAgICAgYm9yZGVyLWNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMTIpO1xuICAgICAgYm94LXNoYWRvdzogMCAycHggMTJweCByZ2JhKDAsIDAsIDAsIDAuNCk7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIC5tYXAtaGVhZGVyIHtcbiAgICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIHVsIHtcbiAgICAgIGxpc3Qtc3R5bGU6IG5vbmU7XG4gICAgICBtYXJnaW46IDA7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b24ge1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgICB3aWR0aDogMTAwJTtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBiYWNrZ3JvdW5kOiBub25lO1xuICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgYm9yZGVyLWxlZnQ6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDAgNnB4IDZweCAwO1xuICAgICAgcGFkZGluZzogNXB4IDEwcHggNXB4IDhweDtcbiAgICAgIG1hcmdpbjogMXB4IDA7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBmb250LXNpemU6IDE1cHg7XG4gICAgICBsaW5lLWhlaWdodDogMS4zNTtcbiAgICAgIGNvbG9yOiBpbmhlcml0O1xuICAgICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgICB3b3JkLWJyZWFrOiBicmVhay13b3JkO1xuICAgICAgb3BhY2l0eTogMC41O1xuICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjE1cywgb3BhY2l0eSAwLjE1cywgYm9yZGVyLWNvbG9yIDAuMTVzO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b246aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgxMjgsIDEyOCwgMTI4LCAwLjEyKTtcbiAgICAgIG9wYWNpdHk6IDAuODU7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIGxpIGJ1dHRvbi5tYXAtaXRlbS1jdXJyZW50IHtcbiAgICAgIG9wYWNpdHk6IDE7XG4gICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI2LCAxMTUsIDIzMiwgMC4wOCk7XG4gICAgICBib3JkZXItbGVmdC1jb2xvcjogIzFhNzNlODtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uIC5tYXAtdHVybi1pbmRleCB7XG4gICAgICBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG4gICAgICBtaW4td2lkdGg6IDE4cHg7XG4gICAgICBmb250LXNpemU6IDEwcHg7XG4gICAgICBvcGFjaXR5OiAwLjU7XG4gICAgICBtYXJnaW4tcmlnaHQ6IDNweDtcbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5mdW5jdGlvbiBnZXRQcm9tcHRUZXh0KHVzZXJRdWVyeTogRWxlbWVudCk6IHN0cmluZyB7XG4gIGNvbnN0IGhlYWRpbmcgPSB1c2VyUXVlcnkucXVlcnlTZWxlY3RvcignaDEsIGgyLCBoMywgW3JvbGU9XCJoZWFkaW5nXCJdJyk7XG4gIGxldCB0ZXh0ID1cbiAgICAoaGVhZGluZyBhcyBIVE1MRWxlbWVudCk/LnRleHRDb250ZW50Py50cmltKCkgfHxcbiAgICAodXNlclF1ZXJ5IGFzIEhUTUxFbGVtZW50KS50ZXh0Q29udGVudD8udHJpbSgpIHx8XG4gICAgJyc7XG4gIHRleHQgPSB0ZXh0LnJlcGxhY2UoL17jgYLjgarjgZ/jga7jg5fjg63jg7Pjg5fjg4hcXHMqLywgJycpO1xuICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9ePlxccyovLCAnJyk7XG4gIHJldHVybiB0ZXh0LnN1YnN0cmluZygwLCA2MCkgfHwgJyjnqbopJztcbn1cblxuZnVuY3Rpb24gZ2V0Q29udmVyc2F0aW9uQ29udGFpbmVycygpOiBIVE1MRWxlbWVudFtdIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAnaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5ID4gLmNvbnZlcnNhdGlvbi1jb250YWluZXInXG4gICAgKVxuICApO1xufVxuXG5mdW5jdGlvbiBidWlsZE1hcFBhbmVsKCk6IEhUTUxEaXZFbGVtZW50IHtcbiAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgcGFuZWwuaWQgPSBNQVBfUEFORUxfSUQ7XG5cbiAgY29uc3QgaGVhZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGhlYWRlci5jbGFzc05hbWUgPSAnbWFwLWhlYWRlcic7XG4gIGhlYWRlci50ZXh0Q29udGVudCA9ICfjgZPjga7jg4Hjg6Pjg4Pjg4jjga7mtYHjgownO1xuICBwYW5lbC5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXG4gIGNvbnN0IGNvbnRhaW5lcnMgPSBnZXRDb252ZXJzYXRpb25Db250YWluZXJzKCk7XG5cbiAgaWYgKGNvbnRhaW5lcnMubGVuZ3RoID09PSAwKSB7XG4gICAgY29uc3QgZW1wdHkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBlbXB0eS5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6IDEwcHg7IG9wYWNpdHk6IDAuNDU7IGZvbnQtc2l6ZTogMTJweDsnO1xuICAgIGVtcHR5LnRleHRDb250ZW50ID0gJ+ODgeODo+ODg+ODiOOBjOOBvuOBoOOBguOCiuOBvuOBm+OCkyc7XG4gICAgcGFuZWwuYXBwZW5kQ2hpbGQoZW1wdHkpO1xuICAgIHJldHVybiBwYW5lbDtcbiAgfVxuXG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd1bCcpO1xuXG4gIGNvbnRhaW5lcnMuZm9yRWFjaCgoY29udGFpbmVyLCBpbmRleCkgPT4ge1xuICAgIGNvbnN0IHVzZXJRdWVyeSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCd1c2VyLXF1ZXJ5Jyk7XG4gICAgaWYgKCF1c2VyUXVlcnkpIHJldHVybjtcblxuICAgIGNvbnN0IHByb21wdFRleHQgPSBnZXRQcm9tcHRUZXh0KHVzZXJRdWVyeSk7XG4gICAgY29uc3QgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuXG4gICAgY29uc3QgaW5kZXhTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICAgIGluZGV4U3Bhbi5jbGFzc05hbWUgPSAnbWFwLXR1cm4taW5kZXgnO1xuICAgIGluZGV4U3Bhbi50ZXh0Q29udGVudCA9IGAke2luZGV4ICsgMX0uYDtcblxuICAgIGJ0bi5hcHBlbmRDaGlsZChpbmRleFNwYW4pO1xuICAgIGJ0bi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShwcm9tcHRUZXh0KSk7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgY29udGFpbmVyLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnLCBibG9jazogJ3N0YXJ0JyB9KTtcbiAgICB9KTtcblxuICAgIGxpLmFwcGVuZENoaWxkKGJ0bik7XG4gICAgbGlzdC5hcHBlbmRDaGlsZChsaSk7XG4gIH0pO1xuXG4gIHBhbmVsLmFwcGVuZENoaWxkKGxpc3QpO1xuICByZXR1cm4gcGFuZWw7XG59XG5cbmZ1bmN0aW9uIGdldE1hcEJ1dHRvbnMoKTogSFRNTEJ1dHRvbkVsZW1lbnRbXSB7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgaWYgKCFwYW5lbCkgcmV0dXJuIFtdO1xuICByZXR1cm4gQXJyYXkuZnJvbShwYW5lbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignbGkgYnV0dG9uJykpO1xufVxuXG5sZXQgaW50ZXJzZWN0aW9uT2JzZXJ2ZXI6IEludGVyc2VjdGlvbk9ic2VydmVyIHwgbnVsbCA9IG51bGw7XG5jb25zdCB2aXNpYmxlVHVybnMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuZnVuY3Rpb24gc2V0dXBJbnRlcnNlY3Rpb25PYnNlcnZlcigpOiB2b2lkIHtcbiAgaWYgKGludGVyc2VjdGlvbk9ic2VydmVyKSBpbnRlcnNlY3Rpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gIHZpc2libGVUdXJucy5jbGVhcigpO1xuXG4gIGNvbnN0IGNvbnRhaW5lcnMgPSBnZXRDb252ZXJzYXRpb25Db250YWluZXJzKCk7XG4gIGlmIChjb250YWluZXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIGludGVyc2VjdGlvbk9ic2VydmVyID0gbmV3IEludGVyc2VjdGlvbk9ic2VydmVyKFxuICAgIChlbnRyaWVzKSA9PiB7XG4gICAgICBlbnRyaWVzLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gY29udGFpbmVycy5pbmRleE9mKGVudHJ5LnRhcmdldCBhcyBIVE1MRWxlbWVudCk7XG4gICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHJldHVybjtcbiAgICAgICAgaWYgKGVudHJ5LmlzSW50ZXJzZWN0aW5nKSB7XG4gICAgICAgICAgdmlzaWJsZVR1cm5zLmFkZChpbmRleCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmlzaWJsZVR1cm5zLmRlbGV0ZShpbmRleCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBidXR0b25zID0gZ2V0TWFwQnV0dG9ucygpO1xuICAgICAgYnV0dG9ucy5mb3JFYWNoKChidG4sIGkpID0+IHtcbiAgICAgICAgYnRuLmNsYXNzTGlzdC50b2dnbGUoJ21hcC1pdGVtLWN1cnJlbnQnLCB2aXNpYmxlVHVybnMuaGFzKGkpKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gICAgICBpZiAocGFuZWwpIHtcbiAgICAgICAgY29uc3QgZmlyc3RIaWdobGlnaHRlZCA9IGJ1dHRvbnMuZmluZCgoXywgaSkgPT4gdmlzaWJsZVR1cm5zLmhhcyhpKSk7XG4gICAgICAgIGlmIChmaXJzdEhpZ2hsaWdodGVkKSB7XG4gICAgICAgICAgZmlyc3RIaWdobGlnaHRlZC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgeyB0aHJlc2hvbGQ6IDAuMTUgfVxuICApO1xuXG4gIGNvbnRhaW5lcnMuZm9yRWFjaCgoYykgPT4gaW50ZXJzZWN0aW9uT2JzZXJ2ZXIhLm9ic2VydmUoYykpO1xufVxuXG5mdW5jdGlvbiBzdG9wSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChpbnRlcnNlY3Rpb25PYnNlcnZlcikge1xuICAgIGludGVyc2VjdGlvbk9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcbiAgICBpbnRlcnNlY3Rpb25PYnNlcnZlciA9IG51bGw7XG4gIH1cbiAgdmlzaWJsZVR1cm5zLmNsZWFyKCk7XG59XG5cbmxldCBjaGF0T2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXIgfCBudWxsID0gbnVsbDtcblxuZnVuY3Rpb24gc3RhcnRDaGF0T2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChjaGF0T2JzZXJ2ZXIpIGNoYXRPYnNlcnZlci5kaXNjb25uZWN0KCk7XG5cbiAgY29uc3QgY2hhdEhpc3RvcnkgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbmZpbml0ZS1zY3JvbGxlci5jaGF0LWhpc3RvcnknKTtcbiAgaWYgKCFjaGF0SGlzdG9yeSkgcmV0dXJuO1xuXG4gIGxldCBkZWJvdW5jZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG4gIGNoYXRPYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICBpZiAoIW1hcE1vZGUpIHJldHVybjtcbiAgICBpZiAoZGVib3VuY2VUaW1lcikgY2xlYXJUaW1lb3V0KGRlYm91bmNlVGltZXIpO1xuICAgIGRlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHJlZnJlc2hNYXAoKSwgMzAwKTtcbiAgfSk7XG5cbiAgY2hhdE9ic2VydmVyLm9ic2VydmUoY2hhdEhpc3RvcnksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiBmYWxzZSB9KTtcbn1cblxuZnVuY3Rpb24gc3RvcENoYXRPYnNlcnZlcigpOiB2b2lkIHtcbiAgaWYgKGNoYXRPYnNlcnZlcikge1xuICAgIGNoYXRPYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgY2hhdE9ic2VydmVyID0gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZWZyZXNoTWFwKCk6IHZvaWQge1xuICBpZiAoIW1hcE1vZGUpIHJldHVybjtcblxuICBjb25zdCBleGlzdGluZyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGNvbnN0IHNhdmVkU2Nyb2xsID0gZXhpc3RpbmcgPyBleGlzdGluZy5zY3JvbGxUb3AgOiAwO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIHN0b3BJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xuXG4gIGNvbnN0IHBhbmVsID0gYnVpbGRNYXBQYW5lbCgpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgcGFuZWwuc2Nyb2xsVG9wID0gc2F2ZWRTY3JvbGw7XG5cbiAgc2V0dXBJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd01hcCgpOiB2b2lkIHtcbiAgaW5qZWN0TWFwU3R5bGVzKCk7XG5cbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIGNvbnN0IHBhbmVsID0gYnVpbGRNYXBQYW5lbCgpO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhbmVsKTtcbiAgbWFwTW9kZSA9IHRydWU7XG5cbiAgc2V0dXBJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xuICBzdGFydENoYXRPYnNlcnZlcigpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRNYXBNb2RlKCk6IHZvaWQge1xuICBzdG9wQ2hhdE9ic2VydmVyKCk7XG4gIHN0b3BJbnRlcnNlY3Rpb25PYnNlcnZlcigpO1xuICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGlmIChwYW5lbCkgcGFuZWwucmVtb3ZlKCk7XG4gIG1hcE1vZGUgPSBmYWxzZTtcbn1cbiIsIi8vIERPTeani+mAoOOCkkFJ44Ko44O844K444Kn44Oz44OI44GM6KqN6K2Y44Gn44GN44KL5b2i5byP44Gn5Ye65YqbXG5cbnR5cGUgRWxlbWVudFR5cGUgPVxuICB8ICd0ZXh0YXJlYSdcbiAgfCAnc2lkZWJhcidcbiAgfCAnc2lkZWJhclRvZ2dsZSdcbiAgfCAnY2hhdEhpc3RvcnknXG4gIHwgJ25ld0NoYXRCdXR0b24nXG4gIHwgJ2NvcHlCdXR0b25zJ1xuICB8ICdjaGF0Q29udGFpbmVyJztcblxuaW50ZXJmYWNlIEZpbmRFbGVtZW50UmVzdWx0IHtcbiAgZWxlbWVudDogRWxlbWVudCB8IG51bGw7XG4gIHNlbGVjdG9yOiBzdHJpbmcgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgSW50ZXJhY3RpdmVFbGVtZW50IHtcbiAgaW5kZXg6IG51bWJlcjtcbiAgdHlwZTogc3RyaW5nO1xuICByb2xlOiBzdHJpbmc7XG4gIGFyaWFMYWJlbDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGlzVmlzaWJsZTogYm9vbGVhbjtcbiAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbn1cblxuY2xhc3MgRE9NQW5hbHl6ZXIge1xuICBwcml2YXRlIGVsZW1lbnRTZWxlY3RvcnM6IFJlY29yZDxFbGVtZW50VHlwZSwgc3RyaW5nW10+O1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuZWxlbWVudFNlbGVjdG9ycyA9IHtcbiAgICAgIHRleHRhcmVhOiBbXG4gICAgICAgICdbcm9sZT1cInRleHRib3hcIl1bY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScsXG4gICAgICAgICdbYXJpYS1sYWJlbCo9XCLjg5fjg63jg7Pjg5fjg4hcIl0nLFxuICAgICAgICAnLnFsLWVkaXRvci50ZXh0YXJlYScsXG4gICAgICAgICdyaWNoLXRleHRhcmVhIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyxcbiAgICAgIF0sXG4gICAgICBzaWRlYmFyOiBbXG4gICAgICAgICdbcm9sZT1cIm5hdmlnYXRpb25cIl0nLFxuICAgICAgICAnYmFyZC1zaWRlbmF2JyxcbiAgICAgICAgJy5zaWRlLW5hdi1jb250YWluZXInLFxuICAgICAgICAnYXNpZGUnLFxuICAgICAgXSxcbiAgICAgIHNpZGViYXJUb2dnbGU6IFtcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODoeOCpOODs+ODoeODi+ODpeODvFwiXScsXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJNYWluIG1lbnVcIl0nLFxuICAgICAgICAnYnV0dG9uW2RhdGEtdGVzdC1pZD1cInNpZGUtbmF2LW1lbnUtYnV0dG9uXCJdJyxcbiAgICAgIF0sXG4gICAgICBjaGF0SGlzdG9yeTogW1xuICAgICAgICAnLmNvbnZlcnNhdGlvbltyb2xlPVwiYnV0dG9uXCJdJyxcbiAgICAgICAgJ1tkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb25cIl0nLFxuICAgICAgICAnLmNvbnZlcnNhdGlvbi1pdGVtcy1jb250YWluZXIgLmNvbnZlcnNhdGlvbicsXG4gICAgICBdLFxuICAgICAgbmV3Q2hhdEJ1dHRvbjogW1xuICAgICAgICAnYVtocmVmPVwiaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS9hcHBcIl0nLFxuICAgICAgICAnYVthcmlhLWxhYmVsKj1cIuaWsOimj+S9nOaIkFwiXScsXG4gICAgICAgICdbZGF0YS10ZXN0LWlkPVwibmV3LWNoYXQtYnV0dG9uXCJdJyxcbiAgICAgIF0sXG4gICAgICBjb3B5QnV0dG9uczogW1xuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44Kz44OU44O8XCJdJyxcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIkNvcHlcIl0nLFxuICAgICAgICAnLmNvcHktYnV0dG9uJyxcbiAgICAgIF0sXG4gICAgICBjaGF0Q29udGFpbmVyOiBbXG4gICAgICAgICdjaGF0LXdpbmRvdycsXG4gICAgICAgICdtYWluLm1haW4nLFxuICAgICAgICAnLmNvbnZlcnNhdGlvbi1jb250YWluZXInLFxuICAgICAgXSxcbiAgICB9O1xuICB9XG5cbiAgZmluZEVsZW1lbnQodHlwZTogRWxlbWVudFR5cGUpOiBGaW5kRWxlbWVudFJlc3VsdCB7XG4gICAgY29uc3Qgc2VsZWN0b3JzID0gdGhpcy5lbGVtZW50U2VsZWN0b3JzW3R5cGVdIHx8IFtdO1xuICAgIGZvciAoY29uc3Qgc2VsZWN0b3Igb2Ygc2VsZWN0b3JzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBlbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG4gICAgICAgIGlmIChlbGVtZW50KSByZXR1cm4geyBlbGVtZW50LCBzZWxlY3RvciB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEludmFsaWQgc2VsZWN0b3IsIHNraXBcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHsgZWxlbWVudDogbnVsbCwgc2VsZWN0b3I6IG51bGwgfTtcbiAgfVxuXG4gIGZpbmRBbGxFbGVtZW50cygpOiBSZWNvcmQ8RWxlbWVudFR5cGUsIEZpbmRFbGVtZW50UmVzdWx0PiB7XG4gICAgY29uc3QgcmVzdWx0ID0ge30gYXMgUmVjb3JkPEVsZW1lbnRUeXBlLCBGaW5kRWxlbWVudFJlc3VsdD47XG4gICAgZm9yIChjb25zdCB0eXBlIGluIHRoaXMuZWxlbWVudFNlbGVjdG9ycykge1xuICAgICAgcmVzdWx0W3R5cGUgYXMgRWxlbWVudFR5cGVdID0gdGhpcy5maW5kRWxlbWVudCh0eXBlIGFzIEVsZW1lbnRUeXBlKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGNhcHR1cmVQYWdlU3RydWN0dXJlKCkge1xuICAgIHJldHVybiB7XG4gICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICB1cmw6IHdpbmRvdy5sb2NhdGlvbi5ocmVmLFxuICAgICAgdGl0bGU6IGRvY3VtZW50LnRpdGxlLFxuICAgICAgZWxlbWVudHM6IHRoaXMuZmluZEFsbEVsZW1lbnRzKCksXG4gICAgICBpbnRlcmFjdGl2ZUVsZW1lbnRzOiB0aGlzLmdldEludGVyYWN0aXZlRWxlbWVudHMoKSxcbiAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgIHZpZXdwb3J0OiB7IHdpZHRoOiB3aW5kb3cuaW5uZXJXaWR0aCwgaGVpZ2h0OiB3aW5kb3cuaW5uZXJIZWlnaHQgfSxcbiAgICAgICAgc2Nyb2xsUG9zaXRpb246IHsgeDogd2luZG93LnNjcm9sbFgsIHk6IHdpbmRvdy5zY3JvbGxZIH0sXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICBnZXRJbnRlcmFjdGl2ZUVsZW1lbnRzKCk6IEludGVyYWN0aXZlRWxlbWVudFtdIHtcbiAgICBjb25zdCBlbGVtZW50czogSW50ZXJhY3RpdmVFbGVtZW50W10gPSBbXTtcbiAgICBjb25zdCBzZWxlY3RvciA9XG4gICAgICAnYnV0dG9uLCBhLCBpbnB1dCwgdGV4dGFyZWEsIFtyb2xlPVwiYnV0dG9uXCJdLCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXSc7XG4gICAgY29uc3QgaW50ZXJhY3RpdmVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG5cbiAgICBpbnRlcmFjdGl2ZXMuZm9yRWFjaCgoZWwsIGluZGV4KSA9PiB7XG4gICAgICBpZiAoaW5kZXggPj0gNTApIHJldHVybjtcbiAgICAgIGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGlmIChyZWN0LndpZHRoID09PSAwIHx8IHJlY3QuaGVpZ2h0ID09PSAwKSByZXR1cm47XG4gICAgICBlbGVtZW50cy5wdXNoKHtcbiAgICAgICAgaW5kZXgsXG4gICAgICAgIHR5cGU6IGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgcm9sZTogZWwuZ2V0QXR0cmlidXRlKCdyb2xlJykgfHwgJycsXG4gICAgICAgIGFyaWFMYWJlbDogZWwuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgfHwgJycsXG4gICAgICAgIHRleHQ6IGVsLnRleHRDb250ZW50Py50cmltKCkuc3Vic3RyaW5nKDAsIDUwKSB8fCAnJyxcbiAgICAgICAgZGVzY3JpcHRpb246IGVsLmdldEF0dHJpYnV0ZSgnZGVzY3JpcHRpb24nKSB8fCAnJyxcbiAgICAgICAgaXNWaXNpYmxlOiByZWN0LndpZHRoID4gMCAmJiByZWN0LmhlaWdodCA+IDAsXG4gICAgICAgIHBvc2l0aW9uOiB7IHg6IE1hdGgucm91bmQocmVjdC54KSwgeTogTWF0aC5yb3VuZChyZWN0LnkpIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBlbGVtZW50cztcbiAgfVxuXG4gIGV4cG9ydEZvckFJKCk6IHN0cmluZyB7XG4gICAgY29uc3Qgc3RydWN0dXJlID0gdGhpcy5jYXB0dXJlUGFnZVN0cnVjdHVyZSgpO1xuXG4gICAgbGV0IG91dHB1dCA9IGAjIyBHZW1pbmkgQ2hhdCBQYWdlIFN0cnVjdHVyZVxcblxcbmA7XG4gICAgb3V0cHV0ICs9IGAqKlVSTCoqOiAke3N0cnVjdHVyZS51cmx9XFxuYDtcbiAgICBvdXRwdXQgKz0gYCoqVGl0bGUqKjogJHtzdHJ1Y3R1cmUudGl0bGV9XFxuXFxuYDtcbiAgICBvdXRwdXQgKz0gYCMjIyBNYWluIEVsZW1lbnRzXFxuXFxuYDtcblxuICAgIGZvciAoY29uc3QgW3R5cGUsIGRhdGFdIG9mIE9iamVjdC5lbnRyaWVzKHN0cnVjdHVyZS5lbGVtZW50cykpIHtcbiAgICAgIGlmIChkYXRhLmVsZW1lbnQpIHtcbiAgICAgICAgb3V0cHV0ICs9IGAtICoqJHt0eXBlfSoqOiBcXGAke2RhdGEuc2VsZWN0b3J9XFxgIOKck1xcbmA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQgKz0gYC0gKioke3R5cGV9Kio6IE5vdCBmb3VuZCDinJdcXG5gO1xuICAgICAgfVxuICAgIH1cblxuICAgIG91dHB1dCArPSBgXFxuIyMjIEludGVyYWN0aXZlIEVsZW1lbnRzICgke3N0cnVjdHVyZS5pbnRlcmFjdGl2ZUVsZW1lbnRzLmxlbmd0aH0pXFxuXFxuYDtcbiAgICBzdHJ1Y3R1cmUuaW50ZXJhY3RpdmVFbGVtZW50cy5zbGljZSgwLCAxMCkuZm9yRWFjaCgoZWwpID0+IHtcbiAgICAgIGlmIChlbC50ZXh0KSB7XG4gICAgICAgIG91dHB1dCArPSBgLSBbJHtlbC50eXBlfV0gJHtlbC50ZXh0fSAoJHtlbC5hcmlhTGFiZWwgfHwgZWwucm9sZX0pXFxuYDtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH1cblxuICBhc3luYyBjb3B5VG9DbGlwYm9hcmQoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgdGV4dCA9IHRoaXMuZXhwb3J0Rm9yQUkoKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGV4dCk7XG4gICAgICB0aGlzLnNob3dOb3RpZmljYXRpb24oJ+ODmuODvOOCuOani+mAoOOCkuOCr+ODquODg+ODl+ODnOODvOODieOBq+OCs+ODlOODvOOBl+OBvuOBl+OBnycpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCB7XG4gICAgICB0aGlzLnNob3dOb3RpZmljYXRpb24oJ+OCs+ODlOODvOOBq+WkseaVl+OBl+OBvuOBl+OBnycsICdlcnJvcicpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHNob3dOb3RpZmljYXRpb24obWVzc2FnZTogc3RyaW5nLCB0eXBlOiAnc3VjY2VzcycgfCAnZXJyb3InID0gJ3N1Y2Nlc3MnKTogdm9pZCB7XG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbm90aWZpY2F0aW9uLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICB0b3A6IDIwcHg7XG4gICAgICByaWdodDogMjBweDtcbiAgICAgIGJhY2tncm91bmQ6ICR7dHlwZSA9PT0gJ2Vycm9yJyA/ICcjZjQ0MzM2JyA6ICcjNENBRjUwJ307XG4gICAgICBjb2xvcjogd2hpdGU7XG4gICAgICBwYWRkaW5nOiAxNnB4IDI0cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICB6LWluZGV4OiAxMDAwMDtcbiAgICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLDAsMCwwLjMpO1xuICAgICAgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgLWFwcGxlLXN5c3RlbSwgc2Fucy1zZXJpZjtcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcbiAgICAgIGFuaW1hdGlvbjogc2xpZGVJbiAwLjNzIGVhc2Utb3V0O1xuICAgIGA7XG4gICAgbm90aWZpY2F0aW9uLnRleHRDb250ZW50ID0gbWVzc2FnZTtcblxuICAgIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAgIEBrZXlmcmFtZXMgc2xpZGVJbiB7XG4gICAgICAgIGZyb20geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoNDAwcHgpOyBvcGFjaXR5OiAwOyB9XG4gICAgICAgIHRvIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDApOyBvcGFjaXR5OiAxOyB9XG4gICAgICB9XG4gICAgYDtcbiAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG5vdGlmaWNhdGlvbik7XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIG5vdGlmaWNhdGlvbi5zdHlsZS50cmFuc2l0aW9uID0gJ29wYWNpdHkgMC4zcyc7XG4gICAgICBub3RpZmljYXRpb24uc3R5bGUub3BhY2l0eSA9ICcwJztcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gbm90aWZpY2F0aW9uLnJlbW92ZSgpLCAzMDApO1xuICAgIH0sIDMwMDApO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplRE9NQW5hbHl6ZXIoKTogdm9pZCB7XG4gIHdpbmRvdy5kb21BbmFseXplciA9IG5ldyBET01BbmFseXplcigpO1xuICB3aW5kb3cuYW5hbHl6ZVBhZ2UgPSAoKSA9PiB7XG4gICAgY29uc29sZS5sb2cod2luZG93LmRvbUFuYWx5emVyIS5jYXB0dXJlUGFnZVN0cnVjdHVyZSgpKTtcbiAgfTtcbiAgd2luZG93LmNvcHlQYWdlU3RydWN0dXJlID0gKCkgPT4ge1xuICAgIHdpbmRvdy5kb21BbmFseXplciEuY29weVRvQ2xpcGJvYXJkKCk7XG4gIH07XG59XG4iLCJpbXBvcnQgeyBpbml0aWFsaXplS2V5Ym9hcmRIYW5kbGVycywgcmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbiB9IGZyb20gJy4uLy4uL3NyYy9rZXlib2FyZCc7XG5pbXBvcnQgeyBpbml0aWFsaXplQ2hhdFBhZ2UgfSBmcm9tICcuLi8uLi9zcmMvY2hhdCc7XG5pbXBvcnQgeyBpbml0aWFsaXplQXV0b2NvbXBsZXRlLCBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlIH0gZnJvbSAnLi4vLi4vc3JjL2F1dG9jb21wbGV0ZSc7XG5pbXBvcnQgeyBpbml0aWFsaXplRGVlcERpdmUgfSBmcm9tICcuLi8uLi9zcmMvZGVlcC1kaXZlJztcbmltcG9ydCB7IGluaXRpYWxpemVFeHBvcnQgfSBmcm9tICcuLi8uLi9zcmMvZXhwb3J0JztcbmltcG9ydCB7IHNob3dNYXAsIHJlc2V0TWFwTW9kZSB9IGZyb20gJy4uLy4uL3NyYy9tYXAnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZVNlYXJjaFBhZ2UsIGlzU2VhcmNoUGFnZSB9IGZyb20gJy4uLy4uL3NyYy9zZWFyY2gnO1xuaW1wb3J0IHsgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi4vLi4vc3JjL2hpc3RvcnknO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZURPTUFuYWx5emVyIH0gZnJvbSAnLi4vLi4vc3JjL2RvbS1hbmFseXplcic7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbnRlbnRTY3JpcHQoe1xuICBtYXRjaGVzOiBbXG4gICAgJ2h0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwKicsXG4gICAgJ2h0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vc2VhcmNoKicsXG4gIF0sXG4gIHJ1bkF0OiAnZG9jdW1lbnRfZW5kJyxcblxuICBtYWluKCkge1xuICAgIC8vIEV4cG9zZSB3aW5kb3cgZ2xvYmFscyB1c2VkIGFjcm9zcyBtb2R1bGVzXG4gICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24gPSByZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uO1xuXG4gICAgaW5pdGlhbGl6ZURPTUFuYWx5emVyKCk7XG4gICAgaW5pdGlhbGl6ZSgpO1xuICB9LFxufSk7XG5cbmZ1bmN0aW9uIGFwcGx5Q3VzdG9tU3R5bGVzKCk6IHZvaWQge1xuICBjb25zdCBzdHlsZUlkID0gJ2dlbWluaS1pbXByb3ZlLXVpLWN1c3RvbS1zdHlsZXMnO1xuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChzdHlsZUlkKT8ucmVtb3ZlKCk7XG5cbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICBzdHlsZS5pZCA9IHN0eWxlSWQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgIC5nZW1zLWxpc3QtY29udGFpbmVyIHtcbiAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICB9XG4gICAgLnNpZGUtbmF2LWVudHJ5LWNvbnRhaW5lciB7XG4gICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIGNoYXQtd2luZG93IHtcbiAgICAgIG1heC13aWR0aDogdmFyKC0tY2hhdC1tYXgtd2lkdGgsIDkwMHB4KSAhaW1wb3J0YW50O1xuICAgICAgbWFyZ2luLWxlZnQ6IDAgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1yaWdodDogYXV0byAhaW1wb3J0YW50O1xuICAgIH1cbiAgICAuY29udmVyc2F0aW9uLWNvbnRhaW5lciB7XG4gICAgICBtYXgtd2lkdGg6IHZhcigtLWNoYXQtbWF4LXdpZHRoLCA5MDBweCkgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tcmlnaHQ6IGF1dG8gIWltcG9ydGFudDtcbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVDaGF0V2lkdGgod2lkdGg6IG51bWJlcik6IHZvaWQge1xuICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tY2hhdC1tYXgtd2lkdGgnLCBgJHt3aWR0aH1weGApO1xufVxuXG5mdW5jdGlvbiBsb2FkQ2hhdFdpZHRoKCk6IHZvaWQge1xuICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChbJ2NoYXRXaWR0aCddLCAocmVzdWx0KSA9PiB7XG4gICAgdXBkYXRlQ2hhdFdpZHRoKHJlc3VsdC5jaGF0V2lkdGggfHwgOTAwKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGluaXRpYWxpemUoKTogdm9pZCB7XG4gIGxvYWRDaGF0V2lkdGgoKTtcbiAgYXBwbHlDdXN0b21TdHlsZXMoKTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9wc3RhdGUnLCAoKSA9PiB7XG4gICAgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gIH0pO1xuXG4gIGxldCBsYXN0VXJsID0gbG9jYXRpb24uaHJlZjtcbiAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgIGNvbnN0IGN1cnJlbnRVcmwgPSBsb2NhdGlvbi5ocmVmO1xuICAgIGlmIChjdXJyZW50VXJsICE9PSBsYXN0VXJsKSB7XG4gICAgICBsYXN0VXJsID0gY3VycmVudFVybDtcblxuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LigtMSk7XG4gICAgICByZXNldE1hcE1vZGUoKTtcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgICAgICAgaW5pdGlhbGl6ZVNlYXJjaEF1dG9jb21wbGV0ZSgpO1xuICAgICAgICBpZiAoIWlzU2VhcmNoUGFnZSgpKSB7XG4gICAgICAgICAgc2hvd01hcCgpO1xuICAgICAgICB9XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnZW1pbmktZXhwb3J0LW5vdGUtYnV0dG9uJyk/LnJlbW92ZSgpO1xuICAgICAgICBpbml0aWFsaXplRXhwb3J0KCk7XG4gICAgICB9LCAxNTAwKTtcbiAgICB9XG4gIH0pLm9ic2VydmUoZG9jdW1lbnQsIHsgc3VidHJlZTogdHJ1ZSwgY2hpbGRMaXN0OiB0cnVlIH0pO1xuXG4gIGluaXRpYWxpemVLZXlib2FyZEhhbmRsZXJzKCk7XG5cbiAgaWYgKGlzU2VhcmNoUGFnZSgpKSB7XG4gICAgaW5pdGlhbGl6ZVNlYXJjaFBhZ2UoKTtcbiAgICBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlKCk7XG4gIH0gZWxzZSB7XG4gICAgaW5pdGlhbGl6ZUNoYXRQYWdlKCk7XG4gICAgaW5pdGlhbGl6ZURlZXBEaXZlKCk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpbml0aWFsaXplRXhwb3J0KCk7XG4gICAgfSwgMTUwMCk7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBzaG93TWFwKCk7XG4gICAgfSwgMTUwMCk7XG4gIH1cblxuICBjaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIG5hbWVzcGFjZSkgPT4ge1xuICAgIGlmIChuYW1lc3BhY2UgPT09ICdzeW5jJyAmJiBjaGFuZ2VzLmNoYXRXaWR0aCkge1xuICAgICAgdXBkYXRlQ2hhdFdpZHRoKGNoYW5nZXMuY2hhdFdpZHRoLm5ld1ZhbHVlKTtcbiAgICAgIGFwcGx5Q3VzdG9tU3R5bGVzKCk7XG4gICAgfVxuICB9KTtcbn1cbiIsIi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLnRzXG5mdW5jdGlvbiBwcmludChtZXRob2QsIC4uLmFyZ3MpIHtcblx0aWYgKGltcG9ydC5tZXRhLmVudi5NT0RFID09PSBcInByb2R1Y3Rpb25cIikgcmV0dXJuO1xuXHRpZiAodHlwZW9mIGFyZ3NbMF0gPT09IFwic3RyaW5nXCIpIG1ldGhvZChgW3d4dF0gJHthcmdzLnNoaWZ0KCl9YCwgLi4uYXJncyk7XG5cdGVsc2UgbWV0aG9kKFwiW3d4dF1cIiwgLi4uYXJncyk7XG59XG4vKipcbiogV3JhcHBlciBhcm91bmQgYGNvbnNvbGVgIHdpdGggYSBcIlt3eHRdXCIgcHJlZml4XG4qL1xuY29uc3QgbG9nZ2VyID0ge1xuXHRkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuXHRsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG5cdHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuXHRlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGxvZ2dlciB9OyIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgYnJvd3NlciQxIH0gZnJvbSBcIkB3eHQtZGV2L2Jyb3dzZXJcIjtcblxuLy8jcmVnaW9uIHNyYy9icm93c2VyLnRzXG4vKipcbiogQ29udGFpbnMgdGhlIGBicm93c2VyYCBleHBvcnQgd2hpY2ggeW91IHNob3VsZCB1c2UgdG8gYWNjZXNzIHRoZSBleHRlbnNpb24gQVBJcyBpbiB5b3VyIHByb2plY3Q6XG4qIGBgYHRzXG4qIGltcG9ydCB7IGJyb3dzZXIgfSBmcm9tICd3eHQvYnJvd3Nlcic7XG4qXG4qIGJyb3dzZXIucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcigoKSA9PiB7XG4qICAgLy8gLi4uXG4qIH0pXG4qIGBgYFxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBicm93c2VyIH07IiwiaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuXG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMudHNcbnZhciBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50ID0gY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcblx0c3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG5cdGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG5cdFx0c3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG5cdFx0dGhpcy5uZXdVcmwgPSBuZXdVcmw7XG5cdFx0dGhpcy5vbGRVcmwgPSBvbGRVcmw7XG5cdH1cbn07XG4vKipcbiogUmV0dXJucyBhbiBldmVudCBuYW1lIHVuaXF1ZSB0byB0aGUgZXh0ZW5zaW9uIGFuZCBjb250ZW50IHNjcmlwdCB0aGF0J3MgcnVubmluZy5cbiovXG5mdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG5cdHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LCBnZXRVbmlxdWVFdmVudE5hbWUgfTsiLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcblxuLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLnRzXG5jb25zdCBzdXBwb3J0c05hdmlnYXRpb25BcGkgPSB0eXBlb2YgZ2xvYmFsVGhpcy5uYXZpZ2F0aW9uPy5hZGRFdmVudExpc3RlbmVyID09PSBcImZ1bmN0aW9uXCI7XG4vKipcbiogQ3JlYXRlIGEgdXRpbCB0aGF0IHdhdGNoZXMgZm9yIFVSTCBjaGFuZ2VzLCBkaXNwYXRjaGluZyB0aGUgY3VzdG9tIGV2ZW50IHdoZW4gZGV0ZWN0ZWQuIFN0b3BzXG4qIHdhdGNoaW5nIHdoZW4gY29udGVudCBzY3JpcHQgaXMgaW52YWxpZGF0ZWQuIFVzZXMgTmF2aWdhdGlvbiBBUEkgd2hlbiBhdmFpbGFibGUsIG90aGVyd2lzZVxuKiBmYWxscyBiYWNrIHRvIHBvbGxpbmcuXG4qL1xuZnVuY3Rpb24gY3JlYXRlTG9jYXRpb25XYXRjaGVyKGN0eCkge1xuXHRsZXQgbGFzdFVybDtcblx0bGV0IHdhdGNoaW5nID0gZmFsc2U7XG5cdHJldHVybiB7IHJ1bigpIHtcblx0XHRpZiAod2F0Y2hpbmcpIHJldHVybjtcblx0XHR3YXRjaGluZyA9IHRydWU7XG5cdFx0bGFzdFVybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG5cdFx0aWYgKHN1cHBvcnRzTmF2aWdhdGlvbkFwaSkgZ2xvYmFsVGhpcy5uYXZpZ2F0aW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJuYXZpZ2F0ZVwiLCAoZXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IG5ld1VybCA9IG5ldyBVUkwoZXZlbnQuZGVzdGluYXRpb24udXJsKTtcblx0XHRcdGlmIChuZXdVcmwuaHJlZiA9PT0gbGFzdFVybC5ocmVmKSByZXR1cm47XG5cdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIGxhc3RVcmwpKTtcblx0XHRcdGxhc3RVcmwgPSBuZXdVcmw7XG5cdFx0fSwgeyBzaWduYWw6IGN0eC5zaWduYWwgfSk7XG5cdFx0ZWxzZSBjdHguc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcblx0XHRcdGlmIChuZXdVcmwuaHJlZiAhPT0gbGFzdFVybC5ocmVmKSB7XG5cdFx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgbGFzdFVybCkpO1xuXHRcdFx0XHRsYXN0VXJsID0gbmV3VXJsO1xuXHRcdFx0fVxuXHRcdH0sIDFlMyk7XG5cdH0gfTtcbn1cblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfTsiLCJpbXBvcnQgeyBsb2dnZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2dnZXIubWpzXCI7XG5pbXBvcnQgeyBnZXRVbmlxdWVFdmVudE5hbWUgfSBmcm9tIFwiLi9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLm1qc1wiO1xuaW1wb3J0IHsgY3JlYXRlTG9jYXRpb25XYXRjaGVyIH0gZnJvbSBcIi4vaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci5tanNcIjtcbmltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcblxuLy8jcmVnaW9uIHNyYy91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0LnRzXG4vKipcbiogSW1wbGVtZW50cyBbYEFib3J0Q29udHJvbGxlcmBdKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9BYm9ydENvbnRyb2xsZXIpLlxuKiBVc2VkIHRvIGRldGVjdCBhbmQgc3RvcCBjb250ZW50IHNjcmlwdCBjb2RlIHdoZW4gdGhlIHNjcmlwdCBpcyBpbnZhbGlkYXRlZC5cbipcbiogSXQgYWxzbyBwcm92aWRlcyBzZXZlcmFsIHV0aWxpdGllcyBsaWtlIGBjdHguc2V0VGltZW91dGAgYW5kIGBjdHguc2V0SW50ZXJ2YWxgIHRoYXQgc2hvdWxkIGJlIHVzZWQgaW5cbiogY29udGVudCBzY3JpcHRzIGluc3RlYWQgb2YgYHdpbmRvdy5zZXRUaW1lb3V0YCBvciBgd2luZG93LnNldEludGVydmFsYC5cbipcbiogVG8gY3JlYXRlIGNvbnRleHQgZm9yIHRlc3RpbmcsIHlvdSBjYW4gdXNlIHRoZSBjbGFzcydzIGNvbnN0cnVjdG9yOlxuKlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBDb250ZW50U2NyaXB0Q29udGV4dCB9IGZyb20gJ3d4dC91dGlscy9jb250ZW50LXNjcmlwdHMtY29udGV4dCc7XG4qXG4qIHRlc3QoXCJzdG9yYWdlIGxpc3RlbmVyIHNob3VsZCBiZSByZW1vdmVkIHdoZW4gY29udGV4dCBpcyBpbnZhbGlkYXRlZFwiLCAoKSA9PiB7XG4qICAgY29uc3QgY3R4ID0gbmV3IENvbnRlbnRTY3JpcHRDb250ZXh0KCd0ZXN0Jyk7XG4qICAgY29uc3QgaXRlbSA9IHN0b3JhZ2UuZGVmaW5lSXRlbShcImxvY2FsOmNvdW50XCIsIHsgZGVmYXVsdFZhbHVlOiAwIH0pO1xuKiAgIGNvbnN0IHdhdGNoZXIgPSB2aS5mbigpO1xuKlxuKiAgIGNvbnN0IHVud2F0Y2ggPSBpdGVtLndhdGNoKHdhdGNoZXIpO1xuKiAgIGN0eC5vbkludmFsaWRhdGVkKHVud2F0Y2gpOyAvLyBMaXN0ZW4gZm9yIGludmFsaWRhdGUgaGVyZVxuKlxuKiAgIGF3YWl0IGl0ZW0uc2V0VmFsdWUoMSk7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRUaW1lcygxKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFdpdGgoMSwgMCk7XG4qXG4qICAgY3R4Lm5vdGlmeUludmFsaWRhdGVkKCk7IC8vIFVzZSB0aGlzIGZ1bmN0aW9uIHRvIGludmFsaWRhdGUgdGhlIGNvbnRleHRcbiogICBhd2FpdCBpdGVtLnNldFZhbHVlKDIpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkVGltZXMoMSk7XG4qIH0pO1xuKiBgYGBcbiovXG52YXIgQ29udGVudFNjcmlwdENvbnRleHQgPSBjbGFzcyBDb250ZW50U2NyaXB0Q29udGV4dCB7XG5cdHN0YXRpYyBTQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6Y29udGVudC1zY3JpcHQtc3RhcnRlZFwiKTtcblx0aWQ7XG5cdGFib3J0Q29udHJvbGxlcjtcblx0bG9jYXRpb25XYXRjaGVyID0gY3JlYXRlTG9jYXRpb25XYXRjaGVyKHRoaXMpO1xuXHRjb25zdHJ1Y3Rvcihjb250ZW50U2NyaXB0TmFtZSwgb3B0aW9ucykge1xuXHRcdHRoaXMuY29udGVudFNjcmlwdE5hbWUgPSBjb250ZW50U2NyaXB0TmFtZTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuaWQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyKTtcblx0XHR0aGlzLmFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHR0aGlzLnN0b3BPbGRTY3JpcHRzKCk7XG5cdFx0dGhpcy5saXN0ZW5Gb3JOZXdlclNjcmlwdHMoKTtcblx0fVxuXHRnZXQgc2lnbmFsKCkge1xuXHRcdHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5zaWduYWw7XG5cdH1cblx0YWJvcnQocmVhc29uKSB7XG5cdFx0cmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLmFib3J0KHJlYXNvbik7XG5cdH1cblx0Z2V0IGlzSW52YWxpZCgpIHtcblx0XHRpZiAoYnJvd3Nlci5ydW50aW1lPy5pZCA9PSBudWxsKSB0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0cmV0dXJuIHRoaXMuc2lnbmFsLmFib3J0ZWQ7XG5cdH1cblx0Z2V0IGlzVmFsaWQoKSB7XG5cdFx0cmV0dXJuICF0aGlzLmlzSW52YWxpZDtcblx0fVxuXHQvKipcblx0KiBBZGQgYSBsaXN0ZW5lciB0aGF0IGlzIGNhbGxlZCB3aGVuIHRoZSBjb250ZW50IHNjcmlwdCdzIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRvIHJlbW92ZSB0aGUgbGlzdGVuZXIuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoY2IpO1xuXHQqIGNvbnN0IHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIgPSBjdHgub25JbnZhbGlkYXRlZCgoKSA9PiB7XG5cdCogICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcblx0KiB9KVxuXHQqIC8vIC4uLlxuXHQqIHJlbW92ZUludmFsaWRhdGVkTGlzdGVuZXIoKTtcblx0Ki9cblx0b25JbnZhbGlkYXRlZChjYikge1xuXHRcdHRoaXMuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBjYik7XG5cdFx0cmV0dXJuICgpID0+IHRoaXMuc2lnbmFsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCBjYik7XG5cdH1cblx0LyoqXG5cdCogUmV0dXJuIGEgcHJvbWlzZSB0aGF0IG5ldmVyIHJlc29sdmVzLiBVc2VmdWwgaWYgeW91IGhhdmUgYW4gYXN5bmMgZnVuY3Rpb24gdGhhdCBzaG91bGRuJ3QgcnVuXG5cdCogYWZ0ZXIgdGhlIGNvbnRleHQgaXMgZXhwaXJlZC5cblx0KlxuXHQqIEBleGFtcGxlXG5cdCogY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcblx0KiAgIGlmIChjdHguaXNJbnZhbGlkKSByZXR1cm4gY3R4LmJsb2NrKCk7XG5cdCpcblx0KiAgIC8vIC4uLlxuXHQqIH1cblx0Ki9cblx0YmxvY2soKSB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKCgpID0+IHt9KTtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldEludGVydmFsYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogSW50ZXJ2YWxzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2xlYXJJbnRlcnZhbGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcblx0XHR9LCB0aW1lb3V0KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldFRpbWVvdXRgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBUaW1lb3V0cyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYHNldFRpbWVvdXRgIGZ1bmN0aW9uLlxuXHQqL1xuXHRzZXRUaW1lb3V0KGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhclRpbWVvdXQoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWVgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cblx0KiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxBbmltYXRpb25GcmFtZWAgZnVuY3Rpb24uXG5cdCovXG5cdHJlcXVlc3RBbmltYXRpb25GcmFtZShjYWxsYmFjaykge1xuXHRcdGNvbnN0IGlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCguLi5hcmdzKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBjYWxsYmFjayguLi5hcmdzKTtcblx0XHR9KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsQW5pbWF0aW9uRnJhbWUoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5yZXF1ZXN0SWRsZUNhbGxiYWNrYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG5cdCogaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBDYWxsYmFja3MgY2FuIGJlIGNhbmNlbGVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2FuY2VsSWRsZUNhbGxiYWNrYCBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuXHRcdGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcblx0XHR9LCBvcHRpb25zKTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuXHRcdH1cblx0XHR0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLCBoYW5kbGVyLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0c2lnbmFsOiB0aGlzLnNpZ25hbFxuXHRcdH0pO1xuXHR9XG5cdC8qKlxuXHQqIEBpbnRlcm5hbFxuXHQqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuXHQqL1xuXHRub3RpZnlJbnZhbGlkYXRlZCgpIHtcblx0XHR0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcblx0XHRsb2dnZXIuZGVidWcoYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgKTtcblx0fVxuXHRzdG9wT2xkU2NyaXB0cygpIHtcblx0XHRkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsIHsgZGV0YWlsOiB7XG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0gfSkpO1xuXHRcdHdpbmRvdy5wb3N0TWVzc2FnZSh7XG5cdFx0XHR0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0sIFwiKlwiKTtcblx0fVxuXHR2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcblx0XHRjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGV0YWlsPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcblx0XHRjb25zdCBpc0Zyb21TZWxmID0gZXZlbnQuZGV0YWlsPy5tZXNzYWdlSWQgPT09IHRoaXMuaWQ7XG5cdFx0cmV0dXJuIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgIWlzRnJvbVNlbGY7XG5cdH1cblx0bGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCkge1xuXHRcdGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIShldmVudCBpbnN0YW5jZW9mIEN1c3RvbUV2ZW50KSB8fCAhdGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSByZXR1cm47XG5cdFx0XHR0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0fTtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpKTtcblx0fVxufTtcblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBDb250ZW50U2NyaXB0Q29udGV4dCB9OyJdLCJuYW1lcyI6WyJkZWZpbml0aW9uIiwicmVzdWx0IiwiY29udGVudCIsInByaW50IiwibG9nZ2VyIiwiYnJvd3NlciIsIld4dExvY2F0aW9uQ2hhbmdlRXZlbnQiLCJDb250ZW50U2NyaXB0Q29udGV4dCJdLCJtYXBwaW5ncyI6Ijs7QUFDQSxXQUFTLG9CQUFvQkEsYUFBWTtBQUN4QyxXQUFPQTtBQUFBLEVBQ1I7QUN5Q08sUUFBTSxvQkFBK0I7QUFBQSxJQUMxQyxNQUFNO0FBQUEsTUFDSixrQkFBa0I7QUFBQSxNQUNsQixlQUFlO0FBQUEsTUFDZixtQkFBbUI7QUFBQSxNQUNuQixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsTUFDWixXQUFXO0FBQUEsTUFDWCxhQUFhO0FB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QU0scUJBQXFCLEVBQUUsQ0FBQztBQUNqRCxhQUFPO0FBQUEsSUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBT0Esb0JBQW9CLFVBQVUsU0FBUztBQUN0QyxZQUFNLEtBQUssb0JBQW9CLElBQUksU0FBUztBQUMzQyxZQUFJLENBQUMsS0FBSyxPQUFPLFFBQVMsVUFBUyxHQUFHLElBQUk7QUFBQSxNQUMzQyxHQUFHLE9BQU87QUFDVixXQUFLLGNBQWMsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBQUEsSUFDQSxpQkFBaUIsUUFBUSxNQUFNLFNBQVMsU0FBUztBQUNoRCxVQUFJLFNBQVMsc0JBQXNCO0FBQ2xDLFlBQUksS0FBSyxRQUFTLE1BQUssZ0JBQWdCLElBQUc7QUFBQSxNQUMzQztBQUNBLGFBQU8sbUJBQW1CLEtBQUssV0FBVyxNQUFNLElBQUksbUJBQW1CLElBQUksSUFBSSxNQUFNLFNBQVM7QUFBQSxRQUM3RixHQUFHO0FBQUEsUUFDSCxRQUFRLEtBQUs7QUFBQSxNQUNoQixDQUFHO0FBQUEsSUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLQSxvQkFBb0I7QUFDbkIsV0FBSyxNQUFNLG9DQUFvQztBQUMvQ0gsZUFBTyxNQUFNLG1CQUFtQixLQUFLLGlCQUFpQix1QkFBdUI7QUFBQSxJQUM5RTtBQUFBLElBQ0EsaUJBQWlCO0FBQ2hCLGVBQVMsY0FBYyxJQUFJLFlBQVlHLHNCQUFxQiw2QkFBNkIsRUFBRSxRQUFRO0FBQUEsUUFDbEcsbUJBQW1CLEtBQUs7QUFBQSxRQUN4QixXQUFXLEtBQUs7QUFBQSxNQUNuQixFQUFHLENBQUUsQ0FBQztBQUNKLGFBQU8sWUFBWTtBQUFBLFFBQ2xCLE1BQU1BLHNCQUFxQjtBQUFBLFFBQzNCLG1CQUFtQixLQUFLO0FBQUEsUUFDeEIsV0FBVyxLQUFLO0FBQUEsTUFDbkIsR0FBSyxHQUFHO0FBQUEsSUFDUDtBQUFBLElBQ0EseUJBQXlCLE9BQU87QUFDL0IsWUFBTSxzQkFBc0IsTUFBTSxRQUFRLHNCQUFzQixLQUFLO0FBQ3JFLFlBQU0sYUFBYSxNQUFNLFFBQVEsY0FBYyxLQUFLO0FBQ3BELGFBQU8sdUJBQXVCLENBQUM7QUFBQSxJQUNoQztBQUFBLElBQ0Esd0JBQXdCO0FBQ3ZCLFlBQU0sS0FBSyxDQUFDLFVBQVU7QUFDckIsWUFBSSxFQUFFLGlCQUFpQixnQkFBZ0IsQ0FBQyxLQUFLLHlCQUF5QixLQUFLLEVBQUc7QUFDOUUsYUFBSyxrQkFBaUI7QUFBQSxNQUN2QjtBQUNBLGVBQVMsaUJBQWlCQSxzQkFBcUIsNkJBQTZCLEVBQUU7QUFDOUUsV0FBSyxjQUFjLE1BQU0sU0FBUyxvQkFBb0JBLHNCQUFxQiw2QkFBNkIsRUFBRSxDQUFDO0FBQUEsSUFDNUc7QUFBQSxFQUNEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OyIsInhfZ29vZ2xlX2lnbm9yZUxpc3QiOlswLDEyLDEzLDE0LDE1LDE2LDE3XX0=
content;