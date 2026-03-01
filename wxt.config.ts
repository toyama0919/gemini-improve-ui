import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Gemini Chat UI Improvements',
    version: '3.1',
    description: 'Gemini Chat UI improvements with keyboard shortcuts',
    author: 'toyama0919',
    permissions: ['storage'],
    host_permissions: [
      'https://gemini.google.com/*',
      'https://www.google.co.jp/*',
    ],
  },
  extensionApi: 'chrome',
  runner: {
    binaries: {
      chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    chromiumArgs: [
      '--remote-debugging-port=9222',
      `--user-data-dir=${process.cwd()}/.chrome-devtools-mcp`,
      '--disable-blink-features=AutomationControlled',
      '--exclude-switches=enable-automation',
    ],
    startUrls: ['https://gemini.google.com/app'],
  },
});
