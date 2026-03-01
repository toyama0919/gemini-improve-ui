import { DEFAULT_SHORTCUTS, Shortcuts } from '../../src/settings';

interface DeepDiveMode {
  id: string;
  prompt?: string;
}

const DEFAULT_DEEP_DIVE_MODES: DeepDiveMode[] = [
  { id: 'default', prompt: 'これについて詳しく' },
];

let currentShortcuts: Shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
let currentChatWidth = 900;
let currentDeepDiveModes: DeepDiveMode[] = JSON.parse(
  JSON.stringify(DEFAULT_DEEP_DIVE_MODES)
);

function loadSettings(): void {
  chrome.storage.sync.get(
    ['shortcuts', 'chatWidth', 'deepDiveModes', 'currentDeepDiveModeId'],
    (result) => {
      if (result.shortcuts) currentShortcuts = result.shortcuts;
      if (result.chatWidth) currentChatWidth = result.chatWidth;
      if (result.deepDiveModes && result.deepDiveModes.length > 0) {
        currentDeepDiveModes = result.deepDiveModes;
      }
      displaySettings();
    }
  );
}

function displayDeepDiveModes(): void {
  const container = document.getElementById('deepDiveModes');
  if (!container) return;

  container.innerHTML = '';
  currentDeepDiveModes.forEach((mode, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.cssText =
      'border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; margin-bottom: 8px; background: #fafafa; display: grid; grid-template-columns: 120px 1fr auto; gap: 12px; align-items: center;';

    const idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.dataset.modeIndex = String(index);
    idInput.value = mode.id || '';
    idInput.placeholder = 'ID';
    idInput.style.cssText = 'padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px;';

    const promptInput = document.createElement('input');
    promptInput.type = 'text';
    promptInput.dataset.modeIndex = String(index);
    promptInput.value = mode.prompt || '';
    promptInput.placeholder = 'プロンプト';
    promptInput.style.cssText = 'padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px;';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-secondary btn-delete-mode';
    deleteBtn.dataset.modeIndex = String(index);
    deleteBtn.textContent = '削除';
    deleteBtn.style.cssText = 'padding: 6px 12px;';

    itemDiv.appendChild(idInput);
    itemDiv.appendChild(promptInput);
    itemDiv.appendChild(deleteBtn);
    container.appendChild(itemDiv);

    idInput.addEventListener('input', (e) => {
      currentDeepDiveModes[index].id = (e.target as HTMLInputElement).value;
    });
    promptInput.addEventListener('input', (e) => {
      currentDeepDiveModes[index].prompt = (e.target as HTMLInputElement).value;
    });
    deleteBtn.addEventListener('click', () => {
      if (currentDeepDiveModes.length > 1) {
        currentDeepDiveModes.splice(index, 1);
        displayDeepDiveModes();
      } else {
        alert('少なくとも1つのモードが必要です');
      }
    });
  });

  const addButton = document.createElement('button');
  addButton.className = 'btn-primary';
  addButton.textContent = '+ モードを追加';
  addButton.style.cssText = 'width: 100%; margin-top: 8px;';
  addButton.addEventListener('click', () => {
    currentDeepDiveModes.push({ id: 'mode-' + Date.now(), prompt: '' });
    displayDeepDiveModes();
  });
  container.appendChild(addButton);
}

function displaySettings(): void {
  displayDeepDiveModes();

  const chatWidthSlider = document.getElementById('chatWidth') as HTMLInputElement | null;
  const chatWidthValue = document.getElementById('chatWidthValue');
  if (chatWidthSlider && chatWidthValue) {
    chatWidthSlider.value = String(currentChatWidth);
    chatWidthValue.textContent = `${currentChatWidth}px`;
  }

  for (const key in currentShortcuts.chat) {
    const input = document.getElementById(`chat.${key}`) as HTMLInputElement | null;
    if (input) {
      input.value = currentShortcuts.chat[key as keyof typeof currentShortcuts.chat];
    }
  }

  for (const key in currentShortcuts.search) {
    const input = document.getElementById(`search.${key}`) as HTMLInputElement | null;
    if (input) {
      input.value = currentShortcuts.search[key as keyof typeof currentShortcuts.search];
    }
  }
}

function saveSettings(): void {
  currentDeepDiveModes.forEach((mode, i) => {
    if (!mode.id) mode.id = `mode-${i}-${Date.now()}`;
  });

  chrome.storage.sync.set(
    {
      shortcuts: currentShortcuts,
      chatWidth: currentChatWidth,
      deepDiveModes: currentDeepDiveModes,
    },
    () => {
      showMessage('Settings saved successfully!');
    }
  );
}

function resetSettings(): void {
  currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  currentChatWidth = 900;
  currentDeepDiveModes = JSON.parse(JSON.stringify(DEFAULT_DEEP_DIVE_MODES));
  displaySettings();
  chrome.storage.sync.set(
    {
      shortcuts: currentShortcuts,
      chatWidth: currentChatWidth,
      deepDiveModes: currentDeepDiveModes,
      currentDeepDiveModeId: 'default',
    },
    () => {
      showMessage('Settings reset to default!');
    }
  );
}

function showMessage(text: string): void {
  const message = document.getElementById('message');
  if (!message) return;
  message.textContent = text;
  message.classList.add('show');
  setTimeout(() => message.classList.remove('show'), 2000);
}

function handleKeyInput(event: KeyboardEvent, inputId: string): void {
  event.preventDefault();
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;

  const [section, key] = inputId.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (currentShortcuts as any)[section][key] = event.code;
  (event.target as HTMLInputElement).value = event.code;
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  const chatWidthSlider = document.getElementById('chatWidth') as HTMLInputElement | null;
  const chatWidthValue = document.getElementById('chatWidthValue');
  if (chatWidthSlider && chatWidthValue) {
    chatWidthSlider.addEventListener('input', (event) => {
      currentChatWidth = parseInt((event.target as HTMLInputElement).value);
      chatWidthValue.textContent = `${currentChatWidth}px`;
    });
  }

  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="text"]');
  inputs.forEach((input) => {
    input.addEventListener('keydown', (event) => {
      handleKeyInput(event, input.id);
    });
    input.addEventListener('keypress', (event) => {
      event.preventDefault();
    });
  });

  document.getElementById('saveBtn')?.addEventListener('click', () => {
    saveSettings();
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      resetSettings();
    }
  });
});
