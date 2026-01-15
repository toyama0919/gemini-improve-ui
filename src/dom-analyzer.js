// DOM構造をAIエージェントが認識できる形式で出力

class DOMAnalyzer {
  constructor() {
    // 複数のセレクター候補を安定性順に保持
    this.elementSelectors = {
      textarea: [
        '[aria-label*="プロンプト"]',
        '[role="textbox"][contenteditable="true"]',
        '.ql-editor.textarea',
        'rich-textarea [contenteditable="true"]'
      ],
      sidebar: [
        'nav[role="navigation"]',
        '.side-nav-container',
        'aside'
      ],
      chatHistory: [
        'nav button[description]',
        '.chat-history-item',
        '[role="button"][description*=""]'
      ],
      newChatButton: [
        '[description*="新規作成"]',
        'a[href*="/app"][description]'
      ]
    };
  }

  // 最初にマッチするセレクターで要素を取得
  findElement(type) {
    const selectors = this.elementSelectors[type] || [];
    
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`[DOMAnalyzer] Found ${type} with selector: ${selector}`);
          return { element, selector };
        }
      } catch (e) {
        console.warn(`[DOMAnalyzer] Invalid selector: ${selector}`, e);
      }
    }
    
    console.warn(`[DOMAnalyzer] Could not find element type: ${type}`);
    return { element: null, selector: null };
  }

  // 全要素を検索して利用可能なセレクターを返す
  findAllElements() {
    const result = {};
    
    for (const type in this.elementSelectors) {
      result[type] = this.findElement(type);
    }
    
    return result;
  }

  // ページの構造をAI向けに出力
  capturePageStructure() {
    const structure = {
      timestamp: Date.now(),
      url: window.location.href,
      title: document.title,
      elements: this.findAllElements(),
      interactiveElements: this.getInteractiveElements(),
      metadata: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scrollPosition: {
          x: window.scrollX,
          y: window.scrollY
        }
      }
    };

    return structure;
  }

  // インタラクティブな要素を抽出
  getInteractiveElements() {
    const elements = [];
    const selector = 'button, a, input, textarea, [role="button"], [contenteditable="true"]';
    const interactives = document.querySelectorAll(selector);

    interactives.forEach((el, index) => {
      if (index >= 50) return; // 最大50個まで

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // 非表示要素はスキップ

      elements.push({
        index,
        type: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        text: el.textContent?.trim().substring(0, 50) || '',
        description: el.getAttribute('description') || '',
        isVisible: rect.width > 0 && rect.height > 0,
        position: {
          x: Math.round(rect.x),
          y: Math.round(rect.y)
        }
      });
    });

    return elements;
  }

  // AI向けのテキスト形式で出力
  exportForAI() {
    const structure = this.capturePageStructure();
    
    let output = `## Gemini Chat Page Structure\n\n`;
    output += `**URL**: ${structure.url}\n`;
    output += `**Title**: ${structure.title}\n\n`;
    
    output += `### Main Elements\n\n`;
    for (const [type, data] of Object.entries(structure.elements)) {
      if (data.element) {
        output += `- **${type}**: \`${data.selector}\` ✓\n`;
      } else {
        output += `- **${type}**: Not found ✗\n`;
      }
    }
    
    output += `\n### Interactive Elements (${structure.interactiveElements.length})\n\n`;
    structure.interactiveElements.slice(0, 10).forEach(el => {
      if (el.text) {
        output += `- [${el.type}] ${el.text} (${el.ariaLabel || el.role})\n`;
      }
    });

    return output;
  }

  // クリップボードにコピー
  async copyToClipboard() {
    const text = this.exportForAI();
    
    try {
      await navigator.clipboard.writeText(text);
      this.showNotification('ページ構造をクリップボードにコピーしました');
      console.log('[DOMAnalyzer] Copied to clipboard:\n', text);
      return true;
    } catch (err) {
      console.error('[DOMAnalyzer] Failed to copy:', err);
      this.showNotification('コピーに失敗しました', 'error');
      return false;
    }
  }

  // 通知を表示
  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#f44336' : '#4CAF50'};
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
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.transition = 'opacity 0.3s';
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// グローバルに公開
window.domAnalyzer = new DOMAnalyzer();

// コンソールから使いやすいヘルパー関数
window.analyzePage = () => {
  console.log(window.domAnalyzer.capturePageStructure());
};

window.copyPageStructure = () => {
  window.domAnalyzer.copyToClipboard();
};

console.log('[DOMAnalyzer] Loaded. Use analyzePage() or copyPageStructure() in console.');
