import { DEFAULT_DEEP_DIVE_MODES, type DeepDiveMode } from './types';

export function injectModeSelector(): void {
  const existing = document.getElementById('gemini-deep-dive-mode-selector');
  if (existing) existing.remove();

  chrome.storage.sync.get(
    ['deepDiveModes', 'currentDeepDiveModeId'],
    (r: Record<string, unknown>) => {
      const modes =
        (r.deepDiveModes as DeepDiveMode[] | undefined) &&
        (r.deepDiveModes as DeepDiveMode[]).length > 0
          ? (r.deepDiveModes as DeepDiveMode[])
          : DEFAULT_DEEP_DIVE_MODES;

      const wrapper = document.createElement('div');
      wrapper.id = 'gemini-deep-dive-mode-selector';
      wrapper.className = 'gemini-deep-dive-mode-selector';

      const select = document.createElement('select');
      select.id = 'gemini-deep-dive-mode';
      select.title = '深掘りモード';
      select.setAttribute('aria-label', '深掘りモード');

      modes.forEach((mode) => {
        const option = document.createElement('option');
        option.value = mode.id;
        option.textContent = mode.id;
        select.appendChild(option);
      });

      select.addEventListener('change', () => {
        chrome.storage.sync.set({ currentDeepDiveModeId: select.value });
      });

      wrapper.appendChild(select);

      const addButton = document.querySelector<HTMLElement>(
        'button[aria-label*="ファイル"], button[aria-label*="追加"]'
      );
      const toolsButton = document.querySelector<HTMLElement>(
        'button[aria-label*="ツール"], button[aria-label*="Tool"]'
      );
      const insertAfter = toolsButton || (addButton && addButton.nextElementSibling as HTMLElement | null);
      if (insertAfter && insertAfter.parentElement) {
        insertAfter.parentElement.insertBefore(wrapper, insertAfter.nextSibling);
      } else {
        const inputArea = document.querySelector<HTMLElement>(
          'div[contenteditable="true"][role="textbox"]'
        );
        if (inputArea) {
          const parent =
            inputArea.closest('form') ||
            inputArea.parentElement?.parentElement;
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
      const urlModeId = urlParams.get('mode_id');
      let modeId = r.currentDeepDiveModeId as string | undefined;
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
