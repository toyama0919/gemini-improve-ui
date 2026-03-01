interface Window {
  rememberActionButtonPosition?: (index: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  domAnalyzer?: any;
  analyzePage?: () => void;
  copyPageStructure?: () => void;
  showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}
