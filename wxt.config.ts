import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Gemini Chat UI Improvements',
    version: '3.1',
    description: 'Gemini Chat UI improvements with keyboard shortcuts',
    author: 'toyama0919',
    permissions: ['storage', 'clipboardRead'],
    host_permissions: [
      'https://gemini.google.com/*',
      'https://www.google.co.jp/*',
    ],
  },
  extensionApi: 'chrome',
  outDir: 'dist',
  runner: {
    // web-ext adds --disable-sync / --use-mock-keychain; ./dev.sh dev launches Chrome instead.
    disabled: true,
  },
});
