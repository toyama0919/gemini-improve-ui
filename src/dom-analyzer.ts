// DOM構造をAIエージェントが認識できる形式で出力

type ElementType =
  | 'textarea'
  | 'sidebar'
  | 'sidebarToggle'
  | 'chatHistory'
  | 'newChatButton'
  | 'copyButtons'
  | 'chatContainer';

interface FindElementResult {
  element: Element | null;
  selector: string | null;
}

interface InteractiveElement {
  index: number;
  type: string;
  role: string;
  ariaLabel: string;
  text: string;
  description: string;
  isVisible: boolean;
  position: { x: number; y: number };
}

class DOMAnalyzer {
  private elementSelectors: Record<ElementType, string[]>;

  constructor() {
    this.elementSelectors = {
      textarea: [
        '[role="textbox"][contenteditable="true"]',
        '[aria-label*="プロンプト"]',
        '.ql-editor.textarea',
        'rich-textarea [contenteditable="true"]',
      ],
      sidebar: [
        '[role="navigation"]',
        'bard-sidenav',
        '.side-nav-container',
        'aside',
      ],
      sidebarToggle: [
        'button[aria-label*="メインメニュー"]',
        'button[aria-label*="Main menu"]',
        'button[data-test-id="side-nav-menu-button"]',
      ],
      chatHistory: [
        '.conversation[role="button"]',
        '[data-test-id="conversation"]',
        '.conversation-items-container .conversation',
      ],
      newChatButton: [
        'a[href="https://gemini.google.com/app"]',
        'a[aria-label*="新規作成"]',
        '[data-test-id="new-chat-button"]',
      ],
      copyButtons: [
        'button[aria-label*="コピー"]',
        'button[aria-label*="Copy"]',
        '.copy-button',
      ],
      chatContainer: [
        'chat-window',
        'main.main',
        '.conversation-container',
      ],
    };
  }

  findElement(type: ElementType): FindElementResult {
    const selectors = this.elementSelectors[type] || [];
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) return { element, selector };
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return { element: null, selector: null };
  }

  findAllElements(): Record<ElementType, FindElementResult> {
    const result = {} as Record<ElementType, FindElementResult>;
    for (const type in this.elementSelectors) {
      result[type as ElementType] = this.findElement(type as ElementType);
    }
    return result;
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
        scrollPosition: { x: window.scrollX, y: window.scrollY },
      },
    };
  }

  getInteractiveElements(): InteractiveElement[] {
    const elements: InteractiveElement[] = [];
    const selector =
      'button, a, input, textarea, [role="button"], [contenteditable="true"]';
    const interactives = document.querySelectorAll(selector);

    interactives.forEach((el, index) => {
      if (index >= 50) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      elements.push({
        index,
        type: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        text: el.textContent?.trim().substring(0, 50) || '',
        description: el.getAttribute('description') || '',
        isVisible: rect.width > 0 && rect.height > 0,
        position: { x: Math.round(rect.x), y: Math.round(rect.y) },
      });
    });

    return elements;
  }

  exportForAI(): string {
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
    structure.interactiveElements.slice(0, 10).forEach((el) => {
      if (el.text) {
        output += `- [${el.type}] ${el.text} (${el.ariaLabel || el.role})\n`;
      }
    });

    return output;
  }

  async copyToClipboard(): Promise<boolean> {
    const text = this.exportForAI();
    try {
      await navigator.clipboard.writeText(text);
      this.showNotification('ページ構造をクリップボードにコピーしました');
      return true;
    } catch {
      this.showNotification('コピーに失敗しました', 'error');
      return false;
    }
  }

  showNotification(message: string, type: 'success' | 'error' = 'success'): void {
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

export function initializeDOMAnalyzer(): void {
  window.domAnalyzer = new DOMAnalyzer();
  window.analyzePage = () => {
    console.log(window.domAnalyzer!.capturePageStructure());
  };
  window.copyPageStructure = () => {
    window.domAnalyzer!.copyToClipboard();
  };
}
