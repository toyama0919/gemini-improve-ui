import { DEEP_DIVE_CSS } from '../styles/deepDive';

export function addDeepDiveStyles(): void {
  const styleId = 'gemini-deep-dive-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = DEEP_DIVE_CSS;
  document.head.appendChild(style);
}
