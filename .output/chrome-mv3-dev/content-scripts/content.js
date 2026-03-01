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
    const turns = [];
    const len = Math.min(userQueries.length, modelResponses.length);
    for (let i = 0; i < len; i++) {
      const userText = Array.from(
        userQueries[i].querySelectorAll(".query-text-line")
      ).map((el) => el.innerText.trim()).filter(Boolean).join("\n");
      const rawModelText = modelResponses[i].querySelector(
        "message-content .markdown"
      )?.innerText?.trim();
      const modelText = rawModelText ? cleanModelText(rawModelText) : "";
      if (userText || modelText) {
        turns.push({ user: userText || "", model: modelText || "" });
      }
    }
    return turns;
  }
  function getChatId() {
    return location.pathname.split("/").pop() || "unknown";
  }
  function generateMarkdown(turns) {
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${dateStr}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const id = timeStr.replace(/[-:T]/g, "");
    const conversationTitle = document.querySelector(
      '[data-test-id="conversation-title"]'
    )?.innerText?.trim();
    const firstUserLines = (turns[0]?.user || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const fallbackTitle = firstUserLines.find((l) => !/^https?:\/\//i.test(l)) || firstUserLines[0] || "Gemini chat";
    const title = (conversationTitle || fallbackTitle).slice(0, 60);
    const chatId = getChatId();
    const frontmatter = [
      "---",
      `id: ${chatId}`,
      `title: "Gemini: ${title}"`,
      `date: ${timeStr}`,
      `source: ${location.href}`,
      "tags: [gemini, fleeting]",
      "---"
    ].join("\n");
    const sections = [frontmatter];
    for (const turn of turns) {
      sections.push("");
      sections.push(`**Q:** ${turn.user}`);
      sections.push("");
      sections.push(`**A:** ${turn.model}`);
      sections.push("");
      sections.push("---");
    }
    return { markdown: sections.join("\n"), id, title };
  }
  async function saveNote(forcePickDir = false) {
    await loadAllMessages();
    const turns = extractChatContent();
    if (turns.length === 0) {
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
    const { markdown, title } = generateMarkdown(turns);
    const chatId = getChatId();
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-").slice(0, 40);
    const filename = `gemini-${safeTitle}-${chatId}.md`;
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
          if (heading.querySelector(".deep-dive-button-inline")) return;
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
          if (wrapper && !wrapper.querySelector(".deep-dive-button-inline")) {
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
          if (wrapper && !wrapper.querySelector(".deep-dive-button-inline")) {
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
          if (!blockquote.querySelector(".deep-dive-button-inline")) {
            targets.push({
              type: "blockquote",
              element: blockquote,
              getContent: () => blockquote.textContent?.trim() ?? ""
            });
          }
        });
        const lists = responseContainer.querySelectorAll(
          "ol[data-path-to-node], ul[data-path-to-node]"
        );
        lists.forEach((list) => {
          if (list.querySelector(".deep-dive-button-inline")) return;
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
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
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
      if (e.altKey && e.key === "ArrowRight") {
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
      if (e.key === "Escape" || e.altKey && e.key === "ArrowLeft") {
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
        } catch (e) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC5tanMiLCIuLi8uLi8uLi9zcmMvc2V0dGluZ3MudHMiLCIuLi8uLi8uLi9zcmMvYXV0b2NvbXBsZXRlLnRzIiwiLi4vLi4vLi4vc3JjL2NoYXQudHMiLCIuLi8uLi8uLi9zcmMvaGlzdG9yeS50cyIsIi4uLy4uLy4uL3NyYy9zZWFyY2gudHMiLCIuLi8uLi8uLi9zcmMvZXhwb3J0LnRzIiwiLi4vLi4vLi4vc3JjL2tleWJvYXJkLnRzIiwiLi4vLi4vLi4vc3JjL2RlZXAtZGl2ZS50cyIsIi4uLy4uLy4uL3NyYy9tYXAudHMiLCIuLi8uLi8uLi9zcmMvZG9tLWFuYWx5emVyLnRzIiwiLi4vLi4vLi4vZW50cnlwb2ludHMvY29udGVudC9pbmRleC50cyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2dnZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL0B3eHQtZGV2L2Jyb3dzZXIvc3JjL2luZGV4Lm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC9icm93c2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9jdXN0b20tZXZlbnRzLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9jb250ZW50LXNjcmlwdC1jb250ZXh0Lm1qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyNyZWdpb24gc3JjL3V0aWxzL2RlZmluZS1jb250ZW50LXNjcmlwdC50c1xuZnVuY3Rpb24gZGVmaW5lQ29udGVudFNjcmlwdChkZWZpbml0aW9uKSB7XG5cdHJldHVybiBkZWZpbml0aW9uO1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUNvbnRlbnRTY3JpcHQgfTsiLCIvLyBTZXR0aW5ncyBtYW5hZ2VtZW50XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQgPSAn44GT44KM44Gr44Gk44GE44Gm6Kmz44GX44GPJztcblxubGV0IGRlZXBEaXZlUHJvbXB0ID0gREVGQVVMVF9ERUVQX0RJVkVfUFJPTVBUO1xuXG5leHBvcnQgZnVuY3Rpb24gbG9hZERlZXBEaXZlUHJvbXB0KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsnZGVlcERpdmVQcm9tcHQnXSwgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5kZWVwRGl2ZVByb21wdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRlZXBEaXZlUHJvbXB0ID0gcmVzdWx0LmRlZXBEaXZlUHJvbXB0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZGVlcERpdmVQcm9tcHQgPSBERUZBVUxUX0RFRVBfRElWRV9QUk9NUFQ7XG4gICAgICB9XG4gICAgICByZXNvbHZlKGRlZXBEaXZlUHJvbXB0KTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWVwRGl2ZVByb21wdCgpOiBzdHJpbmcge1xuICByZXR1cm4gZGVlcERpdmVQcm9tcHQgfHwgREVGQVVMVF9ERUVQX0RJVkVfUFJPTVBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNob3J0Y3V0cyB7XG4gIGNoYXQ6IHtcbiAgICBuYXZpZ2F0ZVRvU2VhcmNoOiBzdHJpbmc7XG4gICAgdG9nZ2xlU2lkZWJhcjogc3RyaW5nO1xuICAgIHRvZ2dsZUhpc3RvcnlNb2RlOiBzdHJpbmc7XG4gICAgc2Nyb2xsVXA6IHN0cmluZztcbiAgICBzY3JvbGxEb3duOiBzdHJpbmc7XG4gICAgaGlzdG9yeVVwOiBzdHJpbmc7XG4gICAgaGlzdG9yeURvd246IHN0cmluZztcbiAgICBoaXN0b3J5T3Blbjogc3RyaW5nO1xuICAgIGhpc3RvcnlFeGl0OiBzdHJpbmc7XG4gIH07XG4gIHNlYXJjaDoge1xuICAgIG1vdmVVcDogc3RyaW5nO1xuICAgIG1vdmVEb3duOiBzdHJpbmc7XG4gICAgb3BlblJlc3VsdDogc3RyaW5nO1xuICAgIHNjcm9sbFVwOiBzdHJpbmc7XG4gICAgc2Nyb2xsRG93bjogc3RyaW5nO1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TSE9SVENVVFM6IFNob3J0Y3V0cyA9IHtcbiAgY2hhdDoge1xuICAgIG5hdmlnYXRlVG9TZWFyY2g6ICdJbnNlcnQnLFxuICAgIHRvZ2dsZVNpZGViYXI6ICdEZWxldGUnLFxuICAgIHRvZ2dsZUhpc3RvcnlNb2RlOiAnRW5kJyxcbiAgICBzY3JvbGxVcDogJ1BhZ2VVcCcsXG4gICAgc2Nyb2xsRG93bjogJ1BhZ2VEb3duJyxcbiAgICBoaXN0b3J5VXA6ICdBcnJvd1VwJyxcbiAgICBoaXN0b3J5RG93bjogJ0Fycm93RG93bicsXG4gICAgaGlzdG9yeU9wZW46ICdFbnRlcicsXG4gICAgaGlzdG9yeUV4aXQ6ICdFc2NhcGUnLFxuICB9LFxuICBzZWFyY2g6IHtcbiAgICBtb3ZlVXA6ICdBcnJvd1VwJyxcbiAgICBtb3ZlRG93bjogJ0Fycm93RG93bicsXG4gICAgb3BlblJlc3VsdDogJ0VudGVyJyxcbiAgICBzY3JvbGxVcDogJ1BhZ2VVcCcsXG4gICAgc2Nyb2xsRG93bjogJ1BhZ2VEb3duJyxcbiAgfSxcbn07XG5cbmxldCBjdXJyZW50U2hvcnRjdXRzOiBTaG9ydGN1dHMgfCBudWxsID0gbnVsbDtcblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRTaG9ydGN1dHMoKTogUHJvbWlzZTxTaG9ydGN1dHM+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoWydzaG9ydGN1dHMnXSwgKHJlc3VsdCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5zaG9ydGN1dHMpIHtcbiAgICAgICAgY3VycmVudFNob3J0Y3V0cyA9IHJlc3VsdC5zaG9ydGN1dHM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjdXJyZW50U2hvcnRjdXRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShERUZBVUxUX1NIT1JUQ1VUUykpO1xuICAgICAgfVxuICAgICAgcmVzb2x2ZShjdXJyZW50U2hvcnRjdXRzISk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVNob3J0Y3V0cyhzaG9ydGN1dHM6IFNob3J0Y3V0cyk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IHNob3J0Y3V0cyB9LCAoKSA9PiB7XG4gICAgICBjdXJyZW50U2hvcnRjdXRzID0gc2hvcnRjdXRzO1xuICAgICAgcmVzb2x2ZSgpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNob3J0Y3V0cygpOiBTaG9ydGN1dHMge1xuICByZXR1cm4gY3VycmVudFNob3J0Y3V0cyB8fCBERUZBVUxUX1NIT1JUQ1VUUztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0U2hvcnRjdXRzKCk6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gc2F2ZVNob3J0Y3V0cyhKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KERFRkFVTFRfU0hPUlRDVVRTKSkpO1xufVxuXG50eXBlIFNob3J0Y3V0S2V5ID0gc3RyaW5nO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTaG9ydGN1dChldmVudDogS2V5Ym9hcmRFdmVudCwgc2hvcnRjdXRLZXk6IFNob3J0Y3V0S2V5KTogYm9vbGVhbiB7XG4gIGNvbnN0IHNob3J0Y3V0cyA9IGdldFNob3J0Y3V0cygpO1xuICBjb25zdCBrZXlzID0gc2hvcnRjdXRLZXkuc3BsaXQoJy4nKTtcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgbGV0IHNob3J0Y3V0OiBhbnkgPSBzaG9ydGN1dHM7XG4gIGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcbiAgICBzaG9ydGN1dCA9IHNob3J0Y3V0W2tleV07XG4gICAgaWYgKCFzaG9ydGN1dCkgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBzaG9ydGN1dCA9PT0gJ29iamVjdCcpIHtcbiAgICBjb25zdCBtZXRhTWF0Y2ggPSBzaG9ydGN1dC5tZXRhID8gZXZlbnQubWV0YUtleSA6ICFldmVudC5tZXRhS2V5O1xuICAgIGNvbnN0IGN0cmxNYXRjaCA9IHNob3J0Y3V0LmN0cmwgPyBldmVudC5jdHJsS2V5IDogIWV2ZW50LmN0cmxLZXk7XG4gICAgY29uc3Qgc2hpZnRNYXRjaCA9IHNob3J0Y3V0LnNoaWZ0ID8gZXZlbnQuc2hpZnRLZXkgOiAhZXZlbnQuc2hpZnRLZXk7XG4gICAgcmV0dXJuIChcbiAgICAgIGV2ZW50LmNvZGUgPT09IHNob3J0Y3V0LmtleSAmJiBtZXRhTWF0Y2ggJiYgY3RybE1hdGNoICYmIHNoaWZ0TWF0Y2hcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICBldmVudC5jb2RlID09PSBzaG9ydGN1dCAmJlxuICAgICFldmVudC5jdHJsS2V5ICYmXG4gICAgIWV2ZW50Lm1ldGFLZXkgJiZcbiAgICAhZXZlbnQuc2hpZnRLZXlcbiAgKTtcbn1cbiIsIi8vIEF1dG9jb21wbGV0ZSBmdW5jdGlvbmFsaXR5IGZvciBHZW1pbmkgY2hhdCB0ZXh0YXJlYVxuXG5jb25zdCBSRVRSWV9ERUxBWSA9IDUwMDtcbmNvbnN0IERFQk9VTkNFX0RFTEFZID0gMzAwO1xuY29uc3QgRFJPUERPV05fTUFSR0lOID0gMTA7XG5jb25zdCBJVEVNX0hFSUdIVCA9IDQwO1xuY29uc3QgTUlOX0RST1BET1dOX0hFSUdIVCA9IDEwMDtcblxubGV0IGF1dG9jb21wbGV0ZUxpc3Q6IEhUTUxEaXZFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgc2VsZWN0ZWRJbmRleCA9IC0xO1xubGV0IGN1cnJlbnRTdWdnZXN0aW9uczogc3RyaW5nW10gPSBbXTtcbmxldCBhdXRvY29tcGxldGVUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRvY29tcGxldGVWaXNpYmxlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIGF1dG9jb21wbGV0ZUxpc3QgIT09IG51bGwgJiZcbiAgICBhdXRvY29tcGxldGVMaXN0LnN0eWxlLmRpc3BsYXkgPT09ICdibG9jaycgJiZcbiAgICBjdXJyZW50U3VnZ2VzdGlvbnMubGVuZ3RoID4gMFxuICApO1xufVxuXG5mdW5jdGlvbiBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlOiBFdmVudCk6IHZvaWQge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gIGUuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG59XG5cbmZ1bmN0aW9uIG1vdmVTZWxlY3Rpb24oZGlyZWN0aW9uOiAnbmV4dCcgfCAncHJldicpOiB2b2lkIHtcbiAgaWYgKGRpcmVjdGlvbiA9PT0gJ25leHQnKSB7XG4gICAgc2VsZWN0ZWRJbmRleCA9XG4gICAgICBzZWxlY3RlZEluZGV4IDwgMCA/IDAgOiAoc2VsZWN0ZWRJbmRleCArIDEpICUgY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBzZWxlY3RlZEluZGV4ID1cbiAgICAgIHNlbGVjdGVkSW5kZXggPCAwXG4gICAgICAgID8gY3VycmVudFN1Z2dlc3Rpb25zLmxlbmd0aCAtIDFcbiAgICAgICAgOiBzZWxlY3RlZEluZGV4IDw9IDBcbiAgICAgICAgICA/IGN1cnJlbnRTdWdnZXN0aW9ucy5sZW5ndGggLSAxXG4gICAgICAgICAgOiBzZWxlY3RlZEluZGV4IC0gMTtcbiAgfVxuICB1cGRhdGVTZWxlY3RlZEl0ZW0oKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hHb29nbGVTdWdnZXN0aW9ucyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBpZiAoIXF1ZXJ5IHx8IHF1ZXJ5LnRyaW0oKS5sZW5ndGggPT09IDApIHJldHVybiBbXTtcbiAgdHJ5IHtcbiAgICBjb25zdCBlbmNvZGVkUXVlcnkgPSBlbmNvZGVVUklDb21wb25lbnQocXVlcnkudHJpbSgpKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFxuICAgICAgYGh0dHBzOi8vd3d3Lmdvb2dsZS5jby5qcC9jb21wbGV0ZS9zZWFyY2g/b3V0cHV0PWZpcmVmb3gmaGw9amEmaWU9dXRmLTgmb2U9dXRmLTgmcT0ke2VuY29kZWRRdWVyeX1gXG4gICAgKTtcbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHJldHVybiBkYXRhWzFdIHx8IFtdO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gW107XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b2NvbXBsZXRlRHJvcGRvd24oKTogSFRNTERpdkVsZW1lbnQge1xuICBpZiAoYXV0b2NvbXBsZXRlTGlzdCkgcmV0dXJuIGF1dG9jb21wbGV0ZUxpc3Q7XG5cbiAgY29uc3QgbGlzdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBsaXN0LmNsYXNzTmFtZSA9ICdnZW1pbmktYXV0b2NvbXBsZXRlLWxpc3QnO1xuICBsaXN0LnN0eWxlLmNzc1RleHQgPSBgXG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGJhY2tncm91bmQ6IHdoaXRlO1xuICAgIGJvcmRlcjogMXB4IHNvbGlkICNkZGQ7XG4gICAgYm9yZGVyLXJhZGl1czogOHB4O1xuICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcbiAgICBvdmVyZmxvdy15OiBhdXRvO1xuICAgIHotaW5kZXg6IDEwMDAwO1xuICAgIGRpc3BsYXk6IG5vbmU7XG4gICAgbWluLXdpZHRoOiAzMDBweDtcbiAgYDtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChsaXN0KTtcbiAgYXV0b2NvbXBsZXRlTGlzdCA9IGxpc3Q7XG4gIHJldHVybiBsaXN0O1xufVxuXG5mdW5jdGlvbiBwb3NpdGlvbkRyb3Bkb3duKFxuICBpbnB1dEVsZW1lbnQ6IEVsZW1lbnQsXG4gIGxpc3Q6IEhUTUxEaXZFbGVtZW50LFxuICBzdWdnZXN0aW9uczogc3RyaW5nW11cbik6IHZvaWQge1xuICBjb25zdCByZWN0ID0gaW5wdXRFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBsaXN0LnN0eWxlLmxlZnQgPSBgJHtyZWN0LmxlZnR9cHhgO1xuICBsaXN0LnN0eWxlLndpZHRoID0gYCR7cmVjdC53aWR0aH1weGA7XG4gIGxpc3Quc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgY29uc3Qgc3BhY2VCZWxvdyA9IHdpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QuYm90dG9tIC0gRFJPUERPV05fTUFSR0lOO1xuICBjb25zdCBzcGFjZUFib3ZlID0gcmVjdC50b3AgLSBEUk9QRE9XTl9NQVJHSU47XG4gIGNvbnN0IG1heEl0ZW1zQmVsb3cgPSBNYXRoLmZsb29yKHNwYWNlQmVsb3cgLyBJVEVNX0hFSUdIVCk7XG4gIGNvbnN0IG1heEl0ZW1zQWJvdmUgPSBNYXRoLmZsb29yKHNwYWNlQWJvdmUgLyBJVEVNX0hFSUdIVCk7XG5cbiAgaWYgKG1heEl0ZW1zQmVsb3cgPCBzdWdnZXN0aW9ucy5sZW5ndGggJiYgbWF4SXRlbXNBYm92ZSA+IG1heEl0ZW1zQmVsb3cpIHtcbiAgICBsaXN0LnN0eWxlLmJvdHRvbSA9IGAke3dpbmRvdy5pbm5lckhlaWdodCAtIHJlY3QudG9wfXB4YDtcbiAgICBsaXN0LnN0eWxlLnRvcCA9ICdhdXRvJztcbiAgICBsaXN0LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KHNwYWNlQWJvdmUsIE1JTl9EUk9QRE9XTl9IRUlHSFQpfXB4YDtcbiAgfSBlbHNlIHtcbiAgICBsaXN0LnN0eWxlLnRvcCA9IGAke3JlY3QuYm90dG9tfXB4YDtcbiAgICBsaXN0LnN0eWxlLmJvdHRvbSA9ICdhdXRvJztcbiAgICBsaXN0LnN0eWxlLm1heEhlaWdodCA9IGAke01hdGgubWF4KHNwYWNlQmVsb3csIE1JTl9EUk9QRE9XTl9IRUlHSFQpfXB4YDtcbiAgfVxufVxuXG5mdW5jdGlvbiBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoXG4gIGlucHV0RWxlbWVudDogSFRNTEVsZW1lbnQsXG4gIHN1Z2dlc3Rpb25zOiBzdHJpbmdbXVxuKTogdm9pZCB7XG4gIGlmICghc3VnZ2VzdGlvbnMgfHwgc3VnZ2VzdGlvbnMubGVuZ3RoID09PSAwKSB7XG4gICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbGlzdCA9IGNyZWF0ZUF1dG9jb21wbGV0ZURyb3Bkb3duKCk7XG4gIGxpc3QuaW5uZXJIVE1MID0gJyc7XG4gIGN1cnJlbnRTdWdnZXN0aW9ucyA9IHN1Z2dlc3Rpb25zO1xuICBzZWxlY3RlZEluZGV4ID0gLTE7XG5cbiAgc3VnZ2VzdGlvbnMuZm9yRWFjaCgoc3VnZ2VzdGlvbiwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBpdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaXRlbS5jbGFzc05hbWUgPSAnZ2VtaW5pLWF1dG9jb21wbGV0ZS1pdGVtJztcbiAgICBpdGVtLnRleHRDb250ZW50ID0gc3VnZ2VzdGlvbjtcbiAgICBpdGVtLnN0eWxlLmNzc1RleHQgPSBgXG4gICAgICBwYWRkaW5nOiAxMHB4IDE2cHg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgICBib3JkZXItYm90dG9tOiAxcHggc29saWQgI2YwZjBmMDtcbiAgICBgO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICAgIHNlbGVjdGVkSW5kZXggPSBpbmRleDtcbiAgICAgIHVwZGF0ZVNlbGVjdGVkSXRlbSgpO1xuICAgIH0pO1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBzZWxlY3RTdWdnZXN0aW9uKGlucHV0RWxlbWVudCwgc3VnZ2VzdGlvbik7XG4gICAgfSk7XG4gICAgbGlzdC5hcHBlbmRDaGlsZChpdGVtKTtcbiAgfSk7XG5cbiAgcG9zaXRpb25Ecm9wZG93bihpbnB1dEVsZW1lbnQsIGxpc3QsIHN1Z2dlc3Rpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpOiB2b2lkIHtcbiAgaWYgKGF1dG9jb21wbGV0ZUxpc3QpIHtcbiAgICBhdXRvY29tcGxldGVMaXN0LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gIH1cbiAgY3VycmVudFN1Z2dlc3Rpb25zID0gW107XG4gIHNlbGVjdGVkSW5kZXggPSAtMTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlU2VsZWN0ZWRJdGVtKCk6IHZvaWQge1xuICBpZiAoIWF1dG9jb21wbGV0ZUxpc3QpIHJldHVybjtcbiAgY29uc3QgaXRlbXMgPSBhdXRvY29tcGxldGVMaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5nZW1pbmktYXV0b2NvbXBsZXRlLWl0ZW0nKTtcbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAoaXRlbSBhcyBIVE1MRWxlbWVudCkuc3R5bGUuYmFja2dyb3VuZENvbG9yID1cbiAgICAgIGluZGV4ID09PSBzZWxlY3RlZEluZGV4ID8gJyNlOGYwZmUnIDogJ3RyYW5zcGFyZW50JztcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHNlbGVjdFN1Z2dlc3Rpb24oaW5wdXRFbGVtZW50OiBIVE1MRWxlbWVudCwgc3VnZ2VzdGlvbjogc3RyaW5nKTogdm9pZCB7XG4gIGlmICgoaW5wdXRFbGVtZW50IGFzIEhUTUxFbGVtZW50ICYgeyBjb250ZW50RWRpdGFibGU6IHN0cmluZyB9KS5jb250ZW50RWRpdGFibGUgPT09ICd0cnVlJykge1xuICAgIHdoaWxlIChpbnB1dEVsZW1lbnQuZmlyc3RDaGlsZCkge1xuICAgICAgaW5wdXRFbGVtZW50LnJlbW92ZUNoaWxkKGlucHV0RWxlbWVudC5maXJzdENoaWxkKTtcbiAgICB9XG4gICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICBwLnRleHRDb250ZW50ID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dEVsZW1lbnQuYXBwZW5kQ2hpbGQocCk7XG4gICAgaW5wdXRFbGVtZW50LmZvY3VzKCk7XG4gICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHMoaW5wdXRFbGVtZW50KTtcbiAgICByYW5nZS5jb2xsYXBzZShmYWxzZSk7XG4gICAgc2VsPy5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcbiAgICBpbnB1dEVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcbiAgfSBlbHNlIHtcbiAgICAoaW5wdXRFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gc3VnZ2VzdGlvbjtcbiAgICBpbnB1dEVsZW1lbnQuZm9jdXMoKTtcbiAgICAoaW5wdXRFbGVtZW50IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgc3VnZ2VzdGlvbi5sZW5ndGgsXG4gICAgICBzdWdnZXN0aW9uLmxlbmd0aFxuICAgICk7XG4gICAgaW5wdXRFbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gIH1cbiAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplQXV0b2NvbXBsZXRlKCk6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgKTtcbiAgaWYgKCF0ZXh0YXJlYSkge1xuICAgIHNldFRpbWVvdXQoaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSwgUkVUUllfREVMQVkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRleHRhcmVhLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgJ2tleWRvd24nLFxuICAgIGFzeW5jIChlKSA9PiB7XG4gICAgICBpZiAoIWUuaXNUcnVzdGVkIHx8IGUuaXNDb21wb3NpbmcpIHJldHVybjtcblxuICAgICAgaWYgKGUubWV0YUtleSAmJiBlLmNvZGUgPT09ICdTcGFjZScpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIGNvbnN0IHRleHQgPSB0ZXh0YXJlYS50ZXh0Q29udGVudCB8fCAnJztcbiAgICAgICAgY29uc3QgdHJpbW1lZFRleHQgPSB0ZXh0LnRyaW0oKTtcbiAgICAgICAgaWYgKHRyaW1tZWRUZXh0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdWdnZXN0aW9ucyA9IGF3YWl0IGZldGNoR29vZ2xlU3VnZ2VzdGlvbnModHJpbW1lZFRleHQpO1xuICAgICAgICBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnModGV4dGFyZWEsIHN1Z2dlc3Rpb25zKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSByZXR1cm47XG5cbiAgICAgIGlmIChlLmtleSA9PT0gJ1RhYicgfHwgZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICBtb3ZlU2VsZWN0aW9uKCduZXh0Jyk7XG4gICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dVcCcpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIG1vdmVTZWxlY3Rpb24oJ3ByZXYnKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgIGNvbnN0IGluZGV4VG9TZWxlY3QgPSBzZWxlY3RlZEluZGV4ID49IDAgPyBzZWxlY3RlZEluZGV4IDogMDtcbiAgICAgICAgc2VsZWN0U3VnZ2VzdGlvbih0ZXh0YXJlYSwgY3VycmVudFN1Z2dlc3Rpb25zW2luZGV4VG9TZWxlY3RdKTtcbiAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgaGlkZUF1dG9jb21wbGV0ZVN1Z2dlc3Rpb25zKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICB0cnVlXG4gICk7XG5cbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGlmIChcbiAgICAgIGF1dG9jb21wbGV0ZUxpc3QgJiZcbiAgICAgICFhdXRvY29tcGxldGVMaXN0LmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpICYmXG4gICAgICBlLnRhcmdldCAhPT0gdGV4dGFyZWFcbiAgICApIHtcbiAgICAgIGhpZGVBdXRvY29tcGxldGVTdWdnZXN0aW9ucygpO1xuICAgIH1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlKCk6IHZvaWQge1xuICBpZiAoIXdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZS5zdGFydHNXaXRoKCcvc2VhcmNoJykpIHJldHVybjtcblxuICBsZXQgYXR0ZW1wdHMgPSAwO1xuICBjb25zdCBtYXhBdHRlbXB0cyA9IDEwO1xuXG4gIGNvbnN0IHNlYXJjaElucHV0SW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICAnaW5wdXRbZGF0YS10ZXN0LWlkPVwic2VhcmNoLWlucHV0XCJdJ1xuICAgICkgfHxcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICAgICdpbnB1dFt0eXBlPVwidGV4dFwiXVtwbGFjZWhvbGRlcio9XCLmpJzntKJcIl0nXG4gICAgICApIHx8XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxJbnB1dEVsZW1lbnQ+KCdpbnB1dFt0eXBlPVwidGV4dFwiXScpO1xuXG4gICAgaWYgKHNlYXJjaElucHV0KSB7XG4gICAgICBjbGVhckludGVydmFsKHNlYXJjaElucHV0SW50ZXJ2YWwpO1xuXG4gICAgICBzZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIChlKSA9PiB7XG4gICAgICAgIGlmICghZS5pc1RydXN0ZWQpIHJldHVybjtcbiAgICAgICAgaWYgKGF1dG9jb21wbGV0ZVRpbWVvdXQpIGNsZWFyVGltZW91dChhdXRvY29tcGxldGVUaW1lb3V0KTtcblxuICAgICAgICBjb25zdCB0ZXh0ID0gc2VhcmNoSW5wdXQudmFsdWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IHRyaW1tZWRUZXh0ID0gdGV4dC50cmltKCk7XG4gICAgICAgIGlmICh0cmltbWVkVGV4dC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBhdXRvY29tcGxldGVUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgY3VycmVudFRyaW1tZWQgPSAoc2VhcmNoSW5wdXQudmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICBpZiAoY3VycmVudFRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3Qgc3VnZ2VzdGlvbnMgPSBhd2FpdCBmZXRjaEdvb2dsZVN1Z2dlc3Rpb25zKGN1cnJlbnRUcmltbWVkKTtcbiAgICAgICAgICBzaG93QXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoc2VhcmNoSW5wdXQsIHN1Z2dlc3Rpb25zKTtcbiAgICAgICAgfSwgREVCT1VOQ0VfREVMQVkpO1xuICAgICAgfSk7XG5cbiAgICAgIHNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICdrZXlkb3duJyxcbiAgICAgICAgKGUpID0+IHtcbiAgICAgICAgICBpZiAoIWUuaXNUcnVzdGVkIHx8IGUuaXNDb21wb3NpbmcpIHJldHVybjtcbiAgICAgICAgICBpZiAoIWlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSByZXR1cm47XG5cbiAgICAgICAgICBpZiAoZS5rZXkgPT09ICdUYWInIHx8IGUua2V5ID09PSAnQXJyb3dEb3duJykge1xuICAgICAgICAgICAgcHJldmVudEV2ZW50UHJvcGFnYXRpb24oZSk7XG4gICAgICAgICAgICBtb3ZlU2VsZWN0aW9uKCduZXh0Jyk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93VXAnKSB7XG4gICAgICAgICAgICBwcmV2ZW50RXZlbnRQcm9wYWdhdGlvbihlKTtcbiAgICAgICAgICAgIG1vdmVTZWxlY3Rpb24oJ3ByZXYnKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWRJbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgIHByZXZlbnRFdmVudFByb3BhZ2F0aW9uKGUpO1xuICAgICAgICAgICAgICBzZWxlY3RTdWdnZXN0aW9uKHNlYXJjaElucHV0LCBjdXJyZW50U3VnZ2VzdGlvbnNbc2VsZWN0ZWRJbmRleF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHRydWVcbiAgICAgICk7XG5cbiAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGF1dG9jb21wbGV0ZUxpc3QgJiZcbiAgICAgICAgICAhYXV0b2NvbXBsZXRlTGlzdC5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSAmJlxuICAgICAgICAgIGUudGFyZ2V0ICE9PSBzZWFyY2hJbnB1dFxuICAgICAgICApIHtcbiAgICAgICAgICBoaWRlQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbnMoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChzZWFyY2hJbnB1dEludGVydmFsKTtcbiAgICB9XG4gIH0sIDUwMCk7XG59XG4iLCIvLyBDaGF0IFVJIGZ1bmN0aW9uYWxpdHkgKHRleHRhcmVhLCBzaWRlYmFyLCBzY3JvbGxpbmcsIGNvcHkgYnV0dG9ucylcblxuaW1wb3J0IHsgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSB9IGZyb20gJy4vYXV0b2NvbXBsZXRlJztcblxubGV0IGNhY2hlZENoYXRBcmVhOiBFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5sZXQgY2hhdEFyZWFDYWNoZVRpbWUgPSAwO1xuY29uc3QgQ0hBVF9BUkVBX0NBQ0hFX0RVUkFUSU9OID0gNTAwMDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRBcmVhKCk6IEVsZW1lbnQge1xuICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gIGlmIChjYWNoZWRDaGF0QXJlYSAmJiBub3cgLSBjaGF0QXJlYUNhY2hlVGltZSA8IENIQVRfQVJFQV9DQUNIRV9EVVJBVElPTikge1xuICAgIHJldHVybiBjYWNoZWRDaGF0QXJlYTtcbiAgfVxuXG4gIGNvbnN0IGNoYXRIaXN0b3J5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5Jyk7XG4gIGlmIChjaGF0SGlzdG9yeSAmJiBjaGF0SGlzdG9yeS5zY3JvbGxIZWlnaHQgPiBjaGF0SGlzdG9yeS5jbGllbnRIZWlnaHQpIHtcbiAgICBjYWNoZWRDaGF0QXJlYSA9IGNoYXRIaXN0b3J5O1xuICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgIHJldHVybiBjaGF0SGlzdG9yeTtcbiAgfVxuXG4gIGlmIChcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsSGVpZ2h0ID5cbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0XG4gICkge1xuICAgIGNhY2hlZENoYXRBcmVhID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICAgIGNoYXRBcmVhQ2FjaGVUaW1lID0gbm93O1xuICAgIHJldHVybiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gIH1cblxuICBjb25zdCBzZWxlY3RvcnMgPSBbXG4gICAgJ2luZmluaXRlLXNjcm9sbGVyJyxcbiAgICAnbWFpbltjbGFzcyo9XCJtYWluXCJdJyxcbiAgICAnLmNvbnZlcnNhdGlvbi1jb250YWluZXInLFxuICAgICdbY2xhc3MqPVwiY2hhdC1oaXN0b3J5XCJdJyxcbiAgICAnW2NsYXNzKj1cIm1lc3NhZ2VzXCJdJyxcbiAgICAnbWFpbicsXG4gICAgJ1tjbGFzcyo9XCJzY3JvbGxcIl0nLFxuICAgICdkaXZbY2xhc3MqPVwiY29udmVyc2F0aW9uXCJdJyxcbiAgXTtcblxuICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgICBpZiAoZWxlbWVudCAmJiBlbGVtZW50LnNjcm9sbEhlaWdodCA+IGVsZW1lbnQuY2xpZW50SGVpZ2h0KSB7XG4gICAgICBjYWNoZWRDaGF0QXJlYSA9IGVsZW1lbnQ7XG4gICAgICBjaGF0QXJlYUNhY2hlVGltZSA9IG5vdztcbiAgICAgIHJldHVybiBlbGVtZW50O1xuICAgIH1cbiAgfVxuXG4gIGNhY2hlZENoYXRBcmVhID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xuICBjaGF0QXJlYUNhY2hlVGltZSA9IG5vdztcbiAgcmV0dXJuIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjcm9sbENoYXRBcmVhKGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJyk6IHZvaWQge1xuICBjb25zdCBjaGF0QXJlYSA9IGdldENoYXRBcmVhKCk7XG4gIGNvbnN0IHNjcm9sbEFtb3VudCA9IHdpbmRvdy5pbm5lckhlaWdodCAqIDAuMTtcbiAgY29uc3Qgc2Nyb2xsVmFsdWUgPSBkaXJlY3Rpb24gPT09ICd1cCcgPyAtc2Nyb2xsQW1vdW50IDogc2Nyb2xsQW1vdW50O1xuXG4gIGlmIChjaGF0QXJlYSA9PT0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGNoYXRBcmVhID09PSBkb2N1bWVudC5ib2R5KSB7XG4gICAgd2luZG93LnNjcm9sbEJ5KHsgdG9wOiBzY3JvbGxWYWx1ZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgfSBlbHNlIHtcbiAgICAoY2hhdEFyZWEgYXMgSFRNTEVsZW1lbnQpLnNjcm9sbEJ5KHsgdG9wOiBzY3JvbGxWYWx1ZSwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTmV3Q2hhdCgpOiB2b2lkIHtcbiAgY29uc3QgbmV3Q2hhdExpbmsgPVxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KFxuICAgICAgJ2FbaHJlZj1cImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwXCJdJ1xuICAgICkgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxBbmNob3JFbGVtZW50PignYVthcmlhLWxhYmVsKj1cIuaWsOimj+S9nOaIkFwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQW5jaG9yRWxlbWVudD4oJ2FbYXJpYS1sYWJlbCo9XCJOZXcgY2hhdFwiXScpO1xuXG4gIGlmIChuZXdDaGF0TGluaykge1xuICAgIG5ld0NoYXRMaW5rLmNsaWNrKCk7XG4gICAgcmVpbml0aWFsaXplQWZ0ZXJOYXZpZ2F0aW9uKCk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgbmV3Q2hhdEJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXRlc3QtaWQ9XCJuZXctY2hhdC1idXR0b25cIl0nKTtcbiAgaWYgKG5ld0NoYXRCdXR0b24pIHtcbiAgICBjb25zdCBjbGlja2FibGUgPVxuICAgICAgbmV3Q2hhdEJ1dHRvbi5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYSwgYnV0dG9uJykgfHxcbiAgICAgIChuZXdDaGF0QnV0dG9uIGFzIEhUTUxFbGVtZW50KTtcbiAgICBjbGlja2FibGUuY2xpY2soKTtcbiAgICByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaW5rcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJ2EsIGJ1dHRvbicpKTtcbiAgY29uc3QgbmV3Q2hhdEJ0biA9IGxpbmtzLmZpbmQoXG4gICAgKGVsKSA9PlxuICAgICAgZWwudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCfmlrDopo/kvZzmiJAnKSB8fFxuICAgICAgZWwudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdOZXcgY2hhdCcpIHx8XG4gICAgICBlbC50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ+aWsOimjycpXG4gICk7XG4gIGlmIChuZXdDaGF0QnRuKSB7XG4gICAgbmV3Q2hhdEJ0bi5jbGljaygpO1xuICAgIHJlaW5pdGlhbGl6ZUFmdGVyTmF2aWdhdGlvbigpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWluaXRpYWxpemVBZnRlck5hdmlnYXRpb24oKTogdm9pZCB7XG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgfSwgMTUwMCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb2N1c1RleHRhcmVhKCk6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nKTtcblxuICBpZiAoIXRleHRhcmVhKSByZXR1cm47XG4gIHRleHRhcmVhLmZvY3VzKCk7XG5cbiAgaWYgKHRleHRhcmVhLmNvbnRlbnRFZGl0YWJsZSA9PT0gJ3RydWUnKSB7XG4gICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICByYW5nZS5zZWxlY3ROb2RlQ29udGVudHModGV4dGFyZWEpO1xuICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHNlbD8uYWRkUmFuZ2UocmFuZ2UpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckFuZEZvY3VzVGV4dGFyZWEoKTogdm9pZCB7XG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3QgaW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICk7XG5cbiAgICBpZiAodGV4dGFyZWEpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgd2hpbGUgKHRleHRhcmVhLmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgdGV4dGFyZWEucmVtb3ZlQ2hpbGQodGV4dGFyZWEuZmlyc3RDaGlsZCk7XG4gICAgICB9XG4gICAgICBjb25zdCBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xuICAgICAgcC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdicicpKTtcbiAgICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICAgICAgdGV4dGFyZWEuZm9jdXMoKTtcbiAgICAgIHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgfVxuICB9LCAyMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0UXVlcnlGcm9tVXJsKCk6IHZvaWQge1xuICBjb25zdCBwYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xuICBpZiAocGF0aCAhPT0gJy9hcHAnICYmIHBhdGggIT09ICcvYXBwLycpIHJldHVybjtcblxuICBjb25zdCB1cmxQYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuICBjb25zdCBxdWVyeSA9IHVybFBhcmFtcy5nZXQoJ3EnKTtcbiAgaWYgKCFxdWVyeSkgcmV0dXJuO1xuXG4gIGNvbnN0IHNlbmQgPSB1cmxQYXJhbXMuZ2V0KCdzZW5kJyk7XG4gIGNvbnN0IHNob3VsZFNlbmQgPSBzZW5kID09PSBudWxsIHx8IHNlbmQgPT09ICd0cnVlJyB8fCBzZW5kID09PSAnMSc7XG5cbiAgbGV0IGF0dGVtcHRzID0gMDtcbiAgY29uc3QgbWF4QXR0ZW1wdHMgPSAyMDtcblxuICBjb25zdCBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICBhdHRlbXB0cysrO1xuICAgIGNvbnN0IHRleHRhcmVhID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgKTtcblxuICAgIGlmICh0ZXh0YXJlYSkge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG5cbiAgICAgIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB7XG4gICAgICAgIHRleHRhcmVhLnJlbW92ZUNoaWxkKHRleHRhcmVhLmZpcnN0Q2hpbGQpO1xuICAgICAgfVxuICAgICAgY29uc3QgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcbiAgICAgIHAudGV4dENvbnRlbnQgPSBxdWVyeTtcbiAgICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICAgICAgdGV4dGFyZWEuZm9jdXMoKTtcblxuICAgICAgY29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgICAgY29uc3Qgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgICAgcmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHRleHRhcmVhKTtcbiAgICAgIHJhbmdlLmNvbGxhcHNlKGZhbHNlKTtcbiAgICAgIHNlbD8ucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcblxuICAgICAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuICAgICAgaWYgKHNob3VsZFNlbmQpIHtcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc2VuZEJ1dHRvbiA9XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uW2FyaWEtbGFiZWwqPVwi6YCB5L+hXCJdJykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCJTZW5kXCJdJykgfHxcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24uc2VuZC1idXR0b24nKSB8fFxuICAgICAgICAgICAgQXJyYXkuZnJvbShcbiAgICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbicpXG4gICAgICAgICAgICApLmZpbmQoXG4gICAgICAgICAgICAgIChidG4pID0+XG4gICAgICAgICAgICAgICAgYnRuLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpPy5pbmNsdWRlcygn6YCB5L+hJykgfHxcbiAgICAgICAgICAgICAgICBidG4uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk/LmluY2x1ZGVzKCdTZW5kJylcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKHNlbmRCdXR0b24gJiYgIXNlbmRCdXR0b24uZGlzYWJsZWQpIHtcbiAgICAgICAgICAgIHNlbmRCdXR0b24uY2xpY2soKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0sIDUwMCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xuICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgfVxuICB9LCAyMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9jdXNBY3Rpb25CdXR0b24oZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gIGlmIChhY3Rpb25CdXR0b25zLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChkaXJlY3Rpb24gPT09ICd1cCcpIHtcbiAgICBhY3Rpb25CdXR0b25zW2FjdGlvbkJ1dHRvbnMubGVuZ3RoIC0gMV0uZm9jdXMoKTtcbiAgfSBlbHNlIHtcbiAgICBhY3Rpb25CdXR0b25zWzBdLmZvY3VzKCk7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlQmV0d2VlbkFjdGlvbkJ1dHRvbnMoZGlyZWN0aW9uOiAndXAnIHwgJ2Rvd24nKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFjdGlvbkJ1dHRvbnMgPSBnZXRBbGxBY3Rpb25CdXR0b25zKCk7XG4gIGNvbnN0IGN1cnJlbnRJbmRleCA9IGFjdGlvbkJ1dHRvbnMuZmluZEluZGV4KFxuICAgIChidG4pID0+IGJ0biA9PT0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudFxuICApO1xuICBpZiAoY3VycmVudEluZGV4ID09PSAtMSkgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChkaXJlY3Rpb24gPT09ICd1cCcpIHtcbiAgICBpZiAoY3VycmVudEluZGV4ID4gMCkge1xuICAgICAgYWN0aW9uQnV0dG9uc1tjdXJyZW50SW5kZXggLSAxXS5mb2N1cygpO1xuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LihjdXJyZW50SW5kZXggLSAxKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoY3VycmVudEluZGV4IDwgYWN0aW9uQnV0dG9ucy5sZW5ndGggLSAxKSB7XG4gICAgICBhY3Rpb25CdXR0b25zW2N1cnJlbnRJbmRleCArIDFdLmZvY3VzKCk7XG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKGN1cnJlbnRJbmRleCArIDEpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxBY3Rpb25CdXR0b25zKCk6IEhUTUxFbGVtZW50W10ge1xuICBjb25zdCBhbGxCdXR0b25zID0gQXJyYXkuZnJvbShcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICdidXR0b24uZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUsIGJ1dHRvbltkYXRhLWFjdGlvbj1cImRlZXAtZGl2ZVwiXSdcbiAgICApXG4gICk7XG5cbiAgcmV0dXJuIGFsbEJ1dHRvbnMuZmlsdGVyKChidG4pID0+IHtcbiAgICBjb25zdCBjb250YWluZXIgPVxuICAgICAgYnRuLmNsb3Nlc3QoJ1tkYXRhLXRlc3QtaWQqPVwidXNlclwiXScpIHx8XG4gICAgICBidG4uY2xvc2VzdCgnW2RhdGEtdGVzdC1pZCo9XCJwcm9tcHRcIl0nKSB8fFxuICAgICAgYnRuLmNsb3Nlc3QoJ1tjbGFzcyo9XCJ1c2VyXCJdJyk7XG4gICAgcmV0dXJuICFjb250YWluZXI7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZFNpZGViYXJUb2dnbGVCdXR0b24oKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcbiAgcmV0dXJuIChcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignW2RhdGEtdGVzdC1pZD1cInNpZGUtbmF2LXRvZ2dsZVwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODoeODi+ODpeODvFwiXScpIHx8XG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2J1dHRvblthcmlhLWxhYmVsKj1cIm1lbnVcIl0nKSB8fFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdidXR0b25bYXJpYS1sYWJlbCo9XCJNZW51XCJdJylcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2lkZWJhck9wZW4oKTogYm9vbGVhbiB7XG4gIGNvbnN0IHNpZGVuYXYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtYXQtc2lkZW5hdicpO1xuICBpZiAoIXNpZGVuYXYpIHJldHVybiB0cnVlO1xuICByZXR1cm4gc2lkZW5hdi5jbGFzc0xpc3QuY29udGFpbnMoJ21hdC1kcmF3ZXItb3BlbmVkJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2dnbGVTaWRlYmFyKCk6IHZvaWQge1xuICBjb25zdCB0b2dnbGUgPSBmaW5kU2lkZWJhclRvZ2dsZUJ1dHRvbigpO1xuICBpZiAodG9nZ2xlKSB0b2dnbGUuY2xpY2soKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVDaGF0UGFnZSgpOiB2b2lkIHtcbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgc2V0UXVlcnlGcm9tVXJsKCk7XG4gIH0sIDEwMDApO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGluaXRpYWxpemVBdXRvY29tcGxldGUoKTtcbiAgfSwgMTUwMCk7XG5cbiAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgY29uc3QgaXNTdHJlYW1pbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbYXJpYS1idXN5PVwidHJ1ZVwiXScpO1xuICAgIGlmIChpc1N0cmVhbWluZykge1xuICAgICAgd2luZG93LnJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24/LigtMSk7XG4gICAgfVxuICB9KTtcblxuICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHtcbiAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgIGF0dHJpYnV0ZUZpbHRlcjogWydhcmlhLWJ1c3knXSxcbiAgICBzdWJ0cmVlOiB0cnVlLFxuICB9KTtcbn1cbiIsIi8vIENoYXQgaGlzdG9yeSBzZWxlY3Rpb24gZnVuY3Rpb25hbGl0eVxuXG5pbXBvcnQgeyBjbGVhckFuZEZvY3VzVGV4dGFyZWEgfSBmcm9tICcuL2NoYXQnO1xuXG5sZXQgc2VsZWN0ZWRIaXN0b3J5SW5kZXggPSAwO1xubGV0IGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGdldEhpc3RvcnlJdGVtcygpOiBIVE1MRWxlbWVudFtdIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAnLmNvbnZlcnNhdGlvbi1pdGVtcy1jb250YWluZXIgLmNvbnZlcnNhdGlvbltkYXRhLXRlc3QtaWQ9XCJjb252ZXJzYXRpb25cIl0nXG4gICAgKVxuICApO1xufVxuXG5mdW5jdGlvbiBoaWdobGlnaHRIaXN0b3J5KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgaXRlbXMgPSBnZXRIaXN0b3J5SXRlbXMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gIHNlbGVjdGVkSGlzdG9yeUluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaW5kZXgsIGl0ZW1zLmxlbmd0aCAtIDEpKTtcblxuICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lID0gJyc7XG4gICAgaXRlbS5zdHlsZS5vdXRsaW5lT2Zmc2V0ID0gJyc7XG4gIH0pO1xuXG4gIGNvbnN0IHNlbGVjdGVkSXRlbSA9IGl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XTtcbiAgaWYgKHNlbGVjdGVkSXRlbSkge1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjMWE3M2U4JztcbiAgICBzZWxlY3RlZEl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICctMnB4JztcbiAgICBzZWxlY3RlZEl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlSGlzdG9yeVVwKCk6IHZvaWQge1xuICBoaWdobGlnaHRIaXN0b3J5KHNlbGVjdGVkSGlzdG9yeUluZGV4IC0gMSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlSGlzdG9yeURvd24oKTogdm9pZCB7XG4gIGhpZ2hsaWdodEhpc3Rvcnkoc2VsZWN0ZWRIaXN0b3J5SW5kZXggKyAxKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9wZW5TZWxlY3RlZEhpc3RvcnkoKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0SGlzdG9yeUl0ZW1zKCk7XG4gIGlmIChpdGVtcy5sZW5ndGggPT09IDAgfHwgIWl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XSkgcmV0dXJuO1xuXG4gIGl0ZW1zW3NlbGVjdGVkSGlzdG9yeUluZGV4XS5jbGljaygpO1xuICBoaXN0b3J5U2VsZWN0aW9uTW9kZSA9IGZhbHNlO1xuXG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG5cbiAgY2xlYXJBbmRGb2N1c1RleHRhcmVhKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogdm9pZCB7XG4gIGhpc3RvcnlTZWxlY3Rpb25Nb2RlID0gZmFsc2U7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0SGlzdG9yeUl0ZW1zKCk7XG4gIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICBpdGVtLnN0eWxlLm91dGxpbmUgPSAnJztcbiAgICBpdGVtLnN0eWxlLm91dGxpbmVPZmZzZXQgPSAnJztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbnRlckhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk6IHZvaWQge1xuICBoaXN0b3J5U2VsZWN0aW9uTW9kZSA9IHRydWU7XG4gIGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50KSB7XG4gICAgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmJsdXIoKTtcbiAgfVxuICBoaWdobGlnaHRIaXN0b3J5KHNlbGVjdGVkSGlzdG9yeUluZGV4KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKTogYm9vbGVhbiB7XG4gIHJldHVybiBoaXN0b3J5U2VsZWN0aW9uTW9kZTtcbn1cbiIsIi8vIFNlYXJjaCBwYWdlIGZ1bmN0aW9uYWxpdHlcblxuaW1wb3J0IHsgZXhpdEhpc3RvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi9oaXN0b3J5JztcblxubGV0IHNlbGVjdGVkU2VhcmNoSW5kZXggPSAwO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTZWFyY2hQYWdlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9zZWFyY2gnKTtcbn1cblxuZnVuY3Rpb24gZ2V0U2VhcmNoUmVzdWx0cygpOiBIVE1MRWxlbWVudFtdIHtcbiAgbGV0IHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdzZWFyY2gtc25pcHBldFt0YWJpbmRleD1cIjBcIl0nKVxuICApO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICByZXN1bHRzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCdzZWFyY2gtc25pcHBldCcpXG4gICAgKTtcbiAgfVxuICBpZiAocmVzdWx0cy5sZW5ndGggPT09IDApIHtcbiAgICByZXN1bHRzID0gQXJyYXkuZnJvbShcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnZGl2LmNvbnZlcnNhdGlvbi1jb250YWluZXJbcm9sZT1cIm9wdGlvblwiXSdcbiAgICAgIClcbiAgICApO1xuICB9XG4gIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJlc3VsdHMgPSBBcnJheS5mcm9tKFxuICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICdbcm9sZT1cIm9wdGlvblwiXS5jb252ZXJzYXRpb24tY29udGFpbmVyJ1xuICAgICAgKVxuICAgICk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gIGNvbnN0IGl0ZW1zID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGluZGV4LCBpdGVtcy5sZW5ndGggLSAxKSk7XG5cbiAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZSA9ICcnO1xuICAgIGl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICcnO1xuICB9KTtcblxuICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XTtcbiAgaWYgKHNlbGVjdGVkSXRlbSkge1xuICAgIHNlbGVjdGVkSXRlbS5zdHlsZS5vdXRsaW5lID0gJzJweCBzb2xpZCAjMWE3M2U4JztcbiAgICBzZWxlY3RlZEl0ZW0uc3R5bGUub3V0bGluZU9mZnNldCA9ICctMnB4JztcbiAgICBzZWxlY3RlZEl0ZW0uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ2F1dG8nIH0pO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlU2VhcmNoUmVzdWx0VXAoKTogdm9pZCB7XG4gIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChzZWxlY3RlZFNlYXJjaEluZGV4IC0gMSk7XG4gIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2lucHV0W2RhdGEtdGVzdC1pZD1cInNlYXJjaC1pbnB1dFwiXSdcbiAgKTtcbiAgaWYgKHNlYXJjaElucHV0KSBzZWFyY2hJbnB1dC5mb2N1cygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW92ZVNlYXJjaFJlc3VsdERvd24oKTogdm9pZCB7XG4gIGhpZ2hsaWdodFNlYXJjaFJlc3VsdChzZWxlY3RlZFNlYXJjaEluZGV4ICsgMSk7XG4gIGNvbnN0IHNlYXJjaElucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2lucHV0W2RhdGEtdGVzdC1pZD1cInNlYXJjaC1pbnB1dFwiXSdcbiAgKTtcbiAgaWYgKHNlYXJjaElucHV0KSBzZWFyY2hJbnB1dC5mb2N1cygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3BlblNlbGVjdGVkU2VhcmNoUmVzdWx0KCk6IHZvaWQge1xuICBjb25zdCBpdGVtcyA9IGdldFNlYXJjaFJlc3VsdHMoKTtcbiAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCB8fCAhaXRlbXNbc2VsZWN0ZWRTZWFyY2hJbmRleF0pIHJldHVybjtcblxuICBjb25zdCBzZWxlY3RlZEl0ZW0gPSBpdGVtc1tzZWxlY3RlZFNlYXJjaEluZGV4XTtcblxuICBjb25zdCBjbGlja2FibGVEaXYgPSBzZWxlY3RlZEl0ZW0ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJ2Rpdltqc2xvZ10nKTtcbiAgaWYgKGNsaWNrYWJsZURpdikge1xuICAgIGNsaWNrYWJsZURpdi5jbGljaygpO1xuICAgIFsnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnY2xpY2snXS5mb3JFYWNoKChldmVudFR5cGUpID0+IHtcbiAgICAgIGNsaWNrYWJsZURpdi5kaXNwYXRjaEV2ZW50KFxuICAgICAgICBuZXcgTW91c2VFdmVudChldmVudFR5cGUsIHsgdmlldzogd2luZG93LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pXG4gICAgICApO1xuICAgIH0pO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2VsZWN0ZWRJdGVtLmNsaWNrKCk7XG4gICAgfSwgMTAwKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBsaW5rID0gc2VsZWN0ZWRJdGVtLnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhW2hyZWZdJyk7XG4gIGlmIChsaW5rKSB7XG4gICAgbGluay5jbGljaygpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHNlbGVjdGVkSXRlbS5jbGljaygpO1xuICBbJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ2NsaWNrJ10uZm9yRWFjaCgoZXZlbnRUeXBlKSA9PiB7XG4gICAgc2VsZWN0ZWRJdGVtLmRpc3BhdGNoRXZlbnQoXG4gICAgICBuZXcgTW91c2VFdmVudChldmVudFR5cGUsIHsgdmlldzogd2luZG93LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pXG4gICAgKTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplU2VhcmNoUGFnZSgpOiB2b2lkIHtcbiAgaWYgKCFpc1NlYXJjaFBhZ2UoKSkgcmV0dXJuO1xuXG4gIGxldCBhdHRlbXB0cyA9IDA7XG4gIGNvbnN0IG1heEF0dGVtcHRzID0gMTA7XG5cbiAgY29uc3QgaGlnaGxpZ2h0SW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgYXR0ZW1wdHMrKztcbiAgICBjb25zdCBzZWFyY2hSZXN1bHRzID0gZ2V0U2VhcmNoUmVzdWx0cygpO1xuXG4gICAgaWYgKHNlYXJjaFJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgc2VsZWN0ZWRTZWFyY2hJbmRleCA9IDA7XG4gICAgICBoaWdobGlnaHRTZWFyY2hSZXN1bHQoMCk7XG4gICAgICBjbGVhckludGVydmFsKGhpZ2hsaWdodEludGVydmFsKTtcbiAgICB9IGVsc2UgaWYgKGF0dGVtcHRzID49IG1heEF0dGVtcHRzKSB7XG4gICAgICBjbGVhckludGVydmFsKGhpZ2hsaWdodEludGVydmFsKTtcbiAgICB9XG4gIH0sIDUwMCk7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRlVG9TZWFyY2hQYWdlKCk6IHZvaWQge1xuICBjb25zdCBzZWFyY2hVcmwgPSAnL3NlYXJjaD9obD1qYSc7XG4gIGhpc3RvcnkucHVzaFN0YXRlKG51bGwsICcnLCBzZWFyY2hVcmwpO1xuICB3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgUG9wU3RhdGVFdmVudCgncG9wc3RhdGUnLCB7IHN0YXRlOiBudWxsIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZVNlYXJjaFBhZ2UoKTogdm9pZCB7XG4gIGlmIChpc1NlYXJjaFBhZ2UoKSkge1xuICAgIGhpc3RvcnkuYmFjaygpO1xuICB9IGVsc2Uge1xuICAgIGV4aXRIaXN0b3J5U2VsZWN0aW9uTW9kZSgpO1xuICAgIG5hdmlnYXRlVG9TZWFyY2hQYWdlKCk7XG4gIH1cbn1cbiIsIi8vIENoYXQgZXhwb3J0IGZ1bmN0aW9uYWxpdHkgLSBzYXZlcyBjdXJyZW50IGNvbnZlcnNhdGlvbiBhcyBaZXR0ZWxrYXN0ZW4gTWFya2Rvd25cblxuY29uc3QgRVhQT1JUX0JVVFRPTl9JRCA9ICdnZW1pbmktZXhwb3J0LW5vdGUtYnV0dG9uJztcbmxldCBleHBvcnREaXJIYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgfCBudWxsID0gbnVsbDtcblxuLy8gLS0tIEluZGV4ZWREQiBoZWxwZXJzIC0tLVxuXG5mdW5jdGlvbiBvcGVuRXhwb3J0REIoKTogUHJvbWlzZTxJREJEYXRhYmFzZT4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlcSA9IGluZGV4ZWREQi5vcGVuKCdnZW1pbmktZXhwb3J0JywgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IChlKSA9PiB7XG4gICAgICAoZS50YXJnZXQgYXMgSURCT3BlbkRCUmVxdWVzdCkucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKCdoYW5kbGVzJyk7XG4gICAgfTtcbiAgICByZXEub25zdWNjZXNzID0gKGUpID0+IHJlc29sdmUoKGUudGFyZ2V0IGFzIElEQk9wZW5EQlJlcXVlc3QpLnJlc3VsdCk7XG4gICAgcmVxLm9uZXJyb3IgPSAoKSA9PiByZWplY3QocmVxLmVycm9yKTtcbiAgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFN0b3JlZERpckhhbmRsZSgpOiBQcm9taXNlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgZGIgPSBhd2FpdCBvcGVuRXhwb3J0REIoKTtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oJ2hhbmRsZXMnLCAncmVhZG9ubHknKTtcbiAgICAgIGNvbnN0IHJlcSA9IHR4Lm9iamVjdFN0b3JlKCdoYW5kbGVzJykuZ2V0KCdzYXZlX2RpcicpO1xuICAgICAgcmVxLm9uc3VjY2VzcyA9ICgpID0+IHJlc29sdmUoKHJlcS5yZXN1bHQgYXMgRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSkgfHwgbnVsbCk7XG4gICAgICByZXEub25lcnJvciA9ICgpID0+IHJlc29sdmUobnVsbCk7XG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0b3JlRGlySGFuZGxlKGhhbmRsZTogRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGRiID0gYXdhaXQgb3BlbkV4cG9ydERCKCk7XG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbignaGFuZGxlcycsICdyZWFkd3JpdGUnKTtcbiAgICAgIHR4Lm9iamVjdFN0b3JlKCdoYW5kbGVzJykucHV0KGhhbmRsZSwgJ3NhdmVfZGlyJyk7XG4gICAgICB0eC5vbmNvbXBsZXRlID0gKCkgPT4gcmVzb2x2ZSgpO1xuICAgICAgdHgub25lcnJvciA9ICgpID0+IHJlamVjdCh0eC5lcnJvcik7XG4gICAgfSk7XG4gIH0gY2F0Y2gge1xuICAgIC8vIElnbm9yZSBzdG9yYWdlIGVycm9yc1xuICB9XG59XG5cbi8vIC0tLSBEaXJlY3RvcnkgaGFuZGxlIG1hbmFnZW1lbnQgLS0tXG5cbmFzeW5jIGZ1bmN0aW9uIGdldEV4cG9ydERpckhhbmRsZSgpOiBQcm9taXNlPEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU+IHtcbiAgaWYgKGV4cG9ydERpckhhbmRsZSkge1xuICAgIGNvbnN0IHBlcm0gPSBhd2FpdCBleHBvcnREaXJIYW5kbGUucXVlcnlQZXJtaXNzaW9uKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gICAgaWYgKHBlcm0gPT09ICdncmFudGVkJykgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbiAgfVxuXG4gIGNvbnN0IHN0b3JlZCA9IGF3YWl0IGdldFN0b3JlZERpckhhbmRsZSgpO1xuICBpZiAoc3RvcmVkKSB7XG4gICAgY29uc3QgcGVybSA9IGF3YWl0IHN0b3JlZC5xdWVyeVBlcm1pc3Npb24oeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICBpZiAocGVybSA9PT0gJ2dyYW50ZWQnKSB7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBzdG9yZWQ7XG4gICAgICByZXR1cm4gZXhwb3J0RGlySGFuZGxlO1xuICAgIH1cbiAgICBjb25zdCBuZXdQZXJtID0gYXdhaXQgc3RvcmVkLnJlcXVlc3RQZXJtaXNzaW9uKHsgbW9kZTogJ3JlYWR3cml0ZScgfSk7XG4gICAgaWYgKG5ld1Blcm0gPT09ICdncmFudGVkJykge1xuICAgICAgZXhwb3J0RGlySGFuZGxlID0gc3RvcmVkO1xuICAgICAgcmV0dXJuIGV4cG9ydERpckhhbmRsZTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGUgPSBhd2FpdCB3aW5kb3cuc2hvd0RpcmVjdG9yeVBpY2tlcih7IG1vZGU6ICdyZWFkd3JpdGUnIH0pO1xuICBhd2FpdCBzdG9yZURpckhhbmRsZShoYW5kbGUpO1xuICBleHBvcnREaXJIYW5kbGUgPSBoYW5kbGU7XG4gIHJldHVybiBleHBvcnREaXJIYW5kbGU7XG59XG5cbi8vIC0tLSBUZXh0IGNsZWFudXAgLS0tXG5cbmNvbnN0IEFSVElGQUNUX1BBVFRFUk5TID0gW1xuICAvXlsr77yLXSQvLFxuICAvXkdvb2dsZSDjgrnjg5fjg6zjg4Pjg4njgrfjg7zjg4jjgavjgqjjgq/jgrnjg53jg7zjg4gkLyxcbiAgL15Hb29nbGUgU2hlZXRzIOOBq+OCqOOCr+OCueODneODvOODiCQvLFxuICAvXkV4cG9ydCB0byBTaGVldHMkLyxcbl07XG5cbmZ1bmN0aW9uIGNsZWFuTW9kZWxUZXh0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB0ZXh0XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5maWx0ZXIoKGxpbmUpID0+ICFBUlRJRkFDVF9QQVRURVJOUy5zb21lKChwKSA9PiBwLnRlc3QobGluZS50cmltKCkpKSlcbiAgICAuam9pbignXFxuJylcbiAgICAucmVwbGFjZSgvXFxuezMsfS9nLCAnXFxuXFxuJylcbiAgICAudHJpbSgpO1xufVxuXG4vLyAtLS0gU2Nyb2xsIHRvIGxvYWQgYWxsIG1lc3NhZ2VzIC0tLVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkQWxsTWVzc2FnZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IHNjcm9sbGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgJ2luZmluaXRlLXNjcm9sbGVyLmNoYXQtaGlzdG9yeSdcbiAgKTtcbiAgaWYgKCFzY3JvbGxlcikgcmV0dXJuO1xuXG4gIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+ODoeODg+OCu+ODvOOCuOOCkuiqreOBv+i+vOOBv+S4rS4uLicpO1xuXG4gIGxldCBwcmV2Q291bnQgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDMwOyBpKyspIHtcbiAgICBzY3JvbGxlci5zY3JvbGxUb3AgPSAwO1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDQwMCkpO1xuICAgIGNvbnN0IGNvdW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndXNlci1xdWVyeScpLmxlbmd0aDtcbiAgICBpZiAoY291bnQgPT09IHByZXZDb3VudCkgYnJlYWs7XG4gICAgcHJldkNvdW50ID0gY291bnQ7XG4gIH1cblxuICBzY3JvbGxlci5zY3JvbGxUb3AgPSBzY3JvbGxlci5zY3JvbGxIZWlnaHQ7XG59XG5cbi8vIC0tLSBDaGF0IGNvbnRlbnQgZXh0cmFjdGlvbiAtLS1cblxuaW50ZXJmYWNlIFR1cm4ge1xuICB1c2VyOiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RDaGF0Q29udGVudCgpOiBUdXJuW10ge1xuICBjb25zdCB1c2VyUXVlcmllcyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndXNlci1xdWVyeScpKTtcbiAgY29uc3QgbW9kZWxSZXNwb25zZXMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ21vZGVsLXJlc3BvbnNlJykpO1xuXG4gIGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXTtcbiAgY29uc3QgbGVuID0gTWF0aC5taW4odXNlclF1ZXJpZXMubGVuZ3RoLCBtb2RlbFJlc3BvbnNlcy5sZW5ndGgpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCB1c2VyVGV4dCA9IEFycmF5LmZyb20oXG4gICAgICB1c2VyUXVlcmllc1tpXS5xdWVyeVNlbGVjdG9yQWxsKCcucXVlcnktdGV4dC1saW5lJylcbiAgICApXG4gICAgICAubWFwKChlbCkgPT4gKGVsIGFzIEhUTUxFbGVtZW50KS5pbm5lclRleHQudHJpbSgpKVxuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oJ1xcbicpO1xuXG4gICAgY29uc3QgcmF3TW9kZWxUZXh0ID0gKFxuICAgICAgbW9kZWxSZXNwb25zZXNbaV0ucXVlcnlTZWxlY3RvcihcbiAgICAgICAgJ21lc3NhZ2UtY29udGVudCAubWFya2Rvd24nXG4gICAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbFxuICAgICk/LmlubmVyVGV4dD8udHJpbSgpO1xuICAgIGNvbnN0IG1vZGVsVGV4dCA9IHJhd01vZGVsVGV4dCA/IGNsZWFuTW9kZWxUZXh0KHJhd01vZGVsVGV4dCkgOiAnJztcblxuICAgIGlmICh1c2VyVGV4dCB8fCBtb2RlbFRleHQpIHtcbiAgICAgIHR1cm5zLnB1c2goeyB1c2VyOiB1c2VyVGV4dCB8fCAnJywgbW9kZWw6IG1vZGVsVGV4dCB8fCAnJyB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHVybnM7XG59XG5cbmZ1bmN0aW9uIGdldENoYXRJZCgpOiBzdHJpbmcge1xuICByZXR1cm4gbG9jYXRpb24ucGF0aG5hbWUuc3BsaXQoJy8nKS5wb3AoKSB8fCAndW5rbm93bic7XG59XG5cbi8vIC0tLSBNYXJrZG93biBnZW5lcmF0aW9uIChaZXR0ZWxrYXN0ZW4gZm9ybWF0KSAtLS1cblxuZnVuY3Rpb24gZ2VuZXJhdGVNYXJrZG93bih0dXJuczogVHVybltdKToge1xuICBtYXJrZG93bjogc3RyaW5nO1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xufSB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IHBhZCA9IChuOiBudW1iZXIpID0+IFN0cmluZyhuKS5wYWRTdGFydCgyLCAnMCcpO1xuICBjb25zdCBkYXRlU3RyID0gYCR7bm93LmdldEZ1bGxZZWFyKCl9LSR7cGFkKG5vdy5nZXRNb250aCgpICsgMSl9LSR7cGFkKG5vdy5nZXREYXRlKCkpfWA7XG4gIGNvbnN0IHRpbWVTdHIgPSBgJHtkYXRlU3RyfVQke3BhZChub3cuZ2V0SG91cnMoKSl9OiR7cGFkKG5vdy5nZXRNaW51dGVzKCkpfToke3BhZChub3cuZ2V0U2Vjb25kcygpKX1gO1xuICBjb25zdCBpZCA9IHRpbWVTdHIucmVwbGFjZSgvWy06VF0vZywgJycpO1xuXG4gIGNvbnN0IGNvbnZlcnNhdGlvblRpdGxlID0gKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAnW2RhdGEtdGVzdC1pZD1cImNvbnZlcnNhdGlvbi10aXRsZVwiXSdcbiAgICApIGFzIEhUTUxFbGVtZW50IHwgbnVsbFxuICApPy5pbm5lclRleHQ/LnRyaW0oKTtcbiAgY29uc3QgZmlyc3RVc2VyTGluZXMgPSAodHVybnNbMF0/LnVzZXIgfHwgJycpXG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAoKGwpID0+IGwudHJpbSgpKVxuICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gIGNvbnN0IGZhbGxiYWNrVGl0bGUgPVxuICAgIGZpcnN0VXNlckxpbmVzLmZpbmQoKGwpID0+ICEvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KGwpKSB8fFxuICAgIGZpcnN0VXNlckxpbmVzWzBdIHx8XG4gICAgJ0dlbWluaSBjaGF0JztcbiAgY29uc3QgdGl0bGUgPSAoY29udmVyc2F0aW9uVGl0bGUgfHwgZmFsbGJhY2tUaXRsZSkuc2xpY2UoMCwgNjApO1xuXG4gIGNvbnN0IGNoYXRJZCA9IGdldENoYXRJZCgpO1xuICBjb25zdCBmcm9udG1hdHRlciA9IFtcbiAgICAnLS0tJyxcbiAgICBgaWQ6ICR7Y2hhdElkfWAsXG4gICAgYHRpdGxlOiBcIkdlbWluaTogJHt0aXRsZX1cImAsXG4gICAgYGRhdGU6ICR7dGltZVN0cn1gLFxuICAgIGBzb3VyY2U6ICR7bG9jYXRpb24uaHJlZn1gLFxuICAgICd0YWdzOiBbZ2VtaW5pLCBmbGVldGluZ10nLFxuICAgICctLS0nLFxuICBdLmpvaW4oJ1xcbicpO1xuXG4gIGNvbnN0IHNlY3Rpb25zID0gW2Zyb250bWF0dGVyXTtcbiAgZm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG4gICAgc2VjdGlvbnMucHVzaCgnJyk7XG4gICAgc2VjdGlvbnMucHVzaChgKipROioqICR7dHVybi51c2VyfWApO1xuICAgIHNlY3Rpb25zLnB1c2goJycpO1xuICAgIHNlY3Rpb25zLnB1c2goYCoqQToqKiAke3R1cm4ubW9kZWx9YCk7XG4gICAgc2VjdGlvbnMucHVzaCgnJyk7XG4gICAgc2VjdGlvbnMucHVzaCgnLS0tJyk7XG4gIH1cblxuICByZXR1cm4geyBtYXJrZG93bjogc2VjdGlvbnMuam9pbignXFxuJyksIGlkLCB0aXRsZSB9O1xufVxuXG4vLyAtLS0gRmlsZSBzYXZlIC0tLVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZU5vdGUoZm9yY2VQaWNrRGlyID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcbiAgYXdhaXQgbG9hZEFsbE1lc3NhZ2VzKCk7XG5cbiAgY29uc3QgdHVybnMgPSBleHRyYWN0Q2hhdENvbnRlbnQoKTtcbiAgaWYgKHR1cm5zLmxlbmd0aCA9PT0gMCkge1xuICAgIHNob3dFeHBvcnROb3RpZmljYXRpb24oJ+S/neWtmOOBp+OBjeOCi+S8muipseOBjOimi+OBpOOBi+OCiuOBvuOBm+OCkycsICdlcnJvcicpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBkaXJIYW5kbGU6IEZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGU7XG4gIHRyeSB7XG4gICAgaWYgKGZvcmNlUGlja0Rpcikge1xuICAgICAgY29uc3QgaGFuZGxlID0gYXdhaXQgd2luZG93LnNob3dEaXJlY3RvcnlQaWNrZXIoeyBtb2RlOiAncmVhZHdyaXRlJyB9KTtcbiAgICAgIGF3YWl0IHN0b3JlRGlySGFuZGxlKGhhbmRsZSk7XG4gICAgICBleHBvcnREaXJIYW5kbGUgPSBoYW5kbGU7XG4gICAgICBkaXJIYW5kbGUgPSBoYW5kbGU7XG4gICAgICBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKGDkv53lrZjlhYjjgpLlpInmm7Q6ICR7aGFuZGxlLm5hbWV9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpckhhbmRsZSA9IGF3YWl0IGdldEV4cG9ydERpckhhbmRsZSgpO1xuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBtYXJrZG93biwgdGl0bGUgfSA9IGdlbmVyYXRlTWFya2Rvd24odHVybnMpO1xuICBjb25zdCBjaGF0SWQgPSBnZXRDaGF0SWQoKTtcbiAgY29uc3Qgc2FmZVRpdGxlID0gdGl0bGVcbiAgICAucmVwbGFjZSgvW1xcXFwvOio/XCI8PnxdL2csICcnKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csICctJylcbiAgICAuc2xpY2UoMCwgNDApO1xuICBjb25zdCBmaWxlbmFtZSA9IGBnZW1pbmktJHtzYWZlVGl0bGV9LSR7Y2hhdElkfS5tZGA7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBpbmJveEhhbmRsZSA9IGF3YWl0IGRpckhhbmRsZS5nZXREaXJlY3RvcnlIYW5kbGUoJ2luYm94Jywge1xuICAgICAgY3JlYXRlOiB0cnVlLFxuICAgIH0pO1xuICAgIGNvbnN0IGZpbGVIYW5kbGUgPSBhd2FpdCBpbmJveEhhbmRsZS5nZXRGaWxlSGFuZGxlKGZpbGVuYW1lLCB7XG4gICAgICBjcmVhdGU6IHRydWUsXG4gICAgfSk7XG4gICAgY29uc3Qgd3JpdGFibGUgPSBhd2FpdCBmaWxlSGFuZGxlLmNyZWF0ZVdyaXRhYmxlKCk7XG4gICAgYXdhaXQgd3JpdGFibGUud3JpdGUobWFya2Rvd24pO1xuICAgIGF3YWl0IHdyaXRhYmxlLmNsb3NlKCk7XG4gICAgc2hvd0V4cG9ydE5vdGlmaWNhdGlvbihg5L+d5a2Y44GX44G+44GX44GfOiBpbmJveC8ke2ZpbGVuYW1lfWApO1xuICB9IGNhdGNoIHtcbiAgICBzaG93RXhwb3J0Tm90aWZpY2F0aW9uKCfkv53lrZjjgavlpLHmlZfjgZfjgb7jgZfjgZ8nLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vLyAtLS0gVUkgLS0tXG5cbmZ1bmN0aW9uIHNob3dFeHBvcnROb3RpZmljYXRpb24oXG4gIG1lc3NhZ2U6IHN0cmluZyxcbiAgdHlwZTogJ3N1Y2Nlc3MnIHwgJ2Vycm9yJyA9ICdzdWNjZXNzJ1xuKTogdm9pZCB7XG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dlbWluaS1leHBvcnQtbm90aWZpY2F0aW9uJyk7XG4gIGlmIChleGlzdGluZykgZXhpc3RpbmcucmVtb3ZlKCk7XG5cbiAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgZWwuaWQgPSAnZ2VtaW5pLWV4cG9ydC1ub3RpZmljYXRpb24nO1xuICBlbC5zdHlsZS5jc3NUZXh0ID0gYFxuICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICBib3R0b206IDI0cHg7XG4gICAgcmlnaHQ6IDI0cHg7XG4gICAgYmFja2dyb3VuZDogJHt0eXBlID09PSAnZXJyb3InID8gJyNjNjI4MjgnIDogJyMxYjVlMjAnfTtcbiAgICBjb2xvcjogd2hpdGU7XG4gICAgcGFkZGluZzogMTJweCAyMHB4O1xuICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICB6LWluZGV4OiAxMDAwMDtcbiAgICBmb250LWZhbWlseTogc3lzdGVtLXVpLCBzYW5zLXNlcmlmO1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBib3gtc2hhZG93OiAwIDRweCAxMnB4IHJnYmEoMCwwLDAsMC4zKTtcbiAgYDtcbiAgZWwudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTtcbiAgc2V0VGltZW91dCgoKSA9PiBlbC5yZW1vdmUoKSwgMzAwMCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUV4cG9ydEJ1dHRvbigpOiB2b2lkIHtcbiAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKEVYUE9SVF9CVVRUT05fSUQpKSByZXR1cm47XG5cbiAgY29uc3QgaW5wdXRBcmVhID1cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dC1hcmVhLXYyJykgfHxcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dC1jb250YWluZXInKTtcbiAgaWYgKCFpbnB1dEFyZWEpIHJldHVybjtcblxuICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgYnRuLmlkID0gRVhQT1JUX0JVVFRPTl9JRDtcbiAgYnRuLnRpdGxlID1cbiAgICAnU2F2ZSBhcyBaZXR0ZWxrYXN0ZW4gbm90ZVxcblNoaWZ0K+OCr+ODquODg+OCr+OBp+S/neWtmOWFiOOCkuWkieabtCc7XG4gIGJ0bi50ZXh0Q29udGVudCA9ICfwn5K+IFNhdmUgbm90ZSc7XG4gIGJ0bi5zdHlsZS5jc3NUZXh0ID0gYFxuICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICBib3R0b206IDEwMHB4O1xuICAgIHJpZ2h0OiAyNHB4O1xuICAgIGJhY2tncm91bmQ6ICMxYTczZTg7XG4gICAgY29sb3I6IHdoaXRlO1xuICAgIGJvcmRlcjogbm9uZTtcbiAgICBib3JkZXItcmFkaXVzOiAyMHB4O1xuICAgIHBhZGRpbmc6IDhweCAxNnB4O1xuICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICBmb250LWZhbWlseTogc3lzdGVtLXVpLCBzYW5zLXNlcmlmO1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICB6LWluZGV4OiA5OTk5O1xuICAgIGJveC1zaGFkb3c6IDAgMnB4IDhweCByZ2JhKDAsMCwwLDAuMjUpO1xuICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4ycztcbiAgYDtcblxuICBidG4uYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsICgpID0+IHtcbiAgICBidG4uc3R5bGUuYmFja2dyb3VuZCA9ICcjMTU1N2IwJztcbiAgfSk7XG4gIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgKCkgPT4ge1xuICAgIGJ0bi5zdHlsZS5iYWNrZ3JvdW5kID0gJyMxYTczZTgnO1xuICB9KTtcbiAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHNhdmVOb3RlKGUuc2hpZnRLZXkpKTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGJ0bik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplRXhwb3J0KCk6IHZvaWQge1xuICBjb25zdCBjaGF0SWQgPSBnZXRDaGF0SWQoKTtcbiAgaWYgKCFjaGF0SWQgfHwgY2hhdElkID09PSAnYXBwJykgcmV0dXJuO1xuICBjcmVhdGVFeHBvcnRCdXR0b24oKTtcbn1cbiIsIi8vIEtleWJvYXJkIGV2ZW50IGhhbmRsZXJzXG5cbmltcG9ydCB7IGlzU2hvcnRjdXQsIGxvYWRTaG9ydGN1dHMsIGdldFNob3J0Y3V0cyB9IGZyb20gJy4vc2V0dGluZ3MnO1xuaW1wb3J0IHsgaXNBdXRvY29tcGxldGVWaXNpYmxlIH0gZnJvbSAnLi9hdXRvY29tcGxldGUnO1xuaW1wb3J0IHtcbiAgc2Nyb2xsQ2hhdEFyZWEsXG4gIGZvY3VzVGV4dGFyZWEsXG4gIHRvZ2dsZVNpZGViYXIsXG4gIGdldEFsbEFjdGlvbkJ1dHRvbnMsXG4gIGZvY3VzQWN0aW9uQnV0dG9uLFxuICBtb3ZlQmV0d2VlbkFjdGlvbkJ1dHRvbnMsXG59IGZyb20gJy4vY2hhdCc7XG5pbXBvcnQge1xuICBpc0hpc3RvcnlTZWxlY3Rpb25Nb2RlLFxuICBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUsXG4gIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUsXG4gIG1vdmVIaXN0b3J5VXAsXG4gIG1vdmVIaXN0b3J5RG93bixcbiAgb3BlblNlbGVjdGVkSGlzdG9yeSxcbn0gZnJvbSAnLi9oaXN0b3J5JztcbmltcG9ydCB7XG4gIGlzU2VhcmNoUGFnZSxcbiAgdG9nZ2xlU2VhcmNoUGFnZSxcbiAgbW92ZVNlYXJjaFJlc3VsdFVwLFxuICBtb3ZlU2VhcmNoUmVzdWx0RG93bixcbiAgb3BlblNlbGVjdGVkU2VhcmNoUmVzdWx0LFxufSBmcm9tICcuL3NlYXJjaCc7XG5pbXBvcnQgeyBzYXZlTm90ZSB9IGZyb20gJy4vZXhwb3J0JztcblxubGV0IGxhc3RGb2N1c2VkQWN0aW9uQnV0dG9uSW5kZXggPSAtMTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb24oaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICBsYXN0Rm9jdXNlZEFjdGlvbkJ1dHRvbkluZGV4ID0gaW5kZXg7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVNlYXJjaFBhZ2VLZXlkb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG4gIGlmIChpc0F1dG9jb21wbGV0ZVZpc2libGUoKSkge1xuICAgIGlmIChcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0Fycm93VXAnIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdBcnJvd0Rvd24nIHx8XG4gICAgICBldmVudC5rZXkgPT09ICdFbnRlcicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ1RhYicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0VzY2FwZSdcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQubmF2aWdhdGVUb1NlYXJjaCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB0b2dnbGVTZWFyY2hQYWdlKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5tb3ZlVXAnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG4gICAgbW92ZVNlYXJjaFJlc3VsdFVwKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ3NlYXJjaC5tb3ZlRG93bicpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbiAgICBtb3ZlU2VhcmNoUmVzdWx0RG93bigpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdzZWFyY2gub3BlblJlc3VsdCcpKSB7XG4gICAgaWYgKGV2ZW50LmlzQ29tcG9zaW5nKSByZXR1cm4gZmFsc2U7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBldmVudC5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcbiAgICBvcGVuU2VsZWN0ZWRTZWFyY2hSZXN1bHQoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLnNjcm9sbFVwJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHdpbmRvdy5zY3JvbGxCeSh7IHRvcDogLXdpbmRvdy5pbm5lckhlaWdodCAqIDAuOCwgYmVoYXZpb3I6ICdhdXRvJyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnc2VhcmNoLnNjcm9sbERvd24nKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgd2luZG93LnNjcm9sbEJ5KHsgdG9wOiB3aW5kb3cuaW5uZXJIZWlnaHQgKiAwLjgsIGJlaGF2aW9yOiAnYXV0bycgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBzaG9ydGN1dHMgPSBnZXRTaG9ydGN1dHMoKTtcbiAgY29uc3QgY2hhdEtleXMgPSBPYmplY3QudmFsdWVzKHNob3J0Y3V0cy5jaGF0KTtcbiAgaWYgKGNoYXRLZXlzLmluY2x1ZGVzKGV2ZW50LmNvZGUpKSByZXR1cm4gdHJ1ZTtcblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUNoYXRQYWdlS2V5ZG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuICBjb25zdCBpc0luSW5wdXQgPSAoZXZlbnQudGFyZ2V0IGFzIEVsZW1lbnQpLm1hdGNoZXMoXG4gICAgJ2lucHV0LCB0ZXh0YXJlYSwgW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nXG4gICk7XG5cbiAgaWYgKGlzQXV0b2NvbXBsZXRlVmlzaWJsZSgpKSB7XG4gICAgaWYgKFxuICAgICAgZXZlbnQua2V5ID09PSAnQXJyb3dVcCcgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0Fycm93RG93bicgfHxcbiAgICAgIGV2ZW50LmtleSA9PT0gJ0VudGVyJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnVGFiJyB8fFxuICAgICAgZXZlbnQua2V5ID09PSAnRXNjYXBlJ1xuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChldmVudC5jb2RlID09PSAnSG9tZScgJiYgIWV2ZW50Lm1ldGFLZXkgJiYgIWV2ZW50LmN0cmxLZXkgJiYgIWlzSW5JbnB1dCkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgc2F2ZU5vdGUoZXZlbnQuc2hpZnRLZXkpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGV2ZW50LmN0cmxLZXkgJiYgZXZlbnQuc2hpZnRLZXkgJiYgZXZlbnQuY29kZSA9PT0gJ0tleUQnKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB3aW5kb3cuZG9tQW5hbHl6ZXI/LmNvcHlUb0NsaXBib2FyZCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lm5hdmlnYXRlVG9TZWFyY2gnKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgdG9nZ2xlU2VhcmNoUGFnZSgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnRvZ2dsZVNpZGViYXInKSkge1xuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgdG9nZ2xlU2lkZWJhcigpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0LnRvZ2dsZUhpc3RvcnlNb2RlJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgY29uc3QgYWN0aW9uQnV0dG9ucyA9IGdldEFsbEFjdGlvbkJ1dHRvbnMoKTtcbiAgICBjb25zdCBoYXNSZXNwb25zZXMgPSBhY3Rpb25CdXR0b25zLmxlbmd0aCA+IDA7XG5cbiAgICBpZiAoaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpKSB7XG4gICAgICBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIGZvY3VzVGV4dGFyZWEoKTtcbiAgICB9IGVsc2UgaWYgKGlzSW5JbnB1dCkge1xuICAgICAgaWYgKGhhc1Jlc3BvbnNlcykge1xuICAgICAgICBsZXQgdGFyZ2V0SW5kZXggPSBsYXN0Rm9jdXNlZEFjdGlvbkJ1dHRvbkluZGV4O1xuICAgICAgICBpZiAodGFyZ2V0SW5kZXggPCAwIHx8IHRhcmdldEluZGV4ID49IGFjdGlvbkJ1dHRvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgdGFyZ2V0SW5kZXggPSBhY3Rpb25CdXR0b25zLmxlbmd0aCAtIDE7XG4gICAgICAgIH1cbiAgICAgICAgYWN0aW9uQnV0dG9uc1t0YXJnZXRJbmRleF0uZm9jdXMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVudGVySGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZm9jdXNlZEVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50IGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgIGNvbnN0IGlzQWN0aW9uQnV0dG9uID1cbiAgICAgICAgZm9jdXNlZEVsZW1lbnQgJiZcbiAgICAgICAgKGZvY3VzZWRFbGVtZW50LmNsYXNzTGlzdD8uY29udGFpbnMoJ2RlZXAtZGl2ZS1idXR0b24taW5saW5lJykgfHxcbiAgICAgICAgICBmb2N1c2VkRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJykgPT09ICdkZWVwLWRpdmUnKTtcbiAgICAgIGlmIChpc0FjdGlvbkJ1dHRvbikge1xuICAgICAgICBjb25zdCBjdXJyZW50SW5kZXggPSBhY3Rpb25CdXR0b25zLmZpbmRJbmRleChcbiAgICAgICAgICAoYnRuKSA9PiBidG4gPT09IGZvY3VzZWRFbGVtZW50XG4gICAgICAgICk7XG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggIT09IC0xKSBsYXN0Rm9jdXNlZEFjdGlvbkJ1dHRvbkluZGV4ID0gY3VycmVudEluZGV4O1xuICAgICAgICBlbnRlckhpc3RvcnlTZWxlY3Rpb25Nb2RlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb2N1c1RleHRhcmVhKCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKGlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKSAmJiBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5RXhpdCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5zY3JvbGxVcCcpKSB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBzY3JvbGxDaGF0QXJlYSgndXAnKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5zY3JvbGxEb3duJykpIHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIHNjcm9sbENoYXRBcmVhKCdkb3duJyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpKSB7XG4gICAgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlVcCcpKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgbW92ZUhpc3RvcnlVcCgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIGlmIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5RG93bicpKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgbW92ZUhpc3RvcnlEb3duKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGlzU2hvcnRjdXQoZXZlbnQsICdjaGF0Lmhpc3RvcnlPcGVuJykpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBvcGVuU2VsZWN0ZWRIaXN0b3J5KCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgIWlzSGlzdG9yeVNlbGVjdGlvbk1vZGUoKSAmJlxuICAgIGlzSW5JbnB1dCAmJlxuICAgIChpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSB8fCBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5RG93bicpKVxuICApIHtcbiAgICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICk7XG4gICAgaWYgKHRleHRhcmVhICYmIHRleHRhcmVhLnRleHRDb250ZW50Py50cmltKCkgPT09ICcnKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgY29uc3QgZGlyZWN0aW9uID0gaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykgPyAndXAnIDogJ2Rvd24nO1xuICAgICAgZm9jdXNBY3Rpb25CdXR0b24oZGlyZWN0aW9uKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghaXNIaXN0b3J5U2VsZWN0aW9uTW9kZSgpICYmICFpc0luSW5wdXQpIHtcbiAgICBjb25zdCBmb2N1c2VkRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGNvbnN0IGlzQWN0aW9uQnV0dG9uID1cbiAgICAgIGZvY3VzZWRFbGVtZW50ICYmXG4gICAgICAoZm9jdXNlZEVsZW1lbnQuY2xhc3NMaXN0Py5jb250YWlucygnZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKSB8fFxuICAgICAgICBmb2N1c2VkRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJykgPT09ICdkZWVwLWRpdmUnKTtcblxuICAgIGlmIChpc0FjdGlvbkJ1dHRvbikge1xuICAgICAgaWYgKFxuICAgICAgICBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5VXAnKSB8fFxuICAgICAgICBpc1Nob3J0Y3V0KGV2ZW50LCAnY2hhdC5oaXN0b3J5RG93bicpXG4gICAgICApIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeVVwJykgPyAndXAnIDogJ2Rvd24nO1xuICAgICAgICBtb3ZlQmV0d2VlbkFjdGlvbkJ1dHRvbnMoZGlyZWN0aW9uKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChldmVudC5rZXkgPT09ICdBcnJvd1JpZ2h0JyB8fCBldmVudC5rZXkgPT09ICdBcnJvd0xlZnQnKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIGNvbnN0IGV4cGFuZEJ1dHRvbiA9IChmb2N1c2VkRWxlbWVudCBhcyBhbnkpLl9leHBhbmRCdXR0b24gYXMgSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IChmb2N1c2VkRWxlbWVudCBhcyBhbnkpLl9kZWVwRGl2ZVRhcmdldDtcbiAgICAgICAgaWYgKGV4cGFuZEJ1dHRvbiAmJiB0YXJnZXQpIHtcbiAgICAgICAgICBjb25zdCBpc0V4cGFuZGVkID1cbiAgICAgICAgICAgIGV4cGFuZEJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJykgPT09ICdjb2xsYXBzZSc7XG4gICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnICYmICFpc0V4cGFuZGVkKSB7XG4gICAgICAgICAgICBleHBhbmRCdXR0b24uY2xpY2soKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcgJiYgaXNFeHBhbmRlZCkge1xuICAgICAgICAgICAgZXhwYW5kQnV0dG9uLmNsaWNrKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNTaG9ydGN1dChldmVudCwgJ2NoYXQuaGlzdG9yeU9wZW4nKSkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBmb2N1c2VkRWxlbWVudC5jbGljaygpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplS2V5Ym9hcmRIYW5kbGVycygpOiB2b2lkIHtcbiAgbG9hZFNob3J0Y3V0cygpLnRoZW4oKCkgPT4ge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAna2V5ZG93bicsXG4gICAgICAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGlzU2VhcmNoUGFnZSgpKSB7XG4gICAgICAgICAgaGFuZGxlU2VhcmNoUGFnZUtleWRvd24oZXZlbnQpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBoYW5kbGVDaGF0UGFnZUtleWRvd24oZXZlbnQpO1xuICAgICAgfSxcbiAgICAgIHRydWVcbiAgICApO1xuICB9KTtcbn1cbiIsIi8vIERlZXAgZGl2ZSBmdW5jdGlvbmFsaXR5IGZvciBHZW1pbmkgcmVzcG9uc2VzXG5cbmludGVyZmFjZSBEZWVwRGl2ZU1vZGUge1xuICBpZDogc3RyaW5nO1xuICBwcm9tcHQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBEZWVwRGl2ZVRhcmdldCB7XG4gIHR5cGU6ICdzZWN0aW9uJyB8ICd0YWJsZScgfCAnYmxvY2txdW90ZScgfCAnbGlzdCcgfCAnY2hpbGQnO1xuICBlbGVtZW50OiBIVE1MRWxlbWVudDtcbiAgZ2V0Q29udGVudDogKCkgPT4gc3RyaW5nO1xuICBleHBhbmRCdXR0b25JZD86IHN0cmluZztcbn1cblxuY29uc3QgREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM6IERlZXBEaXZlTW9kZVtdID0gW1xuICB7IGlkOiAnZGVmYXVsdCcsIHByb21wdDogJ+OBk+OCjOOBq+OBpOOBhOOBpuips+OBl+OBjycgfSxcbl07XG5cbmZ1bmN0aW9uIGFkZERlZXBEaXZlQnV0dG9ucygpOiB2b2lkIHtcbiAgY29uc3QgcmVzcG9uc2VDb250YWluZXJzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1hcmtkb3duLW1haW4tcGFuZWwnKTtcbiAgaWYgKHJlc3BvbnNlQ29udGFpbmVycy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICByZXNwb25zZUNvbnRhaW5lcnMuZm9yRWFjaCgocmVzcG9uc2VDb250YWluZXIpID0+IHtcbiAgICBjb25zdCB0YXJnZXRzOiBEZWVwRGl2ZVRhcmdldFtdID0gW107XG5cbiAgICBjb25zdCBoZWFkaW5ncyA9IHJlc3BvbnNlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2gxW2RhdGEtcGF0aC10by1ub2RlXSwgaDJbZGF0YS1wYXRoLXRvLW5vZGVdLCBoM1tkYXRhLXBhdGgtdG8tbm9kZV0sIGg0W2RhdGEtcGF0aC10by1ub2RlXSwgaDVbZGF0YS1wYXRoLXRvLW5vZGVdLCBoNltkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgKTtcbiAgICBjb25zdCBoYXNIZWFkaW5ncyA9IGhlYWRpbmdzLmxlbmd0aCA+IDA7XG5cbiAgICBpZiAoaGFzSGVhZGluZ3MpIHtcbiAgICAgIGhlYWRpbmdzLmZvckVhY2goKGhlYWRpbmcpID0+IHtcbiAgICAgICAgaWYgKGhlYWRpbmcucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJykpIHJldHVybjtcbiAgICAgICAgdGFyZ2V0cy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiAnc2VjdGlvbicsXG4gICAgICAgICAgZWxlbWVudDogaGVhZGluZyxcbiAgICAgICAgICBnZXRDb250ZW50OiAoKSA9PiBnZXRTZWN0aW9uQ29udGVudChoZWFkaW5nKSxcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgdGFibGVzID0gcmVzcG9uc2VDb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICd0YWJsZVtkYXRhLXBhdGgtdG8tbm9kZV0nXG4gICAgICApO1xuICAgICAgdGFibGVzLmZvckVhY2goKHRhYmxlKSA9PiB7XG4gICAgICAgIGNvbnN0IHdyYXBwZXIgPSB0YWJsZS5jbG9zZXN0PEhUTUxFbGVtZW50PignLnRhYmxlLWJsb2NrLWNvbXBvbmVudCcpO1xuICAgICAgICBpZiAod3JhcHBlciAmJiAhd3JhcHBlci5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKSkge1xuICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiAndGFibGUnLFxuICAgICAgICAgICAgZWxlbWVudDogd3JhcHBlcixcbiAgICAgICAgICAgIGdldENvbnRlbnQ6ICgpID0+IGdldFRhYmxlQ29udGVudCh0YWJsZSksXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB0YWJsZXMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ3RhYmxlW2RhdGEtcGF0aC10by1ub2RlXSdcbiAgICAgICk7XG4gICAgICB0YWJsZXMuZm9yRWFjaCgodGFibGUpID0+IHtcbiAgICAgICAgY29uc3Qgd3JhcHBlciA9IHRhYmxlLmNsb3Nlc3Q8SFRNTEVsZW1lbnQ+KCcudGFibGUtYmxvY2stY29tcG9uZW50Jyk7XG4gICAgICAgIGlmICh3cmFwcGVyICYmICF3cmFwcGVyLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtYnV0dG9uLWlubGluZScpKSB7XG4gICAgICAgICAgdGFyZ2V0cy5wdXNoKHtcbiAgICAgICAgICAgIHR5cGU6ICd0YWJsZScsXG4gICAgICAgICAgICBlbGVtZW50OiB3cmFwcGVyLFxuICAgICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0VGFibGVDb250ZW50KHRhYmxlKSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGJsb2NrcXVvdGVzID0gcmVzcG9uc2VDb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXG4gICAgICAgICdibG9ja3F1b3RlW2RhdGEtcGF0aC10by1ub2RlXSdcbiAgICAgICk7XG4gICAgICBibG9ja3F1b3Rlcy5mb3JFYWNoKChibG9ja3F1b3RlKSA9PiB7XG4gICAgICAgIGlmICghYmxvY2txdW90ZS5xdWVyeVNlbGVjdG9yKCcuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUnKSkge1xuICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiAnYmxvY2txdW90ZScsXG4gICAgICAgICAgICBlbGVtZW50OiBibG9ja3F1b3RlLFxuICAgICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gYmxvY2txdW90ZS50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgbGlzdHMgPSByZXNwb25zZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcbiAgICAgICAgJ29sW2RhdGEtcGF0aC10by1ub2RlXSwgdWxbZGF0YS1wYXRoLXRvLW5vZGVdJ1xuICAgICAgKTtcbiAgICAgIGxpc3RzLmZvckVhY2goKGxpc3QpID0+IHtcbiAgICAgICAgaWYgKGxpc3QucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1idXR0b24taW5saW5lJykpIHJldHVybjtcblxuICAgICAgICBsZXQgcGFyZW50ID0gbGlzdC5wYXJlbnRFbGVtZW50O1xuICAgICAgICBsZXQgaXNOZXN0ZWQgPSBmYWxzZTtcbiAgICAgICAgd2hpbGUgKHBhcmVudCAmJiBwYXJlbnQgIT09IHJlc3BvbnNlQ29udGFpbmVyKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHBhcmVudC50YWdOYW1lID09PSAnT0wnIHx8IHBhcmVudC50YWdOYW1lID09PSAnVUwnKSAmJlxuICAgICAgICAgICAgcGFyZW50Lmhhc0F0dHJpYnV0ZSgnZGF0YS1wYXRoLXRvLW5vZGUnKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgaXNOZXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc05lc3RlZCkgcmV0dXJuO1xuXG4gICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgdHlwZTogJ2xpc3QnLFxuICAgICAgICAgIGVsZW1lbnQ6IGxpc3QsXG4gICAgICAgICAgZ2V0Q29udGVudDogKCkgPT4gZ2V0TGlzdENvbnRlbnQobGlzdCksXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGFyZ2V0cy5mb3JFYWNoKCh0YXJnZXQpID0+IGFkZERlZXBEaXZlQnV0dG9uKHRhcmdldCkpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZ2V0U2VjdGlvbkNvbnRlbnQoaGVhZGluZzogSFRNTEVsZW1lbnQpOiBzdHJpbmcge1xuICBsZXQgY29udGVudCA9IChoZWFkaW5nLnRleHRDb250ZW50Py50cmltKCkgPz8gJycpICsgJ1xcblxcbic7XG4gIGxldCBjdXJyZW50ID0gaGVhZGluZy5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXG4gIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnRlbnQgKz0gKGN1cnJlbnQudGV4dENvbnRlbnQ/LnRyaW0oKSA/PyAnJykgKyAnXFxuXFxuJztcbiAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICB9XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRUYWJsZUNvbnRlbnQodGFibGU6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcbiAgbGV0IGNvbnRlbnQgPSAnJztcbiAgY29uc3Qgcm93cyA9IHRhYmxlLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTFRhYmxlUm93RWxlbWVudD4oJ3RyJyk7XG5cbiAgcm93cy5mb3JFYWNoKChyb3csIHJvd0luZGV4KSA9PiB7XG4gICAgY29uc3QgY2VsbHMgPSByb3cucXVlcnlTZWxlY3RvckFsbCgndGQsIHRoJyk7XG4gICAgY29uc3QgY2VsbFRleHRzID0gQXJyYXkuZnJvbShjZWxscykubWFwKChjZWxsKSA9PlxuICAgICAgY2VsbC50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnXG4gICAgKTtcbiAgICBjb250ZW50ICs9ICd8ICcgKyBjZWxsVGV4dHMuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIGlmIChyb3dJbmRleCA9PT0gMCkge1xuICAgICAgY29udGVudCArPSAnfCAnICsgY2VsbFRleHRzLm1hcCgoKSA9PiAnLS0tJykuam9pbignIHwgJykgKyAnIHxcXG4nO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGNvbnRlbnQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRMaXN0Q29udGVudChsaXN0OiBIVE1MRWxlbWVudCk6IHN0cmluZyB7XG4gIHJldHVybiBsaXN0LnRleHRDb250ZW50Py50cmltKCkgPz8gJyc7XG59XG5cbnR5cGUgRGVlcERpdmVCdXR0b25FbGVtZW50ID0gSFRNTEJ1dHRvbkVsZW1lbnQgJiB7XG4gIF9kZWVwRGl2ZVRhcmdldD86IERlZXBEaXZlVGFyZ2V0O1xuICBfZXhwYW5kQnV0dG9uPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG59O1xuXG5mdW5jdGlvbiBhZGREZWVwRGl2ZUJ1dHRvbih0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0KTogdm9pZCB7XG4gIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpIGFzIERlZXBEaXZlQnV0dG9uRWxlbWVudDtcbiAgYnV0dG9uLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtYnV0dG9uLWlubGluZSc7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnRGVlcCBkaXZlIGludG8gdGhpcyBjb250ZW50Jyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2RlZXAtZGl2ZScpO1xuICBidXR0b24udGl0bGUgPSAnRGVlcCBkaXZlIGludG8gdGhpcyBjb250ZW50JztcbiAgYnV0dG9uLl9kZWVwRGl2ZVRhcmdldCA9IHRhcmdldDtcblxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuICBzdmcuc2V0QXR0cmlidXRlKCd3aWR0aCcsICcxNicpO1xuICBzdmcuc2V0QXR0cmlidXRlKCdoZWlnaHQnLCAnMTYnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgMjQgMjQnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdjdXJyZW50Q29sb3InKTtcbiAgY29uc3QgcGF0aCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAncGF0aCcpO1xuICBwYXRoLnNldEF0dHJpYnV0ZSgnZCcsICdNMTkgMTVsLTYgNi0xLjUtMS41TDE1IDE2SDRWOWgydjVoOWwtMy41LTMuNUwxMyA5bDYgNnonKTtcbiAgc3ZnLmFwcGVuZENoaWxkKHBhdGgpO1xuICBidXR0b24uYXBwZW5kQ2hpbGQoc3ZnKTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIGluc2VydERlZXBEaXZlUXVlcnkodGFyZ2V0LCBlLmN0cmxLZXkpO1xuICB9KTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgaWYgKGUuYWx0S2V5ICYmIGUua2V5ID09PSAnQXJyb3dSaWdodCcpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBzaG93VGVtcGxhdGVQb3B1cChidXR0b24sIHRhcmdldCk7XG4gICAgfVxuICB9KTtcblxuICBsZXQgZXhwYW5kQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJyB8fCB0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgZXhwYW5kQnV0dG9uID0gY3JlYXRlRXhwYW5kQnV0dG9uKHRhcmdldCk7XG4gICAgYnV0dG9uLl9leHBhbmRCdXR0b24gPSBleHBhbmRCdXR0b247XG4gIH1cblxuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5nYXAgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIGlmIChleHBhbmRCdXR0b24pIHRhcmdldC5lbGVtZW50LmFwcGVuZENoaWxkKGV4cGFuZEJ1dHRvbik7XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICd0YWJsZScpIHtcbiAgICBjb25zdCBmb290ZXIgPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnRhYmxlLWZvb3RlcicpO1xuICAgIGlmIChmb290ZXIpIHtcbiAgICAgIGNvbnN0IGNvcHlCdXR0b24gPSBmb290ZXIucXVlcnlTZWxlY3RvcignLmNvcHktYnV0dG9uJyk7XG4gICAgICBpZiAoY29weUJ1dHRvbikge1xuICAgICAgICBmb290ZXIuaW5zZXJ0QmVmb3JlKGJ1dHRvbiwgY29weUJ1dHRvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb290ZXIuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdibG9ja3F1b3RlJykge1xuICAgIHRhcmdldC5lbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcbiAgICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICAgIGJ1dHRvbi5zdHlsZS50b3AgPSAnOHB4JztcbiAgICBidXR0b24uc3R5bGUucmlnaHQgPSAnOHB4JztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICB9IGVsc2UgaWYgKHRhcmdldC50eXBlID09PSAnbGlzdCcpIHtcbiAgICB0YXJnZXQuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG4gICAgYnV0dG9uLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbiAgICBidXR0b24uc3R5bGUudG9wID0gJzAnO1xuICAgIGJ1dHRvbi5zdHlsZS5yaWdodCA9ICcwJztcbiAgICB0YXJnZXQuZWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIGlmIChleHBhbmRCdXR0b24pIHtcbiAgICAgIGV4cGFuZEJ1dHRvbi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG4gICAgICBleHBhbmRCdXR0b24uc3R5bGUudG9wID0gJzAnO1xuICAgICAgZXhwYW5kQnV0dG9uLnN0eWxlLnJpZ2h0ID0gJzMycHgnO1xuICAgICAgdGFyZ2V0LmVsZW1lbnQuYXBwZW5kQ2hpbGQoZXhwYW5kQnV0dG9uKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlRXhwYW5kQnV0dG9uKHRhcmdldDogRGVlcERpdmVUYXJnZXQpOiBIVE1MQnV0dG9uRWxlbWVudCB7XG4gIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuICBidXR0b24uY2xhc3NOYW1lID0gJ2RlZXAtZGl2ZS1leHBhbmQtYnV0dG9uJztcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdFeHBhbmQgdG8gc2VsZWN0Jyk7XG4gIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2RhdGEtYWN0aW9uJywgJ2V4cGFuZCcpO1xuICBidXR0b24uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpO1xuICBidXR0b24udGl0bGUgPSAnRXhwYW5kIHRvIHNlbGVjdCc7XG4gIGJ1dHRvbi50ZXh0Q29udGVudCA9ICcrJztcbiAgYnV0dG9uLnN0eWxlLmZvbnRTaXplID0gJzE0cHgnO1xuICBidXR0b24uc3R5bGUuZm9udFdlaWdodCA9ICdib2xkJztcblxuICBidXR0b24uZGF0YXNldC50YXJnZXRJZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA5KTtcbiAgdGFyZ2V0LmV4cGFuZEJ1dHRvbklkID0gYnV0dG9uLmRhdGFzZXQudGFyZ2V0SWQ7XG5cbiAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICB0b2dnbGVFeHBhbmQodGFyZ2V0LCBidXR0b24pO1xuICB9KTtcblxuICByZXR1cm4gYnV0dG9uO1xufVxuXG5mdW5jdGlvbiB0b2dnbGVFeHBhbmQodGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCwgYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBpc0V4cGFuZGVkID0gYnV0dG9uLmdldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nKSA9PT0gJ2NvbGxhcHNlJztcblxuICBpZiAoaXNFeHBhbmRlZCkge1xuICAgIGNvbGxhcHNlQ2hpbGRCdXR0b25zKHRhcmdldCk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnZXhwYW5kJyk7XG4gICAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdFeHBhbmQgdG8gc2VsZWN0Jyk7XG4gICAgYnV0dG9uLnRpdGxlID0gJ0V4cGFuZCB0byBzZWxlY3QnO1xuICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICcrJztcbiAgfSBlbHNlIHtcbiAgICBleHBhbmRDaGlsZEJ1dHRvbnModGFyZ2V0KTtcbiAgICBidXR0b24uc2V0QXR0cmlidXRlKCdkYXRhLWFjdGlvbicsICdjb2xsYXBzZScpO1xuICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnQ29sbGFwc2UnKTtcbiAgICBidXR0b24udGl0bGUgPSAnQ29sbGFwc2UnO1xuICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9ICctJztcbiAgfVxufVxuXG5mdW5jdGlvbiBleHBhbmRDaGlsZEJ1dHRvbnModGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIGNvbnN0IGhlYWRpbmcgPSB0YXJnZXQuZWxlbWVudDtcbiAgICBsZXQgY3VycmVudCA9IGhlYWRpbmcubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblxuICAgIHdoaWxlIChjdXJyZW50ICYmICFjdXJyZW50Lm1hdGNoZXMoJ2gxLCBoMiwgaDMsIGg0LCBoNSwgaDYsIGhyJykpIHtcbiAgICAgIGlmIChjdXJyZW50LmNsYXNzTGlzdC5jb250YWlucygndGFibGUtYmxvY2stY29tcG9uZW50JykpIHtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoY3VycmVudC50YWdOYW1lID09PSAnUCcgJiYgIWN1cnJlbnQucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKSkge1xuICAgICAgICBhZGRDaGlsZEJ1dHRvbihjdXJyZW50KTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgKGN1cnJlbnQudGFnTmFtZSA9PT0gJ1VMJyB8fCBjdXJyZW50LnRhZ05hbWUgPT09ICdPTCcpICYmXG4gICAgICAgIGN1cnJlbnQuaGFzQXR0cmlidXRlKCdkYXRhLXBhdGgtdG8tbm9kZScpXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgaXRlbXMgPSBjdXJyZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCc6c2NvcGUgPiBsaScpO1xuICAgICAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgaWYgKCFpdGVtLnF1ZXJ5U2VsZWN0b3IoJy5kZWVwLWRpdmUtY2hpbGQtYnV0dG9uJykpIHtcbiAgICAgICAgICAgIGFkZENoaWxkQnV0dG9uKGl0ZW0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0RWxlbWVudFNpYmxpbmcgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0YXJnZXQudHlwZSA9PT0gJ2xpc3QnKSB7XG4gICAgY29uc3QgaXRlbXMgPSB0YXJnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignOnNjb3BlID4gbGknKTtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICBpZiAoIWl0ZW0ucXVlcnlTZWxlY3RvcignLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKSkge1xuICAgICAgICBhZGRDaGlsZEJ1dHRvbihpdGVtKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRDaGlsZEJ1dHRvbihlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblxuICBjb25zdCBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgYnV0dG9uLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtYnV0dG9uLWlubGluZSBkZWVwLWRpdmUtY2hpbGQtYnV0dG9uJztcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnKTtcbiAgYnV0dG9uLnNldEF0dHJpYnV0ZSgnZGF0YS1hY3Rpb24nLCAnZGVlcC1kaXZlJyk7XG4gIGJ1dHRvbi50aXRsZSA9ICdEZWVwIGRpdmUgaW50byB0aGlzIGNvbnRlbnQnO1xuICBidXR0b24uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuICBidXR0b24uc3R5bGUudG9wID0gJzAnO1xuICBidXR0b24uc3R5bGUucmlnaHQgPSAnMCc7XG5cbiAgY29uc3Qgc3ZnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdzdmcnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCAnMTYnKTtcbiAgc3ZnLnNldEF0dHJpYnV0ZSgnaGVpZ2h0JywgJzE2Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ3ZpZXdCb3gnLCAnMCAwIDI0IDI0Jyk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCAnY3VycmVudENvbG9yJyk7XG4gIGNvbnN0IHBhdGggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3BhdGgnKTtcbiAgcGF0aC5zZXRBdHRyaWJ1dGUoJ2QnLCAnTTE5IDE1bC02IDYtMS41LTEuNUwxNSAxNkg0VjloMnY1aDlsLTMuNS0zLjVMMTMgOWw2IDZ6Jyk7XG4gIHN2Zy5hcHBlbmRDaGlsZChwYXRoKTtcbiAgYnV0dG9uLmFwcGVuZENoaWxkKHN2Zyk7XG5cbiAgY29uc3QgY2hpbGRUYXJnZXQ6IERlZXBEaXZlVGFyZ2V0ID0ge1xuICAgIHR5cGU6ICdjaGlsZCcsXG4gICAgZWxlbWVudCxcbiAgICBnZXRDb250ZW50OiAoKSA9PiBlbGVtZW50LnRleHRDb250ZW50Py50cmltKCkgPz8gJycsXG4gIH07XG5cbiAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBpbnNlcnREZWVwRGl2ZVF1ZXJ5KGNoaWxkVGFyZ2V0LCBlLmN0cmxLZXkpO1xuICB9KTtcblxuICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgaWYgKGUuYWx0S2V5ICYmIGUua2V5ID09PSAnQXJyb3dSaWdodCcpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICBzaG93VGVtcGxhdGVQb3B1cChidXR0b24sIGNoaWxkVGFyZ2V0KTtcbiAgICB9XG4gIH0pO1xuXG4gIGVsZW1lbnQuYXBwZW5kQ2hpbGQoYnV0dG9uKTtcbn1cblxuZnVuY3Rpb24gY29sbGFwc2VDaGlsZEJ1dHRvbnModGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCk6IHZvaWQge1xuICBpZiAodGFyZ2V0LnR5cGUgPT09ICdzZWN0aW9uJykge1xuICAgIGNvbnN0IGhlYWRpbmcgPSB0YXJnZXQuZWxlbWVudDtcbiAgICBsZXQgY3VycmVudCA9IGhlYWRpbmcubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICB3aGlsZSAoY3VycmVudCAmJiAhY3VycmVudC5tYXRjaGVzKCdoMSwgaDIsIGgzLCBoNCwgaDUsIGg2LCBocicpKSB7XG4gICAgICBpZiAoY3VycmVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWJsb2NrLWNvbXBvbmVudCcpKSB7XG4gICAgICAgIGN1cnJlbnQgPSBjdXJyZW50Lm5leHRFbGVtZW50U2libGluZyBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY3VycmVudFxuICAgICAgICAucXVlcnlTZWxlY3RvckFsbCgnLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKVxuICAgICAgICAuZm9yRWFjaCgoYnRuKSA9PiBidG4ucmVtb3ZlKCkpO1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICB9XG4gIH0gZWxzZSBpZiAodGFyZ2V0LnR5cGUgPT09ICdsaXN0Jykge1xuICAgIHRhcmdldC5lbGVtZW50XG4gICAgICAucXVlcnlTZWxlY3RvckFsbCgnLmRlZXAtZGl2ZS1jaGlsZC1idXR0b24nKVxuICAgICAgLmZvckVhY2goKGJ0bikgPT4gYnRuLnJlbW92ZSgpKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzaG93VGVtcGxhdGVQb3B1cChcbiAgYnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCxcbiAgdGFyZ2V0OiBEZWVwRGl2ZVRhcmdldFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGhpZGVUZW1wbGF0ZVBvcHVwKCk7XG5cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8e1xuICAgIGRlZXBEaXZlTW9kZXM/OiBEZWVwRGl2ZU1vZGVbXTtcbiAgICBjdXJyZW50RGVlcERpdmVNb2RlSWQ/OiBzdHJpbmc7XG4gICAgZGVlcERpdmVSZWNlbnRNb2Rlcz86IHN0cmluZ1tdO1xuICB9PigocmVzb2x2ZSkgPT4ge1xuICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFxuICAgICAgWydkZWVwRGl2ZU1vZGVzJywgJ2N1cnJlbnREZWVwRGl2ZU1vZGVJZCcsICdkZWVwRGl2ZVJlY2VudE1vZGVzJ10sXG4gICAgICByZXNvbHZlIGFzIChpdGVtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHZvaWRcbiAgICApO1xuICB9KTtcblxuICBjb25zdCBtb2RlcyA9XG4gICAgcmVzdWx0LmRlZXBEaXZlTW9kZXMgJiYgcmVzdWx0LmRlZXBEaXZlTW9kZXMubGVuZ3RoID4gMFxuICAgICAgPyByZXN1bHQuZGVlcERpdmVNb2Rlc1xuICAgICAgOiBERUZBVUxUX0RFRVBfRElWRV9NT0RFUztcblxuICBjb25zdCByZWNlbnRJZHMgPSByZXN1bHQuZGVlcERpdmVSZWNlbnRNb2RlcyB8fCBbXTtcbiAgY29uc3Qgc29ydGVkID0gWy4uLm1vZGVzXS5zb3J0KChhLCBiKSA9PiB7XG4gICAgY29uc3QgYWkgPSByZWNlbnRJZHMuaW5kZXhPZihhLmlkKTtcbiAgICBjb25zdCBiaSA9IHJlY2VudElkcy5pbmRleE9mKGIuaWQpO1xuICAgIGlmIChhaSA9PT0gLTEgJiYgYmkgPT09IC0xKSByZXR1cm4gMDtcbiAgICBpZiAoYWkgPT09IC0xKSByZXR1cm4gMTtcbiAgICBpZiAoYmkgPT09IC0xKSByZXR1cm4gLTE7XG4gICAgcmV0dXJuIGFpIC0gYmk7XG4gIH0pO1xuXG4gIGNvbnN0IHBvcHVwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHBvcHVwLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnO1xuICBwb3B1cC5pZCA9ICdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnO1xuICBwb3B1cC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWVudScpO1xuXG4gIGNvbnN0IG1ha2VJdGVtID0gKFxuICAgIGxhYmVsOiBzdHJpbmcsXG4gICAgaGludDogc3RyaW5nLFxuICAgIG9uQ2xpY2s6ICgpID0+IHZvaWRcbiAgKTogSFRNTEJ1dHRvbkVsZW1lbnQgPT4ge1xuICAgIGNvbnN0IGl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgICBpdGVtLmNsYXNzTmFtZSA9ICdkZWVwLWRpdmUtdGVtcGxhdGUtaXRlbSc7XG4gICAgaXRlbS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbWVudWl0ZW0nKTtcbiAgICBpdGVtLnRleHRDb250ZW50ID0gbGFiZWw7XG4gICAgaWYgKGhpbnQpIGl0ZW0udGl0bGUgPSBoaW50O1xuICAgIGl0ZW0uYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgKGUpID0+IHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgfSk7XG4gICAgaXRlbS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcbiAgICAgIG9uQ2xpY2soKTtcbiAgICB9KTtcbiAgICByZXR1cm4gaXRlbTtcbiAgfTtcblxuICBzb3J0ZWQuZm9yRWFjaCgobW9kZSkgPT4ge1xuICAgIHBvcHVwLmFwcGVuZENoaWxkKFxuICAgICAgbWFrZUl0ZW0obW9kZS5pZCwgbW9kZS5wcm9tcHQgfHwgJycsICgpID0+IGRvSW5zZXJ0UXVlcnkodGFyZ2V0LCBtb2RlKSlcbiAgICApO1xuICB9KTtcblxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBvcHVwKTtcblxuICBjb25zdCByZWN0ID0gYnV0dG9uLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICBjb25zdCBwb3B1cFcgPSAxNjA7XG4gIGxldCBsZWZ0ID0gcmVjdC5sZWZ0ICsgd2luZG93LnNjcm9sbFg7XG4gIGlmIChsZWZ0ICsgcG9wdXBXID4gd2luZG93LmlubmVyV2lkdGggLSA4KSB7XG4gICAgbGVmdCA9IHdpbmRvdy5pbm5lcldpZHRoIC0gcG9wdXBXIC0gODtcbiAgfVxuICBwb3B1cC5zdHlsZS50b3AgPSBgJHtyZWN0LmJvdHRvbSArIHdpbmRvdy5zY3JvbGxZICsgNH1weGA7XG4gIHBvcHVwLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblxuICBjb25zdCBpdGVtcyA9IEFycmF5LmZyb20oXG4gICAgcG9wdXAucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJy5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbScpXG4gICk7XG4gIGxldCBmb2N1c0luZGV4ID0gMDtcbiAgaXRlbXNbMF0/LmZvY3VzKCk7XG5cbiAgcG9wdXAuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XG4gICAgaWYgKGUua2V5ID09PSAnRXNjYXBlJyB8fCAoZS5hbHRLZXkgJiYgZS5rZXkgPT09ICdBcnJvd0xlZnQnKSkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgaGlkZVRlbXBsYXRlUG9wdXAoKTtcbiAgICAgIGJ1dHRvbi5mb2N1cygpO1xuICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggKyAxKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIGl0ZW1zW2ZvY3VzSW5kZXhdLmZvY3VzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93VXAnKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBmb2N1c0luZGV4ID0gKGZvY3VzSW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcbiAgICAgIGl0ZW1zW2ZvY3VzSW5kZXhdLmZvY3VzKCk7XG4gICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ1RhYicpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGlmIChlLnNoaWZ0S2V5KSB7XG4gICAgICAgIGZvY3VzSW5kZXggPSAoZm9jdXNJbmRleCAtIDEgKyBpdGVtcy5sZW5ndGgpICUgaXRlbXMubGVuZ3RoO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9jdXNJbmRleCA9IChmb2N1c0luZGV4ICsgMSkgJSBpdGVtcy5sZW5ndGg7XG4gICAgICB9XG4gICAgICBpdGVtc1tmb2N1c0luZGV4XS5mb2N1cygpO1xuICAgIH1cbiAgfSk7XG5cbiAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoaWRlVGVtcGxhdGVQb3B1cCwgeyBvbmNlOiB0cnVlIH0pO1xuICB9LCAwKTtcbn1cblxuZnVuY3Rpb24gaGlkZVRlbXBsYXRlUG9wdXAoKTogdm9pZCB7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWVwLWRpdmUtdGVtcGxhdGUtcG9wdXAnKT8ucmVtb3ZlKCk7XG59XG5cbmZ1bmN0aW9uIHdyaXRlVG9UZXh0YXJlYShxdWVyeTogc3RyaW5nLCBhdXRvU2VuZDogYm9vbGVhbik6IHZvaWQge1xuICBjb25zdCB0ZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXSdcbiAgKTtcbiAgaWYgKCF0ZXh0YXJlYSkgcmV0dXJuO1xuXG4gIHdoaWxlICh0ZXh0YXJlYS5maXJzdENoaWxkKSB0ZXh0YXJlYS5yZW1vdmVDaGlsZCh0ZXh0YXJlYS5maXJzdENoaWxkKTtcblxuICBxdWVyeS5zcGxpdCgnXFxuJykuZm9yRWFjaCgobGluZSkgPT4ge1xuICAgIGNvbnN0IHAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG4gICAgaWYgKGxpbmUudHJpbSgpID09PSAnJykge1xuICAgICAgcC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdicicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcC50ZXh0Q29udGVudCA9IGxpbmU7XG4gICAgfVxuICAgIHRleHRhcmVhLmFwcGVuZENoaWxkKHApO1xuICB9KTtcblxuICB0ZXh0YXJlYS5mb2N1cygpO1xuICBjb25zdCByYW5nZSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gIGNvbnN0IHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgcmFuZ2Uuc2VsZWN0Tm9kZUNvbnRlbnRzKHRleHRhcmVhKTtcbiAgcmFuZ2UuY29sbGFwc2UoZmFsc2UpO1xuICBzZWw/LnJlbW92ZUFsbFJhbmdlcygpO1xuICBzZWw/LmFkZFJhbmdlKHJhbmdlKTtcbiAgdGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuICBpZiAoYXV0b1NlbmQpIHtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnN0IHNlbmRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PihcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIumAgeS/oVwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiU2VuZFwiXSdcbiAgICAgICk7XG4gICAgICBpZiAoc2VuZEJ1dHRvbiAmJiAhc2VuZEJ1dHRvbi5kaXNhYmxlZCkgc2VuZEJ1dHRvbi5jbGljaygpO1xuICAgIH0sIDEwMCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZG9JbnNlcnRRdWVyeSh0YXJnZXQ6IERlZXBEaXZlVGFyZ2V0LCBtb2RlOiBEZWVwRGl2ZU1vZGUpOiB2b2lkIHtcbiAgY29uc3QgY29udGVudCA9IHRhcmdldC5nZXRDb250ZW50KCk7XG4gIGNvbnN0IHF1b3RlZENvbnRlbnQgPSBjb250ZW50XG4gICAgLnNwbGl0KCdcXG4nKVxuICAgIC5tYXAoKGxpbmUpID0+IGA+ICR7bGluZX1gKVxuICAgIC5qb2luKCdcXG4nKTtcbiAgY29uc3QgcXVlcnkgPSBxdW90ZWRDb250ZW50ICsgJ1xcblxcbicgKyAobW9kZS5wcm9tcHQgfHwgJ+OBk+OCjOOBq+OBpOOBhOOBpuips+OBl+OBjycpO1xuICB3cml0ZVRvVGV4dGFyZWEocXVlcnksIHRydWUpO1xuXG4gIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsnZGVlcERpdmVSZWNlbnRNb2RlcyddLCAocikgPT4ge1xuICAgIGNvbnN0IHJlY2VudCA9ICgoci5kZWVwRGl2ZVJlY2VudE1vZGVzIGFzIHN0cmluZ1tdKSB8fCBbXSkuZmlsdGVyKFxuICAgICAgKGlkKSA9PiBpZCAhPT0gbW9kZS5pZFxuICAgICk7XG4gICAgcmVjZW50LnVuc2hpZnQobW9kZS5pZCk7XG4gICAgY2hyb21lLnN0b3JhZ2Uuc3luYy5zZXQoeyBkZWVwRGl2ZVJlY2VudE1vZGVzOiByZWNlbnQuc2xpY2UoMCwgMjApIH0pO1xuICB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW5zZXJ0RGVlcERpdmVRdWVyeShcbiAgdGFyZ2V0OiBEZWVwRGl2ZVRhcmdldCxcbiAgcXVvdGVPbmx5ID0gZmFsc2Vcbik6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2Rpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJykpIHJldHVybjtcblxuICBjb25zdCBjb250ZW50ID0gdGFyZ2V0LmdldENvbnRlbnQoKTtcbiAgY29uc3QgcXVvdGVkQ29udGVudCA9IGNvbnRlbnRcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLm1hcCgobGluZSkgPT4gYD4gJHtsaW5lfWApXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIGxldCBxdWVyeTogc3RyaW5nO1xuICBsZXQgc2hvdWxkQXV0b1NlbmQgPSBmYWxzZTtcblxuICBpZiAocXVvdGVPbmx5KSB7XG4gICAgcXVlcnkgPSBxdW90ZWRDb250ZW50ICsgJ1xcblxcbic7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8e1xuICAgICAgZGVlcERpdmVNb2Rlcz86IERlZXBEaXZlTW9kZVtdO1xuICAgICAgY3VycmVudERlZXBEaXZlTW9kZUlkPzogc3RyaW5nO1xuICAgIH0+KChyZXNvbHZlKSA9PiB7XG4gICAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLmdldChcbiAgICAgICAgWydkZWVwRGl2ZU1vZGVzJywgJ2N1cnJlbnREZWVwRGl2ZU1vZGVJZCddLFxuICAgICAgICByZXNvbHZlIGFzIChpdGVtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHZvaWRcbiAgICAgICk7XG4gICAgfSk7XG4gICAgY29uc3QgbW9kZXMgPVxuICAgICAgcmVzdWx0LmRlZXBEaXZlTW9kZXMgJiYgcmVzdWx0LmRlZXBEaXZlTW9kZXMubGVuZ3RoID4gMFxuICAgICAgICA/IHJlc3VsdC5kZWVwRGl2ZU1vZGVzXG4gICAgICAgIDogREVGQVVMVF9ERUVQX0RJVkVfTU9ERVM7XG4gICAgY29uc3QgdXJsUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgIGNvbnN0IHVybE1vZGVJZCA9IHVybFBhcmFtcy5nZXQoJ21vZGVfaWQnKTtcbiAgICBsZXQgbW9kZUlkID0gdXJsTW9kZUlkIHx8IHJlc3VsdC5jdXJyZW50RGVlcERpdmVNb2RlSWQgfHwgbW9kZXNbMF0/LmlkO1xuICAgIGlmICghbW9kZXMuc29tZSgobSkgPT4gbS5pZCA9PT0gbW9kZUlkKSkgbW9kZUlkID0gbW9kZXNbMF0/LmlkO1xuICAgIGNvbnN0IG1vZGUgPVxuICAgICAgbW9kZXMuZmluZCgobSkgPT4gbS5pZCA9PT0gbW9kZUlkKSB8fFxuICAgICAgbW9kZXNbMF0gfHxcbiAgICAgIERFRkFVTFRfREVFUF9ESVZFX01PREVTWzBdO1xuICAgIHF1ZXJ5ID0gcXVvdGVkQ29udGVudCArICdcXG5cXG4nICsgKG1vZGUucHJvbXB0IHx8ICfjgZPjgozjgavjgaTjgYTjgaboqbPjgZfjgY8nKTtcbiAgICBzaG91bGRBdXRvU2VuZCA9IHRydWU7XG4gIH1cblxuICB3cml0ZVRvVGV4dGFyZWEocXVlcnksIHNob3VsZEF1dG9TZW5kKTtcbn1cblxuZnVuY3Rpb24gYWRkRGVlcERpdmVTdHlsZXMoKTogdm9pZCB7XG4gIGNvbnN0IHN0eWxlSWQgPSAnZ2VtaW5pLWRlZXAtZGl2ZS1zdHlsZXMnO1xuICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoc3R5bGVJZCkpIHJldHVybjtcblxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gIHN0eWxlLmlkID0gc3R5bGVJZDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLmRlZXAtZGl2ZS1idXR0b24taW5saW5lIHtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICAgICAgd2lkdGg6IDI4cHg7XG4gICAgICBoZWlnaHQ6IDI4cHg7XG4gICAgICBwYWRkaW5nOiAwO1xuICAgICAgYm9yZGVyOiBub25lO1xuICAgICAgYm9yZGVyLXJhZGl1czogMTRweDtcbiAgICAgIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICAgICAgY29sb3I6ICM1ZjYzNjg7XG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XG4gICAgICB0cmFuc2l0aW9uOiBhbGwgMC4ycztcbiAgICAgIGZsZXgtc2hyaW5rOiAwO1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmU6aG92ZXIge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjA1KTtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmU6Zm9jdXMge1xuICAgICAgb3V0bGluZTogMnB4IHNvbGlkICMxYTczZTg7XG4gICAgICBvdXRsaW5lLW9mZnNldDogMnB4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWJ1dHRvbi1pbmxpbmUgc3ZnIHtcbiAgICAgIHdpZHRoOiAxNnB4O1xuICAgICAgaGVpZ2h0OiAxNnB4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLWV4cGFuZC1idXR0b24ge1xuICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gICAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gICAgICB3aWR0aDogMjhweDtcbiAgICAgIGhlaWdodDogMjhweDtcbiAgICAgIHBhZGRpbmc6IDA7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBib3JkZXItcmFkaXVzOiAxNHB4O1xuICAgICAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XG4gICAgICBjb2xvcjogIzVmNjM2ODtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHRyYW5zaXRpb246IGFsbCAwLjJzO1xuICAgICAgZmxleC1zaHJpbms6IDA7XG4gICAgICBmb250LXNpemU6IDE0cHg7XG4gICAgICBmb250LXdlaWdodDogYm9sZDtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uOmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG4gICAgICBjb2xvcjogIzFhNzNlODtcbiAgICB9XG4gICAgLmRlZXAtZGl2ZS1leHBhbmQtYnV0dG9uOmZvY3VzIHtcbiAgICAgIG91dGxpbmU6IDJweCBzb2xpZCAjMWE3M2U4O1xuICAgICAgb3V0bGluZS1vZmZzZXQ6IDJweDtcbiAgICB9XG4gICAgYmxvY2txdW90ZVtkYXRhLXBhdGgtdG8tbm9kZV0ge1xuICAgICAgcGFkZGluZy10b3A6IDQwcHg7XG4gICAgfVxuICAgIC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Ige1xuICAgICAgZGlzcGxheTogaW5saW5lLWZsZXggIWltcG9ydGFudDtcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gICAgICBwYWRkaW5nOiAwIDhweDtcbiAgICAgIG1hcmdpbjogMCA0cHg7XG4gICAgICBmbGV4LXNocmluazogMDtcbiAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICB2ZXJ0aWNhbC1hbGlnbjogbWlkZGxlO1xuICAgIH1cbiAgICBib2R5ID4gLmdlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvciB7XG4gICAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgICBib3R0b206IDEwMHB4O1xuICAgICAgbGVmdDogMzIwcHg7XG4gICAgICB6LWluZGV4OiA5OTk5O1xuICAgIH1cbiAgICAuZ2VtaW5pLWRlZXAtZGl2ZS1tb2RlLXNlbGVjdG9yIHNlbGVjdCB7XG4gICAgICBwYWRkaW5nOiA0cHggOHB4O1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2RhZGNlMDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBjb2xvcjogIzVmNjM2ODtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIG1heC13aWR0aDogMTAwcHg7XG4gICAgfVxuICAgIC5nZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3Igc2VsZWN0OmhvdmVyIHtcbiAgICAgIGJvcmRlci1jb2xvcjogIzFhNzNlODtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgIH1cbiAgICAuZGVlcC1kaXZlLXRlbXBsYXRlLXBvcHVwIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIHotaW5kZXg6IDk5OTk5O1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBtaW4td2lkdGg6IDE2MHB4O1xuICAgICAgcGFkZGluZzogNHB4IDA7XG4gICAgICBiYWNrZ3JvdW5kOiAjZmZmO1xuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2RhZGNlMDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgNHB4IDEycHggcmdiYSgwLDAsMCwwLjE1KTtcbiAgICAgIG91dGxpbmU6IG5vbmU7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICAgIHdpZHRoOiAxMDAlO1xuICAgICAgcGFkZGluZzogN3B4IDE0cHg7XG4gICAgICBib3JkZXI6IG5vbmU7XG4gICAgICBiYWNrZ3JvdW5kOiB0cmFuc3BhcmVudDtcbiAgICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBjb2xvcjogIzNjNDA0MztcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIHdoaXRlLXNwYWNlOiBub3dyYXA7XG4gICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgICAgdGV4dC1vdmVyZmxvdzogZWxsaXBzaXM7XG4gICAgfVxuICAgIC5kZWVwLWRpdmUtdGVtcGxhdGUtaXRlbTpob3ZlcixcbiAgICAuZGVlcC1kaXZlLXRlbXBsYXRlLWl0ZW06Zm9jdXMge1xuICAgICAgYmFja2dyb3VuZDogI2YxZjNmNDtcbiAgICAgIGNvbG9yOiAjMWE3M2U4O1xuICAgICAgb3V0bGluZTogbm9uZTtcbiAgICB9XG4gIGA7XG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuXG5mdW5jdGlvbiBpbmplY3RNb2RlU2VsZWN0b3IoKTogdm9pZCB7XG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3RvcicpO1xuICBpZiAoZXhpc3RpbmcpIGV4aXN0aW5nLnJlbW92ZSgpO1xuXG4gIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFxuICAgIFsnZGVlcERpdmVNb2RlcycsICdjdXJyZW50RGVlcERpdmVNb2RlSWQnXSxcbiAgICAocjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcbiAgICAgIGNvbnN0IG1vZGVzID1cbiAgICAgICAgKHIuZGVlcERpdmVNb2RlcyBhcyBEZWVwRGl2ZU1vZGVbXSB8IHVuZGVmaW5lZCkgJiZcbiAgICAgICAgKHIuZGVlcERpdmVNb2RlcyBhcyBEZWVwRGl2ZU1vZGVbXSkubGVuZ3RoID4gMFxuICAgICAgICAgID8gKHIuZGVlcERpdmVNb2RlcyBhcyBEZWVwRGl2ZU1vZGVbXSlcbiAgICAgICAgICA6IERFRkFVTFRfREVFUF9ESVZFX01PREVTO1xuXG4gICAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgICB3cmFwcGVyLmlkID0gJ2dlbWluaS1kZWVwLWRpdmUtbW9kZS1zZWxlY3Rvcic7XG4gICAgICB3cmFwcGVyLmNsYXNzTmFtZSA9ICdnZW1pbmktZGVlcC1kaXZlLW1vZGUtc2VsZWN0b3InO1xuXG4gICAgICBjb25zdCBzZWxlY3QgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzZWxlY3QnKTtcbiAgICAgIHNlbGVjdC5pZCA9ICdnZW1pbmktZGVlcC1kaXZlLW1vZGUnO1xuICAgICAgc2VsZWN0LnRpdGxlID0gJ+a3seaOmOOCiuODouODvOODiSc7XG4gICAgICBzZWxlY3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgJ+a3seaOmOOCiuODouODvOODiScpO1xuXG4gICAgICBtb2Rlcy5mb3JFYWNoKChtb2RlKSA9PiB7XG4gICAgICAgIGNvbnN0IG9wdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ29wdGlvbicpO1xuICAgICAgICBvcHRpb24udmFsdWUgPSBtb2RlLmlkO1xuICAgICAgICBvcHRpb24udGV4dENvbnRlbnQgPSBtb2RlLmlkO1xuICAgICAgICBzZWxlY3QuYXBwZW5kQ2hpbGQob3B0aW9uKTtcbiAgICAgIH0pO1xuXG4gICAgICBzZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldCh7IGN1cnJlbnREZWVwRGl2ZU1vZGVJZDogc2VsZWN0LnZhbHVlIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIHdyYXBwZXIuYXBwZW5kQ2hpbGQoc2VsZWN0KTtcblxuICAgICAgY29uc3QgYWRkQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg5XjgqHjgqTjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIui/veWKoFwiXSdcbiAgICAgICk7XG4gICAgICBjb25zdCB0b29sc0J1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OE44O844OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCJUb29sXCJdJ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IGluc2VydEFmdGVyID0gdG9vbHNCdXR0b24gfHwgKGFkZEJ1dHRvbiAmJiBhZGRCdXR0b24ubmV4dEVsZW1lbnRTaWJsaW5nIGFzIEhUTUxFbGVtZW50IHwgbnVsbCk7XG4gICAgICBpZiAoaW5zZXJ0QWZ0ZXIgJiYgaW5zZXJ0QWZ0ZXIucGFyZW50RWxlbWVudCkge1xuICAgICAgICBpbnNlcnRBZnRlci5wYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZSh3cmFwcGVyLCBpbnNlcnRBZnRlci5uZXh0U2libGluZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBpbnB1dEFyZWEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcbiAgICAgICAgICAnZGl2W2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl1bcm9sZT1cInRleHRib3hcIl0nXG4gICAgICAgICk7XG4gICAgICAgIGlmIChpbnB1dEFyZWEpIHtcbiAgICAgICAgICBjb25zdCBwYXJlbnQgPVxuICAgICAgICAgICAgaW5wdXRBcmVhLmNsb3Nlc3QoJ2Zvcm0nKSB8fFxuICAgICAgICAgICAgaW5wdXRBcmVhLnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ7XG4gICAgICAgICAgaWYgKHBhcmVudCkge1xuICAgICAgICAgICAgcGFyZW50Lmluc2VydEJlZm9yZSh3cmFwcGVyLCBwYXJlbnQuZmlyc3RDaGlsZCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdXJsUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpO1xuICAgICAgY29uc3QgdXJsTW9kZUlkID0gdXJsUGFyYW1zLmdldCgnbW9kZV9pZCcpO1xuICAgICAgbGV0IG1vZGVJZCA9IHIuY3VycmVudERlZXBEaXZlTW9kZUlkIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmICh1cmxNb2RlSWQgJiYgbW9kZXMuc29tZSgobSkgPT4gbS5pZCA9PT0gdXJsTW9kZUlkKSkge1xuICAgICAgICBtb2RlSWQgPSB1cmxNb2RlSWQ7XG4gICAgICAgIGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHsgY3VycmVudERlZXBEaXZlTW9kZUlkOiB1cmxNb2RlSWQgfSk7XG4gICAgICB9XG4gICAgICBpZiAobW9kZUlkICYmIG1vZGVzLnNvbWUoKG0pID0+IG0uaWQgPT09IG1vZGVJZCkpIHtcbiAgICAgICAgc2VsZWN0LnZhbHVlID0gbW9kZUlkO1xuICAgICAgfSBlbHNlIGlmIChtb2Rlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHNlbGVjdC52YWx1ZSA9IG1vZGVzWzBdLmlkO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn1cblxubGV0IGRlZXBEaXZlVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplRGVlcERpdmUoKTogdm9pZCB7XG4gIGFkZERlZXBEaXZlU3R5bGVzKCk7XG5cbiAgY29uc3QgdHJ5SW5qZWN0TW9kZVNlbGVjdG9yID0gKCkgPT4ge1xuICAgIGNvbnN0IGhhc0J1dHRvbnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFxuICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuODhOODvOODq1wiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwiVG9vbFwiXSwgYnV0dG9uW2FyaWEtbGFiZWwqPVwi44OV44Kh44Kk44OrXCJdLCBidXR0b25bYXJpYS1sYWJlbCo9XCLov73liqBcIl0nXG4gICAgKTtcbiAgICBpZiAoXG4gICAgICBoYXNCdXR0b25zIHx8XG4gICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdkaXZbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXVtyb2xlPVwidGV4dGJveFwiXScpXG4gICAgKSB7XG4gICAgICBpbmplY3RNb2RlU2VsZWN0b3IoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2V0VGltZW91dCh0cnlJbmplY3RNb2RlU2VsZWN0b3IsIDUwMCk7XG4gICAgfVxuICB9O1xuICB0cnlJbmplY3RNb2RlU2VsZWN0b3IoKTtcblxuICBjaHJvbWUuc3RvcmFnZS5vbkNoYW5nZWQuYWRkTGlzdGVuZXIoKGNoYW5nZXMsIG5hbWVzcGFjZSkgPT4ge1xuICAgIGlmIChcbiAgICAgIG5hbWVzcGFjZSA9PT0gJ3N5bmMnICYmXG4gICAgICBjaGFuZ2VzLmRlZXBEaXZlTW9kZXMgJiZcbiAgICAgIGxvY2F0aW9uLmhyZWYuaW5jbHVkZXMoJ2dlbWluaS5nb29nbGUuY29tJykgJiZcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg4Tjg7zjg6tcIl0sIGJ1dHRvblthcmlhLWxhYmVsKj1cIlRvb2xcIl0sIGRpdltjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdW3JvbGU9XCJ0ZXh0Ym94XCJdJ1xuICAgICAgKVxuICAgICkge1xuICAgICAgaW5qZWN0TW9kZVNlbGVjdG9yKCk7XG4gICAgfVxuICB9KTtcblxuICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKChtdXRhdGlvbnMpID0+IHtcbiAgICBsZXQgc2hvdWxkVXBkYXRlID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBtdXRhdGlvbiBvZiBtdXRhdGlvbnMpIHtcbiAgICAgIGlmIChtdXRhdGlvbi5hZGRlZE5vZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG11dGF0aW9uLmFkZGVkTm9kZXMpIHtcbiAgICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gMSkge1xuICAgICAgICAgICAgY29uc3QgZWwgPSBub2RlIGFzIEVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIGVsLm1hdGNoZXM/LignW2RhdGEtcGF0aC10by1ub2RlXScpIHx8XG4gICAgICAgICAgICAgIGVsLnF1ZXJ5U2VsZWN0b3I/LignW2RhdGEtcGF0aC10by1ub2RlXScpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgc2hvdWxkVXBkYXRlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoc2hvdWxkVXBkYXRlKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc2hvdWxkVXBkYXRlKSB7XG4gICAgICBpZiAoZGVlcERpdmVUaW1lcikgY2xlYXJUaW1lb3V0KGRlZXBEaXZlVGltZXIpO1xuICAgICAgZGVlcERpdmVUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gYWRkRGVlcERpdmVCdXR0b25zKCksIDUwMCk7XG4gICAgfVxuICB9KTtcblxuICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4gYWRkRGVlcERpdmVCdXR0b25zKCksIDEwMDApO1xufVxuIiwiLy8gTWFwIHZpZXcgLSBmaXhlZCByaWdodC1zaWRlIHBhbmVsIHNob3dpbmcgY3VycmVudCBjaGF0IG91dGxpbmUgd2l0aCBzY3JvbGwgaGlnaGxpZ2h0XG5cbmxldCBtYXBNb2RlID0gZmFsc2U7XG5jb25zdCBNQVBfUEFORUxfSUQgPSAnZ2VtaW5pLW1hcC1wYW5lbCc7XG5jb25zdCBNQVBfU1RZTEVfSUQgPSAnZ2VtaW5pLW1hcC1zdHlsZXMnO1xuXG5mdW5jdGlvbiBpbmplY3RNYXBTdHlsZXMoKTogdm9pZCB7XG4gIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfU1RZTEVfSUQpKSByZXR1cm47XG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcbiAgc3R5bGUuaWQgPSBNQVBfU1RZTEVfSUQ7XG4gIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICNnZW1pbmktbWFwLXBhbmVsIHtcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIHJpZ2h0OiAxNnB4O1xuICAgICAgdG9wOiA2MHB4O1xuICAgICAgYm90dG9tOiAxNnB4O1xuICAgICAgd2lkdGg6IDI0MHB4O1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNDgsIDI0OSwgMjUwLCAwLjk1KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XG4gICAgICBib3gtc2hhZG93OiAwIDJweCAxMnB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgICAgIG92ZXJmbG93LXk6IGF1dG87XG4gICAgICB6LWluZGV4OiAxMDA7XG4gICAgICBwYWRkaW5nOiA2cHggNHB4O1xuICAgICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoOHB4KTtcbiAgICB9XG4gICAgLmRhcmstdGhlbWUgI2dlbWluaS1tYXAtcGFuZWwge1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgzMiwgMzMsIDM2LCAwLjk1KTtcbiAgICAgIGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEyKTtcbiAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDEycHggcmdiYSgwLCAwLCAwLCAwLjQpO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCAubWFwLWhlYWRlciB7XG4gICAgICBkaXNwbGF5OiBub25lO1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCB1bCB7XG4gICAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgICAgbWFyZ2luOiAwO1xuICAgICAgcGFkZGluZzogMDtcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uIHtcbiAgICAgIGRpc3BsYXk6IGJsb2NrO1xuICAgICAgd2lkdGg6IDEwMCU7XG4gICAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgICAgYmFja2dyb3VuZDogbm9uZTtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGJvcmRlci1sZWZ0OiAycHggc29saWQgdHJhbnNwYXJlbnQ7XG4gICAgICBib3JkZXItcmFkaXVzOiAwIDZweCA2cHggMDtcbiAgICAgIHBhZGRpbmc6IDVweCAxMHB4IDVweCA4cHg7XG4gICAgICBtYXJnaW46IDFweCAwO1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgZm9udC1zaXplOiAxNXB4O1xuICAgICAgbGluZS1oZWlnaHQ6IDEuMzU7XG4gICAgICBjb2xvcjogaW5oZXJpdDtcbiAgICAgIGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuICAgICAgd29yZC1icmVhazogYnJlYWstd29yZDtcbiAgICAgIG9wYWNpdHk6IDAuNTtcbiAgICAgIHRyYW5zaXRpb246IGJhY2tncm91bmQgMC4xNXMsIG9wYWNpdHkgMC4xNXMsIGJvcmRlci1jb2xvciAwLjE1cztcbiAgICB9XG4gICAgI2dlbWluaS1tYXAtcGFuZWwgbGkgYnV0dG9uOmhvdmVyIHtcbiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMTI4LCAxMjgsIDEyOCwgMC4xMik7XG4gICAgICBvcGFjaXR5OiAwLjg1O1xuICAgIH1cbiAgICAjZ2VtaW5pLW1hcC1wYW5lbCBsaSBidXR0b24ubWFwLWl0ZW0tY3VycmVudCB7XG4gICAgICBvcGFjaXR5OiAxO1xuICAgICAgYmFja2dyb3VuZDogcmdiYSgyNiwgMTE1LCAyMzIsIDAuMDgpO1xuICAgICAgYm9yZGVyLWxlZnQtY29sb3I6ICMxYTczZTg7XG4gICAgfVxuICAgICNnZW1pbmktbWFwLXBhbmVsIGxpIGJ1dHRvbiAubWFwLXR1cm4taW5kZXgge1xuICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICAgICAgbWluLXdpZHRoOiAxOHB4O1xuICAgICAgZm9udC1zaXplOiAxMHB4O1xuICAgICAgb3BhY2l0eTogMC41O1xuICAgICAgbWFyZ2luLXJpZ2h0OiAzcHg7XG4gICAgfVxuICBgO1xuICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvbXB0VGV4dCh1c2VyUXVlcnk6IEVsZW1lbnQpOiBzdHJpbmcge1xuICBjb25zdCBoZWFkaW5nID0gdXNlclF1ZXJ5LnF1ZXJ5U2VsZWN0b3IoJ2gxLCBoMiwgaDMsIFtyb2xlPVwiaGVhZGluZ1wiXScpO1xuICBsZXQgdGV4dCA9XG4gICAgKGhlYWRpbmcgYXMgSFRNTEVsZW1lbnQpPy50ZXh0Q29udGVudD8udHJpbSgpIHx8XG4gICAgKHVzZXJRdWVyeSBhcyBIVE1MRWxlbWVudCkudGV4dENvbnRlbnQ/LnRyaW0oKSB8fFxuICAgICcnO1xuICB0ZXh0ID0gdGV4dC5yZXBsYWNlKC9e44GC44Gq44Gf44Gu44OX44Ot44Oz44OX44OIXFxzKi8sICcnKTtcbiAgdGV4dCA9IHRleHQucmVwbGFjZSgvXj5cXHMqLywgJycpO1xuICByZXR1cm4gdGV4dC5zdWJzdHJpbmcoMCwgNjApIHx8ICco56m6KSc7XG59XG5cbmZ1bmN0aW9uIGdldENvbnZlcnNhdGlvbkNvbnRhaW5lcnMoKTogSFRNTEVsZW1lbnRbXSB7XG4gIHJldHVybiBBcnJheS5mcm9tKFxuICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFxuICAgICAgJ2luZmluaXRlLXNjcm9sbGVyLmNoYXQtaGlzdG9yeSA+IC5jb252ZXJzYXRpb24tY29udGFpbmVyJ1xuICAgIClcbiAgKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRNYXBQYW5lbCgpOiBIVE1MRGl2RWxlbWVudCB7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHBhbmVsLmlkID0gTUFQX1BBTkVMX0lEO1xuXG4gIGNvbnN0IGhlYWRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBoZWFkZXIuY2xhc3NOYW1lID0gJ21hcC1oZWFkZXInO1xuICBoZWFkZXIudGV4dENvbnRlbnQgPSAn44GT44Gu44OB44Oj44OD44OI44Gu5rWB44KMJztcbiAgcGFuZWwuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuICBjb25zdCBjb250YWluZXJzID0gZ2V0Q29udmVyc2F0aW9uQ29udGFpbmVycygpO1xuXG4gIGlmIChjb250YWluZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgIGNvbnN0IGVtcHR5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZW1wdHkuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOiAxMHB4OyBvcGFjaXR5OiAwLjQ1OyBmb250LXNpemU6IDEycHg7JztcbiAgICBlbXB0eS50ZXh0Q29udGVudCA9ICfjg4Hjg6Pjg4Pjg4jjgYzjgb7jgaDjgYLjgorjgb7jgZvjgpMnO1xuICAgIHBhbmVsLmFwcGVuZENoaWxkKGVtcHR5KTtcbiAgICByZXR1cm4gcGFuZWw7XG4gIH1cblxuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKTtcblxuICBjb250YWluZXJzLmZvckVhY2goKGNvbnRhaW5lciwgaW5kZXgpID0+IHtcbiAgICBjb25zdCB1c2VyUXVlcnkgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcigndXNlci1xdWVyeScpO1xuICAgIGlmICghdXNlclF1ZXJ5KSByZXR1cm47XG5cbiAgICBjb25zdCBwcm9tcHRUZXh0ID0gZ2V0UHJvbXB0VGV4dCh1c2VyUXVlcnkpO1xuICAgIGNvbnN0IGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICBjb25zdCBidG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcblxuICAgIGNvbnN0IGluZGV4U3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgICBpbmRleFNwYW4uY2xhc3NOYW1lID0gJ21hcC10dXJuLWluZGV4JztcbiAgICBpbmRleFNwYW4udGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9LmA7XG5cbiAgICBidG4uYXBwZW5kQ2hpbGQoaW5kZXhTcGFuKTtcbiAgICBidG4uYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocHJvbXB0VGV4dCkpO1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnRhaW5lci5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdzdGFydCcgfSk7XG4gICAgfSk7XG5cbiAgICBsaS5hcHBlbmRDaGlsZChidG4pO1xuICAgIGxpc3QuYXBwZW5kQ2hpbGQobGkpO1xuICB9KTtcblxuICBwYW5lbC5hcHBlbmRDaGlsZChsaXN0KTtcbiAgcmV0dXJuIHBhbmVsO1xufVxuXG5mdW5jdGlvbiBnZXRNYXBCdXR0b25zKCk6IEhUTUxCdXR0b25FbGVtZW50W10ge1xuICBjb25zdCBwYW5lbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKE1BUF9QQU5FTF9JRCk7XG4gIGlmICghcGFuZWwpIHJldHVybiBbXTtcbiAgcmV0dXJuIEFycmF5LmZyb20ocGFuZWwucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJ2xpIGJ1dHRvbicpKTtcbn1cblxubGV0IGludGVyc2VjdGlvbk9ic2VydmVyOiBJbnRlcnNlY3Rpb25PYnNlcnZlciB8IG51bGwgPSBudWxsO1xuY29uc3QgdmlzaWJsZVR1cm5zID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbmZ1bmN0aW9uIHNldHVwSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChpbnRlcnNlY3Rpb25PYnNlcnZlcikgaW50ZXJzZWN0aW9uT2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICB2aXNpYmxlVHVybnMuY2xlYXIoKTtcblxuICBjb25zdCBjb250YWluZXJzID0gZ2V0Q29udmVyc2F0aW9uQ29udGFpbmVycygpO1xuICBpZiAoY29udGFpbmVycy5sZW5ndGggPT09IDApIHJldHVybjtcblxuICBpbnRlcnNlY3Rpb25PYnNlcnZlciA9IG5ldyBJbnRlcnNlY3Rpb25PYnNlcnZlcihcbiAgICAoZW50cmllcykgPT4ge1xuICAgICAgZW50cmllcy5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgICBjb25zdCBpbmRleCA9IGNvbnRhaW5lcnMuaW5kZXhPZihlbnRyeS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpO1xuICAgICAgICBpZiAoaW5kZXggPT09IC0xKSByZXR1cm47XG4gICAgICAgIGlmIChlbnRyeS5pc0ludGVyc2VjdGluZykge1xuICAgICAgICAgIHZpc2libGVUdXJucy5hZGQoaW5kZXgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHZpc2libGVUdXJucy5kZWxldGUoaW5kZXgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgYnV0dG9ucyA9IGdldE1hcEJ1dHRvbnMoKTtcbiAgICAgIGJ1dHRvbnMuZm9yRWFjaCgoYnRuLCBpKSA9PiB7XG4gICAgICAgIGJ0bi5jbGFzc0xpc3QudG9nZ2xlKCdtYXAtaXRlbS1jdXJyZW50JywgdmlzaWJsZVR1cm5zLmhhcyhpKSk7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICAgICAgaWYgKHBhbmVsKSB7XG4gICAgICAgIGNvbnN0IGZpcnN0SGlnaGxpZ2h0ZWQgPSBidXR0b25zLmZpbmQoKF8sIGkpID0+IHZpc2libGVUdXJucy5oYXMoaSkpO1xuICAgICAgICBpZiAoZmlyc3RIaWdobGlnaHRlZCkge1xuICAgICAgICAgIGZpcnN0SGlnaGxpZ2h0ZWQuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIHsgdGhyZXNob2xkOiAwLjE1IH1cbiAgKTtcblxuICBjb250YWluZXJzLmZvckVhY2goKGMpID0+IGludGVyc2VjdGlvbk9ic2VydmVyIS5vYnNlcnZlKGMpKTtcbn1cblxuZnVuY3Rpb24gc3RvcEludGVyc2VjdGlvbk9ic2VydmVyKCk6IHZvaWQge1xuICBpZiAoaW50ZXJzZWN0aW9uT2JzZXJ2ZXIpIHtcbiAgICBpbnRlcnNlY3Rpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG4gICAgaW50ZXJzZWN0aW9uT2JzZXJ2ZXIgPSBudWxsO1xuICB9XG4gIHZpc2libGVUdXJucy5jbGVhcigpO1xufVxuXG5sZXQgY2hhdE9ic2VydmVyOiBNdXRhdGlvbk9ic2VydmVyIHwgbnVsbCA9IG51bGw7XG5cbmZ1bmN0aW9uIHN0YXJ0Q2hhdE9ic2VydmVyKCk6IHZvaWQge1xuICBpZiAoY2hhdE9ic2VydmVyKSBjaGF0T2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuXG4gIGNvbnN0IGNoYXRIaXN0b3J5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5maW5pdGUtc2Nyb2xsZXIuY2hhdC1oaXN0b3J5Jyk7XG4gIGlmICghY2hhdEhpc3RvcnkpIHJldHVybjtcblxuICBsZXQgZGVib3VuY2VUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcblxuICBjaGF0T2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgaWYgKCFtYXBNb2RlKSByZXR1cm47XG4gICAgaWYgKGRlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dChkZWJvdW5jZVRpbWVyKTtcbiAgICBkZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiByZWZyZXNoTWFwKCksIDMwMCk7XG4gIH0pO1xuXG4gIGNoYXRPYnNlcnZlci5vYnNlcnZlKGNoYXRIaXN0b3J5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogZmFsc2UgfSk7XG59XG5cbmZ1bmN0aW9uIHN0b3BDaGF0T2JzZXJ2ZXIoKTogdm9pZCB7XG4gIGlmIChjaGF0T2JzZXJ2ZXIpIHtcbiAgICBjaGF0T2JzZXJ2ZXIuZGlzY29ubmVjdCgpO1xuICAgIGNoYXRPYnNlcnZlciA9IG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmcmVzaE1hcCgpOiB2b2lkIHtcbiAgaWYgKCFtYXBNb2RlKSByZXR1cm47XG5cbiAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBjb25zdCBzYXZlZFNjcm9sbCA9IGV4aXN0aW5nID8gZXhpc3Rpbmcuc2Nyb2xsVG9wIDogMDtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBzdG9wSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcblxuICBjb25zdCBwYW5lbCA9IGJ1aWxkTWFwUGFuZWwoKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYW5lbCk7XG4gIHBhbmVsLnNjcm9sbFRvcCA9IHNhdmVkU2Nyb2xsO1xuXG4gIHNldHVwSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dNYXAoKTogdm9pZCB7XG4gIGluamVjdE1hcFN0eWxlcygpO1xuXG4gIGNvbnN0IGV4aXN0aW5nID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoTUFQX1BBTkVMX0lEKTtcbiAgaWYgKGV4aXN0aW5nKSBleGlzdGluZy5yZW1vdmUoKTtcblxuICBjb25zdCBwYW5lbCA9IGJ1aWxkTWFwUGFuZWwoKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYW5lbCk7XG4gIG1hcE1vZGUgPSB0cnVlO1xuXG4gIHNldHVwSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcbiAgc3RhcnRDaGF0T2JzZXJ2ZXIoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0TWFwTW9kZSgpOiB2b2lkIHtcbiAgc3RvcENoYXRPYnNlcnZlcigpO1xuICBzdG9wSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoKTtcbiAgY29uc3QgcGFuZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChNQVBfUEFORUxfSUQpO1xuICBpZiAocGFuZWwpIHBhbmVsLnJlbW92ZSgpO1xuICBtYXBNb2RlID0gZmFsc2U7XG59XG4iLCIvLyBET03mp4vpgKDjgpJBSeOCqOODvOOCuOOCp+ODs+ODiOOBjOiqjeitmOOBp+OBjeOCi+W9ouW8j+OBp+WHuuWKm1xuXG50eXBlIEVsZW1lbnRUeXBlID1cbiAgfCAndGV4dGFyZWEnXG4gIHwgJ3NpZGViYXInXG4gIHwgJ3NpZGViYXJUb2dnbGUnXG4gIHwgJ2NoYXRIaXN0b3J5J1xuICB8ICduZXdDaGF0QnV0dG9uJ1xuICB8ICdjb3B5QnV0dG9ucydcbiAgfCAnY2hhdENvbnRhaW5lcic7XG5cbmludGVyZmFjZSBGaW5kRWxlbWVudFJlc3VsdCB7XG4gIGVsZW1lbnQ6IEVsZW1lbnQgfCBudWxsO1xuICBzZWxlY3Rvcjogc3RyaW5nIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEludGVyYWN0aXZlRWxlbWVudCB7XG4gIGluZGV4OiBudW1iZXI7XG4gIHR5cGU6IHN0cmluZztcbiAgcm9sZTogc3RyaW5nO1xuICBhcmlhTGFiZWw6IHN0cmluZztcbiAgdGV4dDogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBpc1Zpc2libGU6IGJvb2xlYW47XG4gIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG59XG5cbmNsYXNzIERPTUFuYWx5emVyIHtcbiAgcHJpdmF0ZSBlbGVtZW50U2VsZWN0b3JzOiBSZWNvcmQ8RWxlbWVudFR5cGUsIHN0cmluZ1tdPjtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmVsZW1lbnRTZWxlY3RvcnMgPSB7XG4gICAgICB0ZXh0YXJlYTogW1xuICAgICAgICAnW3JvbGU9XCJ0ZXh0Ym94XCJdW2NvbnRlbnRlZGl0YWJsZT1cInRydWVcIl0nLFxuICAgICAgICAnW2FyaWEtbGFiZWwqPVwi44OX44Ot44Oz44OX44OIXCJdJyxcbiAgICAgICAgJy5xbC1lZGl0b3IudGV4dGFyZWEnLFxuICAgICAgICAncmljaC10ZXh0YXJlYSBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScsXG4gICAgICBdLFxuICAgICAgc2lkZWJhcjogW1xuICAgICAgICAnW3JvbGU9XCJuYXZpZ2F0aW9uXCJdJyxcbiAgICAgICAgJ2JhcmQtc2lkZW5hdicsXG4gICAgICAgICcuc2lkZS1uYXYtY29udGFpbmVyJyxcbiAgICAgICAgJ2FzaWRlJyxcbiAgICAgIF0sXG4gICAgICBzaWRlYmFyVG9nZ2xlOiBbXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCLjg6HjgqTjg7Pjg6Hjg4vjg6Xjg7xcIl0nLFxuICAgICAgICAnYnV0dG9uW2FyaWEtbGFiZWwqPVwiTWFpbiBtZW51XCJdJyxcbiAgICAgICAgJ2J1dHRvbltkYXRhLXRlc3QtaWQ9XCJzaWRlLW5hdi1tZW51LWJ1dHRvblwiXScsXG4gICAgICBdLFxuICAgICAgY2hhdEhpc3Rvcnk6IFtcbiAgICAgICAgJy5jb252ZXJzYXRpb25bcm9sZT1cImJ1dHRvblwiXScsXG4gICAgICAgICdbZGF0YS10ZXN0LWlkPVwiY29udmVyc2F0aW9uXCJdJyxcbiAgICAgICAgJy5jb252ZXJzYXRpb24taXRlbXMtY29udGFpbmVyIC5jb252ZXJzYXRpb24nLFxuICAgICAgXSxcbiAgICAgIG5ld0NoYXRCdXR0b246IFtcbiAgICAgICAgJ2FbaHJlZj1cImh0dHBzOi8vZ2VtaW5pLmdvb2dsZS5jb20vYXBwXCJdJyxcbiAgICAgICAgJ2FbYXJpYS1sYWJlbCo9XCLmlrDopo/kvZzmiJBcIl0nLFxuICAgICAgICAnW2RhdGEtdGVzdC1pZD1cIm5ldy1jaGF0LWJ1dHRvblwiXScsXG4gICAgICBdLFxuICAgICAgY29weUJ1dHRvbnM6IFtcbiAgICAgICAgJ2J1dHRvblthcmlhLWxhYmVsKj1cIuOCs+ODlOODvFwiXScsXG4gICAgICAgICdidXR0b25bYXJpYS1sYWJlbCo9XCJDb3B5XCJdJyxcbiAgICAgICAgJy5jb3B5LWJ1dHRvbicsXG4gICAgICBdLFxuICAgICAgY2hhdENvbnRhaW5lcjogW1xuICAgICAgICAnY2hhdC13aW5kb3cnLFxuICAgICAgICAnbWFpbi5tYWluJyxcbiAgICAgICAgJy5jb252ZXJzYXRpb24tY29udGFpbmVyJyxcbiAgICAgIF0sXG4gICAgfTtcbiAgfVxuXG4gIGZpbmRFbGVtZW50KHR5cGU6IEVsZW1lbnRUeXBlKTogRmluZEVsZW1lbnRSZXN1bHQge1xuICAgIGNvbnN0IHNlbGVjdG9ycyA9IHRoaXMuZWxlbWVudFNlbGVjdG9yc1t0eXBlXSB8fCBbXTtcbiAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHNlbGVjdG9ycykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZWxlbWVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuICAgICAgICBpZiAoZWxlbWVudCkgcmV0dXJuIHsgZWxlbWVudCwgc2VsZWN0b3IgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLy8gSW52YWxpZCBzZWxlY3Rvciwgc2tpcFxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4geyBlbGVtZW50OiBudWxsLCBzZWxlY3RvcjogbnVsbCB9O1xuICB9XG5cbiAgZmluZEFsbEVsZW1lbnRzKCk6IFJlY29yZDxFbGVtZW50VHlwZSwgRmluZEVsZW1lbnRSZXN1bHQ+IHtcbiAgICBjb25zdCByZXN1bHQgPSB7fSBhcyBSZWNvcmQ8RWxlbWVudFR5cGUsIEZpbmRFbGVtZW50UmVzdWx0PjtcbiAgICBmb3IgKGNvbnN0IHR5cGUgaW4gdGhpcy5lbGVtZW50U2VsZWN0b3JzKSB7XG4gICAgICByZXN1bHRbdHlwZSBhcyBFbGVtZW50VHlwZV0gPSB0aGlzLmZpbmRFbGVtZW50KHR5cGUgYXMgRWxlbWVudFR5cGUpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgY2FwdHVyZVBhZ2VTdHJ1Y3R1cmUoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgIHVybDogd2luZG93LmxvY2F0aW9uLmhyZWYsXG4gICAgICB0aXRsZTogZG9jdW1lbnQudGl0bGUsXG4gICAgICBlbGVtZW50czogdGhpcy5maW5kQWxsRWxlbWVudHMoKSxcbiAgICAgIGludGVyYWN0aXZlRWxlbWVudHM6IHRoaXMuZ2V0SW50ZXJhY3RpdmVFbGVtZW50cygpLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgdmlld3BvcnQ6IHsgd2lkdGg6IHdpbmRvdy5pbm5lcldpZHRoLCBoZWlnaHQ6IHdpbmRvdy5pbm5lckhlaWdodCB9LFxuICAgICAgICBzY3JvbGxQb3NpdGlvbjogeyB4OiB3aW5kb3cuc2Nyb2xsWCwgeTogd2luZG93LnNjcm9sbFkgfSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuXG4gIGdldEludGVyYWN0aXZlRWxlbWVudHMoKTogSW50ZXJhY3RpdmVFbGVtZW50W10ge1xuICAgIGNvbnN0IGVsZW1lbnRzOiBJbnRlcmFjdGl2ZUVsZW1lbnRbXSA9IFtdO1xuICAgIGNvbnN0IHNlbGVjdG9yID1cbiAgICAgICdidXR0b24sIGEsIGlucHV0LCB0ZXh0YXJlYSwgW3JvbGU9XCJidXR0b25cIl0sIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJztcbiAgICBjb25zdCBpbnRlcmFjdGl2ZXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcblxuICAgIGludGVyYWN0aXZlcy5mb3JFYWNoKChlbCwgaW5kZXgpID0+IHtcbiAgICAgIGlmIChpbmRleCA+PSA1MCkgcmV0dXJuO1xuICAgICAgY29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgaWYgKHJlY3Qud2lkdGggPT09IDAgfHwgcmVjdC5oZWlnaHQgPT09IDApIHJldHVybjtcbiAgICAgIGVsZW1lbnRzLnB1c2goe1xuICAgICAgICBpbmRleCxcbiAgICAgICAgdHlwZTogZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICByb2xlOiBlbC5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSB8fCAnJyxcbiAgICAgICAgYXJpYUxhYmVsOiBlbC5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSB8fCAnJyxcbiAgICAgICAgdGV4dDogZWwudGV4dENvbnRlbnQ/LnRyaW0oKS5zdWJzdHJpbmcoMCwgNTApIHx8ICcnLFxuICAgICAgICBkZXNjcmlwdGlvbjogZWwuZ2V0QXR0cmlidXRlKCdkZXNjcmlwdGlvbicpIHx8ICcnLFxuICAgICAgICBpc1Zpc2libGU6IHJlY3Qud2lkdGggPiAwICYmIHJlY3QuaGVpZ2h0ID4gMCxcbiAgICAgICAgcG9zaXRpb246IHsgeDogTWF0aC5yb3VuZChyZWN0LngpLCB5OiBNYXRoLnJvdW5kKHJlY3QueSkgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGVsZW1lbnRzO1xuICB9XG5cbiAgZXhwb3J0Rm9yQUkoKTogc3RyaW5nIHtcbiAgICBjb25zdCBzdHJ1Y3R1cmUgPSB0aGlzLmNhcHR1cmVQYWdlU3RydWN0dXJlKCk7XG5cbiAgICBsZXQgb3V0cHV0ID0gYCMjIEdlbWluaSBDaGF0IFBhZ2UgU3RydWN0dXJlXFxuXFxuYDtcbiAgICBvdXRwdXQgKz0gYCoqVVJMKio6ICR7c3RydWN0dXJlLnVybH1cXG5gO1xuICAgIG91dHB1dCArPSBgKipUaXRsZSoqOiAke3N0cnVjdHVyZS50aXRsZX1cXG5cXG5gO1xuICAgIG91dHB1dCArPSBgIyMjIE1haW4gRWxlbWVudHNcXG5cXG5gO1xuXG4gICAgZm9yIChjb25zdCBbdHlwZSwgZGF0YV0gb2YgT2JqZWN0LmVudHJpZXMoc3RydWN0dXJlLmVsZW1lbnRzKSkge1xuICAgICAgaWYgKGRhdGEuZWxlbWVudCkge1xuICAgICAgICBvdXRwdXQgKz0gYC0gKioke3R5cGV9Kio6IFxcYCR7ZGF0YS5zZWxlY3Rvcn1cXGAg4pyTXFxuYDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dCArPSBgLSAqKiR7dHlwZX0qKjogTm90IGZvdW5kIOKcl1xcbmA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgb3V0cHV0ICs9IGBcXG4jIyMgSW50ZXJhY3RpdmUgRWxlbWVudHMgKCR7c3RydWN0dXJlLmludGVyYWN0aXZlRWxlbWVudHMubGVuZ3RofSlcXG5cXG5gO1xuICAgIHN0cnVjdHVyZS5pbnRlcmFjdGl2ZUVsZW1lbnRzLnNsaWNlKDAsIDEwKS5mb3JFYWNoKChlbCkgPT4ge1xuICAgICAgaWYgKGVsLnRleHQpIHtcbiAgICAgICAgb3V0cHV0ICs9IGAtIFske2VsLnR5cGV9XSAke2VsLnRleHR9ICgke2VsLmFyaWFMYWJlbCB8fCBlbC5yb2xlfSlcXG5gO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIG91dHB1dDtcbiAgfVxuXG4gIGFzeW5jIGNvcHlUb0NsaXBib2FyZCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCB0ZXh0ID0gdGhpcy5leHBvcnRGb3JBSSgpO1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0ZXh0KTtcbiAgICAgIHRoaXMuc2hvd05vdGlmaWNhdGlvbign44Oa44O844K45qeL6YCg44KS44Kv44Oq44OD44OX44Oc44O844OJ44Gr44Kz44OU44O844GX44G+44GX44GfJyk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRoaXMuc2hvd05vdGlmaWNhdGlvbign44Kz44OU44O844Gr5aSx5pWX44GX44G+44GX44GfJywgJ2Vycm9yJyk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgc2hvd05vdGlmaWNhdGlvbihtZXNzYWdlOiBzdHJpbmcsIHR5cGU6ICdzdWNjZXNzJyB8ICdlcnJvcicgPSAnc3VjY2VzcycpOiB2b2lkIHtcbiAgICBjb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBub3RpZmljYXRpb24uc3R5bGUuY3NzVGV4dCA9IGBcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICAgIHRvcDogMjBweDtcbiAgICAgIHJpZ2h0OiAyMHB4O1xuICAgICAgYmFja2dyb3VuZDogJHt0eXBlID09PSAnZXJyb3InID8gJyNmNDQzMzYnIDogJyM0Q0FGNTAnfTtcbiAgICAgIGNvbG9yOiB3aGl0ZTtcbiAgICAgIHBhZGRpbmc6IDE2cHggMjRweDtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDtcbiAgICAgIHotaW5kZXg6IDEwMDAwO1xuICAgICAgYm94LXNoYWRvdzogMCA0cHggMTJweCByZ2JhKDAsMCwwLDAuMyk7XG4gICAgICBmb250LWZhbWlseTogc3lzdGVtLXVpLCAtYXBwbGUtc3lzdGVtLCBzYW5zLXNlcmlmO1xuICAgICAgZm9udC1zaXplOiAxNHB4O1xuICAgICAgYW5pbWF0aW9uOiBzbGlkZUluIDAuM3MgZWFzZS1vdXQ7XG4gICAgYDtcbiAgICBub3RpZmljYXRpb24udGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuXG4gICAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuICAgIHN0eWxlLnRleHRDb250ZW50ID0gYFxuICAgICAgQGtleWZyYW1lcyBzbGlkZUluIHtcbiAgICAgICAgZnJvbSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCg0MDBweCk7IG9wYWNpdHk6IDA7IH1cbiAgICAgICAgdG8geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7IG9wYWNpdHk6IDE7IH1cbiAgICAgIH1cbiAgICBgO1xuICAgIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQobm90aWZpY2F0aW9uKTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgbm90aWZpY2F0aW9uLnN0eWxlLnRyYW5zaXRpb24gPSAnb3BhY2l0eSAwLjNzJztcbiAgICAgIG5vdGlmaWNhdGlvbi5zdHlsZS5vcGFjaXR5ID0gJzAnO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBub3RpZmljYXRpb24ucmVtb3ZlKCksIDMwMCk7XG4gICAgfSwgMzAwMCk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxpemVET01BbmFseXplcigpOiB2b2lkIHtcbiAgd2luZG93LmRvbUFuYWx5emVyID0gbmV3IERPTUFuYWx5emVyKCk7XG4gIHdpbmRvdy5hbmFseXplUGFnZSA9ICgpID0+IHtcbiAgICBjb25zb2xlLmxvZyh3aW5kb3cuZG9tQW5hbHl6ZXIhLmNhcHR1cmVQYWdlU3RydWN0dXJlKCkpO1xuICB9O1xuICB3aW5kb3cuY29weVBhZ2VTdHJ1Y3R1cmUgPSAoKSA9PiB7XG4gICAgd2luZG93LmRvbUFuYWx5emVyIS5jb3B5VG9DbGlwYm9hcmQoKTtcbiAgfTtcbn1cbiIsImltcG9ydCB7IGluaXRpYWxpemVLZXlib2FyZEhhbmRsZXJzLCByZW1lbWJlckFjdGlvbkJ1dHRvblBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vc3JjL2tleWJvYXJkJztcbmltcG9ydCB7IGluaXRpYWxpemVDaGF0UGFnZSB9IGZyb20gJy4uLy4uL3NyYy9jaGF0JztcbmltcG9ydCB7IGluaXRpYWxpemVBdXRvY29tcGxldGUsIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUgfSBmcm9tICcuLi8uLi9zcmMvYXV0b2NvbXBsZXRlJztcbmltcG9ydCB7IGluaXRpYWxpemVEZWVwRGl2ZSB9IGZyb20gJy4uLy4uL3NyYy9kZWVwLWRpdmUnO1xuaW1wb3J0IHsgaW5pdGlhbGl6ZUV4cG9ydCB9IGZyb20gJy4uLy4uL3NyYy9leHBvcnQnO1xuaW1wb3J0IHsgc2hvd01hcCwgcmVzZXRNYXBNb2RlIH0gZnJvbSAnLi4vLi4vc3JjL21hcCc7XG5pbXBvcnQgeyBpbml0aWFsaXplU2VhcmNoUGFnZSwgaXNTZWFyY2hQYWdlIH0gZnJvbSAnLi4vLi4vc3JjL3NlYXJjaCc7XG5pbXBvcnQgeyBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUgfSBmcm9tICcuLi8uLi9zcmMvaGlzdG9yeSc7XG5pbXBvcnQgeyBpbml0aWFsaXplRE9NQW5hbHl6ZXIgfSBmcm9tICcuLi8uLi9zcmMvZG9tLWFuYWx5emVyJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29udGVudFNjcmlwdCh7XG4gIG1hdGNoZXM6IFtcbiAgICAnaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS9hcHAqJyxcbiAgICAnaHR0cHM6Ly9nZW1pbmkuZ29vZ2xlLmNvbS9zZWFyY2gqJyxcbiAgXSxcbiAgcnVuQXQ6ICdkb2N1bWVudF9lbmQnLFxuXG4gIG1haW4oKSB7XG4gICAgLy8gRXhwb3NlIHdpbmRvdyBnbG9iYWxzIHVzZWQgYWNyb3NzIG1vZHVsZXNcbiAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbiA9IHJlbWVtYmVyQWN0aW9uQnV0dG9uUG9zaXRpb247XG5cbiAgICBpbml0aWFsaXplRE9NQW5hbHl6ZXIoKTtcbiAgICBpbml0aWFsaXplKCk7XG4gIH0sXG59KTtcblxuZnVuY3Rpb24gYXBwbHlDdXN0b21TdHlsZXMoKTogdm9pZCB7XG4gIGNvbnN0IHN0eWxlSWQgPSAnZ2VtaW5pLWltcHJvdmUtdWktY3VzdG9tLXN0eWxlcyc7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHN0eWxlSWQpPy5yZW1vdmUoKTtcblxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gIHN0eWxlLmlkID0gc3R5bGVJZDtcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXG4gICAgLmdlbXMtbGlzdC1jb250YWluZXIge1xuICAgICAgZGlzcGxheTogbm9uZSAhaW1wb3J0YW50O1xuICAgIH1cbiAgICAuc2lkZS1uYXYtZW50cnktY29udGFpbmVyIHtcbiAgICAgIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDtcbiAgICB9XG4gICAgY2hhdC13aW5kb3cge1xuICAgICAgbWF4LXdpZHRoOiB2YXIoLS1jaGF0LW1heC13aWR0aCwgOTAwcHgpICFpbXBvcnRhbnQ7XG4gICAgICBtYXJnaW4tbGVmdDogMCAhaW1wb3J0YW50O1xuICAgICAgbWFyZ2luLXJpZ2h0OiBhdXRvICFpbXBvcnRhbnQ7XG4gICAgfVxuICAgIC5jb252ZXJzYXRpb24tY29udGFpbmVyIHtcbiAgICAgIG1heC13aWR0aDogdmFyKC0tY2hhdC1tYXgtd2lkdGgsIDkwMHB4KSAhaW1wb3J0YW50O1xuICAgICAgbWFyZ2luLWxlZnQ6IDAgIWltcG9ydGFudDtcbiAgICAgIG1hcmdpbi1yaWdodDogYXV0byAhaW1wb3J0YW50O1xuICAgIH1cbiAgYDtcbiAgZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChzdHlsZSk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNoYXRXaWR0aCh3aWR0aDogbnVtYmVyKTogdm9pZCB7XG4gIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1jaGF0LW1heC13aWR0aCcsIGAke3dpZHRofXB4YCk7XG59XG5cbmZ1bmN0aW9uIGxvYWRDaGF0V2lkdGgoKTogdm9pZCB7XG4gIGNocm9tZS5zdG9yYWdlLnN5bmMuZ2V0KFsnY2hhdFdpZHRoJ10sIChyZXN1bHQpID0+IHtcbiAgICB1cGRhdGVDaGF0V2lkdGgocmVzdWx0LmNoYXRXaWR0aCB8fCA5MDApO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaW5pdGlhbGl6ZSgpOiB2b2lkIHtcbiAgbG9hZENoYXRXaWR0aCgpO1xuICBhcHBseUN1c3RvbVN0eWxlcygpO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdwb3BzdGF0ZScsICgpID0+IHtcbiAgICBleGl0SGlzdG9yeVNlbGVjdGlvbk1vZGUoKTtcbiAgfSk7XG5cbiAgbGV0IGxhc3RVcmwgPSBsb2NhdGlvbi5ocmVmO1xuICBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG4gICAgY29uc3QgY3VycmVudFVybCA9IGxvY2F0aW9uLmhyZWY7XG4gICAgaWYgKGN1cnJlbnRVcmwgIT09IGxhc3RVcmwpIHtcbiAgICAgIGxhc3RVcmwgPSBjdXJyZW50VXJsO1xuXG4gICAgICB3aW5kb3cucmVtZW1iZXJBY3Rpb25CdXR0b25Qb3NpdGlvbj8uKC0xKTtcbiAgICAgIHJlc2V0TWFwTW9kZSgpO1xuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgaW5pdGlhbGl6ZUF1dG9jb21wbGV0ZSgpO1xuICAgICAgICBpbml0aWFsaXplU2VhcmNoQXV0b2NvbXBsZXRlKCk7XG4gICAgICAgIGlmICghaXNTZWFyY2hQYWdlKCkpIHtcbiAgICAgICAgICBzaG93TWFwKCk7XG4gICAgICAgIH1cbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dlbWluaS1leHBvcnQtbm90ZS1idXR0b24nKT8ucmVtb3ZlKCk7XG4gICAgICAgIGluaXRpYWxpemVFeHBvcnQoKTtcbiAgICAgIH0sIDE1MDApO1xuICAgIH1cbiAgfSkub2JzZXJ2ZShkb2N1bWVudCwgeyBzdWJ0cmVlOiB0cnVlLCBjaGlsZExpc3Q6IHRydWUgfSk7XG5cbiAgaW5pdGlhbGl6ZUtleWJvYXJkSGFuZGxlcnMoKTtcblxuICBpZiAoaXNTZWFyY2hQYWdlKCkpIHtcbiAgICBpbml0aWFsaXplU2VhcmNoUGFnZSgpO1xuICAgIGluaXRpYWxpemVTZWFyY2hBdXRvY29tcGxldGUoKTtcbiAgfSBlbHNlIHtcbiAgICBpbml0aWFsaXplQ2hhdFBhZ2UoKTtcbiAgICBpbml0aWFsaXplRGVlcERpdmUoKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGluaXRpYWxpemVFeHBvcnQoKTtcbiAgICB9LCAxNTAwKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHNob3dNYXAoKTtcbiAgICB9LCAxNTAwKTtcbiAgfVxuXG4gIGNocm9tZS5zdG9yYWdlLm9uQ2hhbmdlZC5hZGRMaXN0ZW5lcigoY2hhbmdlcywgbmFtZXNwYWNlKSA9PiB7XG4gICAgaWYgKG5hbWVzcGFjZSA9PT0gJ3N5bmMnICYmIGNoYW5nZXMuY2hhdFdpZHRoKSB7XG4gICAgICB1cGRhdGVDaGF0V2lkdGgoY2hhbmdlcy5jaGF0V2lkdGgubmV3VmFsdWUpO1xuICAgICAgYXBwbHlDdXN0b21TdHlsZXMoKTtcbiAgICB9XG4gIH0pO1xufVxuIiwiLy8jcmVnaW9uIHNyYy91dGlscy9pbnRlcm5hbC9sb2dnZXIudHNcbmZ1bmN0aW9uIHByaW50KG1ldGhvZCwgLi4uYXJncykge1xuXHRpZiAoaW1wb3J0Lm1ldGEuZW52Lk1PREUgPT09IFwicHJvZHVjdGlvblwiKSByZXR1cm47XG5cdGlmICh0eXBlb2YgYXJnc1swXSA9PT0gXCJzdHJpbmdcIikgbWV0aG9kKGBbd3h0XSAke2FyZ3Muc2hpZnQoKX1gLCAuLi5hcmdzKTtcblx0ZWxzZSBtZXRob2QoXCJbd3h0XVwiLCAuLi5hcmdzKTtcbn1cbi8qKlxuKiBXcmFwcGVyIGFyb3VuZCBgY29uc29sZWAgd2l0aCBhIFwiW3d4dF1cIiBwcmVmaXhcbiovXG5jb25zdCBsb2dnZXIgPSB7XG5cdGRlYnVnOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5kZWJ1ZywgLi4uYXJncyksXG5cdGxvZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUubG9nLCAuLi5hcmdzKSxcblx0d2FybjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUud2FybiwgLi4uYXJncyksXG5cdGVycm9yOiAoLi4uYXJncykgPT4gcHJpbnQoY29uc29sZS5lcnJvciwgLi4uYXJncylcbn07XG5cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgbG9nZ2VyIH07IiwiLy8gI3JlZ2lvbiBzbmlwcGV0XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IGdsb2JhbFRoaXMuYnJvd3Nlcj8ucnVudGltZT8uaWRcbiAgPyBnbG9iYWxUaGlzLmJyb3dzZXJcbiAgOiBnbG9iYWxUaGlzLmNocm9tZTtcbi8vICNlbmRyZWdpb24gc25pcHBldFxuIiwiaW1wb3J0IHsgYnJvd3NlciBhcyBicm93c2VyJDEgfSBmcm9tIFwiQHd4dC1kZXYvYnJvd3NlclwiO1xuXG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvbiBBUElzIGluIHlvdXIgcHJvamVjdDpcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSlcbiogYGBgXG4qIEBtb2R1bGUgd3h0L2Jyb3dzZXJcbiovXG5jb25zdCBicm93c2VyID0gYnJvd3NlciQxO1xuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGJyb3dzZXIgfTsiLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG5cbi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy50c1xudmFyIFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgPSBjbGFzcyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IGV4dGVuZHMgRXZlbnQge1xuXHRzdGF0aWMgRVZFTlRfTkFNRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpsb2NhdGlvbmNoYW5nZVwiKTtcblx0Y29uc3RydWN0b3IobmV3VXJsLCBvbGRVcmwpIHtcblx0XHRzdXBlcihXeHRMb2NhdGlvbkNoYW5nZUV2ZW50LkVWRU5UX05BTUUsIHt9KTtcblx0XHR0aGlzLm5ld1VybCA9IG5ld1VybDtcblx0XHR0aGlzLm9sZFVybCA9IG9sZFVybDtcblx0fVxufTtcbi8qKlxuKiBSZXR1cm5zIGFuIGV2ZW50IG5hbWUgdW5pcXVlIHRvIHRoZSBleHRlbnNpb24gYW5kIGNvbnRlbnQgc2NyaXB0IHRoYXQncyBydW5uaW5nLlxuKi9cbmZ1bmN0aW9uIGdldFVuaXF1ZUV2ZW50TmFtZShldmVudE5hbWUpIHtcblx0cmV0dXJuIGAke2Jyb3dzZXI/LnJ1bnRpbWU/LmlkfToke2ltcG9ydC5tZXRhLmVudi5FTlRSWVBPSU5UfToke2V2ZW50TmFtZX1gO1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQsIGdldFVuaXF1ZUV2ZW50TmFtZSB9OyIsImltcG9ydCB7IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tIFwiLi9jdXN0b20tZXZlbnRzLm1qc1wiO1xuXG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIudHNcbmNvbnN0IHN1cHBvcnRzTmF2aWdhdGlvbkFwaSA9IHR5cGVvZiBnbG9iYWxUaGlzLm5hdmlnYXRpb24/LmFkZEV2ZW50TGlzdGVuZXIgPT09IFwiZnVuY3Rpb25cIjtcbi8qKlxuKiBDcmVhdGUgYSB1dGlsIHRoYXQgd2F0Y2hlcyBmb3IgVVJMIGNoYW5nZXMsIGRpc3BhdGNoaW5nIHRoZSBjdXN0b20gZXZlbnQgd2hlbiBkZXRlY3RlZC4gU3RvcHNcbiogd2F0Y2hpbmcgd2hlbiBjb250ZW50IHNjcmlwdCBpcyBpbnZhbGlkYXRlZC4gVXNlcyBOYXZpZ2F0aW9uIEFQSSB3aGVuIGF2YWlsYWJsZSwgb3RoZXJ3aXNlXG4qIGZhbGxzIGJhY2sgdG8gcG9sbGluZy5cbiovXG5mdW5jdGlvbiBjcmVhdGVMb2NhdGlvbldhdGNoZXIoY3R4KSB7XG5cdGxldCBsYXN0VXJsO1xuXHRsZXQgd2F0Y2hpbmcgPSBmYWxzZTtcblx0cmV0dXJuIHsgcnVuKCkge1xuXHRcdGlmICh3YXRjaGluZykgcmV0dXJuO1xuXHRcdHdhdGNoaW5nID0gdHJ1ZTtcblx0XHRsYXN0VXJsID0gbmV3IFVSTChsb2NhdGlvbi5ocmVmKTtcblx0XHRpZiAoc3VwcG9ydHNOYXZpZ2F0aW9uQXBpKSBnbG9iYWxUaGlzLm5hdmlnYXRpb24uYWRkRXZlbnRMaXN0ZW5lcihcIm5hdmlnYXRlXCIsIChldmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VXJsID0gbmV3IFVSTChldmVudC5kZXN0aW5hdGlvbi51cmwpO1xuXHRcdFx0aWYgKG5ld1VybC5ocmVmID09PSBsYXN0VXJsLmhyZWYpIHJldHVybjtcblx0XHRcdHdpbmRvdy5kaXNwYXRjaEV2ZW50KG5ldyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50KG5ld1VybCwgbGFzdFVybCkpO1xuXHRcdFx0bGFzdFVybCA9IG5ld1VybDtcblx0XHR9LCB7IHNpZ25hbDogY3R4LnNpZ25hbCB9KTtcblx0XHRlbHNlIGN0eC5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuXHRcdFx0aWYgKG5ld1VybC5ocmVmICE9PSBsYXN0VXJsLmhyZWYpIHtcblx0XHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBsYXN0VXJsKSk7XG5cdFx0XHRcdGxhc3RVcmwgPSBuZXdVcmw7XG5cdFx0XHR9XG5cdFx0fSwgMWUzKTtcblx0fSB9O1xufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9OyIsImltcG9ydCB7IGxvZ2dlciB9IGZyb20gXCIuL2ludGVybmFsL2xvZ2dlci5tanNcIjtcbmltcG9ydCB7IGdldFVuaXF1ZUV2ZW50TmFtZSB9IGZyb20gXCIuL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzXCI7XG5pbXBvcnQgeyBjcmVhdGVMb2NhdGlvbldhdGNoZXIgfSBmcm9tIFwiLi9pbnRlcm5hbC9sb2NhdGlvbi13YXRjaGVyLm1qc1wiO1xuaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gXCJ3eHQvYnJvd3NlclwiO1xuXG4vLyNyZWdpb24gc3JjL3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQudHNcbi8qKlxuKiBJbXBsZW1lbnRzIFtgQWJvcnRDb250cm9sbGVyYF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0Fib3J0Q29udHJvbGxlcikuXG4qIFVzZWQgdG8gZGV0ZWN0IGFuZCBzdG9wIGNvbnRlbnQgc2NyaXB0IGNvZGUgd2hlbiB0aGUgc2NyaXB0IGlzIGludmFsaWRhdGVkLlxuKlxuKiBJdCBhbHNvIHByb3ZpZGVzIHNldmVyYWwgdXRpbGl0aWVzIGxpa2UgYGN0eC5zZXRUaW1lb3V0YCBhbmQgYGN0eC5zZXRJbnRlcnZhbGAgdGhhdCBzaG91bGQgYmUgdXNlZCBpblxuKiBjb250ZW50IHNjcmlwdHMgaW5zdGVhZCBvZiBgd2luZG93LnNldFRpbWVvdXRgIG9yIGB3aW5kb3cuc2V0SW50ZXJ2YWxgLlxuKlxuKiBUbyBjcmVhdGUgY29udGV4dCBmb3IgdGVzdGluZywgeW91IGNhbiB1c2UgdGhlIGNsYXNzJ3MgY29uc3RydWN0b3I6XG4qXG4qIGBgYHRzXG4qIGltcG9ydCB7IENvbnRlbnRTY3JpcHRDb250ZXh0IH0gZnJvbSAnd3h0L3V0aWxzL2NvbnRlbnQtc2NyaXB0cy1jb250ZXh0JztcbipcbiogdGVzdChcInN0b3JhZ2UgbGlzdGVuZXIgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiBjb250ZXh0IGlzIGludmFsaWRhdGVkXCIsICgpID0+IHtcbiogICBjb25zdCBjdHggPSBuZXcgQ29udGVudFNjcmlwdENvbnRleHQoJ3Rlc3QnKTtcbiogICBjb25zdCBpdGVtID0gc3RvcmFnZS5kZWZpbmVJdGVtKFwibG9jYWw6Y291bnRcIiwgeyBkZWZhdWx0VmFsdWU6IDAgfSk7XG4qICAgY29uc3Qgd2F0Y2hlciA9IHZpLmZuKCk7XG4qXG4qICAgY29uc3QgdW53YXRjaCA9IGl0ZW0ud2F0Y2god2F0Y2hlcik7XG4qICAgY3R4Lm9uSW52YWxpZGF0ZWQodW53YXRjaCk7IC8vIExpc3RlbiBmb3IgaW52YWxpZGF0ZSBoZXJlXG4qXG4qICAgYXdhaXQgaXRlbS5zZXRWYWx1ZSgxKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFRpbWVzKDEpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkV2l0aCgxLCAwKTtcbipcbiogICBjdHgubm90aWZ5SW52YWxpZGF0ZWQoKTsgLy8gVXNlIHRoaXMgZnVuY3Rpb24gdG8gaW52YWxpZGF0ZSB0aGUgY29udGV4dFxuKiAgIGF3YWl0IGl0ZW0uc2V0VmFsdWUoMik7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRUaW1lcygxKTtcbiogfSk7XG4qIGBgYFxuKi9cbnZhciBDb250ZW50U2NyaXB0Q29udGV4dCA9IGNsYXNzIENvbnRlbnRTY3JpcHRDb250ZXh0IHtcblx0c3RhdGljIFNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSA9IGdldFVuaXF1ZUV2ZW50TmFtZShcInd4dDpjb250ZW50LXNjcmlwdC1zdGFydGVkXCIpO1xuXHRpZDtcblx0YWJvcnRDb250cm9sbGVyO1xuXHRsb2NhdGlvbldhdGNoZXIgPSBjcmVhdGVMb2NhdGlvbldhdGNoZXIodGhpcyk7XG5cdGNvbnN0cnVjdG9yKGNvbnRlbnRTY3JpcHROYW1lLCBvcHRpb25zKSB7XG5cdFx0dGhpcy5jb250ZW50U2NyaXB0TmFtZSA9IGNvbnRlbnRTY3JpcHROYW1lO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5pZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIpO1xuXHRcdHRoaXMuYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdHRoaXMuc3RvcE9sZFNjcmlwdHMoKTtcblx0XHR0aGlzLmxpc3RlbkZvck5ld2VyU2NyaXB0cygpO1xuXHR9XG5cdGdldCBzaWduYWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcblx0fVxuXHRhYm9ydChyZWFzb24pIHtcblx0XHRyZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuYWJvcnQocmVhc29uKTtcblx0fVxuXHRnZXQgaXNJbnZhbGlkKCkge1xuXHRcdGlmIChicm93c2VyLnJ1bnRpbWU/LmlkID09IG51bGwpIHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5zaWduYWwuYWJvcnRlZDtcblx0fVxuXHRnZXQgaXNWYWxpZCgpIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNJbnZhbGlkO1xuXHR9XG5cdC8qKlxuXHQqIEFkZCBhIGxpc3RlbmVyIHRoYXQgaXMgY2FsbGVkIHdoZW4gdGhlIGNvbnRlbnQgc2NyaXB0J3MgY29udGV4dCBpcyBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIEByZXR1cm5zIEEgZnVuY3Rpb24gdG8gcmVtb3ZlIHRoZSBsaXN0ZW5lci5cblx0KlxuXHQqIEBleGFtcGxlXG5cdCogYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG5cdCogY29uc3QgcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lciA9IGN0eC5vbkludmFsaWRhdGVkKCgpID0+IHtcblx0KiAgIGJyb3dzZXIucnVudGltZS5vbk1lc3NhZ2UucmVtb3ZlTGlzdGVuZXIoY2IpO1xuXHQqIH0pXG5cdCogLy8gLi4uXG5cdCogcmVtb3ZlSW52YWxpZGF0ZWRMaXN0ZW5lcigpO1xuXHQqL1xuXHRvbkludmFsaWRhdGVkKGNiKSB7XG5cdFx0dGhpcy5zaWduYWwuYWRkRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcblx0XHRyZXR1cm4gKCkgPT4gdGhpcy5zaWduYWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFib3J0XCIsIGNiKTtcblx0fVxuXHQvKipcblx0KiBSZXR1cm4gYSBwcm9taXNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMuIFVzZWZ1bCBpZiB5b3UgaGF2ZSBhbiBhc3luYyBmdW5jdGlvbiB0aGF0IHNob3VsZG4ndCBydW5cblx0KiBhZnRlciB0aGUgY29udGV4dCBpcyBleHBpcmVkLlxuXHQqXG5cdCogQGV4YW1wbGVcblx0KiBjb25zdCBnZXRWYWx1ZUZyb21TdG9yYWdlID0gYXN5bmMgKCkgPT4ge1xuXHQqICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcblx0KlxuXHQqICAgLy8gLi4uXG5cdCogfVxuXHQqL1xuXHRibG9jaygpIHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4ge30pO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0SW50ZXJ2YWxgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsIHdoZW4gaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBJbnRlcnZhbHMgY2FuIGJlIGNsZWFyZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjbGVhckludGVydmFsYCBmdW5jdGlvbi5cblx0Ki9cblx0c2V0SW50ZXJ2YWwoaGFuZGxlciwgdGltZW91dCkge1xuXHRcdGNvbnN0IGlkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgaGFuZGxlcigpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjbGVhckludGVydmFsKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cuc2V0VGltZW91dGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWwgd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIFRpbWVvdXRzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgc2V0VGltZW91dGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldFRpbWVvdXQoaGFuZGxlciwgdGltZW91dCkge1xuXHRcdGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFyVGltZW91dChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlIHJlcXVlc3Qgd2hlblxuXHQqIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbEFuaW1hdGlvbkZyYW1lYCBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdEFuaW1hdGlvbkZyYW1lKGNhbGxiYWNrKSB7XG5cdFx0Y29uc3QgaWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKC4uLmFyZ3MpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuXHRcdH0pO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxBbmltYXRpb25GcmFtZShpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RJZGxlQ2FsbGJhY2tgIHRoYXQgYXV0b21hdGljYWxseSBjYW5jZWxzIHRoZSByZXF1ZXN0IHdoZW5cblx0KiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIENhbGxiYWNrcyBjYW4gYmUgY2FuY2VsZWQgYnkgY2FsbGluZyB0aGUgbm9ybWFsIGBjYW5jZWxJZGxlQ2FsbGJhY2tgIGZ1bmN0aW9uLlxuXHQqL1xuXHRyZXF1ZXN0SWRsZUNhbGxiYWNrKGNhbGxiYWNrLCBvcHRpb25zKSB7XG5cdFx0Y29uc3QgaWQgPSByZXF1ZXN0SWRsZUNhbGxiYWNrKCguLi5hcmdzKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuc2lnbmFsLmFib3J0ZWQpIGNhbGxiYWNrKC4uLmFyZ3MpO1xuXHRcdH0sIG9wdGlvbnMpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBjYW5jZWxJZGxlQ2FsbGJhY2soaWQpKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0YWRkRXZlbnRMaXN0ZW5lcih0YXJnZXQsIHR5cGUsIGhhbmRsZXIsIG9wdGlvbnMpIHtcblx0XHRpZiAodHlwZSA9PT0gXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIikge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgdGhpcy5sb2NhdGlvbldhdGNoZXIucnVuKCk7XG5cdFx0fVxuXHRcdHRhcmdldC5hZGRFdmVudExpc3RlbmVyPy4odHlwZS5zdGFydHNXaXRoKFwid3h0OlwiKSA/IGdldFVuaXF1ZUV2ZW50TmFtZSh0eXBlKSA6IHR5cGUsIGhhbmRsZXIsIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRzaWduYWw6IHRoaXMuc2lnbmFsXG5cdFx0fSk7XG5cdH1cblx0LyoqXG5cdCogQGludGVybmFsXG5cdCogQWJvcnQgdGhlIGFib3J0IGNvbnRyb2xsZXIgYW5kIGV4ZWN1dGUgYWxsIGBvbkludmFsaWRhdGVkYCBsaXN0ZW5lcnMuXG5cdCovXG5cdG5vdGlmeUludmFsaWRhdGVkKCkge1xuXHRcdHRoaXMuYWJvcnQoXCJDb250ZW50IHNjcmlwdCBjb250ZXh0IGludmFsaWRhdGVkXCIpO1xuXHRcdGxvZ2dlci5kZWJ1ZyhgQ29udGVudCBzY3JpcHQgXCIke3RoaXMuY29udGVudFNjcmlwdE5hbWV9XCIgY29udGV4dCBpbnZhbGlkYXRlZGApO1xuXHR9XG5cdHN0b3BPbGRTY3JpcHRzKCkge1xuXHRcdGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgeyBkZXRhaWw6IHtcblx0XHRcdGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuXHRcdFx0bWVzc2FnZUlkOiB0aGlzLmlkXG5cdFx0fSB9KSk7XG5cdFx0d2luZG93LnBvc3RNZXNzYWdlKHtcblx0XHRcdHR5cGU6IENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSxcblx0XHRcdGNvbnRlbnRTY3JpcHROYW1lOiB0aGlzLmNvbnRlbnRTY3JpcHROYW1lLFxuXHRcdFx0bWVzc2FnZUlkOiB0aGlzLmlkXG5cdFx0fSwgXCIqXCIpO1xuXHR9XG5cdHZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkge1xuXHRcdGNvbnN0IGlzU2FtZUNvbnRlbnRTY3JpcHQgPSBldmVudC5kZXRhaWw/LmNvbnRlbnRTY3JpcHROYW1lID09PSB0aGlzLmNvbnRlbnRTY3JpcHROYW1lO1xuXHRcdGNvbnN0IGlzRnJvbVNlbGYgPSBldmVudC5kZXRhaWw/Lm1lc3NhZ2VJZCA9PT0gdGhpcy5pZDtcblx0XHRyZXR1cm4gaXNTYW1lQ29udGVudFNjcmlwdCAmJiAhaXNGcm9tU2VsZjtcblx0fVxuXHRsaXN0ZW5Gb3JOZXdlclNjcmlwdHMoKSB7XG5cdFx0Y29uc3QgY2IgPSAoZXZlbnQpID0+IHtcblx0XHRcdGlmICghKGV2ZW50IGluc3RhbmNlb2YgQ3VzdG9tRXZlbnQpIHx8ICF0aGlzLnZlcmlmeVNjcmlwdFN0YXJ0ZWRFdmVudChldmVudCkpIHJldHVybjtcblx0XHRcdHRoaXMubm90aWZ5SW52YWxpZGF0ZWQoKTtcblx0XHR9O1xuXHRcdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLCBjYik7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoQ29udGVudFNjcmlwdENvbnRleHQuU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFLCBjYikpO1xuXHR9XG59O1xuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IENvbnRlbnRTY3JpcHRDb250ZXh0IH07Il0sIm5hbWVzIjpbImRlZmluaXRpb24iLCJyZXN1bHQiLCJjb250ZW50IiwicHJpbnQiLCJsb2dnZXIiLCJicm93c2VyIiwiV3h0TG9jYXRpb25DaGFuZ2VFdmVudCIsIkNvbnRlbnRTY3JpcHRDb250ZXh0Il0sIm1hcHBpbmdzIjoiOztBQUNBLFdBQVMsb0JBQW9CQSxhQUFZO0FBQ3hDLFdBQU9BO0FBQUEsRUFDUjtBQ3lDTyxRQUFNLG9CQUErQjtBQUFBLElBQzFDLE1BQU07QUFBQSxNQUNKLGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLG1CQUFtQjtBQUFBLE1BQ25CLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxNQUNaLFdBQVc7QUFBQSxNQUNYLGFBQWE7QUFBQSxNQUNiLGFBQWE7QUFBQSxNQUNiLGFBQWE7QUFBQSxJQUFBO0FBQUEsSUFFZixRQUFRO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsSUFBQTtBQUFBLEVBRWhCO0FBRUEsTUFBSSxtQkFBcUM7QUFFbEMsV0FBUyxnQkFBb0M7QUFDbEQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxZQUFZO0FBQzlCLGFBQU8sUUFBUSxLQUFLLElBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQ0MsWUFBVztBQUNqRCxZQUFJQSxRQUFPLFdBQVc7QUFDcEIsNkJBQW1CQSxRQUFPO0FBQUEsUUFDNUIsT0FBTztBQUNMLDZCQUFtQixLQUFLLE1BQU0sS0FBSyxVQUFVLGlCQUFpQixDQUFDO0FBQUEsUUFDakU7QUFDQSxnQkFBUSxnQkFBaUI7QUFBQSxNQUMz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QSxJQUNQO0FBQUEsSUFDQSx5QkFBeUIsT0FBTztBQUMvQixZQUFNLHNCQUFzQixNQUFNLFFBQVEsc0JBQXNCLEtBQUs7QUFDckUsWUFBTSxhQUFhLE1BQU0sUUFBUSxjQUFjLEtBQUs7QUFDcEQsYUFBTyx1QkFBdUIsQ0FBQztBQUFBLElBQ2hDO0FBQUEsSUFDQSx3QkFBd0I7QUFDdkIsWUFBTSxLQUFLLENBQUMsVUFBVTtBQUNyQixZQUFJLEVBQUUsaUJBQWlCLGdCQUFnQixDQUFDLEtBQUsseUJBQXlCLEtBQUssRUFBRztBQUM5RSxhQUFLLGtCQUFpQjtBQUFBLE1BQ3ZCO0FBQ0EsZUFBUyxpQkFBaUJBLHNCQUFxQiw2QkFBNkIsRUFBRTtBQUM5RSxXQUFLLGNBQWMsTUFBTSxTQUFTLG9CQUFvQkEsc0JBQXFCLDZCQUE2QixFQUFFLENBQUM7QUFBQSxJQUM1RztBQUFBLEVBQ0Q7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7IiwieF9nb29nbGVfaWdub3JlTGlzdCI6WzAsMTIsMTMsMTQsMTUsMTYsMTddfQ==
content;