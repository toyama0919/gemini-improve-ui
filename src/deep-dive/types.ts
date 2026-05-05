export interface DeepDiveMode {
  id: string;
  prompt?: string;
}

export interface DeepDiveTarget {
  type: 'section' | 'table' | 'blockquote' | 'list' | 'child' | 'orphan';
  element: HTMLElement;
  getContent: () => string;
  expandButtonId?: string;
}

export interface OrphanGroup {
  anchor: HTMLElement;
  elements: HTMLElement[];
}

export const DEFAULT_DEEP_DIVE_MODES: DeepDiveMode[] = [
  { id: 'default', prompt: 'これについて詳しく' },
];

export const SESSION_ID = Math.random().toString(36).substr(2, 9);

export type DeepDiveButtonElement = HTMLButtonElement & {
  _deepDiveTarget?: DeepDiveTarget;
};
