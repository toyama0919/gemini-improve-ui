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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvc2V0dGluZ3MudHMiLCIuLi8uLi8uLi9zcmMvYXV0b2NvbXBsZXRlLnRzIiwiLi4vLi4vLi4vc3JjL2NoYXQudHMiLCIuLi8uLi8uLi9zcmMvaGlzdG9yeS50cyIsIi4uLy4uLy4uL3NyYy9zZWFyY2gudHMiLCIuLi8uLi8uLi9zcmMvZXhwb3J0LnRzIiwiLi4vLi4vLi4vc3JjL2tleWJvYXJkLnRzIiwiLi4vLi4vLi4vc3JjL2RlZXAtZGl2ZS50cyIsIi4uLy4uLy4uL3NyYy9tYXAudHMiLCIuLi8uLi8uLi9zcmMvZG9tLWFuYWx5emVyLnRzIiwiLi4vLi4vLi4vZW50cnlwb2ludHMvY29udGVudC9pbmRleC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0Lm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyNyZWdpb24gc3JjL3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC50c1xuZnVuY3Rpb24gZGVmaW5lQ29udGVudFNjcmlwdChkZWZpbml0aW9uKSB7XG5cdHJldHVybiBkZWZpbml0aW9uO1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUNvbnRlbnRTY3JpcHQgfTsiLCIvLyBTZXR0aW5ncyBtYW5hZ2VtZW50XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQgPSAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJztcblxubGV0IGRlZXBEaXZlUHJvbXB0ID0gREVGQVVMVF9ERUVQX0RJVkVfUFJPTVBUO1xuXG5leHBvcnQgZnVuY3Rpb24gbG9hZERlZXBEaXZlUHJvbXB0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsnZGVlcERpdmVQcm9tcHQnXSwgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5kZWVwRGl2ZVByb21wdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlZXBEaXZlUHJvbXB0ID0gcmVzdWx0LmRlZXBEaXZlUHJvbXB0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVlcERpdmVQcm9tcHQgPSBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG4gICAgICB9XG4gICAgICByZXNvbHZlKGRlZXBEaXZlUHJvbXB0KTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWVwRGl2ZVByb21wdCgpOiBzdHJpbmcge1xuICByZXR1cm4gZGVlcERpdmVQcm9tcHQgfHwgREVGQVVMVF9ERUVQX0RJVkVfUFJPTVBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNob3J0Y3V0cyB7XG4gIGNoYXQ6IHtcbiAgICBuYXZpZ2F0ZVRvU2VhcmNoOiBzdHJpbmc7XG4gICAgdG9nZ2xlU2lkZWJhcjogc3RyaW5nO1xuICAgIHRvZ2dsZUhpc3RvcnlNb2RlOiBzdHJpbmc7XG4gICAgc2Nyb2xsVXA6IHN0cmluZztcbiAgICBzY3JvbGxEb3duOiBzdHJpbmc7XG4gICAgaGlzdG9yeVVwOiBzdHJpbmc7XG4gICAgaGlzdG9yeURvd246IHN0cmluZztcbiAgICBoaXN0b3J5T3Blbjogc3RyaW5nO1xuICAgIGhpc3RvcnlFeGl0OiBzdHJpbmc7XG4gIH07XG4gIHNlYXJjaDoge1xuICAgIG1vdmVVcDogc3RyaW5nO1xuICAgIG1vdmVEb3duOiBzdHJpbmc7XG4gICAgb3BlblJlc3VsdDogc3RyaW5nO1xuICAgIHNjcm9sbFVwOiBzdHJpbmc7XG4gICAgc2Nyb2xsRG93bjogc3RyaW5nO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TSE9SVENVVFM6IFNob3J0Y3V0cyA9IHtcbiAgY2hhdDoge1xuICAgIG5hdmlnYXRlVG9TZWFyY2g6ICdJbnNlcnQnLFxuICAgIHRvZ2dsZVNpZGViYXI6ICdEZWxldGUnLFxuICAgIHRvZ2dsZUhpc3RvcnlNb2RlOiAnRW5kJyxcbiAgICBzY3JvbGxVcDogJ1BhZ2VVcCcsXG4gICAgc2Nyb2xsRG93bjogJ1BhZ2VEb3duJyxcbiAgICBoaXN0b3J5VXA6ICdBcnJvd1VwJyxcbiAgICBoaXN0b3J5RG93bjogJ0Fycm93RG93bicsXG4gICAgaGlzdG9yeU9wZW46ICdFbnRlcicsXG4gICAgaGlzdG9yeUV4aXQ6ICdFc2NhcGUnLFxuICB9LFxuICBzZWFyY2g6IHtcbiAgICBtb3ZlVXA6ICdBcnJvd1VwJyxcbiAgICBtb3ZlRG93bjogJ0Fycm93RG93bicsXG4gICAgb3BlblJlc3VsdDogJ0VudGVyJyxcbiAgICBzY3JvbGxVcDogJ1BhZ2VVcCcsXG4gICAgc2Nyb2xsRG93bjogJ1BhZ2VEb3duJyxcbiAgfSxcbn07XG5cbmxldCBjdXJyZW50U2hvcnRjdXRzOiBTaG9ydGN1dHMgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTaG9ydGN1dHMoKTogUHJvbWlzZTxTaG9ydGN1dHM+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydzaG9ydGN1dHMnXSwgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5zaG9ydGN1dHMpIHtcbiAgICAgICAgY3VycmVudFNob3J0Y3V0cyA9IHJlc3VsdC5zaG9ydGN1dHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX1NIT1JUQ1VUUykpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVNob3J0Y3V0cyhzaG9ydGN1dHM6IFNob3J0Y3V0cyk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IHNob3J0Y3V0cyB9LCAoKSA9PiB7XG4gICAgICBjdXJyZW50U2hvcnRjdXRzID0gc2hvcnRjdXRzO1xuICAgICAgcmVzb2x2ZSgpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNob3J0Y3V0cygpOiBTaG9ydGN1dHMge1xuICByZXR1cm4gY3VycmVudFNob3J0Y3V0cyB8fCBERUZBVUxUX1NIT1JUQ1VUUztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0U2hvcnRjdXRzKCk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gc2F2ZVNob3J0Y3V0cyhKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KERFRkFVTFRfU0hPUlRDVVRTKSkpO1xufVxuXG50eXBlIFNob3J0Y3V0S2V5ID0gc3RyaW5nO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTaG9ydGN1dChldmVudDogS2V5Ym9hcmRFdmVudCwgc2hvcnRjdXRLZXk6IFNob3J0Y3V0S2V5KTogYm9vbGVhbiB7XG4gIGNvbnN0IHNob3J0Y3V0cyA9IGdldFNob3J0Y3V0cygpO1xuICBjb25zdCBrZXlzID0gc2hvcnRjdXRLZXkuc3BsaXQoJy4nKTtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgbGV0IHNob3J0Y3V0OiBhbnkgPSBzaG9ydGN1dHM7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBzaG9ydGN1dCA9IHNob3J0Y3V0W2tleV07XG4gICAgaWYgKCFzaG9ydGN1dCkgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBzaG9ydGN1dCA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBtZXRhTWF0Y2ggPSBzaG9ydGN1dC5tZXRhID8gZXZlbnQubWV0YUtleSA6ICFldmVudC5tZXRhS2V5O1xuICAgIGNvbnN0IGN0cmxNYXRjaCA9IHNob3J0Y3V0LmN0cmwgPyBldmVudC5jdHJsS2V5IDogIWV2ZW50LmN0cmxLZXk7XG4gICAgY29uc3Qgc2hpZnRNYXRjaCA9IHNob3J0Y3V0LnNoaWZ0ID8gZXZlbnQuc2hpZnRLZXkgOiAhZXZlbnQuc2hpZnRLZXk7XG4gICAgcmV0dXJuIChcbiAgICAgIGV2ZW50LmNvZGUgPT09IHNob3J0Y3V0LmtleSAmJiBtZXRhTWF0Y2ggJiYgY3RybE1hdGNoICYmIHNoaWZ0TWF0Y2hcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICBldmVudC5jb2RlID09PSBzaG9ydGN1dCAmJlxuICAgICFldmVudC5jdHJsS2V5ICYmXG4gICAgIWV2ZW50Lm1ldGFLZXkgJiZcbiAgICAhZXZlbnQuc2hpZnRLZXlcbiAgKTtcbn1cbiIsIi8vIEF1dG9jb21wbGV0ZSBmdW5jdGlvbmFsaXR5IGZvciBHZW1pbmkgY2hhdCB0ZXh0YXJlYVxuXG5jb25zdCBSRVRSWV9ERUxBWSA9IDUwMDtcbmNvbnN0IERFQk9VTkNFX0RFTEFZID0gMzAwO1xuY29uc3QgRFJPUERPV05fTUFSR0lOID0gMTA7XG5jb25zdCBJVEVNX0hFSUdIVCA9IDQwO1xuY29uc3QgTUlOX0RST1BET1dOX0hFSUdIVCA9IDEwMDtcblxubGV0IGF1dG9jb21wbGV0ZUxpc3Q6IEhUTUxEaXZFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2VsZWN0ZWRJbmRleCA9IC0xO1xubGV0IGN1cnJlbnRTdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcbmxldCBhdXRvY29tcGxldGVUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRvY29tcGxldGVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIGF1dG9jb21wbGV0ZUxpc3QgIT09IG51bGwgJiZcbiAgICBhdXRvY29tcGxldGVMaXN0LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jaycgJiZcbiAgICBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoID4gMFxuICApO1xufVxuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlOiBFdmVudCk6IHZvaWQge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG59XG5cbmZ1bmN0aW9uIG1vdmVTZWxlY3Rpb24oZGlyZWN0aW9uOiAnbmV4dCcgfCAncHJldicpOiB2b2lkIHtcbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ25leHQnKSB7XG4gICAgc2VsZWN0ZWRJbmRleCA9XG4gICAgICBzZWxlY3RlZEluZGV4IDwgMCA/IDAgOiAoc2VsZWN0ZWRJbmRleCArIDEpICUgY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RlZEluZGV4ID1cbiAgICAgIHNlbGVjdGVkSW5kZXggPCAwXG4gICAgICAgID8gY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aCAtIDFcbiAgICAgICAgOiBzZWxlY3RlZEluZGV4IDw9IDBcbiAgICAgICAgICA/IGN1cnJlbnRTdWdnZXN0aW9ucy5sZW5ndGggLSAxXG4gICAgICAgICAgOiBzZWxlY3RlZEluZGV4IC0gMTtcbiAgfVxuICB1cGRhdGVTZWxlY3RlZEl0ZW0oKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hHb29nbGVTdWdnZXN0aW9ucyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBpZiAoIXF1ZXJ5IHx8IHF1ZXJ5LnRyaW0oKS5sZW5ndGggPT09IDApIHJldHVybiBbXTtcbiAgdHJ5IHtcbiAgICBjb25zdCBlbmNvZGVkUXVlcnkgPSBlbmNvZGVVUklDb21wb25lbnQocXVlcnkudHJpbSgpKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxuICAgICAgYGh0dHBzOi8vd3d3Lmdvb2dsZS5jby5qcC9jb21wbGV0ZS9zZWFyY2g/b3V0cHV0PWZpcmVmb3gmaGw9amEmaWU9dXRmLTgmb2U9dXRmLTgmcT0ke2VuY29kZWRRdWVyeX1gXG4gICAgKTtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHJldHVybiBkYXRhWzFdIHx8IFtdO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gW107XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b2NvbXBsZXRlRHJvcGRvd24oKTogSFRNTERpdkVsZW1lbnQge1xuICBpZiAoYXV0b2NvbXBsZXRlTGlzdCkgcmV0dXJuIGF1dG9jb21wbGV0ZUxpc3Q7XG5cbiAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBsaXN0LmNsYXNzTmFtZSA9ICdnZW1pbmktYXV0b2NvbXBsZXRlLWxpc3QnO1xuICBsaXN0LnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJhY2tncm91bmQ6IHdoaXRlO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7XG4gICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcbiAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgIHotaW5kZXg6IDEwMDAwO1xuICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgbWluLXdpZHRoOiAzMDBweDtcbiAgYDtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaXN0KTtcbiAgYXV0b2NvbXBsZXRlTGlzdCA9IGxpc3Q7XG4gIHJldHVybiBsaXN0O1xufVxuXG5mdW5jdGlvbiBwb3NpdGlvbkRyb3Bkb3duKFxuICBpbnB1dEVsZW1lbnQ6IEVsZW1lbnQsXG4gIGxpc3Q6IEhUTUxEaXZFbGVtZW50LFxuICBzdWdnZXN0aW9uczogc3RyaW5nW11cbik6IHZvaWQge1xuICBjb25zdCByZWN0ID0gaW5wdXRFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBsaXN0LnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnR9cHhgO1xuICBsaXN0LnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG4gIGxpc3Quc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgY29uc3Qgc3BhY2VCZWxvdyA9IHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuYm90dG9tIC0gRFJPUERPV05fTUFSR0lOO1xuICBjb25zdCBzcGFjZUFib3ZlID0gcmVjdC50b3AgLSBEUk9QRE9XTl9NQVJHSU47XG4gIGNvbnN0IG1heEl0ZW1zQmVsb3cgPSBNYXRoLmZsb29yKHNwYWNlQmVsb3cgLyBJVEVNX0hFSUdIVCk7XG4gIGNvbnN0IG1heEl0ZW1zQWJvdmUgPSBNYXRoLmZsb29yKHNwYWNlQWJvdmUgLyBJVEVNX0hFSUdIVCk7XG5cbiAgaWYgKG1heEl0ZW1zQmVsb3cgPCBzdWdnZXN0aW9ucy5sZW5ndGggJiYgbWF4SXRlbXNBYm92ZSA+IG1heEl0ZW1zQmVsb3cpIHtcbiAgICBsaXN0LnN0eWxlLmJvdHRvbSA9IGAke3dpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QudG9wfXB4YDtcbiAgICBsaXN0LnN0eWxlLnRvcCA9ICdhdXRvJztcbiAgICBsaXN0LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KHNwYWNlQWJvdmUsIE1JTl9EUk9QRE9XTl9IRUlHSFQpfXB4YDtcbiAgfSBlbHNlIHtcbiAgICBsaXN0LnN0eWxlLnRvcCA9IGAke3JlY3QuYm90dG9tfXB4YDtcbiAgICBsaXN0LnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcbiAgICBsaXN0LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KHNwYWNlQmVsb3csIE1JTl9EUk9QRE9XTl9IRUlHSFQpfXB4YDtcbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoXG4gIGlucHV0RWxlbWVudDogSFRNTEVsZW1lbnQsXG4gIHN1Z2dlc3Rpb25zOiBzdHJpbmdbXVxuKTogdm9pZCB7XG4gIGlmICghc3VnZ2VzdGlvbnMgfHwgc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbGlzdCA9IGNyZWF0ZUF1dG9jb21wbGV0ZURyb3Bkb3duKCk7XG4gIGxpc3QuaW5uZXJIVE1MID0gJyc7XG4gIGN1cnJlbnRTdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zO1xuICBzZWxlY3RlZEluZGV4ID0gLTE7XG5cbiAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbiwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaXRlbS5jbGFzc05hbWUgPSAnZ2VtaW5pLWF1dG9jb21wbGV0ZS1pdGVtJztcbiAgICBpdGVtLnRleHRDb250ZW50ID0gc3VnZ2VzdGlvbjtcbiAgICBpdGVtLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICBwYWRkaW5nOiAxMHB4IDE2cHg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2YwZjBmMDtcbiAgICBgO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgIHNlbGVjdGVkSW5kZXggPSBpbmRleDtcbiAgICAgIHVwZGF0ZVNlbGVjdGVkSXRlbSgpO1xuICAgIH0pO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBzZWxlY3RTdWdnZXN0aW9uKGlucHV0RWxlbWVudCwgc3VnZ2VzdGlvbik7XG4gICAgfSk7XG4gICAgbGlzdC5hcHBlbmRDaGlsZChpdGVtKTtcbiAgfSk7XG5cbiAgcG9zaXRpb25Ecm9wZG93bihpbnB1dEVsZW1lbnQsIGxpc3QsIHN1Z2dlc3Rpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpOiB2b2lkIHtcbiAgaWYgKGF1dG9jb21wbGV0ZUxpc3QpIHtcbiAgICBhdXRvY29tcGxldGVMaXN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gIH1cbiAgY3VycmVudFN1Z2dlc3Rpb25zID0gW107XG4gIHNlbGVjdGVkSW5kZXggPSAtMTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU2VsZWN0ZWRJdGVtKCk6IHZvaWQge1xuICBpZiAoIWF1dG9jb21wbGV0ZUxpc3QpIHJldHVybjtcbiAgY29uc3QgaXRlbXMgPSBhdXRvY29tcGxldGVMaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5nZW1pbmktYXV0b2NvbXBsZXRlLWl0ZW0nKTtcbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAoaXRlbSBhcyBIVE1MRWxlbWVudCkuc3R5bGUuYmFja2dyb3VuZENvbG9yID1cbiAgICAgIGluZGV4ID09PSBzZWxlY3RlZEluZGV4ID8gJyNlOGYwZmUnIDogJ3RyYW5zcGFyZW50JztcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNlbGVjdFN1Z2dlc3Rpb24oaW5wdXRFbGVtZW50OiBIVE1MRWxlbWVudCwgc3VnZ2VzdGlvbjogc3RyaW5nKTogdm9pZCB7XG4gIGlmICgoaW5wdXRFbGVtZW50IGFzIEhUTUxFbGVtZW50ICYgeyBjb250ZW50RWRpdGFibGU6IHN0cmluZyB9KS5jb250ZW50RWRpdGFibGUgPT09ICd0cnVlJykge1xuICAgIHdoaWxlIChpbnB1dEVsZW1lbnQuZmlyc3RDaGlsZCkge1xuICAgICAgaW5wdXRFbGVtZW50LnJlbW92ZUNoaWxkKGlucHV0RWxlbWVudC5maXJzdENoaWxkKTtcbiAgICB9XG4gICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICBwLnRleHRDb250ZW50ID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dEVsZW1lbnQuYXBwZW5kQ2hpbGQocCk7XG4gICAgaW5wdXRFbGVtZW50LmZvY3VzKCk7XG4gICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHMoaW5wdXRFbGVtZW50KTtcbiAgICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gICAgc2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgfSBlbHNlIHtcbiAgICAoaW5wdXRFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcbiAgICAoaW5wdXRFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgc3VnZ2VzdGlvbi5sZW5ndGgsXG4gICAgICBzdWdnZXN0aW9uLmxlbmd0aFxuICAgICk7XG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIH1cbiAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplQXV0b2NvbXBsZXRlKCk6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgKTtcbiAgaWYgKCF0ZXh0YXJlYSkge1xuICAgIHNldFRpbWVvdXQoaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSwgUkVUUllfREVMQVkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRleHRhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgJ2tleWRvd24nLFxuICAgIGFzeW5jIChlKSA9PiB7XG4gICAgICBpZiAoIWUuaXNUcnVzdGVkIHx8IGUuaXNDb21wb3NpbmcpIHJldHVybjtcblxuICAgICAgaWYgKGUubWV0YUtleSAmJiBlLmNvZGUgPT09ICdTcGFjZScpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIGNvbnN0IHRleHQgPSB0ZXh0YXJlYS50ZXh0Q29udGVudCB8fCAnJztcbiAgICAgICAgY29uc3QgdHJpbW1lZFRleHQgPSB0ZXh0LnRyaW0oKTtcbiAgICAgICAgaWYgKHRyaW1tZWRUZXh0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IGF3YWl0IGZldGNoR29vZ2xlU3VnZ2VzdGlvbnModHJpbW1lZFRleHQpO1xuICAgICAgICBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnModGV4dGFyZWEsIHN1Z2dlc3Rpb25zKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSByZXR1cm47XG5cbiAgICAgIGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICBtb3ZlU2VsZWN0aW9uKCduZXh0Jyk7XG4gICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIG1vdmVTZWxlY3Rpb24oJ3ByZXYnKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIGNvbnN0IGluZGV4VG9TZWxlY3QgPSBzZWxlY3RlZEluZGV4ID49IDAgPyBzZWxlY3RlZEluZGV4IDogMDtcbiAgICAgICAgc2VsZWN0U3VnZ2VzdGlvbih0ZXh0YXJlYSwgY3VycmVudFN1Z2dlc3Rpb25zW2luZGV4VG9TZWxlY3RdKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICB0cnVlXG4gICk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGlmIChcbiAgICAgIGF1dG9jb21wbGV0ZUxpc3QgJiZcbiAgICAgICFhdXRvY29tcGxldGVMaXN0LmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpICYmXG4gICAgICBlLnRhcmdldCAhPT0gdGV4dGFyZWFcbiAgICApIHtcbiAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlKCk6IHZvaWQge1xuICBpZiAoIXdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZS5zdGFydHNXaXRoKCcvc2VhcmNoJykpIHJldHVybjtcblxuICBsZXQgYXR0ZW1wdHMgPSAwO1xuICBjb25zdCBtYXhBdHRlbXB0cyA9IDEwO1xuXG4gIGNvbnN0IHNlYXJjaElucHV0SW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICAgICkgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICAgICdpbnB1dFt0eXBlPVwidGV4dFwiXVtwbGFjZWhvbGRlcio9XCLmpJzntKJcIl0nXG4gICAgICApIHx8XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KCdpbnB1dFt0eXBlPVwidGV4dFwiXScpO1xuXG4gICAgaWYgKHNlYXJjaElucHV0KSB7XG4gICAgICBjbGVhckludGVydmFsKHNlYXJjaElucHV0SW50ZXJ2YWwpO1xuXG4gICAgICBzZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgIGlmICghZS5pc1RydXN0ZWQpIHJldHVybjtcbiAgICAgICAgaWYgKGF1dG9jb21wbGV0ZVRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvY29tcGxldGVUaW1lb3V0KTtcblxuICAgICAgICBjb25zdCB0ZXh0ID0gc2VhcmNoSW5wdXQudmFsdWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IHRyaW1tZWRUZXh0ID0gdGV4dC50cmltKCk7XG4gICAgICAgIGlmICh0cmltbWVkVGV4dC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhdXRvY29tcGxldGVUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgY3VycmVudFRyaW1tZWQgPSAoc2VhcmNoSW5wdXQudmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICBpZiAoY3VycmVudFRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBhd2FpdCBmZXRjaEdvb2dsZVN1Z2dlc3Rpb25zKGN1cnJlbnRUcmltbWVkKTtcbiAgICAgICAgICBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoc2VhcmNoSW5wdXQsIHN1Z2dlc3Rpb25zKTtcbiAgICAgICAgfSwgREVCT1VOQ0VfREVMQVkpO1xuICAgICAgfSk7XG5cbiAgICAgIHNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdrZXlkb3duJyxcbiAgICAgICAgKGUpID0+IHtcbiAgICAgICAgICBpZiAoIWUuaXNUcnVzdGVkIHx8IGUuaXNDb21wb3NpbmcpIHJldHVybjtcbiAgICAgICAgICBpZiAoIWlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSByZXR1cm47XG5cbiAgICAgICAgICBpZiAoZS5rZXkgPT09ICdUYWInIHx8IGUua2V5ID09PSAnQXJyb3dEb3duJykge1xuICAgICAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgICAgICBtb3ZlU2VsZWN0aW9uKCduZXh0Jyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93VXAnKSB7XG4gICAgICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgICAgIG1vdmVTZWxlY3Rpb24oJ3ByZXYnKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWRJbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICAgICAgICBzZWxlY3RTdWdnZXN0aW9uKHNlYXJjaElucHV0LCBjdXJyZW50U3VnZ2VzdGlvbnNbc2VsZWN0ZWRJbmRleF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRydWVcbiAgICAgICk7XG5cbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGF1dG9jb21wbGV0ZUxpc3QgJiZcbiAgICAgICAgICAhYXV0b2NvbXBsZXRlTGlzdC5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSAmJlxuICAgICAgICAgIGUudGFyZ2V0ICE9PSBzZWFyY2hJbnB1dFxuICAgICAgICApIHtcbiAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChzZWFyY2hJbnB1dEludGVydmFsKTtcbiAgICB9XG4gIH0sIDUwMCk7XG59XG4iLCIvLyBDaGF0IFVJIGZ1bmN0aW9uYWxpdHkgKHRleHRhcmVhLCBzaWRlYmFyLCBzY3JvbGxpbmcsIGNvcHkgYnV0dG9ucylcblxuaW1wb3J0IHsgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSB9IGZyb20gJy4vYXV0b2NvbXBsZXRlJztcblxubGV0IGNhY2hlZENoYXRBcmVhOiBFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2hhdEFyZWFDYWNoZVRpbWUgPSAwO1xuY29uc3QgQ0hBVF9BUkVBX0NBQ0hFX0RVUkFUSU9OID0gNTAwMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRBcmVhKCk6IEVsZW1lbnQge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gIGlmIChjYWNoZWRDaGF0QXJlYSAmJiBub3cgLSBjaGF0QXJlYUNhY2hlVGltZSA8IENIQVRfQVJFQV9DQUNIRV9EVVJBVElPTikge1xuICAgIHJldHVybiBjYWNoZWRDaGF0QXJlYTtcbiAgfVxuXG4gIGNvbnN0IGNoYXRIaXN0b3J5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5Jyk7XG4gIGlmIChjaGF0SGlzdG9yeSAmJiBjaGF0SGlzdG9yeS5zY3JvbGxIZWlnaHQgPiBjaGF0SGlzdG9yeS5jbGllbnRIZWlnaHQpIHtcbiAgICBjYWNoZWRDaGF0QXJlYSA9IGNoYXRIaXN0b3J5O1xuICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgIHJldHVybiBjaGF0SGlzdG9yeTtcbiAgfVxuXG4gIGlmIChcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsSGVpZ2h0ID5cbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0XG4gICkge1xuICAgIGNhY2hlZENoYXRBcmVhID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgIHJldHVybiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIH1cblxuICBjb25zdCBzZWxlY3RvcnMgPSBbXG4gICAgJ2luZmluaXRlLXNjcm9sbGVyJyxcbiAgICAnbWFpbltjbGFzcyo9XCJtYWluXCJdJyxcbiAgICAnLmNvbnZlcnNhdGlvbi1jb250YWluZXInLFxuICAgICdbY2xhc3MqPVwiY2hhdC1oaXN0b3J5XCJdJyxcbiAgICAnW2NsYXNzKj1cIm1lc3NhZ2VzXCJdJyxcbiAgICAnbWFpbicsXG4gICAgJ1tjbGFzcyo9XCJzY3JvbGxcIl0nLFxuICAgICdkaXZbY2xhc3MqPVwiY29udmVyc2F0aW9uXCJdJyxcbiAgXTtcblxuICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICBpZiAoZWxlbWVudCAmJiBlbGVtZW50LnNjcm9sbEhlaWdodCA+IGVsZW1lbnQuY2xpZW50SGVpZ2h0KSB7XG4gICAgICBjYWNoZWRDaGF0QXJlYSA9IGVsZW1lbnQ7XG4gICAgICBjaGF0QXJlYUNhY2hlVGltZSA9IG5vdztcbiAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH1cbiAgfVxuXG4gIGNhY2hlZENoYXRBcmVhID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICBjaGF0QXJlYUNhY2hlVGltZSA9IG5vdztcbiAgcmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjcm9sbENoYXRBcmVhKGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJyk6IHZvaWQge1xuICBjb25zdCBjaGF0QXJlYSA9IGdldENoYXRBcmVhKCk7XG4gIGNvbnN0IHNjcm9sbEFtb3VudCA9IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuMTtcbiAgY29uc3Qgc2Nyb2xsVmFsdWUgPSBkaXJlY3Rpb24gPT09ICd1cCcgPyAtc2Nyb2xsQW1vdW50IDogc2Nyb2xsQW1vdW50O1xuXG4gIGlmIChjaGF0QXJlYSA9PT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGNoYXRBcmVhID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgd2luZG93LnNjcm9sbEJ5KHsgdG9wOiBzY3JvbGxWYWx1ZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgfSBlbHNlIHtcbiAgICAoY2hhdEFyZWEgYXMgSFRNTEVsZW1lbnQpLnNjcm9sbEJ5KHsgdG9wOiBzY3JvbGxWYWx1ZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTmV3Q2hhdCgpOiB2b2lkIHtcbiAgY29uc3QgbmV3Q2hhdExpbmsgPVxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KFxuICAgICAgJ2FbaHJlZj1cImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwXCJdJ1xuICAgICkgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYVthcmlhLWxhYmVsKj1cIuaWsOimj+S9nOaIkFwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbYXJpYS1sYWJlbCo9XCJOZXcgY2hhdFwiXScpO1xuXG4gIGlmIChuZXdDaGF0TGluaykge1xuICAgIG5ld0NoYXRMaW5rLmNsaWNrKCk7XG4gICAgcmVpbml0aWFsaXplQWZ0ZXJOYXZpZ2F0aW9uKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbmV3Q2hhdEJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRlc3QtaWQ9XCJuZXctY2hhdC1idXR0b25cIl0nKTtcbiAgaWYgKG5ld0NoYXRCdXR0b24pIHtcbiAgICBjb25zdCBjbGlja2FibGUgPVxuICAgICAgbmV3Q2hhdEJ1dHRvbi5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYSwgYnV0dG9uJykgfHxcbiAgICAgIChuZXdDaGF0QnV0dG9uIGFzIEhUTUxFbGVtZW50KTtcbiAgICBjbGlja2FibGUuY2xpY2soKTtcbiAgICByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaW5rcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2EsIGJ1dHRvbicpKTtcbiAgY29uc3QgbmV3Q2hhdEJ0biA9IGxpbmtzLmZpbmQoXG4gICAgKGVsKSA9PlxuICAgICAgZWwudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCfmlrDopo/kvZzmiJAnKSB8fFxuICAgICAgZWwudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdOZXcgY2hhdCcpIHx8XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ+aWsOimjycpXG4gICk7XG4gIGlmIChuZXdDaGF0QnRuKSB7XG4gICAgbmV3Q2hhdEJ0bi5jbGljaygpO1xuICAgIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTogdm9pZCB7XG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgfSwgMTUwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c1RleHRhcmVhKCk6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcblxuICBpZiAoIXRleHRhcmVhKSByZXR1cm47XG4gIHRleHRhcmVhLmZvY3VzKCk7XG5cbiAgaWYgKHRleHRhcmVhLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XG4gICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckFuZEZvY3VzVGV4dGFyZWEoKTogdm9pZCB7XG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICk7XG5cbiAgICBpZiAodGV4dGFyZWEpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgd2hpbGUgKHRleHRhcmVhLmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgdGV4dGFyZWEucmVtb3ZlQ2hpbGQodGV4dGFyZWEuZmlyc3RDaGlsZCk7XG4gICAgICB9XG4gICAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgcC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdicicpKTtcbiAgICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICAgICAgdGV4dGFyZWEuZm9jdXMoKTtcbiAgICAgIHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgfVxuICB9LCAyMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0UXVlcnlGcm9tVXJsKCk6IHZvaWQge1xuICBjb25zdCBwYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xuICBpZiAocGF0aCAhPT0gJy9hcHAnICYmIHBhdGggIT09ICcvYXBwLycpIHJldHVybjtcblxuICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICBjb25zdCBxdWVyeSA9IHVybFBhcmFtcy5nZXQoJ3EnKTtcbiAgaWYgKCFxdWVyeSkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbmQgPSB1cmxQYXJhbXMuZ2V0KCdzZW5kJyk7XG4gIGNvbnN0IHNob3VsZFNlbmQgPSBzZW5kID09PSBudWxsIHx8IHNlbmQgPT09ICd0cnVlJyB8fCBzZW5kID09PSAnMSc7XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAyMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG5cbiAgICAgIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB7XG4gICAgICAgIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuICAgICAgfVxuICAgICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIHAudGV4dENvbnRlbnQgPSBxdWVyeTtcbiAgICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICAgICAgdGV4dGFyZWEuZm9jdXMoKTtcblxuICAgICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgICAgcmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHRleHRhcmVhKTtcbiAgICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICAgIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcblxuICAgICAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuICAgICAgaWYgKHNob3VsZFNlbmQpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc2VuZEJ1dHRvbiA9XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwi6YCB5L+hXCJdJykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCJTZW5kXCJdJykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24uc2VuZC1idXR0b24nKSB8fFxuICAgICAgICAgICAgQXJyYXkuZnJvbShcbiAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbicpXG4gICAgICAgICAgICApLmZpbmQoXG4gICAgICAgICAgICAgIChidG4pID0+XG4gICAgICAgICAgICAgICAgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpPy5pbmNsdWRlcygn6YCB5L+hJykgfHxcbiAgICAgICAgICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCdTZW5kJylcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHNlbmRCdXR0b24gJiYgIXNlbmRCdXR0b24uZGlzYWJsZWQpIHtcbiAgICAgICAgICAgIHNlbmRCdXR0b24uY2xpY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDUwMCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgfVxuICB9LCAyMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9jdXNBY3Rpb25CdXR0b24oZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gIGlmIChhY3Rpb25CdXR0b25zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChkaXJlY3Rpb24gPT09ICd1cCcpIHtcbiAgICBhY3Rpb25CdXR0b25zW2FjdGlvbkJ1dHRvbnMubGVuZ3RoIC0gMV0uZm9jdXMoKTtcbiAgfSBlbHNlIHtcbiAgICBhY3Rpb25CdXR0b25zWzBdLmZvY3VzKCk7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlQmV0d2VlbkFjdGlvbkJ1dHRvbnMoZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gIGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KFxuICAgIChidG4pID0+IGJ0biA9PT0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudFxuICApO1xuICBpZiAoY3VycmVudEluZGV4ID09PSAtMSkgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChkaXJlY3Rpb24gPT09ICd1cCcpIHtcbiAgICBpZiAoY3VycmVudEluZGV4ID4gMCkge1xuICAgICAgYWN0aW9uQnV0dG9uc1tjdXJyZW50SW5kZXggLSAxXS5mb2N1cygpO1xuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LihjdXJyZW50SW5kZXggLSAxKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoY3VycmVudEluZGV4IDwgYWN0aW9uQnV0dG9ucy5sZW5ndGggLSAxKSB7XG4gICAgICBhY3Rpb25CdXR0b25zW2N1cnJlbnRJbmRleCArIDFdLmZvY3VzKCk7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKGN1cnJlbnRJbmRleCArIDEpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxBY3Rpb25CdXR0b25zKCk6IEhUTUxFbGVtZW50W10ge1xuICBjb25zdCBhbGxCdXR0b25zID0gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICdidXR0b24uZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUsIGJ1dHRvbltkYXRhLWFjdGlvbj1cImRlZXAtZGl2ZVwiXSdcbiAgICApXG4gICk7XG5cbiAgcmV0dXJuIGFsbEJ1dHRvbnMuZmlsdGVyKChidG4pID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPVxuICAgICAgYnRuLmNsb3Nlc3QoJ1tkYXRhLXRlc3QtaWQqPVwidXNlclwiXScpIHx8XG4gICAgICBidG4uY2xvc2VzdCgnW2RhdGEtdGVzdC1pZCo9XCJwcm9tcHRcIl0nKSB8fFxuICAgICAgYnRuLmNsb3Nlc3QoJ1tjbGFzcyo9XCJ1c2VyXCJdJyk7XG4gICAgcmV0dXJuICFjb250YWluZXI7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZFNpZGViYXJUb2dnbGVCdXR0b24oKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgcmV0dXJuIChcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtdGVzdC1pZD1cInNpZGUtbmF2LXRvZ2dsZVwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODoeODi+ODpeODvFwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIm1lbnVcIl0nKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCJNZW51XCJdJylcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2lkZWJhck9wZW4oKTogYm9vbGVhbiB7XG4gIGNvbnN0IHNpZGVuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtYXQtc2lkZW5hdicpO1xuICBpZiAoIXNpZGVuYXYpIHJldHVybiB0cnVlO1xuICByZXR1cm4gc2lkZW5hdi5jbGFzc0xpc3QuY29udGFpbnMoJ21hdC1kcmF3ZXItb3BlbmVkJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVTaWRlYmFyKCk6IHZvaWQge1xuICBjb25zdCB0b2dnbGUgPSBmaW5kU2lkZWJhclRvZ2dsZUJ1dHRvbigpO1xuICBpZiAodG9nZ2xlKSB0b2dnbGUuY2xpY2soKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVDaGF0UGFnZSgpOiB2b2lkIHtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgc2V0UXVlcnlGcm9tVXJsKCk7XG4gIH0sIDEwMDApO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgfSwgMTUwMCk7XG5cbiAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgY29uc3QgaXNTdHJlYW1pbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1idXN5PVwidHJ1ZVwiXScpO1xuICAgIGlmIChpc1N0cmVhbWluZykge1xuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LigtMSk7XG4gICAgfVxuICB9KTtcblxuICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHtcbiAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgIGF0dHJpYnV0ZUZpbHRlcjogWydhcmlhLWJ1c3knXSxcbiAgICBzdWJ0cmVlOiB0cnVlLFxuICB9KTtcbn1cbiIsIi8vIENoYXQgaGlzdG9yeSBzZWxlY3Rpb24gZnVuY3Rpb25hbGl0eVxuXG5pbXBvcnQgeyBjbGVhckFuZEZvY3VzVGV4dGFyZWEgfSBmcm9tICcuL2NoYXQnO1xuXG5sZXQgc2VsZWN0ZWRIaXN0b3J5SW5kZXggPSAwO1xubGV0IGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGdldEhpc3RvcnlJdGVtcygpOiBIVE1MRWxlbWVudFtdIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAnLmNvbnZlcnNhdGlvbi1pdGVtcy1jb250YWluZXIgLmNvbnZlcnNhdGlvbltkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb25cIl0nXG4gICAgKVxuICApO1xufVxuXG5mdW5jdGlvbiBoaWdobGlnaHRIaXN0b3J5KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIHNlbGVjdGVkSGlzdG9yeUluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaW5kZXgsIGl0ZW1zLmxlbmd0aCAtIDEpKTtcblxuICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lID0gJyc7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7XG4gIH0pO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XTtcbiAgaWYgKHNlbGVjdGVkSXRlbSkge1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjMWE3M2U4JztcbiAgICBzZWxlY3RlZEl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICctMnB4JztcbiAgICBzZWxlY3RlZEl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlSGlzdG9yeVVwKCk6IHZvaWQge1xuICBoaWdobGlnaHRIaXN0b3J5KHNlbGVjdGVkSGlzdG9yeUluZGV4IC0gMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlSGlzdG9yeURvd24oKTogdm9pZCB7XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXggKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5TZWxlY3RlZEhpc3RvcnkoKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0SGlzdG9yeUl0ZW1zKCk7XG4gIGlmIChpdGVtcy5sZW5ndGggPT09IDAgfHwgIWl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XSkgcmV0dXJuO1xuXG4gIGl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XS5jbGljaygpO1xuICBoaXN0b3J5U2VsZWN0aW9uTW9kZSA9IGZhbHNlO1xuXG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG5cbiAgY2xlYXJBbmRGb2N1c1RleHRhcmVhKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogdm9pZCB7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0SGlzdG9yeUl0ZW1zKCk7XG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbnRlckhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk6IHZvaWQge1xuICBoaXN0b3J5U2VsZWN0aW9uTW9kZSA9IHRydWU7XG4gIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50KSB7XG4gICAgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmJsdXIoKTtcbiAgfVxuICBoaWdobGlnaHRIaXN0b3J5KHNlbGVjdGVkSGlzdG9yeUluZGV4KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiBoaXN0b3J5U2VsZWN0aW9uTW9kZTtcbn1cbiIsIi8vIFNlYXJjaCBwYWdlIGZ1bmN0aW9uYWxpdHlcblxuaW1wb3J0IHsgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi9oaXN0b3J5JztcblxubGV0IHNlbGVjdGVkU2VhcmNoSW5kZXggPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTZWFyY2hQYWdlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9zZWFyY2gnKTtcbn1cblxuZnVuY3Rpb24gZ2V0U2VhcmNoUmVzdWx0cygpOiBIVE1MRWxlbWVudFtdIHtcbiAgbGV0IHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdzZWFyY2gtc25pcHBldFt0YWJpbmRleD1cIjBcIl0nKVxuICApO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICByZXN1bHRzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdzZWFyY2gtc25pcHBldCcpXG4gICAgKTtcbiAgfVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICByZXN1bHRzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnZGl2LmNvbnZlcnNhdGlvbi1jb250YWluZXJbcm9sZT1cIm9wdGlvblwiXSdcbiAgICAgIClcbiAgICApO1xuICB9XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICdbcm9sZT1cIm9wdGlvblwiXS5jb252ZXJzYXRpb24tY29udGFpbmVyJ1xuICAgICAgKVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGluZGV4LCBpdGVtcy5sZW5ndGggLSAxKSk7XG5cbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcblxuICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XTtcbiAgaWYgKHNlbGVjdGVkSXRlbSkge1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjMWE3M2U4JztcbiAgICBzZWxlY3RlZEl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICctMnB4JztcbiAgICBzZWxlY3RlZEl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlU2VhcmNoUmVzdWx0VXAoKTogdm9pZCB7XG4gIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChzZWxlY3RlZFNlYXJjaEluZGV4IC0gMSk7XG4gIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2lucHV0W2RhdGEtdGVzdC1pZD1cInNlYXJjaC1pbnB1dFwiXSdcbiAgKTtcbiAgaWYgKHNlYXJjaElucHV0KSBzZWFyY2hJbnB1dC5mb2N1cygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW92ZVNlYXJjaFJlc3VsdERvd24oKTogdm9pZCB7XG4gIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChzZWxlY3RlZFNlYXJjaEluZGV4ICsgMSk7XG4gIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2lucHV0W2RhdGEtdGVzdC1pZD1cInNlYXJjaC1pbnB1dFwiXSdcbiAgKTtcbiAgaWYgKHNlYXJjaElucHV0KSBzZWFyY2hJbnB1dC5mb2N1cygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3BlblNlbGVjdGVkU2VhcmNoUmVzdWx0KCk6IHZvaWQge1xuICBjb25zdCBpdGVtcyA9IGdldFNlYXJjaFJlc3VsdHMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCB8fCAhaXRlbXNbc2VsZWN0ZWRTZWFyY2hJbmRleF0pIHJldHVybjtcblxuICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XTtcblxuICBjb25zdCBjbGlja2FibGVEaXYgPSBzZWxlY3RlZEl0ZW0ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2Rpdltqc2xvZ10nKTtcbiAgaWYgKGNsaWNrYWJsZURpdikge1xuICAgIGNsaWNrYWJsZURpdi5jbGljaygpO1xuICAgIFsnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnY2xpY2snXS5mb3JFYWNoKChldmVudFR5cGUpID0+IHtcbiAgICAgIGNsaWNrYWJsZURpdi5kaXNwYXRjaEV2ZW50KFxuICAgICAgICBuZXcgTW91c2VFdmVudChldmVudFR5cGUsIHsgdmlldzogd2luZG93LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pXG4gICAgICApO1xuICAgIH0pO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2VsZWN0ZWRJdGVtLmNsaWNrKCk7XG4gICAgfSwgMTAwKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaW5rID0gc2VsZWN0ZWRJdGVtLnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2hyZWZdJyk7XG4gIGlmIChsaW5rKSB7XG4gICAgbGluay5jbGljaygpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHNlbGVjdGVkSXRlbS5jbGljaygpO1xuICBbJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2NsaWNrJ10uZm9yRWFjaCgoZXZlbnRUeXBlKSA9PiB7XG4gICAgc2VsZWN0ZWRJdGVtLmRpc3BhdGNoRXZlbnQoXG4gICAgICBuZXcgTW91c2VFdmVudChldmVudFR5cGUsIHsgdmlldzogd2luZG93LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pXG4gICAgKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplU2VhcmNoUGFnZSgpOiB2b2lkIHtcbiAgaWYgKCFpc1NlYXJjaFBhZ2UoKSkgcmV0dXJuO1xuXG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3QgaGlnaGxpZ2h0SW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCBzZWFyY2hSZXN1bHRzID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuXG4gICAgaWYgKHNlYXJjaFJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IDA7XG4gICAgICBoaWdobGlnaHRTZWFyY2hSZXN1bHQoMCk7XG4gICAgICBjbGVhckludGVydmFsKGhpZ2hsaWdodEludGVydmFsKTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGhpZ2hsaWdodEludGVydmFsKTtcbiAgICB9XG4gIH0sIDUwMCk7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRlVG9TZWFyY2hQYWdlKCk6IHZvaWQge1xuICBjb25zdCBzZWFyY2hVcmwgPSAnL3NlYXJjaD9obD1qYSc7XG4gIGhpc3RvcnkucHVzaFN0YXRlKG51bGwsICcnLCBzZWFyY2hVcmwpO1xuICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgUG9wU3RhdGVFdmVudCgncG9wc3RhdGUnLCB7IHN0YXRlOiBudWxsIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZVNlYXJjaFBhZ2UoKTogdm9pZCB7XG4gIGlmIChpc1NlYXJjaFBhZ2UoKSkge1xuICAgIGhpc3RvcnkuYmFjaygpO1xuICB9IGVsc2Uge1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgIG5hdmlnYXRlVG9TZWFyY2hQYWdlKCk7XG4gIH1cbn1cbiIsIi8vIENoYXQgZXhwb3J0IGZ1bmN0aW9uYWxpdHkgLSBzYXZlcyBjdXJyZW50IGNvbnZlcnNhdGlvbiBhcyBaZXR0ZWxrYXN0ZW4gTWFya2Rvd25cblxuY29uc3QgRVhQT1JUX0JVVFRPTl9JRCA9ICdnZW1pbmktZXhwb3J0LW5vdGUtYnV0dG9uJztcbmxldCBleHBvcnREaXJIYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgfCBudWxsID0gbnVsbDtcblxuLy8gLS0tIEluZGV4ZWREQiBoZWxwZXJzIC0tLVxuXG5mdW5jdGlvbiBvcGVuRXhwb3J0REIoKTogUHJvbWlzZTxJREJEYXRhYmFzZT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IGluZGV4ZWREQi5vcGVuKCdnZW1pbmktZXhwb3J0JywgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IChlKSA9PiB7XG4gICAgICAoZS50YXJnZXQgYXMgSURCT3BlbkRCUmVxdWVzdCkucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdoYW5kbGVzJyk7XG4gICAgfTtcbiAgICByZXEub25zdWNjZXNzID0gKGUpID0+IHJlc29sdmUoKGUudGFyZ2V0IGFzIElEQk9wZW5EQlJlcXVlc3QpLnJlc3VsdCk7XG4gICAgcmVxLm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxLmVycm9yKTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0b3JlZERpckhhbmRsZSgpOiBQcm9taXNlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGIgPSBhd2FpdCBvcGVuRXhwb3J0REIoKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2hhbmRsZXMnLCAncmVhZG9ubHknKTtcbiAgICAgIGNvbnN0IHJlcSA9IHR4Lm9iamVjdFN0b3JlKCdoYW5kbGVzJykuZ2V0KCdzYXZlX2RpcicpO1xuICAgICAgcmVxLm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUoKHJlcS5yZXN1bHQgYXMgRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSkgfHwgbnVsbCk7XG4gICAgICByZXEub25lcnJvciA9ICgpID0+IHJlc29sdmUobnVsbCk7XG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0b3JlRGlySGFuZGxlKGhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGRiID0gYXdhaXQgb3BlbkV4cG9ydERCKCk7XG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaGFuZGxlcycsICdyZWFkd3JpdGUnKTtcbiAgICAgIHR4Lm9iamVjdFN0b3JlKCdoYW5kbGVzJykucHV0KGhhbmRsZSwgJ3NhdmVfZGlyJyk7XG4gICAgICB0eC5vbmNvbXBsZXRlID0gKCkgPT4gcmVzb2x2ZSgpO1xuICAgICAgdHgub25lcnJvciA9ICgpID0+IHJlamVjdCh0eC5lcnJvcik7XG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIElnbm9yZSBzdG9yYWdlIGVycm9yc1xuICB9XG59XG5cbi8vIC0tLSBEaXJlY3RvcnkgaGFuZGxlIG1hbmFnZW1lbnQgLS0tXG5cbmFzeW5jIGZ1bmN0aW9uIGdldEV4cG9ydERpckhhbmRsZSgpOiBQcm9taXNlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU+IHtcbiAgaWYgKGV4cG9ydERpckhhbmRsZSkge1xuICAgIGNvbnN0IHBlcm0gPSBhd2FpdCBleHBvcnREaXJIYW5kbGUucXVlcnlQZXJtaXNzaW9uKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gICAgaWYgKHBlcm0gPT09ICdncmFudGVkJykgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbiAgfVxuXG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZERpckhhbmRsZSgpO1xuICBpZiAoc3RvcmVkKSB7XG4gICAgY29uc3QgcGVybSA9IGF3YWl0IHN0b3JlZC5xdWVyeVBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAocGVybSA9PT0gJ2dyYW50ZWQnKSB7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBzdG9yZWQ7XG4gICAgICByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICAgIH1cbiAgICBjb25zdCBuZXdQZXJtID0gYXdhaXQgc3RvcmVkLnJlcXVlc3RQZXJtaXNzaW9uKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gICAgaWYgKG5ld1Blcm0gPT09ICdncmFudGVkJykge1xuICAgICAgZXhwb3J0RGlySGFuZGxlID0gc3RvcmVkO1xuICAgICAgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGUgPSBhd2FpdCB3aW5kb3cuc2hvd0RpcmVjdG9yeVBpY2tlcih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICBhd2FpdCBzdG9yZURpckhhbmRsZShoYW5kbGUpO1xuICBleHBvcnREaXJIYW5kbGUgPSBoYW5kbGU7XG4gIHJldHVybiBleHBvcnREaXJIYW5kbGU7XG59XG5cbi8vIC0tLSBET00gdG8gTWFya2Rvd24gY29udmVyc2lvbiAtLS1cblxuZnVuY3Rpb24gZG9tVG9NYXJrZG93bihlbDogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBjb25zdCBTS0lQX1RBR1MgPSBuZXcgU2V0KFsnYnV0dG9uJywgJ3N2ZycsICdwYXRoJywgJ21hdC1pY29uJ10pO1xuXG4gIGZ1bmN0aW9uIG5vZGVUb01kKG5vZGU6IE5vZGUpOiBzdHJpbmcge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSkgcmV0dXJuIG5vZGUudGV4dENvbnRlbnQgfHwgJyc7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgIT09IE5vZGUuRUxFTUVOVF9OT0RFKSByZXR1cm4gJyc7XG5cbiAgICBjb25zdCBlbGVtID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCB0YWcgPSBlbGVtLnRhZ05hbWUudG9Mb3dlckNhc2UoKTtcblxuICAgIGlmIChTS0lQX1RBR1MuaGFzKHRhZykpIHJldHVybiAnJztcblxuICAgIGNvbnN0IGlubmVyID0gKCkgPT4gQXJyYXkuZnJvbShlbGVtLmNoaWxkTm9kZXMpLm1hcChub2RlVG9NZCkuam9pbignJyk7XG5cbiAgICBjb25zdCBobSA9IHRhZy5tYXRjaCgvXmgoWzEtNl0pJC8pO1xuICAgIGlmIChobSkge1xuICAgICAgY29uc3QgaGFzaGVzID0gJyMnLnJlcGVhdChOdW1iZXIoaG1bMV0pKTtcbiAgICAgIGNvbnN0IHRleHQgPSBpbm5lcigpLnRyaW0oKTtcbiAgICAgIHJldHVybiBgXFxuJHtoYXNoZXN9ICR7dGV4dH1cXG5cXG5gO1xuICAgIH1cblxuICAgIHN3aXRjaCAodGFnKSB7XG4gICAgICBjYXNlICdwJzpcbiAgICAgICAgcmV0dXJuIGlubmVyKCkgKyAnXFxuXFxuJztcbiAgICAgIGNhc2UgJ2JyJzpcbiAgICAgICAgcmV0dXJuICdcXG4nO1xuICAgICAgY2FzZSAnaHInOlxuICAgICAgICByZXR1cm4gJ1xcbi0tLVxcblxcbic7XG4gICAgICBjYXNlICd1bCc6XG4gICAgICBjYXNlICdvbCc6XG4gICAgICAgIHJldHVybiBpbm5lcigpICsgJ1xcbic7XG4gICAgICBjYXNlICdsaSc6IHtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGlubmVyKCkucmVwbGFjZSgvXFxuKyQvLCAnJyk7XG4gICAgICAgIHJldHVybiBgLSAke2NvbnRlbnR9XFxuYDtcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2InOlxuICAgICAgY2FzZSAnc3Ryb25nJzpcbiAgICAgICAgcmV0dXJuIGAqKiR7aW5uZXIoKX0qKmA7XG4gICAgICBjYXNlICdpJzpcbiAgICAgIGNhc2UgJ2VtJzpcbiAgICAgICAgcmV0dXJuIGAqJHtpbm5lcigpfSpgO1xuICAgICAgY2FzZSAnY29kZSc6XG4gICAgICAgIHJldHVybiBgXFxgJHtpbm5lcigpfVxcYGA7XG4gICAgICBjYXNlICdwcmUnOlxuICAgICAgICByZXR1cm4gYFxcYFxcYFxcYFxcbiR7aW5uZXIoKX1cXG5cXGBcXGBcXGBcXG5cXG5gO1xuICAgICAgY2FzZSAndGFibGUnOlxuICAgICAgICByZXR1cm4gdGFibGVUb01kKGVsZW0pICsgJ1xcblxcbic7XG4gICAgICBjYXNlICd0aGVhZCc6XG4gICAgICBjYXNlICd0Ym9keSc6XG4gICAgICBjYXNlICd0cic6XG4gICAgICBjYXNlICd0ZCc6XG4gICAgICBjYXNlICd0aCc6XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBpbm5lcigpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRhYmxlVG9NZCh0YWJsZTogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJvd3MgPSBBcnJheS5mcm9tKHRhYmxlLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RyJykpO1xuICAgIGlmIChyb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuXG4gICAgY29uc3QgZ2V0Q2VsbHMgPSAocm93OiBFbGVtZW50KSA9PlxuICAgICAgQXJyYXkuZnJvbShyb3cucXVlcnlTZWxlY3RvckFsbCgndGQsIHRoJykpLm1hcCgoY2VsbCkgPT5cbiAgICAgICAgQXJyYXkuZnJvbShjZWxsLmNoaWxkTm9kZXMpXG4gICAgICAgICAgLm1hcChub2RlVG9NZClcbiAgICAgICAgICAuam9pbignJylcbiAgICAgICAgICAucmVwbGFjZSgvXFxuKy9nLCAnICcpXG4gICAgICAgICAgLnRyaW0oKVxuICAgICAgKTtcblxuICAgIGNvbnN0IFtoZWFkZXJSb3csIC4uLmJvZHlSb3dzXSA9IHJvd3M7XG4gICAgY29uc3QgaGVhZGVycyA9IGdldENlbGxzKGhlYWRlclJvdyk7XG4gICAgY29uc3Qgc2VwYXJhdG9yID0gaGVhZGVycy5tYXAoKCkgPT4gJy0tLScpO1xuXG4gICAgcmV0dXJuIFtcbiAgICAgIGB8ICR7aGVhZGVycy5qb2luKCcgfCAnKX0gfGAsXG4gICAgICBgfCAke3NlcGFyYXRvci5qb2luKCcgfCAnKX0gfGAsXG4gICAgICAuLi5ib2R5Um93cy5tYXAoKHIpID0+IGB8ICR7Z2V0Q2VsbHMocikuam9pbignIHwgJyl9IHxgKSxcbiAgICBdLmpvaW4oJ1xcbicpO1xuICB9XG5cbiAgcmV0dXJuIEFycmF5LmZyb20oZWwuY2hpbGROb2RlcylcbiAgICAubWFwKG5vZGVUb01kKVxuICAgIC5qb2luKCcnKVxuICAgIC5yZXBsYWNlKC9cXG57Myx9L2csICdcXG5cXG4nKVxuICAgIC50cmltKCk7XG59XG5cbi8vIC0tLSBUZXh0IGNsZWFudXAgLS0tXG5cbmNvbnN0IEFSVElGQUNUX1BBVFRFUk5TID0gW1xuICAvXlsr77yLXSQvLFxuICAvXkdvb2dsZSDjgrnjg5fjg6zjg4Pjg4njgrfjg7zjg4jjgavjgqjjgq/jgrnjg53jg7zjg4gkLyxcbiAgL15Hb29nbGUgU2hlZXRzIOOBq+OCqOOCr+OCueODneODvOODiCQvLFxuICAvXkV4cG9ydCB0byBTaGVldHMkLyxcbl07XG5cbmZ1bmN0aW9uIGNsZWFuTW9kZWxUZXh0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB0ZXh0XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5maWx0ZXIoKGxpbmUpID0+ICFBUlRJRkFDVF9QQVRURVJOUy5zb21lKChwKSA9PiBwLnRlc3QobGluZS50cmltKCkpKSlcbiAgICAuam9pbignXFxuJylcbiAgICAucmVwbGFjZSgvXFxuezMsfS9nLCAnXFxuXFxuJylcbiAgICAudHJpbSgpO1xufVxuXG4vLyAtLS0gU2Nyb2xsIHRvIGxvYWQgYWxsIG1lc3NhZ2VzIC0tLVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkQWxsTWVzc2FnZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHNjcm9sbGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2luZmluaXRlLXNjcm9sbGVyLmNoYXQtaGlzdG9yeSdcbiAgKTtcbiAgaWYgKCFzY3JvbGxlcikgcmV0dXJuO1xuXG4gIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+ODoeODg+OCu+ODvOOCuOOCkuiqreOBv+i+vOOBv+S4rS4uLicpO1xuXG4gIGxldCBwcmV2Q291bnQgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDMwOyBpKyspIHtcbiAgICBzY3JvbGxlci5zY3JvbGxUb3AgPSAwO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDQwMCkpO1xuICAgIGNvbnN0IGNvdW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndXNlci1xdWVyeScpLmxlbmd0aDtcbiAgICBpZiAoY291bnQgPT09IHByZXZDb3VudCkgYnJlYWs7XG4gICAgcHJldkNvdW50ID0gY291bnQ7XG4gIH1cblxuICBzY3JvbGxlci5zY3JvbGxUb3AgPSBzY3JvbGxlci5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIC0tLSBDaGF0IGNvbnRlbnQgZXh0cmFjdGlvbiAtLS1cblxuaW50ZXJmYWNlIENoYXQge1xuICB1c2VyOiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RDaGF0Q29udGVudCgpOiBDaGF0W10ge1xuICBjb25zdCB1c2VyUXVlcmllcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndXNlci1xdWVyeScpKTtcbiAgY29uc3QgbW9kZWxSZXNwb25zZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ21vZGVsLXJlc3BvbnNlJykpO1xuXG4gIGNvbnN0IGNoYXRzOiBDaGF0W10gPSBbXTtcbiAgY29uc3QgbGVuID0gTWF0aC5taW4odXNlclF1ZXJpZXMubGVuZ3RoLCBtb2RlbFJlc3BvbnNlcy5sZW5ndGgpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCB1c2VyVGV4dCA9IEFycmF5LmZyb20oXG4gICAgICB1c2VyUXVlcmllc1tpXS5xdWVyeVNlbGVjdG9yQWxsKCcucXVlcnktdGV4dC1saW5lJylcbiAgICApXG4gICAgICAubWFwKChlbCkgPT4gKGVsIGFzIEhUTUxFbGVtZW50KS5pbm5lclRleHQudHJpbSgpKVxuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oJ1xcbicpO1xuXG4gICAgY29uc3QgbWFya2Rvd25FbCA9IG1vZGVsUmVzcG9uc2VzW2ldLnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnbWVzc2FnZS1jb250ZW50IC5tYXJrZG93bidcbiAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICBjb25zdCByYXdNb2RlbFRleHQgPSBtYXJrZG93bkVsXG4gICAgICA/IGRvbVRvTWFya2Rvd24obWFya2Rvd25FbCkudHJpbSgpXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBtb2RlbFRleHQgPSByYXdNb2RlbFRleHQgPyBjbGVhbk1vZGVsVGV4dChyYXdNb2RlbFRleHQpIDogJyc7XG5cbiAgICBpZiAodXNlclRleHQgfHwgbW9kZWxUZXh0KSB7XG4gICAgICBjaGF0cy5wdXNoKHsgdXNlcjogdXNlclRleHQgfHwgJycsIG1vZGVsOiBtb2RlbFRleHQgfHwgJycgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGNoYXRzO1xufVxuXG5mdW5jdGlvbiBnZXRDaGF0SWQoKTogc3RyaW5nIHtcbiAgcmV0dXJuIGxvY2F0aW9uLnBhdGhuYW1lLnNwbGl0KCcvJykucG9wKCkgfHwgJ3Vua25vd24nO1xufVxuXG4vLyAtLS0gWUFNTCBnZW5lcmF0aW9uIChaZXR0ZWxrYXN0ZW4gZm9ybWF0KSAtLS1cblxuZnVuY3Rpb24geWFtbFF1b3RlKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAnXCInICsgcy5yZXBsYWNlKC9cXFxcL2csICdcXFxcXFxcXCcpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKSArICdcIic7XG59XG5cbmZ1bmN0aW9uIHlhbWxCbG9jayh0ZXh0OiBzdHJpbmcsIGluZGVudDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHRleHRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcCgobGluZSkgPT4gKGxpbmUgPT09ICcnID8gJycgOiBpbmRlbnQgKyBsaW5lKSlcbiAgICAuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlTWFya2Rvd24oY2hhdHM6IENoYXRbXSk6IHtcbiAgbWFya2Rvd246IHN0cmluZztcbiAgaWQ6IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbn0ge1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICBjb25zdCBwYWQgPSAobjogbnVtYmVyKSA9PiBTdHJpbmcobikucGFkU3RhcnQoMiwgJzAnKTtcbiAgY29uc3QgZGF0ZVN0ciA9IGAke25vdy5nZXRGdWxsWWVhcigpfS0ke3BhZChub3cuZ2V0TW9udGgoKSArIDEpfS0ke3BhZChub3cuZ2V0RGF0ZSgpKX1gO1xuICBjb25zdCB0aW1lU3RyID0gYCR7ZGF0ZVN0cn1UJHtwYWQobm93LmdldEhvdXJzKCkpfToke3BhZChub3cuZ2V0TWludXRlcygpKX06JHtwYWQobm93LmdldFNlY29uZHMoKSl9YDtcbiAgY29uc3QgaWQgPSB0aW1lU3RyLnJlcGxhY2UoL1stOlRdL2csICcnKTtcblxuICBjb25zdCBjb252ZXJzYXRpb25UaXRsZSA9IChcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgJ1tkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb24tdGl0bGVcIl0nXG4gICAgKSBhcyBIVE1MRWxlbWVudCB8IG51bGxcbiAgKT8uaW5uZXJUZXh0Py50cmltKCk7XG4gIGNvbnN0IGZpcnN0VXNlckxpbmVzID0gKGNoYXRzWzBdPy51c2VyIHx8ICcnKVxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAubWFwKChsKSA9PiBsLnRyaW0oKSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuICBjb25zdCBmYWxsYmFja1RpdGxlID1cbiAgICBmaXJzdFVzZXJMaW5lcy5maW5kKChsKSA9PiAhL15odHRwcz86XFwvXFwvL2kudGVzdChsKSkgfHxcbiAgICBmaXJzdFVzZXJMaW5lc1swXSB8fFxuICAgICdHZW1pbmkgY2hhdCc7XG4gIGNvbnN0IHRpdGxlID0gKGNvbnZlcnNhdGlvblRpdGxlIHx8IGZhbGxiYWNrVGl0bGUpLnNsaWNlKDAsIDYwKTtcblxuICBjb25zdCBjaGF0SWQgPSBnZXRDaGF0SWQoKTtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW1xuICAgIGBpZDogJHt5YW1sUXVvdGUoY2hhdElkKX1gLFxuICAgIGB0aXRsZTogJHt5YW1sUXVvdGUoJ0dlbWluaTogJyArIHRpdGxlKX1gLFxuICAgIGBkYXRlOiAke3lhbWxRdW90ZSh0aW1lU3RyKX1gLFxuICAgIGBzb3VyY2U6ICR7eWFtbFF1b3RlKGxvY2F0aW9uLmhyZWYpfWAsXG4gICAgJ3RhZ3M6JyxcbiAgICAnICAtIGdlbWluaScsXG4gICAgJyAgLSBmbGVldGluZycsXG4gICAgJ2NoYXRzOicsXG4gIF07XG5cbiAgZm9yIChjb25zdCB0dXJuIG9mIGNoYXRzKSB7XG4gICAgbGluZXMucHVzaCgnICAtIHE6IHwnKTtcbiAgICBsaW5lcy5wdXNoKHlhbWxCbG9jayh0dXJuLnVzZXIsICcgICAgICAnKSk7XG4gICAgbGluZXMucHVzaCgnICAgIGE6IHwnKTtcbiAgICBsaW5lcy5wdXNoKHlhbWxCbG9jayh0dXJuLm1vZGVsLCAnICAgICAgJykpO1xuICB9XG5cblxuICByZXR1cm4geyBtYXJrZG93bjogbGluZXMuam9pbignXFxuJyksIGlkLCB0aXRsZSB9O1xufVxuXG4vLyAtLS0gRmlsZSBzYXZlIC0tLVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZU5vdGUoZm9yY2VQaWNrRGlyID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgbG9hZEFsbE1lc3NhZ2VzKCk7XG5cbiAgY29uc3QgY2hhdHMgPSBleHRyYWN0Q2hhdENvbnRlbnQoKTtcbiAgaWYgKGNoYXRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+S/neWtmOOBp+OBjeOCi+S8muipseOBjOimi+OBpOOBi+OCiuOBvuOBm+OCkycsICdlcnJvcicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBkaXJIYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU7XG4gIHRyeSB7XG4gICAgaWYgKGZvcmNlUGlja0Rpcikge1xuICAgICAgY29uc3QgaGFuZGxlID0gYXdhaXQgd2luZG93LnNob3dEaXJlY3RvcnlQaWNrZXIoeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICAgIGF3YWl0IHN0b3JlRGlySGFuZGxlKGhhbmRsZSk7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBoYW5kbGU7XG4gICAgICBkaXJIYW5kbGUgPSBoYW5kbGU7XG4gICAgICBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKGDkv53lrZjlhYjjgpLlpInmm7Q6ICR7aGFuZGxlLm5hbWV9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpckhhbmRsZSA9IGF3YWl0IGdldEV4cG9ydERpckhhbmRsZSgpO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBtYXJrZG93biwgdGl0bGUgfSA9IGdlbmVyYXRlTWFya2Rvd24oY2hhdHMpO1xuICBjb25zdCBjaGF0SWQgPSBnZXRDaGF0SWQoKTtcbiAgY29uc3Qgc2FmZVRpdGxlID0gdGl0bGVcbiAgICAucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdL2csICcnKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csICctJylcbiAgICAuc2xpY2UoMCwgNDApO1xuICBjb25zdCBmaWxlbmFtZSA9IGBnZW1pbmktJHtzYWZlVGl0bGV9LSR7Y2hhdElkfS55YW1sYDtcblxuICB0cnkge1xuICAgIGNvbnN0IGluYm94SGFuZGxlID0gYXdhaXQgZGlySGFuZGxlLmdldERpcmVjdG9yeUhhbmRsZSgnaW5ib3gnLCB7XG4gICAgICBjcmVhdGU6IHRydWUsXG4gICAgfSk7XG4gICAgY29uc3QgZmlsZUhhbmRsZSA9IGF3YWl0IGluYm94SGFuZGxlLmdldEZpbGVIYW5kbGUoZmlsZW5hbWUsIHtcbiAgICAgIGNyZWF0ZTogdHJ1ZSxcbiAgICB9KTtcbiAgICBjb25zdCB3cml0YWJsZSA9IGF3YWl0IGZpbGVIYW5kbGUuY3JlYXRlV3JpdGFibGUoKTtcbiAgICBhd2FpdCB3cml0YWJsZS53cml0ZShtYXJrZG93bik7XG4gICAgYXdhaXQgd3JpdGFibGUuY2xvc2UoKTtcbiAgICBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKGDkv53lrZjjgZfjgb7jgZfjgZ86IGluYm94LyR7ZmlsZW5hbWV9YCk7XG4gIH0gY2F0Y2gge1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+S/neWtmOOBq+WkseaVl+OBl+OBvuOBl+OBnycsICdlcnJvcicpO1xuICB9XG59XG5cbi8vIC0tLSBVSSAtLS1cblxuZnVuY3Rpb24gc2hvd0V4cG9ydE5vdGlmaWNhdGlvbihcbiAgbWVzc2FnZTogc3RyaW5nLFxuICB0eXBlOiAnc3VjY2VzcycgfCAnZXJyb3InID0gJ3N1Y2Nlc3MnXG4pOiB2b2lkIHtcbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2VtaW5pLWV4cG9ydC1ub3RpZmljYXRpb24nKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBlbC5pZCA9ICdnZW1pbmktZXhwb3J0LW5vdGlmaWNhdGlvbic7XG4gIGVsLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJvdHRvbTogMjRweDtcbiAgICByaWdodDogMjRweDtcbiAgICBiYWNrZ3JvdW5kOiAke3R5cGUgPT09ICdlcnJvcicgPyAnI2M2MjgyOCcgOiAnIzFiNWUyMCd9O1xuICAgIGNvbG9yOiB3aGl0ZTtcbiAgICBwYWRkaW5nOiAxMnB4IDIwcHg7XG4gICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgIHotaW5kZXg6IDEwMDAwO1xuICAgIGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIHNhbnMtc2VyaWY7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLDAsMCwwLjMpO1xuICBgO1xuICBlbC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWwpO1xuICBzZXRUaW1lb3V0KCgpID0+IGVsLnJlbW92ZSgpLCAzMDAwKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRXhwb3J0QnV0dG9uKCk6IHZvaWQge1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoRVhQT1JUX0JVVFRPTl9JRCkpIHJldHVybjtcblxuICBjb25zdCBpbnB1dEFyZWEgPVxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LWFyZWEtdjInKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LWNvbnRhaW5lcicpO1xuICBpZiAoIWlucHV0QXJlYSkgcmV0dXJuO1xuXG4gIGNvbnN0IGJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBidG4uaWQgPSBFWFBPUlRfQlVUVE9OX0lEO1xuICBidG4udGl0bGUgPVxuICAgICdTYXZlIGFzIFpldHRlbGthc3RlbiBub3RlXFxuU2hpZnQr44Kv44Oq44OD44Kv44Gn5L+d5a2Y5YWI44KS5aSJ5pu0JztcbiAgYnRuLnRleHRDb250ZW50ID0gJ/Cfkr4gU2F2ZSBub3RlJztcbiAgYnRuLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJvdHRvbTogMTAwcHg7XG4gICAgcmlnaHQ6IDI0cHg7XG4gICAgYmFja2dyb3VuZDogIzFhNzNlODtcbiAgICBjb2xvcjogd2hpdGU7XG4gICAgYm9yZGVyOiBub25lO1xuICAgIGJvcmRlci1yYWRpdXM6IDIwcHg7XG4gICAgcGFkZGluZzogOHB4IDE2cHg7XG4gICAgZm9udC1zaXplOiAxM3B4O1xuICAgIGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIHNhbnMtc2VyaWY7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICAgIHotaW5kZXg6IDk5OTk7XG4gICAgYm94LXNoYWRvdzogMCAycHggOHB4IHJnYmEoMCwwLDAsMC4yNSk7XG4gICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZCAwLjJzO1xuICBgO1xuXG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWVudGVyJywgKCkgPT4ge1xuICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyMxNTU3YjAnO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG4gICAgYnRuLnN0eWxlLmJhY2tncm91bmQgPSAnIzFhNzNlOCc7XG4gIH0pO1xuICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4gc2F2ZU5vdGUoZS5zaGlmdEtleSkpO1xuXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYnRuKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVFeHBvcnQoKTogdm9pZCB7XG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBpZiAoIWNoYXRJZCB8fCBjaGF0SWQgPT09ICdhcHAnKSByZXR1cm47XG4gIGNyZWF0ZUV4cG9ydEJ1dHRvbigpO1xufVxuIiwiLy8gS2V5Ym9hcmQgZXZlbnQgaGFuZGxlcnNcblxuaW1wb3J0IHsgaXNTaG9ydGN1dCwgbG9hZFNob3J0Y3V0cywgZ2V0U2hvcnRjdXRzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XG5pbXBvcnQgeyBpc0F1dG9jb21wbGV0ZVZpc2libGUgfSBmcm9tICcuL2F1dG9jb21wbGV0ZSc7XG5pbXBvcnQge1xuICBzY3JvbGxDaGF0QXJlYSxcbiAgZm9jdXNUZXh0YXJlYSxcbiAgdG9nZ2xlU2lkZWJhcixcbiAgZ2V0QWxsQWN0aW9uQnV0dG9ucyxcbiAgZm9jdXNBY3Rpb25CdXR0b24sXG4gIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyxcbn0gZnJvbSAnLi9jaGF0JztcbmltcG9ydCB7XG4gIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUsXG4gIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSxcbiAgbW92ZUhpc3RvcnlVcCxcbiAgbW92ZUhpc3RvcnlEb3duLFxuICBvcGVuU2VsZWN0ZWRIaXN0b3J5LFxufSBmcm9tICcuL2hpc3RvcnknO1xuaW1wb3J0IHtcbiAgaXNTZWFyY2hQYWdlLFxuICB0b2dnbGVTZWFyY2hQYWdlLFxuICBtb3ZlU2VhcmNoUmVzdWx0VXAsXG4gIG1vdmVTZWFyY2hSZXN1bHREb3duLFxuICBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQsXG59IGZyb20gJy4vc2VhcmNoJztcbmltcG9ydCB7IHNhdmVOb3RlIH0gZnJvbSAnLi9leHBvcnQnO1xuXG5sZXQgbGFzdEZvY3VzZWRBY3Rpb25CdXR0b25JbmRleCA9IC0xO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbihpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gIGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXggPSBpbmRleDtcbn1cblxuZnVuY3Rpb24gaGFuZGxlU2VhcmNoUGFnZUtleWRvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcbiAgaWYgKGlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSB7XG4gICAgaWYgKFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dVcCcgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0Fycm93RG93bicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0VudGVyJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnVGFiJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRXNjYXBlJ1xuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5uYXZpZ2F0ZVRvU2VhcmNoJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHRvZ2dsZVNlYXJjaFBhZ2UoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLm1vdmVVcCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbiAgICBtb3ZlU2VhcmNoUmVzdWx0VXAoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLm1vdmVEb3duJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgIG1vdmVTZWFyY2hSZXN1bHREb3duKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5vcGVuUmVzdWx0JykpIHtcbiAgICBpZiAoZXZlbnQuaXNDb21wb3NpbmcpIHJldHVybiBmYWxzZTtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuICAgIG9wZW5TZWxlY3RlZFNlYXJjaFJlc3VsdCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2guc2Nyb2xsVXAnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgd2luZG93LnNjcm9sbEJ5KHsgdG9wOiAtd2luZG93LmlubmVySGVpZ2h0ICogMC44LCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2guc2Nyb2xsRG93bicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB3aW5kb3cuc2Nyb2xsQnkoeyB0b3A6IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuOCwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGNvbnN0IHNob3J0Y3V0cyA9IGdldFNob3J0Y3V0cygpO1xuICBjb25zdCBjaGF0S2V5cyA9IE9iamVjdC52YWx1ZXMoc2hvcnRjdXRzLmNoYXQpO1xuICBpZiAoY2hhdEtleXMuaW5jbHVkZXMoZXZlbnQuY29kZSkpIHJldHVybiB0cnVlO1xuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlQ2hhdFBhZ2VLZXlkb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG4gIGNvbnN0IGlzSW5JbnB1dCA9IChldmVudC50YXJnZXQgYXMgRWxlbWVudCkubWF0Y2hlcyhcbiAgICAnaW5wdXQsIHRleHRhcmVhLCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXSdcbiAgKTtcblxuICBpZiAoaXNBdXRvY29tcGxldGVWaXNpYmxlKCkpIHtcbiAgICBpZiAoXG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd1VwJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dEb3duJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRW50ZXInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdUYWInIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFc2NhcGUnXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKGV2ZW50LmNvZGUgPT09ICdIb21lJyAmJiAhZXZlbnQubWV0YUtleSAmJiAhZXZlbnQuY3RybEtleSAmJiAhaXNJbklucHV0KSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBzYXZlTm90ZShldmVudC5zaGlmdEtleSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoZXZlbnQuY3RybEtleSAmJiBldmVudC5zaGlmdEtleSAmJiBldmVudC5jb2RlID09PSAnS2V5RCcpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHdpbmRvdy5kb21BbmFseXplcj8uY29weVRvQ2xpcGJvYXJkKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQubmF2aWdhdGVUb1NlYXJjaCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB0b2dnbGVTZWFyY2hQYWdlKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQudG9nZ2xlU2lkZWJhcicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB0b2dnbGVTaWRlYmFyKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQudG9nZ2xlSGlzdG9yeU1vZGUnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICBjb25zdCBhY3Rpb25CdXR0b25zID0gZ2V0QWxsQWN0aW9uQnV0dG9ucygpO1xuICAgIGNvbnN0IGhhc1Jlc3BvbnNlcyA9IGFjdGlvbkJ1dHRvbnMubGVuZ3RoID4gMDtcblxuICAgIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkpIHtcbiAgICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgZm9jdXNUZXh0YXJlYSgpO1xuICAgIH0gZWxzZSBpZiAoaXNJbklucHV0KSB7XG4gICAgICBpZiAoaGFzUmVzcG9uc2VzKSB7XG4gICAgICAgIGxldCB0YXJnZXRJbmRleCA9IGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXg7XG4gICAgICAgIGlmICh0YXJnZXRJbmRleCA8IDAgfHwgdGFyZ2V0SW5kZXggPj0gYWN0aW9uQnV0dG9ucy5sZW5ndGgpIHtcbiAgICAgICAgICB0YXJnZXRJbmRleCA9IGFjdGlvbkJ1dHRvbnMubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgICAgICBhY3Rpb25CdXR0b25zW3RhcmdldEluZGV4XS5mb2N1cygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZW50ZXJIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBmb2N1c2VkRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29uc3QgaXNBY3Rpb25CdXR0b24gPVxuICAgICAgICBmb2N1c2VkRWxlbWVudCAmJlxuICAgICAgICAoZm9jdXNlZEVsZW1lbnQuY2xhc3NMaXN0Py5jb250YWlucygnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKSB8fFxuICAgICAgICAgIGZvY3VzZWRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2RlZXAtZGl2ZScpO1xuICAgICAgaWYgKGlzQWN0aW9uQnV0dG9uKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KFxuICAgICAgICAgIChidG4pID0+IGJ0biA9PT0gZm9jdXNlZEVsZW1lbnRcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCAhPT0gLTEpIGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXggPSBjdXJyZW50SW5kZXg7XG4gICAgICAgIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvY3VzVGV4dGFyZWEoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlFeGl0JykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnNjcm9sbFVwJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHNjcm9sbENoYXRBcmVhKCd1cCcpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnNjcm9sbERvd24nKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgc2Nyb2xsQ2hhdEFyZWEoJ2Rvd24nKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkpIHtcbiAgICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtb3ZlSGlzdG9yeVVwKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBtb3ZlSGlzdG9yeURvd24oKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeU9wZW4nKSkge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIG9wZW5TZWxlY3RlZEhpc3RvcnkoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICAhaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmXG4gICAgaXNJbklucHV0ICYmXG4gICAgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpIHx8IGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJykpXG4gICkge1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcbiAgICBpZiAodGV4dGFyZWEgJiYgdGV4dGFyZWEudGV4dENvbnRlbnQ/LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBjb25zdCBkaXJlY3Rpb24gPSBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSA/ICd1cCcgOiAnZG93bic7XG4gICAgICBmb2N1c0FjdGlvbkJ1dHRvbihkaXJlY3Rpb24pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlKCkgJiYgIWlzSW5JbnB1dCkge1xuICAgIGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgY29uc3QgaXNBY3Rpb25CdXR0b24gPVxuICAgICAgZm9jdXNlZEVsZW1lbnQgJiZcbiAgICAgIChmb2N1c2VkRWxlbWVudC5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdkZWVwLWRpdmUtYnV0dG9uLWlubGluZScpIHx8XG4gICAgICAgIGZvY3VzZWRFbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2RlZXAtZGl2ZScpO1xuXG4gICAgaWYgKGlzQWN0aW9uQnV0dG9uKSB7XG4gICAgICBpZiAoXG4gICAgICAgIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpIHx8XG4gICAgICAgIGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlEb3duJylcbiAgICAgICkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSA/ICd1cCcgOiAnZG93bic7XG4gICAgICAgIG1vdmVCZXR3ZWVuQWN0aW9uQnV0dG9ucyhkaXJlY3Rpb24pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnIHx8IGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgZXhwYW5kQnV0dG9uID0gKGZvY3VzZWRFbGVtZW50IGFzIGFueSkuX2V4cGFuZEJ1dHRvbiBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gKGZvY3VzZWRFbGVtZW50IGFzIGFueSkuX2RlZXBEaXZlVGFyZ2V0O1xuICAgICAgICBpZiAoZXhwYW5kQnV0dG9uICYmIHRhcmdldCkge1xuICAgICAgICAgIGNvbnN0IGlzRXhwYW5kZWQgPVxuICAgICAgICAgICAgZXhwYW5kQnV0dG9uLmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2NvbGxhcHNlJztcbiAgICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dSaWdodCcgJiYgIWlzRXhwYW5kZWQpIHtcbiAgICAgICAgICAgIGV4cGFuZEJ1dHRvbi5jbGljaygpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dMZWZ0JyAmJiBpc0V4cGFuZGVkKSB7XG4gICAgICAgICAgICBleHBhbmRCdXR0b24uY2xpY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5T3BlbicpKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIGZvY3VzZWRFbGVtZW50LmNsaWNrKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVLZXlib2FyZEhhbmRsZXJzKCk6IHZvaWQge1xuICBsb2FkU2hvcnRjdXRzKCkudGhlbigoKSA9PiB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgICdrZXlkb3duJyxcbiAgICAgIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoaXNTZWFyY2hQYWdlKCkpIHtcbiAgICAgICAgICBoYW5kbGVTZWFyY2hQYWdlS2V5ZG93bihldmVudCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGhhbmRsZUNoYXRQYWdlS2V5ZG93bihldmVudCk7XG4gICAgICB9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH0pO1xufVxuIiwiLy8gRGVlcCBkaXZlIGZ1bmN0aW9uYWxpdHkgZm9yIEdlbWluaSByZXNwb25zZXNcblxuaW50ZXJmYWNlIERlZXBEaXZlTW9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHByb21wdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIERlZXBEaXZlVGFyZ2V0IHtcbiAgdHlwZTogJ3NlY3Rpb24nIHwgJ3RhYmxlJyB8ICdibG9ja3F1b3RlJyB8ICdsaXN0JyB8ICdjaGlsZCc7XG4gIGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuICBnZXRDb250ZW50OiAoKSA9PiBzdHJpbmc7XG4gIGV4cGFuZEJ1dHRvbklkPzogc3RyaW5nO1xufVxuXG5jb25zdCBERUZBVUxUX0RFRVBfRElWRV9NT0RFUzogRGVlcERpdmVNb2RlW10gPSBbXG4gIHsgaWQ6ICdkZWZhdWx0JywgcHJvbXB0OiAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJyB9LFxuXTtcblxuZnVuY3Rpb24gYWRkRGVlcERpdmVCdXR0b25zKCk6IHZvaWQge1xuICBjb25zdCByZXNwb25zZUNvbnRhaW5lcnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubWFya2Rvd24tbWFpbi1wYW5lbCcpO1xuICBpZiAocmVzcG9uc2VDb250YWluZXJzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIHJlc3BvbnNlQ29udGFpbmVycy5mb3JFYWNoKChyZXNwb25zZUNvbnRhaW5lcikgPT4ge1xuICAgIGNvbnN0IHRhcmdldHM6IERlZXBEaXZlVGFyZ2V0W10gPSBbXTtcblxuICAgIGNvbnN0IGhlYWRpbmdzID0gcmVzcG9uc2VDb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAnaDFbZGF0YS1wYXRoLXRvLW5vZGVdLCBoMltkYXRhLXBhdGgtdG8tbm9kZV0sIGgzW2RhdGEtcGF0aC10by1ub2RlXSwgaDRbZGF0YS1wYXRoLXRvLW5vZGVdLCBoNVtkYXRhLXBhdGgtdG8tbm9kZV0sIGg2W2RhdGEtcGF0aC10by1ub2RlXSdcbiAgICApO1xuICAgIGNvbnN0IGhhc0hlYWRpbmdzID0gaGVhZGluZ3MubGVuZ3RoID4gMDtcblxuICAgIGlmIChoYXNIZWFkaW5ncykge1xuICAgICAgaGVhZGluZ3MuZm9yRWFjaCgoaGVhZGluZykgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZyA9IGhlYWRpbmcucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgIGlmIChleGlzdGluZy5oYXNBdHRyaWJ1dGUoJ2RhdGEtaW5pdGlhbGl6ZWQnKSkgcmV0dXJuO1xuICAgICAgICAgIGhlYWRpbmcucXVlcnlTZWxlY3RvckFsbCgnLmRlZXAtZGl2ZS1idXR0b24taW5saW5lLCAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b24nKS5mb3JFYWNoKChiKSA9PiBiLnJlbW92ZSgpKTtcbiAgICAgICAgfVxuICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdzZWN0aW9uJyxcbiAgICAgICAgICBlbGVtZW50OiBoZWFkaW5nLFxuICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGdldFNlY3Rpb25Db250ZW50KGhlYWRpbmcpLFxuICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB0YWJsZXMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ3RhYmxlW2RhdGEtcGF0aC10by1ub2RlXSdcbiAgICAgICk7XG4gICAgICB0YWJsZXMuZm9yRWFjaCgodGFibGUpID0+IHtcbiAgICAgICAgY29uc3Qgd3JhcHBlciA9IHRhYmxlLmNsb3Nlc3Q8SFRNTEVsZW1lbnQ+KCcudGFibGUtYmxvY2stY29tcG9uZW50Jyk7XG4gICAgICAgIGlmICh3cmFwcGVyKSB7XG4gICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB3cmFwcGVyLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nLmhhc0F0dHJpYnV0ZSgnZGF0YS1pbml0aWFsaXplZCcpKSByZXR1cm47XG4gICAgICAgICAgICBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGFyZ2V0cy5wdXNoKHtcbiAgICAgICAgICAgIHR5cGU6ICd0YWJsZScsXG4gICAgICAgICAgICBlbGVtZW50OiB3cmFwcGVyLFxuICAgICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0VGFibGVDb250ZW50KHRhYmxlKSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHRhYmxlcyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAndGFibGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIHRhYmxlcy5mb3JFYWNoKCh0YWJsZSkgPT4ge1xuICAgICAgICBjb25zdCB3cmFwcGVyID0gdGFibGUuY2xvc2VzdDxIVE1MRWxlbWVudD4oJy50YWJsZS1ibG9jay1jb21wb25lbnQnKTtcbiAgICAgICAgaWYgKHdyYXBwZXIpIHtcbiAgICAgICAgICBjb25zdCBleGlzdGluZyA9IHdyYXBwZXIucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJyk7XG4gICAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICAgIGV4aXN0aW5nLnJlbW92ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgICAgdHlwZTogJ3RhYmxlJyxcbiAgICAgICAgICAgIGVsZW1lbnQ6IHdyYXBwZXIsXG4gICAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRUYWJsZUNvbnRlbnQodGFibGUpLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgYmxvY2txdW90ZXMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ2Jsb2NrcXVvdGVbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGJsb2NrcXVvdGVzLmZvckVhY2goKGJsb2NrcXVvdGUpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBibG9ja3F1b3RlLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICBleGlzdGluZy5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgICB0YXJnZXRzLnB1c2goe1xuICAgICAgICAgIHR5cGU6ICdibG9ja3F1b3RlJyxcbiAgICAgICAgICBlbGVtZW50OiBibG9ja3F1b3RlLFxuICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGJsb2NrcXVvdGUudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJyxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgbGlzdHMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ29sW2RhdGEtcGF0aC10by1ub2RlXSwgdWxbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGxpc3RzLmZvckVhY2goKGxpc3QpID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBsaXN0LnF1ZXJ5U2VsZWN0b3IoJzpzY29wZSA+IC5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICBpZiAoZXhpc3RpbmcuaGFzQXR0cmlidXRlKCdkYXRhLWluaXRpYWxpemVkJykpIHJldHVybjtcbiAgICAgICAgICBsaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZSwgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJykuZm9yRWFjaCgoYikgPT4gYi5yZW1vdmUoKSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcGFyZW50ID0gbGlzdC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBsZXQgaXNOZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgd2hpbGUgKHBhcmVudCAmJiBwYXJlbnQgIT09IHJlc3BvbnNlQ29udGFpbmVyKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHBhcmVudC50YWdOYW1lID09PSAnT0wnIHx8IHBhcmVudC50YWdOYW1lID09PSAnVUwnKSAmJlxuICAgICAgICAgICAgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZGF0YS1wYXRoLXRvLW5vZGUnKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgaXNOZXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc05lc3RlZCkgcmV0dXJuO1xuXG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ2xpc3QnLFxuICAgICAgICAgIGVsZW1lbnQ6IGxpc3QsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0TGlzdENvbnRlbnQobGlzdCksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGFyZ2V0cy5mb3JFYWNoKCh0YXJnZXQpID0+IGFkZERlZXBEaXZlQnV0dG9uKHRhcmdldCkpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0U2VjdGlvbkNvbnRlbnQoaGVhZGluZzogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBsZXQgY29udGVudCA9IChoZWFkaW5nLnRleHRDb250ZW50Py50cmltKCkgPz8gJycpICsgJ1xcblxcbic7XG4gIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXG4gIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnRlbnQgKz0gKGN1cnJlbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJykgKyAnXFxuXFxuJztcbiAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICB9XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUYWJsZUNvbnRlbnQodGFibGU6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgbGV0IGNvbnRlbnQgPSAnJztcbiAgY29uc3Qgcm93cyA9IHRhYmxlLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTFRhYmxlUm93RWxlbWVudD4oJ3RyJyk7XG5cbiAgcm93cy5mb3JFYWNoKChyb3csIHJvd0luZGV4KSA9PiB7XG4gICAgY29uc3QgY2VsbHMgPSByb3cucXVlcnlTZWxlY3RvckFsbCgndGQsIHRoJyk7XG4gICAgY29uc3QgY2VsbFRleHRzID0gQXJyYXkuZnJvbShjZWxscykubWFwKChjZWxsKSA9PlxuICAgICAgY2VsbC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnXG4gICAgKTtcbiAgICBjb250ZW50ICs9ICd8ICcgKyBjZWxsVGV4dHMuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIGlmIChyb3dJbmRleCA9PT0gMCkge1xuICAgICAgY29udGVudCArPSAnfCAnICsgY2VsbFRleHRzLm1hcCgoKSA9PiAnLS0tJykuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRMaXN0Q29udGVudChsaXN0OiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIHJldHVybiBsaXN0LnRleHRDb250ZW50Py50cmltKCkgPz8gJyc7XG59XG5cbnR5cGUgRGVlcERpdmVCdXR0b25FbGVtZW50ID0gSFRNTEJ1dHRvbkVsZW1lbnQgJiB7XG4gIF9kZWVwRGl2ZVRhcmdldD86IERlZXBEaXZlVGFyZ2V0O1xuICBfZXhwYW5kQnV0dG9uPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gIF9wb3B1cENsb3NlZEF0PzogbnVtYmVyO1xufTtcblxuZnVuY3Rpb24gYWRkRGVlcERpdmVCdXR0b24odGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSBhcyBEZWVwRGl2ZUJ1dHRvbkVsZW1lbnQ7XG4gIGJ1dHRvbi5jbGFzc05hbWUgPSAnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ0RlZXAgZGl2ZSBpbnRvIHRoaXMgY29udGVudCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdkZWVwLWRpdmUnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1pbml0aWFsaXplZCcsICcxJyk7XG4gIGJ1dHRvbi50aXRsZSA9ICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnO1xuICBidXR0b24uX2RlZXBEaXZlVGFyZ2V0ID0gdGFyZ2V0O1xuXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgJzE2Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd2aWV3Qm94JywgJzAgMCAyNCAyNCcpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdmaWxsJywgJ2N1cnJlbnRDb2xvcicpO1xuICBjb25zdCBwYXRoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdwYXRoJyk7XG4gIHBhdGguc2V0QXR0cmlidXRlKCdkJywgJ00xOSAxNWwtNiA2LTEuNS0xLjVMMTUgMTZINFY5aDJ2NWg5bC0zLjUtMy41TDEzIDlsNiA2eicpO1xuICBzdmcuYXBwZW5kQ2hpbGQocGF0aCk7XG4gIGJ1dHRvbi5hcHBlbmRDaGlsZChzdmcpO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgaW5zZXJ0RGVlcERpdmVRdWVyeSh0YXJnZXQsIGUuY3RybEtleSk7XG4gIH0pO1xuXG4gIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiAhZS5hbHRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5KSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgaWYgKGJ1dHRvbi5fcG9wdXBDbG9zZWRBdCAmJiBEYXRlLm5vdygpIC0gYnV0dG9uLl9wb3B1cENsb3NlZEF0IDwgMzAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGFuZEJ0biA9IGJ1dHRvbi5fZXhwYW5kQnV0dG9uO1xuICAgICAgaWYgKGV4cGFuZEJ0biAmJiBleHBhbmRCdG4uZ2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicpID09PSAnZXhwYW5kJykge1xuICAgICAgICB0b2dnbGVFeHBhbmQodGFyZ2V0LCBleHBhbmRCdG4pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzaG93VGVtcGxhdGVQb3B1cChidXR0b24sIHRhcmdldCk7XG4gICAgfVxuICB9KTtcblxuICBsZXQgZXhwYW5kQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJyB8fCB0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgZXhwYW5kQnV0dG9uID0gY3JlYXRlRXhwYW5kQnV0dG9uKHRhcmdldCk7XG4gICAgYnV0dG9uLl9leHBhbmRCdXR0b24gPSBleHBhbmRCdXR0b247XG4gIH1cblxuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5nYXAgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIGlmIChleHBhbmRCdXR0b24pIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGV4cGFuZEJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICd0YWJsZScpIHtcbiAgICBjb25zdCBmb290ZXIgPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnRhYmxlLWZvb3RlcicpO1xuICAgIGlmIChmb290ZXIpIHtcbiAgICAgIGNvbnN0IGNvcHlCdXR0b24gPSBmb290ZXIucXVlcnlTZWxlY3RvcignLmNvcHktYnV0dG9uJyk7XG4gICAgICBpZiAoY29weUJ1dHRvbikge1xuICAgICAgICBmb290ZXIuaW5zZXJ0QmVmb3JlKGJ1dHRvbiwgY29weUJ1dHRvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb290ZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdibG9ja3F1b3RlJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnOHB4JztcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG4gICAgYnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICBidXR0b24uc3R5bGUudG9wID0gJzAnO1xuICAgIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwJztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIGlmIChleHBhbmRCdXR0b24pIHtcbiAgICAgIGV4cGFuZEJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgICBleHBhbmRCdXR0b24uc3R5bGUudG9wID0gJzAnO1xuICAgICAgZXhwYW5kQnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzMycHgnO1xuICAgICAgdGFyZ2V0LmVsZW1lbnQuYXBwZW5kQ2hpbGQoZXhwYW5kQnV0dG9uKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlRXhwYW5kQnV0dG9uKHRhcmdldDogRGVlcERpdmVUYXJnZXQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBidXR0b24uY2xhc3NOYW1lID0gJ2RlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJztcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdFeHBhbmQgdG8gc2VsZWN0Jyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2V4cGFuZCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpO1xuICBidXR0b24udGl0bGUgPSAnRXhwYW5kIHRvIHNlbGVjdCc7XG4gIGJ1dHRvbi50ZXh0Q29udGVudCA9ICcrJztcbiAgYnV0dG9uLnN0eWxlLmZvbnRTaXplID0gJzE0cHgnO1xuICBidXR0b24uc3R5bGUuZm9udFdlaWdodCA9ICdib2xkJztcblxuICBidXR0b24uZGF0YXNldC50YXJnZXRJZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA5KTtcbiAgdGFyZ2V0LmV4cGFuZEJ1dHRvbklkID0gYnV0dG9uLmRhdGFzZXQudGFyZ2V0SWQ7XG5cbiAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICB0b2dnbGVFeHBhbmQodGFyZ2V0LCBidXR0b24pO1xuICB9KTtcblxuICByZXR1cm4gYnV0dG9uO1xufVxuXG5mdW5jdGlvbiB0b2dnbGVFeHBhbmQodGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCwgYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBpc0V4cGFuZGVkID0gYnV0dG9uLmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2NvbGxhcHNlJztcblxuICBpZiAoaXNFeHBhbmRlZCkge1xuICAgIGNvbGxhcHNlQ2hpbGRCdXR0b25zKHRhcmdldCk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnZXhwYW5kJyk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdFeHBhbmQgdG8gc2VsZWN0Jyk7XG4gICAgYnV0dG9uLnRpdGxlID0gJ0V4cGFuZCB0byBzZWxlY3QnO1xuICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICcrJztcbiAgfSBlbHNlIHtcbiAgICBleHBhbmRDaGlsZEJ1dHRvbnModGFyZ2V0KTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdjb2xsYXBzZScpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnQ29sbGFwc2UnKTtcbiAgICBidXR0b24udGl0bGUgPSAnQ29sbGFwc2UnO1xuICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICctJztcbiAgfVxufVxuXG5mdW5jdGlvbiBleHBhbmRDaGlsZEJ1dHRvbnModGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIGNvbnN0IGhlYWRpbmcgPSB0YXJnZXQuZWxlbWVudDtcbiAgICBsZXQgY3VycmVudCA9IGhlYWRpbmcubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblxuICAgIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICAgIGlmIChjdXJyZW50LmNsYXNzTGlzdC5jb250YWlucygndGFibGUtYmxvY2stY29tcG9uZW50JykpIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoY3VycmVudC50YWdOYW1lID09PSAnUCcgJiYgIWN1cnJlbnQucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKSkge1xuICAgICAgICBhZGRDaGlsZEJ1dHRvbihjdXJyZW50KTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgKGN1cnJlbnQudGFnTmFtZSA9PT0gJ1VMJyB8fCBjdXJyZW50LnRhZ05hbWUgPT09ICdPTCcpICYmXG4gICAgICAgIGN1cnJlbnQuaGFzQXR0cmlidXRlKCdkYXRhLXBhdGgtdG8tbm9kZScpXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSBjdXJyZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCc6c2NvcGUgPiBsaScpO1xuICAgICAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgaWYgKCFpdGVtLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJykpIHtcbiAgICAgICAgICAgIGFkZENoaWxkQnV0dG9uKGl0ZW0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgY29uc3QgaXRlbXMgPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignOnNjb3BlID4gbGknKTtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICBpZiAoIWl0ZW0ucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKSkge1xuICAgICAgICBhZGRDaGlsZEJ1dHRvbihpdGVtKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRDaGlsZEJ1dHRvbihlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblxuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgYnV0dG9uLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtYnV0dG9uLWlubGluZSBkZWVwLWRpdmUtY2hpbGQtYnV0dG9uJztcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnZGVlcC1kaXZlJyk7XG4gIGJ1dHRvbi50aXRsZSA9ICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnO1xuICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICBidXR0b24uc3R5bGUudG9wID0gJzAnO1xuICBidXR0b24uc3R5bGUucmlnaHQgPSAnMCc7XG5cbiAgY29uc3Qgc3ZnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdzdmcnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCAnMTYnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgJzE2Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ3ZpZXdCb3gnLCAnMCAwIDI0IDI0Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnY3VycmVudENvbG9yJyk7XG4gIGNvbnN0IHBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3BhdGgnKTtcbiAgcGF0aC5zZXRBdHRyaWJ1dGUoJ2QnLCAnTTE5IDE1bC02IDYtMS41LTEuNUwxNSAxNkg0VjloMnY1aDlsLTMuNS0zLjVMMTMgOWw2IDZ6Jyk7XG4gIHN2Zy5hcHBlbmRDaGlsZChwYXRoKTtcbiAgYnV0dG9uLmFwcGVuZENoaWxkKHN2Zyk7XG5cbiAgY29uc3QgY2hpbGRUYXJnZXQ6IERlZXBEaXZlVGFyZ2V0ID0ge1xuICAgIHR5cGU6ICdjaGlsZCcsXG4gICAgZWxlbWVudCxcbiAgICBnZXRDb250ZW50OiAoKSA9PiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gJycsXG4gIH07XG5cbiAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBpbnNlcnREZWVwRGl2ZVF1ZXJ5KGNoaWxkVGFyZ2V0LCBlLmN0cmxLZXkpO1xuICB9KTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5ID09PSAnQXJyb3dSaWdodCcgJiYgIWUuYWx0S2V5ICYmICFlLmN0cmxLZXkgJiYgIWUubWV0YUtleSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHNob3dUZW1wbGF0ZVBvcHVwKGJ1dHRvbiwgY2hpbGRUYXJnZXQpO1xuICAgIH1cbiAgfSk7XG5cbiAgZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xufVxuXG5mdW5jdGlvbiBjb2xsYXBzZUNoaWxkQnV0dG9ucyh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0KTogdm9pZCB7XG4gIGlmICh0YXJnZXQudHlwZSA9PT0gJ3NlY3Rpb24nKSB7XG4gICAgY29uc3QgaGVhZGluZyA9IHRhcmdldC5lbGVtZW50O1xuICAgIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICAgIGlmIChjdXJyZW50LmNsYXNzTGlzdC5jb250YWlucygndGFibGUtYmxvY2stY29tcG9uZW50JykpIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjdXJyZW50XG4gICAgICAgIC5xdWVyeVNlbGVjdG9yQWxsKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpXG4gICAgICAgIC5mb3JFYWNoKChidG4pID0+IGJ0bi5yZW1vdmUoKSk7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgdGFyZ2V0LmVsZW1lbnRcbiAgICAgIC5xdWVyeVNlbGVjdG9yQWxsKCcuZGVlcC1kaXZlLWNoaWxkLWJ1dHRvbicpXG4gICAgICAuZm9yRWFjaCgoYnRuKSA9PiBidG4ucmVtb3ZlKCkpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNob3dUZW1wbGF0ZVBvcHVwKFxuICBidXR0b246IEhUTUxCdXR0b25FbGVtZW50LFxuICB0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0XG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTx7XG4gICAgZGVlcERpdmVNb2Rlcz86IERlZXBEaXZlTW9kZVtdO1xuICAgIGN1cnJlbnREZWVwRGl2ZU1vZGVJZD86IHN0cmluZztcbiAgICBkZWVwRGl2ZVJlY2VudE1vZGVzPzogc3RyaW5nW107XG4gIH0+KChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoXG4gICAgICBbJ2RlZXBEaXZlTW9kZXMnLCAnY3VycmVudERlZXBEaXZlTW9kZUlkJywgJ2RlZXBEaXZlUmVjZW50TW9kZXMnXSxcbiAgICAgIHJlc29sdmUgYXMgKGl0ZW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gdm9pZFxuICAgICk7XG4gIH0pO1xuXG4gIGNvbnN0IG1vZGVzID1cbiAgICByZXN1bHQuZGVlcERpdmVNb2RlcyAmJiByZXN1bHQuZGVlcERpdmVNb2Rlcy5sZW5ndGggPiAwXG4gICAgICA/IHJlc3VsdC5kZWVwRGl2ZU1vZGVzXG4gICAgICA6IERFRkFVTFRfREVFUF9ESVZFX01PREVTO1xuXG4gIGNvbnN0IHJlY2VudElkcyA9IHJlc3VsdC5kZWVwRGl2ZVJlY2VudE1vZGVzIHx8IFtdO1xuICBjb25zdCBzb3J0ZWQgPSBbLi4ubW9kZXNdLnNvcnQoKGEsIGIpID0+IHtcbiAgICBjb25zdCBhaSA9IHJlY2VudElkcy5pbmRleE9mKGEuaWQpO1xuICAgIGNvbnN0IGJpID0gcmVjZW50SWRzLmluZGV4T2YoYi5pZCk7XG4gICAgaWYgKGFpID09PSAtMSAmJiBiaSA9PT0gLTEpIHJldHVybiAwO1xuICAgIGlmIChhaSA9PT0gLTEpIHJldHVybiAxO1xuICAgIGlmIChiaSA9PT0gLTEpIHJldHVybiAtMTtcbiAgICByZXR1cm4gYWkgLSBiaTtcbiAgfSk7XG5cbiAgY29uc3QgcG9wdXAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgcG9wdXAuY2xhc3NOYW1lID0gJ2RlZXAtZGl2ZS10ZW1wbGF0ZS1wb3B1cCc7XG4gIHBvcHVwLmlkID0gJ2RlZXAtZGl2ZS10ZW1wbGF0ZS1wb3B1cCc7XG4gIHBvcHVwLnNldEF0dHJpYnV0ZSgncm9sZScsICdtZW51Jyk7XG5cbiAgY29uc3QgbWFrZUl0ZW0gPSAoXG4gICAgbGFiZWw6IHN0cmluZyxcbiAgICBoaW50OiBzdHJpbmcsXG4gICAgb25DbGljazogKCkgPT4gdm9pZFxuICApOiBIVE1MQnV0dG9uRWxlbWVudCA9PiB7XG4gICAgY29uc3QgaXRlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICAgIGl0ZW0uY2xhc3NOYW1lID0gJ2RlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtJztcbiAgICBpdGVtLnNldEF0dHJpYnV0ZSgncm9sZScsICdtZW51aXRlbScpO1xuICAgIGl0ZW0udGV4dENvbnRlbnQgPSBsYWJlbDtcbiAgICBpZiAoaGludCkgaXRlbS50aXRsZSA9IGhpbnQ7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCAoZSkgPT4ge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICB9KTtcbiAgICBpdGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBoaWRlVGVtcGxhdGVQb3B1cCgpO1xuICAgICAgb25DbGljaygpO1xuICAgIH0pO1xuICAgIHJldHVybiBpdGVtO1xuICB9O1xuXG4gIHNvcnRlZC5mb3JFYWNoKChtb2RlKSA9PiB7XG4gICAgcG9wdXAuYXBwZW5kQ2hpbGQoXG4gICAgICBtYWtlSXRlbShtb2RlLmlkLCBtb2RlLnByb21wdCB8fCAnJywgKCkgPT4gZG9JbnNlcnRRdWVyeSh0YXJnZXQsIG1vZGUpKVxuICAgICk7XG4gIH0pO1xuXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocG9wdXApO1xuXG4gIGNvbnN0IHJlY3QgPSBidXR0b24uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIGNvbnN0IHBvcHVwVyA9IDE2MDtcbiAgbGV0IGxlZnQgPSByZWN0LmxlZnQgKyB3aW5kb3cuc2Nyb2xsWDtcbiAgaWYgKGxlZnQgKyBwb3B1cFcgPiB3aW5kb3cuaW5uZXJXaWR0aCAtIDgpIHtcbiAgICBsZWZ0ID0gd2luZG93LmlubmVyV2lkdGggLSBwb3B1cFcgLSA4O1xuICB9XG4gIHBvcHVwLnN0eWxlLnRvcCA9IGAke3JlY3QuYm90dG9tICsgd2luZG93LnNjcm9sbFkgKyA0fXB4YDtcbiAgcG9wdXAuc3R5bGUubGVmdCA9IGAke2xlZnR9cHhgO1xuXG4gIGNvbnN0IGl0ZW1zID0gQXJyYXkuZnJvbShcbiAgICBwb3B1cC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignLmRlZXAtZGl2ZS10ZW1wbGF0ZS1pdGVtJylcbiAgKTtcbiAgbGV0IGZvY3VzSW5kZXggPSAwO1xuICBpdGVtc1swXT8uZm9jdXMoKTtcblxuICBwb3B1cC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcbiAgICBpZiAoZS5rZXkgPT09ICdFc2NhcGUnIHx8IGUua2V5ID09PSAnQXJyb3dMZWZ0JyB8fCBlLmtleSA9PT0gJ0Fycm93UmlnaHQnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAoYnV0dG9uIGFzIERlZXBEaXZlQnV0dG9uRWxlbWVudCkuX3BvcHVwQ2xvc2VkQXQgPSBEYXRlLm5vdygpO1xuICAgICAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcbiAgICAgIGJ1dHRvbi5mb2N1cygpO1xuICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggKyAxKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIGl0ZW1zW2ZvY3VzSW5kZXhdLmZvY3VzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93VXAnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIGl0ZW1zW2ZvY3VzSW5kZXhdLmZvY3VzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ1RhYicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlmIChlLnNoaWZ0S2V5KSB7XG4gICAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9jdXNJbmRleCA9IChmb2N1c0luZGV4ICsgMSkgJSBpdGVtcy5sZW5ndGg7XG4gICAgICB9XG4gICAgICBpdGVtc1tmb2N1c0luZGV4XS5mb2N1cygpO1xuICAgIH1cbiAgfSk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoaWRlVGVtcGxhdGVQb3B1cCwgeyBvbmNlOiB0cnVlIH0pO1xuICB9LCAwKTtcbn1cblxuZnVuY3Rpb24gaGlkZVRlbXBsYXRlUG9wdXAoKTogdm9pZCB7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnKT8ucmVtb3ZlKCk7XG59XG5cbmZ1bmN0aW9uIHdyaXRlVG9UZXh0YXJlYShxdWVyeTogc3RyaW5nLCBhdXRvU2VuZDogYm9vbGVhbik6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgKTtcbiAgaWYgKCF0ZXh0YXJlYSkgcmV0dXJuO1xuXG4gIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB0ZXh0YXJlYS5yZW1vdmVDaGlsZCh0ZXh0YXJlYS5maXJzdENoaWxkKTtcblxuICBxdWVyeS5zcGxpdCgnXFxuJykuZm9yRWFjaCgobGluZSkgPT4ge1xuICAgIGNvbnN0IHAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgaWYgKGxpbmUudHJpbSgpID09PSAnJykge1xuICAgICAgcC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdicicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcC50ZXh0Q29udGVudCA9IGxpbmU7XG4gICAgfVxuICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICB9KTtcblxuICB0ZXh0YXJlYS5mb2N1cygpO1xuICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgcmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHRleHRhcmVhKTtcbiAgcmFuZ2UuY29sbGFwc2UoZmFsc2UpO1xuICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcbiAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuICBpZiAoYXV0b1NlbmQpIHtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnN0IHNlbmRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIumAgeS/oVwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VuZFwiXSdcbiAgICAgICk7XG4gICAgICBpZiAoc2VuZEJ1dHRvbiAmJiAhc2VuZEJ1dHRvbi5kaXNhYmxlZCkgc2VuZEJ1dHRvbi5jbGljaygpO1xuICAgIH0sIDEwMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZG9JbnNlcnRRdWVyeSh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0LCBtb2RlOiBEZWVwRGl2ZU1vZGUpOiB2b2lkIHtcbiAgY29uc3QgY29udGVudCA9IHRhcmdldC5nZXRDb250ZW50KCk7XG4gIGNvbnN0IHF1b3RlZENvbnRlbnQgPSBjb250ZW50XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAoKGxpbmUpID0+IGA+ICR7bGluZX1gKVxuICAgIC5qb2luKCdcXG4nKTtcbiAgY29uc3QgcXVlcnkgPSBxdW90ZWRDb250ZW50ICsgJ1xcblxcbicgKyAobW9kZS5wcm9tcHQgfHwgJ+OBk+OCjOOBq+OBpOOBhOOBpuips+OBl+OBjycpO1xuICB3cml0ZVRvVGV4dGFyZWEocXVlcnksIHRydWUpO1xuXG4gIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsnZGVlcERpdmVSZWNlbnRNb2RlcyddLCAocikgPT4ge1xuICAgIGNvbnN0IHJlY2VudCA9ICgoci5kZWVwRGl2ZVJlY2VudE1vZGVzIGFzIHN0cmluZ1tdKSB8fCBbXSkuZmlsdGVyKFxuICAgICAgKGlkKSA9PiBpZCAhPT0gbW9kZS5pZFxuICAgICk7XG4gICAgcmVjZW50LnVuc2hpZnQobW9kZS5pZCk7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5zZXQoeyBkZWVwRGl2ZVJlY2VudE1vZGVzOiByZWNlbnQuc2xpY2UoMCwgMjApIH0pO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5zZXJ0RGVlcERpdmVRdWVyeShcbiAgdGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCxcbiAgcXVvdGVPbmx5ID0gZmFsc2Vcbik6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJykpIHJldHVybjtcblxuICBjb25zdCBjb250ZW50ID0gdGFyZ2V0LmdldENvbnRlbnQoKTtcbiAgY29uc3QgcXVvdGVkQ29udGVudCA9IGNvbnRlbnRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcCgobGluZSkgPT4gYD4gJHtsaW5lfWApXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIGxldCBxdWVyeTogc3RyaW5nO1xuICBsZXQgc2hvdWxkQXV0b1NlbmQgPSBmYWxzZTtcblxuICBpZiAocXVvdGVPbmx5KSB7XG4gICAgcXVlcnkgPSBxdW90ZWRDb250ZW50ICsgJ1xcblxcbic7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8e1xuICAgICAgZGVlcERpdmVNb2Rlcz86IERlZXBEaXZlTW9kZVtdO1xuICAgICAgY3VycmVudERlZXBEaXZlTW9kZUlkPzogc3RyaW5nO1xuICAgIH0+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcbiAgICAgICAgWydkZWVwRGl2ZU1vZGVzJywgJ2N1cnJlbnREZWVwRGl2ZU1vZGVJZCddLFxuICAgICAgICByZXNvbHZlIGFzIChpdGVtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHZvaWRcbiAgICAgICk7XG4gICAgfSk7XG4gICAgY29uc3QgbW9kZXMgPVxuICAgICAgcmVzdWx0LmRlZXBEaXZlTW9kZXMgJiYgcmVzdWx0LmRlZXBEaXZlTW9kZXMubGVuZ3RoID4gMFxuICAgICAgICA/IHJlc3VsdC5kZWVwRGl2ZU1vZGVzXG4gICAgICAgIDogREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM7XG4gICAgY29uc3QgdXJsUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgIGNvbnN0IHVybE1vZGVJZCA9IHVybFBhcmFtcy5nZXQoJ21vZGVfaWQnKTtcbiAgICBsZXQgbW9kZUlkID0gdXJsTW9kZUlkIHx8IHJlc3VsdC5jdXJyZW50RGVlcERpdmVNb2RlSWQgfHwgbW9kZXNbMF0/LmlkO1xuICAgIGlmICghbW9kZXMuc29tZSgobSkgPT4gbS5pZCA9PT0gbW9kZUlkKSkgbW9kZUlkID0gbW9kZXNbMF0/LmlkO1xuICAgIGNvbnN0IG1vZGUgPVxuICAgICAgbW9kZXMuZmluZCgobSkgPT4gbS5pZCA9PT0gbW9kZUlkKSB8fFxuICAgICAgbW9kZXNbMF0gfHxcbiAgICAgIERFRkFVTFRfREVFUF9ESVZFX01PREVTWzBdO1xuICAgIHF1ZXJ5ID0gcXVvdGVkQ29udGVudCArICdcXG5cXG4nICsgKG1vZGUucHJvbXB0IHx8ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nKTtcbiAgICBzaG91bGRBdXRvU2VuZCA9IHRydWU7XG4gIH1cblxuICB3cml0ZVRvVGV4dGFyZWEocXVlcnksIHNob3VsZEF1dG9TZW5kKTtcbn1cblxuZnVuY3Rpb24gYWRkRGVlcERpdmVTdHlsZXMoKTogdm9pZCB7XG4gIGNvbnN0IHN0eWxlSWQgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1zdHlsZXMnO1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3R5bGVJZCkpIHJldHVybjtcblxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gIHN0eWxlLmlkID0gc3R5bGVJZDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLmRlZXAtZGl2ZS1idXR0b24taW5saW5lIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgd2lkdGg6IDI4cHg7XG4gICAgICBoZWlnaHQ6IDI4cHg7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTRweDtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgY29sb3I6ICM1ZjYzNjg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycztcbiAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmU6aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjA1KTtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmU6Zm9jdXMge1xuICAgICAgb3V0bGluZTogMnB4IHNvbGlkICMxYTczZTg7XG4gICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUgc3ZnIHtcbiAgICAgIHdpZHRoOiAxNnB4O1xuICAgICAgaGVpZ2h0OiAxNnB4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b24ge1xuICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICB3aWR0aDogMjhweDtcbiAgICAgIGhlaWdodDogMjhweDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBjb2xvcjogIzVmNjM2ODtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzO1xuICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgICBmb250LXdlaWdodDogYm9sZDtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uOmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG4gICAgICBjb2xvcjogIzFhNzNlODtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uOmZvY3VzIHtcbiAgICAgIG91dGxpbmU6IDJweCBzb2xpZCAjMWE3M2U4O1xuICAgICAgb3V0bGluZS1vZmZzZXQ6IDJweDtcbiAgICB9XG4gICAgYmxvY2txdW90ZVtkYXRhLXBhdGgtdG8tbm9kZV0ge1xuICAgICAgcGFkZGluZy10b3A6IDQwcHg7XG4gICAgfVxuICAgIC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWZsZXggIWltcG9ydGFudDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBwYWRkaW5nOiAwIDhweDtcbiAgICAgIG1hcmdpbjogMCA0cHg7XG4gICAgICBmbGV4LXNocmluazogMDtcbiAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICB2ZXJ0aWNhbC1hbGlnbjogbWlkZGxlO1xuICAgIH1cbiAgICBib2R5ID4gLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBib3R0b206IDEwMHB4O1xuICAgICAgbGVmdDogMzIwcHg7XG4gICAgICB6LWluZGV4OiA5OTk5O1xuICAgIH1cbiAgICAuZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yIHNlbGVjdCB7XG4gICAgICBwYWRkaW5nOiA0cHggOHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2RhZGNlMDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBjb2xvcjogIzVmNjM2ODtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIG1heC13aWR0aDogMTAwcHg7XG4gICAgfVxuICAgIC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Igc2VsZWN0OmhvdmVyIHtcbiAgICAgIGJvcmRlci1jb2xvcjogIzFhNzNlODtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIHotaW5kZXg6IDk5OTk5O1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBtaW4td2lkdGg6IDE2MHB4O1xuICAgICAgcGFkZGluZzogNHB4IDA7XG4gICAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2RhZGNlMDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLDAsMCwwLjE1KTtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgcGFkZGluZzogN3B4IDE0cHg7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBjb2xvcjogIzNjNDA0MztcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbTpob3ZlcixcbiAgICAuZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW06Zm9jdXMge1xuICAgICAgYmFja2dyb3VuZDogI2YxZjNmNDtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5mdW5jdGlvbiBpbmplY3RNb2RlU2VsZWN0b3IoKTogdm9pZCB7XG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvcicpO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFxuICAgIFsnZGVlcERpdmVNb2RlcycsICdjdXJyZW50RGVlcERpdmVNb2RlSWQnXSxcbiAgICAocjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgICAgIGNvbnN0IG1vZGVzID1cbiAgICAgICAgKHIuZGVlcERpdmVNb2RlcyBhcyBEZWVwRGl2ZU1vZGVbXSB8IHVuZGVmaW5lZCkgJiZcbiAgICAgICAgKHIuZGVlcERpdmVNb2RlcyBhcyBEZWVwRGl2ZU1vZGVbXSkubGVuZ3RoID4gMFxuICAgICAgICAgID8gKHIuZGVlcERpdmVNb2RlcyBhcyBEZWVwRGl2ZU1vZGVbXSlcbiAgICAgICAgICA6IERFRkFVTFRfREVFUF9ESVZFX01PREVTO1xuXG4gICAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICB3cmFwcGVyLmlkID0gJ2dlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3Rvcic7XG4gICAgICB3cmFwcGVyLmNsYXNzTmFtZSA9ICdnZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3InO1xuXG4gICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzZWxlY3QnKTtcbiAgICAgIHNlbGVjdC5pZCA9ICdnZW1pbmktZGVlcC1kaXZlLW1vZGUnO1xuICAgICAgc2VsZWN0LnRpdGxlID0gJ+a3seaOmOOCiuODouODvOODiSc7XG4gICAgICBzZWxlY3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ+a3seaOmOOCiuODouODvOODiScpO1xuXG4gICAgICBtb2Rlcy5mb3JFYWNoKChtb2RlKSA9PiB7XG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgICAgICBvcHRpb24udmFsdWUgPSBtb2RlLmlkO1xuICAgICAgICBvcHRpb24udGV4dENvbnRlbnQgPSBtb2RlLmlkO1xuICAgICAgICBzZWxlY3QuYXBwZW5kQ2hpbGQob3B0aW9uKTtcbiAgICAgIH0pO1xuXG4gICAgICBzZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IGN1cnJlbnREZWVwRGl2ZU1vZGVJZDogc2VsZWN0LnZhbHVlIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHdyYXBwZXIuYXBwZW5kQ2hpbGQoc2VsZWN0KTtcblxuICAgICAgY29uc3QgYWRkQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg5XjgqHjgqTjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIui/veWKoFwiXSdcbiAgICAgICk7XG4gICAgICBjb25zdCB0b29sc0J1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OE44O844OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJUb29sXCJdJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IGluc2VydEFmdGVyID0gdG9vbHNCdXR0b24gfHwgKGFkZEJ1dHRvbiAmJiBhZGRCdXR0b24ubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbCk7XG4gICAgICBpZiAoaW5zZXJ0QWZ0ZXIgJiYgaW5zZXJ0QWZ0ZXIucGFyZW50RWxlbWVudCkge1xuICAgICAgICBpbnNlcnRBZnRlci5wYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZSh3cmFwcGVyLCBpbnNlcnRBZnRlci5uZXh0U2libGluZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBpbnB1dEFyZWEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgICAgICk7XG4gICAgICAgIGlmIChpbnB1dEFyZWEpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnQgPVxuICAgICAgICAgICAgaW5wdXRBcmVhLmNsb3Nlc3QoJ2Zvcm0nKSB8fFxuICAgICAgICAgICAgaW5wdXRBcmVhLnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZSh3cmFwcGVyLCBwYXJlbnQuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdXJsUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgY29uc3QgdXJsTW9kZUlkID0gdXJsUGFyYW1zLmdldCgnbW9kZV9pZCcpO1xuICAgICAgbGV0IG1vZGVJZCA9IHIuY3VycmVudERlZXBEaXZlTW9kZUlkIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmICh1cmxNb2RlSWQgJiYgbW9kZXMuc29tZSgobSkgPT4gbS5pZCA9PT0gdXJsTW9kZUlkKSkge1xuICAgICAgICBtb2RlSWQgPSB1cmxNb2RlSWQ7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgY3VycmVudERlZXBEaXZlTW9kZUlkOiB1cmxNb2RlSWQgfSk7XG4gICAgICB9XG4gICAgICBpZiAobW9kZUlkICYmIG1vZGVzLnNvbWUoKG0pID0+IG0uaWQgPT09IG1vZGVJZCkpIHtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gbW9kZUlkO1xuICAgICAgfSBlbHNlIGlmIChtb2Rlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHNlbGVjdC52YWx1ZSA9IG1vZGVzWzBdLmlkO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn1cblxubGV0IGRlZXBEaXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplRGVlcERpdmUoKTogdm9pZCB7XG4gIGFkZERlZXBEaXZlU3R5bGVzKCk7XG5cbiAgY29uc3QgdHJ5SW5qZWN0TW9kZVNlbGVjdG9yID0gKCkgPT4ge1xuICAgIGNvbnN0IGhhc0J1dHRvbnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODhOODvOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiVG9vbFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OV44Kh44Kk44OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCLov73liqBcIl0nXG4gICAgKTtcbiAgICBpZiAoXG4gICAgICBoYXNCdXR0b25zIHx8XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXScpXG4gICAgKSB7XG4gICAgICBpbmplY3RNb2RlU2VsZWN0b3IoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0VGltZW91dCh0cnlJbmplY3RNb2RlU2VsZWN0b3IsIDUwMCk7XG4gICAgfVxuICB9O1xuICB0cnlJbmplY3RNb2RlU2VsZWN0b3IoKTtcblxuICBjaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIG5hbWVzcGFjZSkgPT4ge1xuICAgIGlmIChcbiAgICAgIG5hbWVzcGFjZSA9PT0gJ3N5bmMnICYmXG4gICAgICBjaGFuZ2VzLmRlZXBEaXZlTW9kZXMgJiZcbiAgICAgIGxvY2F0aW9uLmhyZWYuaW5jbHVkZXMoJ2dlbWluaS5nb29nbGUuY29tJykgJiZcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg4Tjg7zjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlRvb2xcIl0sIGRpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICAgKVxuICAgICkge1xuICAgICAgaW5qZWN0TW9kZVNlbGVjdG9yKCk7XG4gICAgfVxuICB9KTtcblxuICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChtdXRhdGlvbnMpID0+IHtcbiAgICBsZXQgc2hvdWxkVXBkYXRlID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBtdXRhdGlvbiBvZiBtdXRhdGlvbnMpIHtcbiAgICAgIGlmIChtdXRhdGlvbi5hZGRlZE5vZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG11dGF0aW9uLmFkZGVkTm9kZXMpIHtcbiAgICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBub2RlIGFzIEVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGVsLm1hdGNoZXM/LignW2RhdGEtcGF0aC10by1ub2RlXScpIHx8XG4gICAgICAgICAgICAgIGVsLnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtcGF0aC10by1ub2RlXScpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgc2hvdWxkVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc2hvdWxkVXBkYXRlKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc2hvdWxkVXBkYXRlKSB7XG4gICAgICBpZiAoZGVlcERpdmVUaW1lcikgY2xlYXJUaW1lb3V0KGRlZXBEaXZlVGltZXIpO1xuICAgICAgZGVlcERpdmVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gYWRkRGVlcERpdmVCdXR0b25zKCksIDUwMCk7XG4gICAgfVxuICB9KTtcblxuICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4gYWRkRGVlcERpdmVCdXR0b25zKCksIDEwMDApO1xufVxuIiwiLy8gTWFwIHZpZXcgLSBmaXhlZCByaWdodC1zaWRlIHBhbmVsIHNob3dpbmcgY3VycmVudCBjaGF0IG91dGxpbmUgd2l0aCBzY3JvbGwgaGlnaGxpZ2h0XG5cbmxldCBtYXBNb2RlID0gZmFsc2U7XG5jb25zdCBNQVBfUEFORUxfSUQgPSAnZ2VtaW5pLW1hcC1wYW5lbCc7XG5jb25zdCBNQVBfU1RZTEVfSUQgPSAnZ2VtaW5pLW1hcC1zdHlsZXMnO1xuXG5mdW5jdGlvbiBpbmplY3RNYXBTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfU1RZTEVfSUQpKSByZXR1cm47XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSBNQVBfU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICNnZW1pbmktbWFwLXBhbmVsIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIHJpZ2h0OiAxNnB4O1xuICAgICAgdG9wOiA2MHB4O1xuICAgICAgYm90dG9tOiAxNnB4O1xuICAgICAgd2lkdGg6IDI0MHB4O1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNDgsIDI0OSwgMjUwLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gICAgICBib3gtc2hhZG93OiAwIDJweCAxMnB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgICB6LWluZGV4OiAxMDA7XG4gICAgICBwYWRkaW5nOiA2cHggNHB4O1xuICAgICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICB9XG4gICAgLmRhcmstdGhlbWUgI2dlbWluaS1tYXAtcGFuZWwge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgzMiwgMzMsIDM2LCAwLjk1KTtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjQpO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCAubWFwLWhlYWRlciB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCB1bCB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgICAgd2lkdGg6IDEwMCU7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgYmFja2dyb3VuZDogbm9uZTtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJvcmRlci1sZWZ0OiAycHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItcmFkaXVzOiAwIDZweCA2cHggMDtcbiAgICAgIHBhZGRpbmc6IDVweCAxMHB4IDVweCA4cHg7XG4gICAgICBtYXJnaW46IDFweCAwO1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgZm9udC1zaXplOiAxNXB4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuMzU7XG4gICAgICBjb2xvcjogaW5oZXJpdDtcbiAgICAgIGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuICAgICAgd29yZC1icmVhazogYnJlYWstd29yZDtcbiAgICAgIG9wYWNpdHk6IDAuNTtcbiAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXMsIG9wYWNpdHkgMC4xNXMsIGJvcmRlci1jb2xvciAwLjE1cztcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uOmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTI4LCAxMjgsIDEyOCwgMC4xMik7XG4gICAgICBvcGFjaXR5OiAwLjg1O1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b24ubWFwLWl0ZW0tY3VycmVudCB7XG4gICAgICBvcGFjaXR5OiAxO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNiwgMTE1LCAyMzIsIDAuMDgpO1xuICAgICAgYm9yZGVyLWxlZnQtY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIGxpIGJ1dHRvbiAubWFwLXR1cm4taW5kZXgge1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWluLXdpZHRoOiAxOHB4O1xuICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgb3BhY2l0eTogMC41O1xuICAgICAgbWFyZ2luLXJpZ2h0OiAzcHg7XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvbXB0VGV4dCh1c2VyUXVlcnk6IEVsZW1lbnQpOiBzdHJpbmcge1xuICBjb25zdCBoZWFkaW5nID0gdXNlclF1ZXJ5LnF1ZXJ5U2VsZWN0b3IoJ2gxLCBoMiwgaDMsIFtyb2xlPVwiaGVhZGluZ1wiXScpO1xuICBsZXQgdGV4dCA9XG4gICAgKGhlYWRpbmcgYXMgSFRNTEVsZW1lbnQpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8XG4gICAgKHVzZXJRdWVyeSBhcyBIVE1MRWxlbWVudCkudGV4dENvbnRlbnQ/LnRyaW0oKSB8fFxuICAgICcnO1xuICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9e44GC44Gq44Gf44Gu44OX44Ot44Oz44OX44OIXFxzKi8sICcnKTtcbiAgdGV4dCA9IHRleHQucmVwbGFjZSgvXj5cXHMqLywgJycpO1xuICByZXR1cm4gdGV4dC5zdWJzdHJpbmcoMCwgNjApIHx8ICco56m6KSc7XG59XG5cbmZ1bmN0aW9uIGdldENvbnZlcnNhdGlvbkNvbnRhaW5lcnMoKTogSFRNTEVsZW1lbnRbXSB7XG4gIHJldHVybiBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2luZmluaXRlLXNjcm9sbGVyLmNoYXQtaGlzdG9yeSA+IC5jb252ZXJzYXRpb24tY29udGFpbmVyJ1xuICAgIClcbiAgKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRNYXBQYW5lbCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHBhbmVsLmlkID0gTUFQX1BBTkVMX0lEO1xuXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBoZWFkZXIuY2xhc3NOYW1lID0gJ21hcC1oZWFkZXInO1xuICBoZWFkZXIudGV4dENvbnRlbnQgPSAn44GT44Gu44OB44Oj44OD44OI44Gu5rWB44KMJztcbiAgcGFuZWwuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuICBjb25zdCBjb250YWluZXJzID0gZ2V0Q29udmVyc2F0aW9uQ29udGFpbmVycygpO1xuXG4gIGlmIChjb250YWluZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZW1wdHkuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMHB4OyBvcGFjaXR5OiAwLjQ1OyBmb250LXNpemU6IDEycHg7JztcbiAgICBlbXB0eS50ZXh0Q29udGVudCA9ICfjg4Hjg6Pjg4Pjg4jjgYzjgb7jgaDjgYLjgorjgb7jgZvjgpMnO1xuICAgIHBhbmVsLmFwcGVuZENoaWxkKGVtcHR5KTtcbiAgICByZXR1cm4gcGFuZWw7XG4gIH1cblxuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKTtcblxuICBjb250YWluZXJzLmZvckVhY2goKGNvbnRhaW5lciwgaW5kZXgpID0+IHtcbiAgICBjb25zdCB1c2VyUXVlcnkgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcigndXNlci1xdWVyeScpO1xuICAgIGlmICghdXNlclF1ZXJ5KSByZXR1cm47XG5cbiAgICBjb25zdCBwcm9tcHRUZXh0ID0gZ2V0UHJvbXB0VGV4dCh1c2VyUXVlcnkpO1xuICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblxuICAgIGNvbnN0IGluZGV4U3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICBpbmRleFNwYW4uY2xhc3NOYW1lID0gJ21hcC10dXJuLWluZGV4JztcbiAgICBpbmRleFNwYW4udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LmA7XG5cbiAgICBidG4uYXBwZW5kQ2hpbGQoaW5kZXhTcGFuKTtcbiAgICBidG4uYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocHJvbXB0VGV4dCkpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnRhaW5lci5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdzdGFydCcgfSk7XG4gICAgfSk7XG5cbiAgICBsaS5hcHBlbmRDaGlsZChidG4pO1xuICAgIGxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICB9KTtcblxuICBwYW5lbC5hcHBlbmRDaGlsZChsaXN0KTtcbiAgcmV0dXJuIHBhbmVsO1xufVxuXG5mdW5jdGlvbiBnZXRNYXBCdXR0b25zKCk6IEhUTUxCdXR0b25FbGVtZW50W10ge1xuICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGlmICghcGFuZWwpIHJldHVybiBbXTtcbiAgcmV0dXJuIEFycmF5LmZyb20ocGFuZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJ2xpIGJ1dHRvbicpKTtcbn1cblxubGV0IGludGVyc2VjdGlvbk9ic2VydmVyOiBJbnRlcnNlY3Rpb25PYnNlcnZlciB8IG51bGwgPSBudWxsO1xuY29uc3QgdmlzaWJsZVR1cm5zID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbmZ1bmN0aW9uIHNldHVwSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChpbnRlcnNlY3Rpb25PYnNlcnZlcikgaW50ZXJzZWN0aW9uT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICB2aXNpYmxlVHVybnMuY2xlYXIoKTtcblxuICBjb25zdCBjb250YWluZXJzID0gZ2V0Q29udmVyc2F0aW9uQ29udGFpbmVycygpO1xuICBpZiAoY29udGFpbmVycy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICBpbnRlcnNlY3Rpb25PYnNlcnZlciA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcihcbiAgICAoZW50cmllcykgPT4ge1xuICAgICAgZW50cmllcy5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgICBjb25zdCBpbmRleCA9IGNvbnRhaW5lcnMuaW5kZXhPZihlbnRyeS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpO1xuICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm47XG4gICAgICAgIGlmIChlbnRyeS5pc0ludGVyc2VjdGluZykge1xuICAgICAgICAgIHZpc2libGVUdXJucy5hZGQoaW5kZXgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZpc2libGVUdXJucy5kZWxldGUoaW5kZXgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgYnV0dG9ucyA9IGdldE1hcEJ1dHRvbnMoKTtcbiAgICAgIGJ1dHRvbnMuZm9yRWFjaCgoYnRuLCBpKSA9PiB7XG4gICAgICAgIGJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdtYXAtaXRlbS1jdXJyZW50JywgdmlzaWJsZVR1cm5zLmhhcyhpKSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICAgICAgaWYgKHBhbmVsKSB7XG4gICAgICAgIGNvbnN0IGZpcnN0SGlnaGxpZ2h0ZWQgPSBidXR0b25zLmZpbmQoKF8sIGkpID0+IHZpc2libGVUdXJucy5oYXMoaSkpO1xuICAgICAgICBpZiAoZmlyc3RIaWdobGlnaHRlZCkge1xuICAgICAgICAgIGZpcnN0SGlnaGxpZ2h0ZWQuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIHsgdGhyZXNob2xkOiAwLjE1IH1cbiAgKTtcblxuICBjb250YWluZXJzLmZvckVhY2goKGMpID0+IGludGVyc2VjdGlvbk9ic2VydmVyIS5vYnNlcnZlKGMpKTtcbn1cblxuZnVuY3Rpb24gc3RvcEludGVyc2VjdGlvbk9ic2VydmVyKCk6IHZvaWQge1xuICBpZiAoaW50ZXJzZWN0aW9uT2JzZXJ2ZXIpIHtcbiAgICBpbnRlcnNlY3Rpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgaW50ZXJzZWN0aW9uT2JzZXJ2ZXIgPSBudWxsO1xuICB9XG4gIHZpc2libGVUdXJucy5jbGVhcigpO1xufVxuXG5sZXQgY2hhdE9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyIHwgbnVsbCA9IG51bGw7XG5cbmZ1bmN0aW9uIHN0YXJ0Q2hhdE9ic2VydmVyKCk6IHZvaWQge1xuICBpZiAoY2hhdE9ic2VydmVyKSBjaGF0T2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuXG4gIGNvbnN0IGNoYXRIaXN0b3J5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5Jyk7XG4gIGlmICghY2hhdEhpc3RvcnkpIHJldHVybjtcblxuICBsZXQgZGVib3VuY2VUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuICBjaGF0T2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgaWYgKCFtYXBNb2RlKSByZXR1cm47XG4gICAgaWYgKGRlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dChkZWJvdW5jZVRpbWVyKTtcbiAgICBkZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiByZWZyZXNoTWFwKCksIDMwMCk7XG4gIH0pO1xuXG4gIGNoYXRPYnNlcnZlci5vYnNlcnZlKGNoYXRIaXN0b3J5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHN0b3BDaGF0T2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChjaGF0T2JzZXJ2ZXIpIHtcbiAgICBjaGF0T2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgIGNoYXRPYnNlcnZlciA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmcmVzaE1hcCgpOiB2b2lkIHtcbiAgaWYgKCFtYXBNb2RlKSByZXR1cm47XG5cbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBjb25zdCBzYXZlZFNjcm9sbCA9IGV4aXN0aW5nID8gZXhpc3Rpbmcuc2Nyb2xsVG9wIDogMDtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBzdG9wSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcblxuICBjb25zdCBwYW5lbCA9IGJ1aWxkTWFwUGFuZWwoKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYW5lbCk7XG4gIHBhbmVsLnNjcm9sbFRvcCA9IHNhdmVkU2Nyb2xsO1xuXG4gIHNldHVwSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dNYXAoKTogdm9pZCB7XG4gIGluamVjdE1hcFN0eWxlcygpO1xuXG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjb25zdCBwYW5lbCA9IGJ1aWxkTWFwUGFuZWwoKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYW5lbCk7XG4gIG1hcE1vZGUgPSB0cnVlO1xuXG4gIHNldHVwSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcbiAgc3RhcnRDaGF0T2JzZXJ2ZXIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0TWFwTW9kZSgpOiB2b2lkIHtcbiAgc3RvcENoYXRPYnNlcnZlcigpO1xuICBzdG9wSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcbiAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBpZiAocGFuZWwpIHBhbmVsLnJlbW92ZSgpO1xuICBtYXBNb2RlID0gZmFsc2U7XG59XG4iLCIvLyBET03mp4vpgKDjgpJBSeOCqOODvOOCuOOCp+ODs+ODiOOBjOiqjeitmOOBp+OBjeOCi+W9ouW8j+OBp+WHuuWKm1xuXG50eXBlIEVsZW1lbnRUeXBlID1cbiAgfCAndGV4dGFyZWEnXG4gIHwgJ3NpZGViYXInXG4gIHwgJ3NpZGViYXJUb2dnbGUnXG4gIHwgJ2NoYXRIaXN0b3J5J1xuICB8ICduZXdDaGF0QnV0dG9uJ1xuICB8ICdjb3B5QnV0dG9ucydcbiAgfCAnY2hhdENvbnRhaW5lcic7XG5cbmludGVyZmFjZSBGaW5kRWxlbWVudFJlc3VsdCB7XG4gIGVsZW1lbnQ6IEVsZW1lbnQgfCBudWxsO1xuICBzZWxlY3Rvcjogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEludGVyYWN0aXZlRWxlbWVudCB7XG4gIGluZGV4OiBudW1iZXI7XG4gIHR5cGU6IHN0cmluZztcbiAgcm9sZTogc3RyaW5nO1xuICBhcmlhTGFiZWw6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBpc1Zpc2libGU6IGJvb2xlYW47XG4gIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG59XG5cbmNsYXNzIERPTUFuYWx5emVyIHtcbiAgcHJpdmF0ZSBlbGVtZW50U2VsZWN0b3JzOiBSZWNvcmQ8RWxlbWVudFR5cGUsIHN0cmluZ1tdPjtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmVsZW1lbnRTZWxlY3RvcnMgPSB7XG4gICAgICB0ZXh0YXJlYTogW1xuICAgICAgICAnW3JvbGU9XCJ0ZXh0Ym94XCJdW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nLFxuICAgICAgICAnW2FyaWEtbGFiZWwqPVwi44OX44Ot44Oz44OX44OIXCJdJyxcbiAgICAgICAgJy5xbC1lZGl0b3IudGV4dGFyZWEnLFxuICAgICAgICAncmljaC10ZXh0YXJlYSBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScsXG4gICAgICBdLFxuICAgICAgc2lkZWJhcjogW1xuICAgICAgICAnW3JvbGU9XCJuYXZpZ2F0aW9uXCJdJyxcbiAgICAgICAgJ2JhcmQtc2lkZW5hdicsXG4gICAgICAgICcuc2lkZS1uYXYtY29udGFpbmVyJyxcbiAgICAgICAgJ2FzaWRlJyxcbiAgICAgIF0sXG4gICAgICBzaWRlYmFyVG9nZ2xlOiBbXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg6HjgqTjg7Pjg6Hjg4vjg6Xjg7xcIl0nLFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiTWFpbiBtZW51XCJdJyxcbiAgICAgICAgJ2J1dHRvbltkYXRhLXRlc3QtaWQ9XCJzaWRlLW5hdi1tZW51LWJ1dHRvblwiXScsXG4gICAgICBdLFxuICAgICAgY2hhdEhpc3Rvcnk6IFtcbiAgICAgICAgJy5jb252ZXJzYXRpb25bcm9sZT1cImJ1dHRvblwiXScsXG4gICAgICAgICdbZGF0YS10ZXN0LWlkPVwiY29udmVyc2F0aW9uXCJdJyxcbiAgICAgICAgJy5jb252ZXJzYXRpb24taXRlbXMtY29udGFpbmVyIC5jb252ZXJzYXRpb24nLFxuICAgICAgXSxcbiAgICAgIG5ld0NoYXRCdXR0b246IFtcbiAgICAgICAgJ2FbaHJlZj1cImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwXCJdJyxcbiAgICAgICAgJ2FbYXJpYS1sYWJlbCo9XCLmlrDopo/kvZzmiJBcIl0nLFxuICAgICAgICAnW2RhdGEtdGVzdC1pZD1cIm5ldy1jaGF0LWJ1dHRvblwiXScsXG4gICAgICBdLFxuICAgICAgY29weUJ1dHRvbnM6IFtcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuOCs+ODlOODvFwiXScsXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJDb3B5XCJdJyxcbiAgICAgICAgJy5jb3B5LWJ1dHRvbicsXG4gICAgICBdLFxuICAgICAgY2hhdENvbnRhaW5lcjogW1xuICAgICAgICAnY2hhdC13aW5kb3cnLFxuICAgICAgICAnbWFpbi5tYWluJyxcbiAgICAgICAgJy5jb252ZXJzYXRpb24tY29udGFpbmVyJyxcbiAgICAgIF0sXG4gICAgfTtcbiAgfVxuXG4gIGZpbmRFbGVtZW50KHR5cGU6IEVsZW1lbnRUeXBlKTogRmluZEVsZW1lbnRSZXN1bHQge1xuICAgIGNvbnN0IHNlbGVjdG9ycyA9IHRoaXMuZWxlbWVudFNlbGVjdG9yc1t0eXBlXSB8fCBbXTtcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICBpZiAoZWxlbWVudCkgcmV0dXJuIHsgZWxlbWVudCwgc2VsZWN0b3IgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBJbnZhbGlkIHNlbGVjdG9yLCBza2lwXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IGVsZW1lbnQ6IG51bGwsIHNlbGVjdG9yOiBudWxsIH07XG4gIH1cblxuICBmaW5kQWxsRWxlbWVudHMoKTogUmVjb3JkPEVsZW1lbnRUeXBlLCBGaW5kRWxlbWVudFJlc3VsdD4ge1xuICAgIGNvbnN0IHJlc3VsdCA9IHt9IGFzIFJlY29yZDxFbGVtZW50VHlwZSwgRmluZEVsZW1lbnRSZXN1bHQ+O1xuICAgIGZvciAoY29uc3QgdHlwZSBpbiB0aGlzLmVsZW1lbnRTZWxlY3RvcnMpIHtcbiAgICAgIHJlc3VsdFt0eXBlIGFzIEVsZW1lbnRUeXBlXSA9IHRoaXMuZmluZEVsZW1lbnQodHlwZSBhcyBFbGVtZW50VHlwZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBjYXB0dXJlUGFnZVN0cnVjdHVyZSgpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgdXJsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgIHRpdGxlOiBkb2N1bWVudC50aXRsZSxcbiAgICAgIGVsZW1lbnRzOiB0aGlzLmZpbmRBbGxFbGVtZW50cygpLFxuICAgICAgaW50ZXJhY3RpdmVFbGVtZW50czogdGhpcy5nZXRJbnRlcmFjdGl2ZUVsZW1lbnRzKCksXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICB2aWV3cG9ydDogeyB3aWR0aDogd2luZG93LmlubmVyV2lkdGgsIGhlaWdodDogd2luZG93LmlubmVySGVpZ2h0IH0sXG4gICAgICAgIHNjcm9sbFBvc2l0aW9uOiB7IHg6IHdpbmRvdy5zY3JvbGxYLCB5OiB3aW5kb3cuc2Nyb2xsWSB9LFxuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgZ2V0SW50ZXJhY3RpdmVFbGVtZW50cygpOiBJbnRlcmFjdGl2ZUVsZW1lbnRbXSB7XG4gICAgY29uc3QgZWxlbWVudHM6IEludGVyYWN0aXZlRWxlbWVudFtdID0gW107XG4gICAgY29uc3Qgc2VsZWN0b3IgPVxuICAgICAgJ2J1dHRvbiwgYSwgaW5wdXQsIHRleHRhcmVhLCBbcm9sZT1cImJ1dHRvblwiXSwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nO1xuICAgIGNvbnN0IGludGVyYWN0aXZlcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuXG4gICAgaW50ZXJhY3RpdmVzLmZvckVhY2goKGVsLCBpbmRleCkgPT4ge1xuICAgICAgaWYgKGluZGV4ID49IDUwKSByZXR1cm47XG4gICAgICBjb25zdCByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBpZiAocmVjdC53aWR0aCA9PT0gMCB8fCByZWN0LmhlaWdodCA9PT0gMCkgcmV0dXJuO1xuICAgICAgZWxlbWVudHMucHVzaCh7XG4gICAgICAgIGluZGV4LFxuICAgICAgICB0eXBlOiBlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIHJvbGU6IGVsLmdldEF0dHJpYnV0ZSgncm9sZScpIHx8ICcnLFxuICAgICAgICBhcmlhTGFiZWw6IGVsLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8ICcnLFxuICAgICAgICB0ZXh0OiBlbC50ZXh0Q29udGVudD8udHJpbSgpLnN1YnN0cmluZygwLCA1MCkgfHwgJycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBlbC5nZXRBdHRyaWJ1dGUoJ2Rlc2NyaXB0aW9uJykgfHwgJycsXG4gICAgICAgIGlzVmlzaWJsZTogcmVjdC53aWR0aCA+IDAgJiYgcmVjdC5oZWlnaHQgPiAwLFxuICAgICAgICBwb3NpdGlvbjogeyB4OiBNYXRoLnJvdW5kKHJlY3QueCksIHk6IE1hdGgucm91bmQocmVjdC55KSB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gZWxlbWVudHM7XG4gIH1cblxuICBleHBvcnRGb3JBSSgpOiBzdHJpbmcge1xuICAgIGNvbnN0IHN0cnVjdHVyZSA9IHRoaXMuY2FwdHVyZVBhZ2VTdHJ1Y3R1cmUoKTtcblxuICAgIGxldCBvdXRwdXQgPSBgIyMgR2VtaW5pIENoYXQgUGFnZSBTdHJ1Y3R1cmVcXG5cXG5gO1xuICAgIG91dHB1dCArPSBgKipVUkwqKjogJHtzdHJ1Y3R1cmUudXJsfVxcbmA7XG4gICAgb3V0cHV0ICs9IGAqKlRpdGxlKio6ICR7c3RydWN0dXJlLnRpdGxlfVxcblxcbmA7XG4gICAgb3V0cHV0ICs9IGAjIyMgTWFpbiBFbGVtZW50c1xcblxcbmA7XG5cbiAgICBmb3IgKGNvbnN0IFt0eXBlLCBkYXRhXSBvZiBPYmplY3QuZW50cmllcyhzdHJ1Y3R1cmUuZWxlbWVudHMpKSB7XG4gICAgICBpZiAoZGF0YS5lbGVtZW50KSB7XG4gICAgICAgIG91dHB1dCArPSBgLSAqKiR7dHlwZX0qKjogXFxgJHtkYXRhLnNlbGVjdG9yfVxcYCDinJNcXG5gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0ICs9IGAtICoqJHt0eXBlfSoqOiBOb3QgZm91bmQg4pyXXFxuYDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBvdXRwdXQgKz0gYFxcbiMjIyBJbnRlcmFjdGl2ZSBFbGVtZW50cyAoJHtzdHJ1Y3R1cmUuaW50ZXJhY3RpdmVFbGVtZW50cy5sZW5ndGh9KVxcblxcbmA7XG4gICAgc3RydWN0dXJlLmludGVyYWN0aXZlRWxlbWVudHMuc2xpY2UoMCwgMTApLmZvckVhY2goKGVsKSA9PiB7XG4gICAgICBpZiAoZWwudGV4dCkge1xuICAgICAgICBvdXRwdXQgKz0gYC0gWyR7ZWwudHlwZX1dICR7ZWwudGV4dH0gKCR7ZWwuYXJpYUxhYmVsIHx8IGVsLnJvbGV9KVxcbmA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gb3V0cHV0O1xuICB9XG5cbiAgYXN5bmMgY29weVRvQ2xpcGJvYXJkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHRleHQgPSB0aGlzLmV4cG9ydEZvckFJKCk7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRleHQpO1xuICAgICAgdGhpcy5zaG93Tm90aWZpY2F0aW9uKCfjg5rjg7zjgrjmp4vpgKDjgpLjgq/jg6rjg4Pjg5fjg5zjg7zjg4njgavjgrPjg5Tjg7zjgZfjgb7jgZfjgZ8nKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2gge1xuICAgICAgdGhpcy5zaG93Tm90aWZpY2F0aW9uKCfjgrPjg5Tjg7zjgavlpLHmlZfjgZfjgb7jgZfjgZ8nLCAnZXJyb3InKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBzaG93Tm90aWZpY2F0aW9uKG1lc3NhZ2U6IHN0cmluZywgdHlwZTogJ3N1Y2Nlc3MnIHwgJ2Vycm9yJyA9ICdzdWNjZXNzJyk6IHZvaWQge1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG5vdGlmaWNhdGlvbi5zdHlsZS5jc3NUZXh0ID0gYFxuICAgICAgcG9zaXRpb246IGZpeGVkO1xuICAgICAgdG9wOiAyMHB4O1xuICAgICAgcmlnaHQ6IDIwcHg7XG4gICAgICBiYWNrZ3JvdW5kOiAke3R5cGUgPT09ICdlcnJvcicgPyAnI2Y0NDMzNicgOiAnIzRDQUY1MCd9O1xuICAgICAgY29sb3I6IHdoaXRlO1xuICAgICAgcGFkZGluZzogMTZweCAyNHB4O1xuICAgICAgYm9yZGVyLXJhZGl1czogNHB4O1xuICAgICAgei1pbmRleDogMTAwMDA7XG4gICAgICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwwLDAsMC4zKTtcbiAgICAgIGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIHNhbnMtc2VyaWY7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgICBhbmltYXRpb246IHNsaWRlSW4gMC4zcyBlYXNlLW91dDtcbiAgICBgO1xuICAgIG5vdGlmaWNhdGlvbi50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cbiAgICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gICAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgICBAa2V5ZnJhbWVzIHNsaWRlSW4ge1xuICAgICAgICBmcm9tIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDQwMHB4KTsgb3BhY2l0eTogMDsgfVxuICAgICAgICB0byB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgwKTsgb3BhY2l0eTogMTsgfVxuICAgICAgfVxuICAgIGA7XG4gICAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChub3RpZmljYXRpb24pO1xuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBub3RpZmljYXRpb24uc3R5bGUudHJhbnNpdGlvbiA9ICdvcGFjaXR5IDAuM3MnO1xuICAgICAgbm90aWZpY2F0aW9uLnN0eWxlLm9wYWNpdHkgPSAnMCc7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IG5vdGlmaWNhdGlvbi5yZW1vdmUoKSwgMzAwKTtcbiAgICB9LCAzMDAwKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZURPTUFuYWx5emVyKCk6IHZvaWQge1xuICB3aW5kb3cuZG9tQW5hbHl6ZXIgPSBuZXcgRE9NQW5hbHl6ZXIoKTtcbiAgd2luZG93LmFuYWx5emVQYWdlID0gKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKHdpbmRvdy5kb21BbmFseXplciEuY2FwdHVyZVBhZ2VTdHJ1Y3R1cmUoKSk7XG4gIH07XG4gIHdpbmRvdy5jb3B5UGFnZVN0cnVjdHVyZSA9ICgpID0+IHtcbiAgICB3aW5kb3cuZG9tQW5hbHl6ZXIhLmNvcHlUb0NsaXBib2FyZCgpO1xuICB9O1xufVxuIiwiaW1wb3J0IHsgaW5pdGlhbGl6ZUtleWJvYXJkSGFuZGxlcnMsIHJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24gfSBmcm9tICcuLi8uLi9zcmMva2V5Ym9hcmQnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZUNoYXRQYWdlIH0gZnJvbSAnLi4vLi4vc3JjL2NoYXQnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSwgaW5pdGlhbGl6ZVNlYXJjaEF1dG9jb21wbGV0ZSB9IGZyb20gJy4uLy4uL3NyYy9hdXRvY29tcGxldGUnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZURlZXBEaXZlIH0gZnJvbSAnLi4vLi4vc3JjL2RlZXAtZGl2ZSc7XG5pbXBvcnQgeyBpbml0aWFsaXplRXhwb3J0IH0gZnJvbSAnLi4vLi4vc3JjL2V4cG9ydCc7XG5pbXBvcnQgeyBzaG93TWFwLCByZXNldE1hcE1vZGUgfSBmcm9tICcuLi8uLi9zcmMvbWFwJztcbmltcG9ydCB7IGluaXRpYWxpemVTZWFyY2hQYWdlLCBpc1NlYXJjaFBhZ2UgfSBmcm9tICcuLi8uLi9zcmMvc2VhcmNoJztcbmltcG9ydCB7IGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSB9IGZyb20gJy4uLy4uL3NyYy9oaXN0b3J5JztcbmltcG9ydCB7IGluaXRpYWxpemVET01BbmFseXplciB9IGZyb20gJy4uLy4uL3NyYy9kb20tYW5hbHl6ZXInO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb250ZW50U2NyaXB0KHtcbiAgbWF0Y2hlczogW1xuICAgICdodHRwczovL2dlbWluaS5nb29nbGUuY29tL2FwcConLFxuICAgICdodHRwczovL2dlbWluaS5nb29nbGUuY29tL3NlYXJjaConLFxuICBdLFxuICBydW5BdDogJ2RvY3VtZW50X2VuZCcsXG5cbiAgbWFpbigpIHtcbiAgICAvLyBFeHBvc2Ugd2luZG93IGdsb2JhbHMgdXNlZCBhY3Jvc3MgbW9kdWxlc1xuICAgIHdpbmRvdy5yZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uID0gcmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbjtcblxuICAgIGluaXRpYWxpemVET01BbmFseXplcigpO1xuICAgIGluaXRpYWxpemUoKTtcbiAgfSxcbn0pO1xuXG5mdW5jdGlvbiBhcHBseUN1c3RvbVN0eWxlcygpOiB2b2lkIHtcbiAgY29uc3Qgc3R5bGVJZCA9ICdnZW1pbmktaW1wcm92ZS11aS1jdXN0b20tc3R5bGVzJztcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3R5bGVJZCk/LnJlbW92ZSgpO1xuXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSBzdHlsZUlkO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAuZ2Vtcy1saXN0LWNvbnRhaW5lciB7XG4gICAgICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIC5zaWRlLW5hdi1lbnRyeS1jb250YWluZXIge1xuICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgIH1cbiAgICBjaGF0LXdpbmRvdyB7XG4gICAgICBtYXgtd2lkdGg6IHZhcigtLWNoYXQtbWF4LXdpZHRoLCA5MDBweCkgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tcmlnaHQ6IGF1dG8gIWltcG9ydGFudDtcbiAgICB9XG4gICAgLmNvbnZlcnNhdGlvbi1jb250YWluZXIge1xuICAgICAgbWF4LXdpZHRoOiB2YXIoLS1jaGF0LW1heC13aWR0aCwgOTAwcHgpICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tbGVmdDogMCAhaW1wb3J0YW50O1xuICAgICAgbWFyZ2luLXJpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlQ2hhdFdpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWNoYXQtbWF4LXdpZHRoJywgYCR7d2lkdGh9cHhgKTtcbn1cblxuZnVuY3Rpb24gbG9hZENoYXRXaWR0aCgpOiB2b2lkIHtcbiAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydjaGF0V2lkdGgnXSwgKHJlc3VsdCkgPT4ge1xuICAgIHVwZGF0ZUNoYXRXaWR0aChyZXN1bHQuY2hhdFdpZHRoIHx8IDkwMCk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBpbml0aWFsaXplKCk6IHZvaWQge1xuICBsb2FkQ2hhdFdpZHRoKCk7XG4gIGFwcGx5Q3VzdG9tU3R5bGVzKCk7XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvcHN0YXRlJywgKCkgPT4ge1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICB9KTtcblxuICBsZXQgbGFzdFVybCA9IGxvY2F0aW9uLmhyZWY7XG4gIG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICBjb25zdCBjdXJyZW50VXJsID0gbG9jYXRpb24uaHJlZjtcbiAgICBpZiAoY3VycmVudFVybCAhPT0gbGFzdFVybCkge1xuICAgICAgbGFzdFVybCA9IGN1cnJlbnRVcmw7XG5cbiAgICAgIHdpbmRvdy5yZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uPy4oLTEpO1xuICAgICAgcmVzZXRNYXBNb2RlKCk7XG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpbml0aWFsaXplQXV0b2NvbXBsZXRlKCk7XG4gICAgICAgIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUoKTtcbiAgICAgICAgaWYgKCFpc1NlYXJjaFBhZ2UoKSkge1xuICAgICAgICAgIHNob3dNYXAoKTtcbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2VtaW5pLWV4cG9ydC1ub3RlLWJ1dHRvbicpPy5yZW1vdmUoKTtcbiAgICAgICAgaW5pdGlhbGl6ZUV4cG9ydCgpO1xuICAgICAgfSwgMTUwMCk7XG4gICAgfVxuICB9KS5vYnNlcnZlKGRvY3VtZW50LCB7IHN1YnRyZWU6IHRydWUsIGNoaWxkTGlzdDogdHJ1ZSB9KTtcblxuICBpbml0aWFsaXplS2V5Ym9hcmRIYW5kbGVycygpO1xuXG4gIGlmIChpc1NlYXJjaFBhZ2UoKSkge1xuICAgIGluaXRpYWxpemVTZWFyY2hQYWdlKCk7XG4gICAgaW5pdGlhbGl6ZVNlYXJjaEF1dG9jb21wbGV0ZSgpO1xuICB9IGVsc2Uge1xuICAgIGluaXRpYWxpemVDaGF0UGFnZSgpO1xuICAgIGluaXRpYWxpemVEZWVwRGl2ZSgpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaW5pdGlhbGl6ZUV4cG9ydCgpO1xuICAgIH0sIDE1MDApO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2hvd01hcCgpO1xuICAgIH0sIDE1MDApO1xuICB9XG5cbiAgY2hyb21lLnN0b3JhZ2Uub25DaGFuZ2VkLmFkZExpc3RlbmVyKChjaGFuZ2VzLCBuYW1lc3BhY2UpID0+IHtcbiAgICBpZiAobmFtZXNwYWNlID09PSAnc3luYycgJiYgY2hhbmdlcy5jaGF0V2lkdGgpIHtcbiAgICAgIHVwZGF0ZUNoYXRXaWR0aChjaGFuZ2VzLmNoYXRXaWR0aC5uZXdWYWx1ZSk7XG4gICAgICBhcHBseUN1c3RvbVN0eWxlcygpO1xuICAgIH1cbiAgfSk7XG59XG4iLCIvLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvZ2dlci50c1xuZnVuY3Rpb24gcHJpbnQobWV0aG9kLCAuLi5hcmdzKSB7XG5cdGlmIChpbXBvcnQubWV0YS5lbnYuTU9ERSA9PT0gXCJwcm9kdWN0aW9uXCIpIHJldHVybjtcblx0aWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSBtZXRob2QoYFt3eHRdICR7YXJncy5zaGlmdCgpfWAsIC4uLmFyZ3MpO1xuXHRlbHNlIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xufVxuLyoqXG4qIFdyYXBwZXIgYXJvdW5kIGBjb25zb2xlYCB3aXRoIGEgXCJbd3h0XVwiIHByZWZpeFxuKi9cbmNvbnN0IGxvZ2dlciA9IHtcblx0ZGVidWc6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmRlYnVnLCAuLi5hcmdzKSxcblx0bG9nOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5sb2csIC4uLmFyZ3MpLFxuXHR3YXJuOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS53YXJuLCAuLi5hcmdzKSxcblx0ZXJyb3I6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmVycm9yLCAuLi5hcmdzKVxufTtcblxuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBsb2dnZXIgfTsiLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG5cbi8vI3JlZ2lvbiBzcmMvYnJvd3Nlci50c1xuLyoqXG4qIENvbnRhaW5zIHRoZSBgYnJvd3NlcmAgZXhwb3J0IHdoaWNoIHlvdSBzaG91bGQgdXNlIHRvIGFjY2VzcyB0aGUgZXh0ZW5zaW9uIEFQSXMgaW4geW91ciBwcm9qZWN0OlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBicm93c2VyIH0gZnJvbSAnd3h0L2Jyb3dzZXInO1xuKlxuKiBicm93c2VyLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuKiAgIC8vIC4uLlxuKiB9KVxuKiBgYGBcbiogQG1vZHVsZSB3eHQvYnJvd3NlclxuKi9cbmNvbnN0IGJyb3dzZXIgPSBicm93c2VyJDE7XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9OyIsImltcG9ydCB7IGJyb3dzZXIgfSBmcm9tIFwid3h0L2Jyb3dzZXJcIjtcblxuLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLnRzXG52YXIgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCA9IGNsYXNzIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG5cdHN0YXRpYyBFVkVOVF9OQU1FID0gZ2V0VW5pcXVlRXZlbnROYW1lKFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpO1xuXHRjb25zdHJ1Y3RvcihuZXdVcmwsIG9sZFVybCkge1xuXHRcdHN1cGVyKFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQuRVZFTlRfTkFNRSwge30pO1xuXHRcdHRoaXMubmV3VXJsID0gbmV3VXJsO1xuXHRcdHRoaXMub2xkVXJsID0gb2xkVXJsO1xuXHR9XG59O1xuLyoqXG4qIFJldHVybnMgYW4gZXZlbnQgbmFtZSB1bmlxdWUgdG8gdGhlIGV4dGVuc2lvbiBhbmQgY29udGVudCBzY3JpcHQgdGhhdCdzIHJ1bm5pbmcuXG4qL1xuZnVuY3Rpb24gZ2V0VW5pcXVlRXZlbnROYW1lKGV2ZW50TmFtZSkge1xuXHRyZXR1cm4gYCR7YnJvd3Nlcj8ucnVudGltZT8uaWR9OiR7aW1wb3J0Lm1ldGEuZW52LkVOVFJZUE9JTlR9OiR7ZXZlbnROYW1lfWA7XG59XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCwgZ2V0VW5pcXVlRXZlbnROYW1lIH07IiwiaW1wb3J0IHsgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gXCIuL2N1c3RvbS1ldmVudHMubWpzXCI7XG5cbi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci50c1xuY29uc3Qgc3VwcG9ydHNOYXZpZ2F0aW9uQXBpID0gdHlwZW9mIGdsb2JhbFRoaXMubmF2aWdhdGlvbj8uYWRkRXZlbnRMaXN0ZW5lciA9PT0gXCJmdW5jdGlvblwiO1xuLyoqXG4qIENyZWF0ZSBhIHV0aWwgdGhhdCB3YXRjaGVzIGZvciBVUkwgY2hhbmdlcywgZGlzcGF0Y2hpbmcgdGhlIGN1c3RvbSBldmVudCB3aGVuIGRldGVjdGVkLiBTdG9wc1xuKiB3YXRjaGluZyB3aGVuIGNvbnRlbnQgc2NyaXB0IGlzIGludmFsaWRhdGVkLiBVc2VzIE5hdmlnYXRpb24gQVBJIHdoZW4gYXZhaWxhYmxlLCBvdGhlcndpc2VcbiogZmFsbHMgYmFjayB0byBwb2xsaW5nLlxuKi9cbmZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcblx0bGV0IGxhc3RVcmw7XG5cdGxldCB3YXRjaGluZyA9IGZhbHNlO1xuXHRyZXR1cm4geyBydW4oKSB7XG5cdFx0aWYgKHdhdGNoaW5nKSByZXR1cm47XG5cdFx0d2F0Y2hpbmcgPSB0cnVlO1xuXHRcdGxhc3RVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuXHRcdGlmIChzdXBwb3J0c05hdmlnYXRpb25BcGkpIGdsb2JhbFRoaXMubmF2aWdhdGlvbi5hZGRFdmVudExpc3RlbmVyKFwibmF2aWdhdGVcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmwgPSBuZXcgVVJMKGV2ZW50LmRlc3RpbmF0aW9uLnVybCk7XG5cdFx0XHRpZiAobmV3VXJsLmhyZWYgPT09IGxhc3RVcmwuaHJlZikgcmV0dXJuO1xuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBsYXN0VXJsKSk7XG5cdFx0XHRsYXN0VXJsID0gbmV3VXJsO1xuXHRcdH0sIHsgc2lnbmFsOiBjdHguc2lnbmFsIH0pO1xuXHRcdGVsc2UgY3R4LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG5cdFx0XHRpZiAobmV3VXJsLmhyZWYgIT09IGxhc3RVcmwuaHJlZikge1xuXHRcdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIGxhc3RVcmwpKTtcblx0XHRcdFx0bGFzdFVybCA9IG5ld1VybDtcblx0XHRcdH1cblx0XHR9LCAxZTMpO1xuXHR9IH07XG59XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgY3JlYXRlTG9jYXRpb25XYXRjaGVyIH07IiwiaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSBcIi4vaW50ZXJuYWwvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHsgZ2V0VW5pcXVlRXZlbnROYW1lIH0gZnJvbSBcIi4vaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5pbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5cbi8vI3JlZ2lvbiBzcmMvdXRpbHMvY29udGVudC1zY3JpcHQtY29udGV4dC50c1xuLyoqXG4qIEltcGxlbWVudHMgW2BBYm9ydENvbnRyb2xsZXJgXShodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvQWJvcnRDb250cm9sbGVyKS5cbiogVXNlZCB0byBkZXRlY3QgYW5kIHN0b3AgY29udGVudCBzY3JpcHQgY29kZSB3aGVuIHRoZSBzY3JpcHQgaXMgaW52YWxpZGF0ZWQuXG4qXG4qIEl0IGFsc28gcHJvdmlkZXMgc2V2ZXJhbCB1dGlsaXRpZXMgbGlrZSBgY3R4LnNldFRpbWVvdXRgIGFuZCBgY3R4LnNldEludGVydmFsYCB0aGF0IHNob3VsZCBiZSB1c2VkIGluXG4qIGNvbnRlbnQgc2NyaXB0cyBpbnN0ZWFkIG9mIGB3aW5kb3cuc2V0VGltZW91dGAgb3IgYHdpbmRvdy5zZXRJbnRlcnZhbGAuXG4qXG4qIFRvIGNyZWF0ZSBjb250ZXh0IGZvciB0ZXN0aW5nLCB5b3UgY2FuIHVzZSB0aGUgY2xhc3MncyBjb25zdHJ1Y3RvcjpcbipcbiogYGBgdHNcbiogaW1wb3J0IHsgQ29udGVudFNjcmlwdENvbnRleHQgfSBmcm9tICd3eHQvdXRpbHMvY29udGVudC1zY3JpcHRzLWNvbnRleHQnO1xuKlxuKiB0ZXN0KFwic3RvcmFnZSBsaXN0ZW5lciBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIGNvbnRleHQgaXMgaW52YWxpZGF0ZWRcIiwgKCkgPT4ge1xuKiAgIGNvbnN0IGN0eCA9IG5ldyBDb250ZW50U2NyaXB0Q29udGV4dCgndGVzdCcpO1xuKiAgIGNvbnN0IGl0ZW0gPSBzdG9yYWdlLmRlZmluZUl0ZW0oXCJsb2NhbDpjb3VudFwiLCB7IGRlZmF1bHRWYWx1ZTogMCB9KTtcbiogICBjb25zdCB3YXRjaGVyID0gdmkuZm4oKTtcbipcbiogICBjb25zdCB1bndhdGNoID0gaXRlbS53YXRjaCh3YXRjaGVyKTtcbiogICBjdHgub25JbnZhbGlkYXRlZCh1bndhdGNoKTsgLy8gTGlzdGVuIGZvciBpbnZhbGlkYXRlIGhlcmVcbipcbiogICBhd2FpdCBpdGVtLnNldFZhbHVlKDEpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkVGltZXMoMSk7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRXaXRoKDEsIDApO1xuKlxuKiAgIGN0eC5ub3RpZnlJbnZhbGlkYXRlZCgpOyAvLyBVc2UgdGhpcyBmdW5jdGlvbiB0byBpbnZhbGlkYXRlIHRoZSBjb250ZXh0XG4qICAgYXdhaXQgaXRlbS5zZXRWYWx1ZSgyKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFRpbWVzKDEpO1xuKiB9KTtcbiogYGBgXG4qL1xudmFyIENvbnRlbnRTY3JpcHRDb250ZXh0ID0gY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuXHRzdGF0aWMgU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFID0gZ2V0VW5pcXVlRXZlbnROYW1lKFwid3h0OmNvbnRlbnQtc2NyaXB0LXN0YXJ0ZWRcIik7XG5cdGlkO1xuXHRhYm9ydENvbnRyb2xsZXI7XG5cdGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcblx0Y29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcblx0XHR0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLmlkID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMik7XG5cdFx0dGhpcy5hYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0dGhpcy5zdG9wT2xkU2NyaXB0cygpO1xuXHRcdHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG5cdH1cblx0Z2V0IHNpZ25hbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuXHR9XG5cdGFib3J0KHJlYXNvbikge1xuXHRcdHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuXHR9XG5cdGdldCBpc0ludmFsaWQoKSB7XG5cdFx0aWYgKGJyb3dzZXIucnVudGltZT8uaWQgPT0gbnVsbCkgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuXHRcdHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuXHR9XG5cdGdldCBpc1ZhbGlkKCkge1xuXHRcdHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG5cdH1cblx0LyoqXG5cdCogQWRkIGEgbGlzdGVuZXIgdGhhdCBpcyBjYWxsZWQgd2hlbiB0aGUgY29udGVudCBzY3JpcHQncyBjb250ZXh0IGlzIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQHJldHVybnMgQSBmdW5jdGlvbiB0byByZW1vdmUgdGhlIGxpc3RlbmVyLlxuXHQqXG5cdCogQGV4YW1wbGVcblx0KiBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKGNiKTtcblx0KiBjb25zdCByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyID0gY3R4Lm9uSW52YWxpZGF0ZWQoKCkgPT4ge1xuXHQqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5yZW1vdmVMaXN0ZW5lcihjYik7XG5cdCogfSlcblx0KiAvLyAuLi5cblx0KiByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG5cdCovXG5cdG9uSW52YWxpZGF0ZWQoY2IpIHtcblx0XHR0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuXHRcdHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuXHR9XG5cdC8qKlxuXHQqIFJldHVybiBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcy4gVXNlZnVsIGlmIHlvdSBoYXZlIGFuIGFzeW5jIGZ1bmN0aW9uIHRoYXQgc2hvdWxkbid0IHJ1blxuXHQqIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqIGNvbnN0IGdldFZhbHVlRnJvbVN0b3JhZ2UgPSBhc3luYyAoKSA9PiB7XG5cdCogICBpZiAoY3R4LmlzSW52YWxpZCkgcmV0dXJuIGN0eC5ibG9jaygpO1xuXHQqXG5cdCogICAvLyAuLi5cblx0KiB9XG5cdCovXG5cdGJsb2NrKCkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7fSk7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIEludGVydmFscyBjYW4gYmUgY2xlYXJlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNsZWFySW50ZXJ2YWxgIGZ1bmN0aW9uLlxuXHQqL1xuXHRzZXRJbnRlcnZhbChoYW5kbGVyLCB0aW1lb3V0KSB7XG5cdFx0Y29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRUaW1lb3V0YCB0aGF0IGF1dG9tYXRpY2FsbHkgY2xlYXJzIHRoZSBpbnRlcnZhbCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogVGltZW91dHMgY2FuIGJlIGNsZWFyZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBzZXRUaW1lb3V0YCBmdW5jdGlvbi5cblx0Ki9cblx0c2V0VGltZW91dChoYW5kbGVyLCB0aW1lb3V0KSB7XG5cdFx0Y29uc3QgaWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcblx0XHR9LCB0aW1lb3V0KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJUaW1lb3V0KGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lYCB0aGF0IGF1dG9tYXRpY2FsbHkgY2FuY2VscyB0aGUgcmVxdWVzdCB3aGVuXG5cdCogaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBDYWxsYmFja3MgY2FuIGJlIGNhbmNlbGVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2FuY2VsQW5pbWF0aW9uRnJhbWVgIGZ1bmN0aW9uLlxuXHQqL1xuXHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2FsbGJhY2spIHtcblx0XHRjb25zdCBpZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgY2FsbGJhY2soLi4uYXJncyk7XG5cdFx0fSk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbEFuaW1hdGlvbkZyYW1lKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuXHQqIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbElkbGVDYWxsYmFja2AgZnVuY3Rpb24uXG5cdCovXG5cdHJlcXVlc3RJZGxlQ2FsbGJhY2soY2FsbGJhY2ssIG9wdGlvbnMpIHtcblx0XHRjb25zdCBpZCA9IHJlcXVlc3RJZGxlQ2FsbGJhY2soKC4uLmFyZ3MpID0+IHtcblx0XHRcdGlmICghdGhpcy5zaWduYWwuYWJvcnRlZCkgY2FsbGJhY2soLi4uYXJncyk7XG5cdFx0fSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbElkbGVDYWxsYmFjayhpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHRhZGRFdmVudExpc3RlbmVyKHRhcmdldCwgdHlwZSwgaGFuZGxlciwgb3B0aW9ucykge1xuXHRcdGlmICh0eXBlID09PSBcInd4dDpsb2NhdGlvbmNoYW5nZVwiKSB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSB0aGlzLmxvY2F0aW9uV2F0Y2hlci5ydW4oKTtcblx0XHR9XG5cdFx0dGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXI/Lih0eXBlLnN0YXJ0c1dpdGgoXCJ3eHQ6XCIpID8gZ2V0VW5pcXVlRXZlbnROYW1lKHR5cGUpIDogdHlwZSwgaGFuZGxlciwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHNpZ25hbDogdGhpcy5zaWduYWxcblx0XHR9KTtcblx0fVxuXHQvKipcblx0KiBAaW50ZXJuYWxcblx0KiBBYm9ydCB0aGUgYWJvcnQgY29udHJvbGxlciBhbmQgZXhlY3V0ZSBhbGwgYG9uSW52YWxpZGF0ZWRgIGxpc3RlbmVycy5cblx0Ki9cblx0bm90aWZ5SW52YWxpZGF0ZWQoKSB7XG5cdFx0dGhpcy5hYm9ydChcIkNvbnRlbnQgc2NyaXB0IGNvbnRleHQgaW52YWxpZGF0ZWRcIik7XG5cdFx0bG9nZ2VyLmRlYnVnKGBDb250ZW50IHNjcmlwdCBcIiR7dGhpcy5jb250ZW50U2NyaXB0TmFtZX1cIiBjb250ZXh0IGludmFsaWRhdGVkYCk7XG5cdH1cblx0c3RvcE9sZFNjcmlwdHMoKSB7XG5cdFx0ZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLCB7IGRldGFpbDoge1xuXHRcdFx0Y29udGVudFNjcmlwdE5hbWU6IHRoaXMuY29udGVudFNjcmlwdE5hbWUsXG5cdFx0XHRtZXNzYWdlSWQ6IHRoaXMuaWRcblx0XHR9IH0pKTtcblx0XHR3aW5kb3cucG9zdE1lc3NhZ2Uoe1xuXHRcdFx0dHlwZTogQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLFxuXHRcdFx0Y29udGVudFNjcmlwdE5hbWU6IHRoaXMuY29udGVudFNjcmlwdE5hbWUsXG5cdFx0XHRtZXNzYWdlSWQ6IHRoaXMuaWRcblx0XHR9LCBcIipcIik7XG5cdH1cblx0dmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSB7XG5cdFx0Y29uc3QgaXNTYW1lQ29udGVudFNjcmlwdCA9IGV2ZW50LmRldGFpbD8uY29udGVudFNjcmlwdE5hbWUgPT09IHRoaXMuY29udGVudFNjcmlwdE5hbWU7XG5cdFx0Y29uc3QgaXNGcm9tU2VsZiA9IGV2ZW50LmRldGFpbD8ubWVzc2FnZUlkID09PSB0aGlzLmlkO1xuXHRcdHJldHVybiBpc1NhbWVDb250ZW50U2NyaXB0ICYmICFpc0Zyb21TZWxmO1xuXHR9XG5cdGxpc3RlbkZvck5ld2VyU2NyaXB0cygpIHtcblx0XHRjb25zdCBjYiA9IChldmVudCkgPT4ge1xuXHRcdFx0aWYgKCEoZXZlbnQgaW5zdGFuY2VvZiBDdXN0b21FdmVudCkgfHwgIXRoaXMudmVyaWZ5U2NyaXB0U3RhcnRlZEV2ZW50KGV2ZW50KSkgcmV0dXJuO1xuXHRcdFx0dGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuXHRcdH07XG5cdFx0ZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsIGNiKTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcihDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsIGNiKSk7XG5cdH1cbn07XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgQ29udGVudFNjcmlwdENvbnRleHQgfTsiXSwibmFtZXMiOlsiZGVmaW5pdGlvbiIsInJlc3VsdCIsImNvbnRlbnQiLCJwcmludCIsImxvZ2dlciIsImJyb3dzZXIiLCJXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IiwiQ29udGVudFNjcmlwdENvbnRleHQi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QUFPLFFBQVMsVUFBUyxHQUFHLElBQUk7QUFBQSxNQUMzQyxHQUFHLE9BQU87QUFDVixXQUFLLGNBQWMsTUFBTSxtQkFBbUIsRUFBRSxDQUFDO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBQUEsSUFDQSxpQkFBaUIsUUFBUSxNQUFNLFNBQVMsU0FBUztBQUNoRCxVQUFJLFNBQVMsc0JBQXNCO0FBQ2xDLFlBQUksS0FBSyxRQUFTLE1BQUssZ0JBQWdCLElBQUc7QUFBQSxNQUMzQztBQUNBLGFBQU8sbUJBQW1CLEtBQUssV0FBVyxNQUFNLElBQUksbUJBQW1CLElBQUksSUFBSSxNQUFNLFNBQVM7QUFBQSxRQUM3RixHQUFHO0FBQUEsUUFDSCxRQUFRLEtBQUs7QUFBQSxNQUNoQixDQUFHO0FBQUEsSUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLQSxvQkFBb0I7QUFDbkIsV0FBSyxNQUFNLG9DQUFvQztBQUMvQ0gsZUFBTyxNQUFNLG1CQUFtQixLQUFLLGlCQUFpQix1QkFBdUI7QUFBQSxJQUM5RTtBQUFBLElBQ0EsaUJBQWlCO0FBQ2hCLGVBQVMsY0FBYyxJQUFJLFlBQVlHLHNCQUFxQiw2QkFBNkIsRUFBRSxRQUFRO0FBQUEsUUFDbEcsbUJBQW1CLEtBQUs7QUFBQSxRQUN4QixXQUFXLEtBQUs7QUFBQSxNQUNuQixFQUFHLENBQUUsQ0FBQztBQUNKLGFBQU8sWUFBWTtBQUFBLFFBQ2xCLE1BQU1BLHNCQUFxQjtBQUFBLFFBQzNCLG1CQUFtQixLQUFLO0FBQUEsUUFDeEIsV0FBVyxLQUFLO0FBQUEsTUFDbkIsR0FBSyxHQUFHO0FBQUEsSUFDUDtBQUFBLElBQ0EseUJBQXlCLE9BQU87QUFDL0IsWUFBTSxzQkFBc0IsTUFBTSxRQUFRLHNCQUFzQixLQUFLO0FBQ3JFLFlBQU0sYUFBYSxNQUFNLFFBQVEsY0FBYyxLQUFLO0FBQ3BELGFBQU8sdUJBQXVCLENBQUM7QUFBQSxJQUNoQztBQUFBLElBQ0Esd0JBQXdCO0FBQ3ZCLFlBQU0sS0FBSyxDQUFDLFVBQVU7QUFDckIsWUFBSSxFQUFFLGlCQUFpQixnQkFBZ0IsQ0FBQyxLQUFLLHlCQUF5QixLQUFLLEVBQUc7QUFDOUUsYUFBSyxrQkFBaUI7QUFBQSxNQUN2QjtBQUNBLGVBQVMsaUJBQWlCQSxzQkFBcUIsNkJBQTZCLEVBQUU7QUFDOUUsV0FBSyxjQUFjLE1BQU0sU0FBUyxvQkFBb0JBLHNCQUFxQiw2QkFBNkIsRUFBRSxDQUFDO0FBQUEsSUFDNUc7QUFBQSxFQUNEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OyIsInhfZ29vZ2xlX2lnbm9yZUxpc3QiOlswLDEyLDEzLDE0LDE1LDE2LDE3XX0=
content;