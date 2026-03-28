---
name: chrome-devtools-debug
description: Debug Chrome extensions using chrome-devtools-mcp. Use when testing extensions, inspecting UI state, debugging Chrome interactions, or when user requests browser debugging.
---

# Chrome DevTools Debug

Chrome拡張のデバッグワークフロー。WXT dev server + Chrome DevTools MCPを使う。

## Quick Start

**開発時（ホットリロード + MCP）**

```bash
./dev.sh dev          # WXT dev server起動 → Chrome自動起動 (port 9222)
                      # ※ npm run dev の実体は `wxt`（`wxt dev`ではない）
./dev.sh stop         # Chrome停止
./dev.sh status       # 接続確認
```

**ビルド済みをテストする場合**

```bash
npm run build
./dev.sh start        # .output/chrome-mv3/ をロードして起動
./dev.sh start --fg   # フォアグラウンド (Ctrl+C で停止)
./dev.sh start --test # テストチャットURLも開く
```

**MCP接続確認**

```bash
curl http://localhost:9222/json/list
```

## MCP Configuration

`.cursor/mcp.json` で設定済み:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl=http://127.0.0.1:9222"]
    }
  }
}
```

## Development Workflow

### 通常の開発サイクル

```bash
./dev.sh dev
# → Chromeが自動で開く (port 9222)
# → ファイルを保存すると拡張が自動リロード
# → DevTools MCPはport 9222に接続済み
```

コード変更後の手動操作は**不要**。WXTが自動でリビルド + 拡張リロードする。

### MCPによる動作確認

```javascript
// ページに移動
navigate_page({ type: "url", url: "https://gemini.google.com/app" })

// ロード待ち（textは配列）
wait_for({ text: ["Google Gemini"], timeout: 5000 })

// 拡張機能の状態確認
evaluate_script({
  function: `() => ({
    customStyles: !!document.getElementById('gemini-improve-ui-custom-styles'),
    chatMaxWidth: getComputedStyle(document.documentElement).getPropertyValue('--chat-max-width').trim(),
    mapPanel: !!document.getElementById('gemini-map-panel'),
    deepDiveButtons: document.querySelectorAll('.deep-dive-button-inline').length,
  })`
})
// 期待値: customStyles=true, chatMaxWidth="900px", mapPanel=true (会話ページのみ)
```

> **注意**: Content Script は Isolated World で動作するため、`window.domAnalyzer` 等の window グローバルは `evaluate_script` からは見えない（page context と別空間）。DOM への変化（スタイル注入・要素追加）で確認する。

### デバッグの基本方針

**スクリーンショットより text-based verification を優先:**

```javascript
// Good: DOM構造をテキストで確認
evaluate_script(() => {
  const buttons = document.querySelectorAll('.deep-dive-button-inline');
  return {
    count: buttons.length,
    firstButton: buttons[0]?.outerHTML.substring(0, 200),
  };
});

// take_screenshot() は視覚的なレイアウト確認が必要な時だけ
```

### ソースファイルの場所

```
src/
  settings.ts      # ストレージ設定
  keyboard.ts      # キーボードショートカット
  deep-dive.ts     # Deep Diveボタン
  chat.ts          # チャット操作
  autocomplete.ts  # オートコンプリート
  export.ts        # Zettelkastenエクスポート
  map.ts           # アウトラインパネル
  dom-analyzer.ts  # DOM構造分析 (Ctrl+Shift+D)
  search.ts        # 検索ページ
  history.ts       # 履歴選択
entrypoints/
  content/index.ts # コンテンツスクリプト エントリポイント
  options/main.ts  # オプションページ
```

### DOM調査

```javascript
// take_snapshot() でDOM構造取得
// セレクター優先順位:
// 1. data-test-id (最安定)
// 2. ARIA属性 (aria-label, role)
// 3. セマンティック属性
// 4. クラス名 (最終手段)
```

## Troubleshooting

**`./dev.sh dev` でport競合エラー**

```bash
./dev.sh stop   # 既存のChromeを停止してから再実行
```

**MCP接続失敗**
- Node.js 22+ を確認: `node --version`
- Chrome起動確認: `curl http://localhost:9222/json/list`
- Cursorを再起動

**拡張が反映されない**
- WXT dev mode中は自動リロードされるはず → ターミナルのエラーログを確認
- `./dev.sh start` (ビルド版) の場合は `npm run build` 後に `./dev.sh restart`

**スタイルが適用されない**
- DevToolsで `--chat-max-width` CSS変数を確認
- ハードリロード (Cmd+Shift+R)

**Googleログインできない（「このブラウザは安全でない可能性があります」）**

WXT の automation フラグが Google に検知される。`wxt.config.ts` に以下が必要:
```typescript
chromiumArgs: [
  '--disable-blink-features=AutomationControlled',
  '--exclude-switches=enable-automation',
]
```
それでもブロックされる場合は `./dev.sh start` でまずログインしてプロファイルを作成する:
```bash
./dev.sh start   # WXTなしで Chrome を起動 → Google ログイン
./dev.sh stop    # ログイン後に停止
./dev.sh dev     # 以降は dev で OK（プロファイルにログイン状態が保持される）
```

**Chrome Canary が起動してしまう**

`wxt.config.ts` の `runner.binaries.chrome` に明示的にパスを指定:
```typescript
runner: {
  binaries: {
    chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  },
}
```

**CDP connection closed before response to Extensions.loadUnpacked**

`.chrome-devtools-mcp/` プロファイルが Canary で作られた場合、通常 Chrome で開けずクラッシュする。
```bash
rm -rf .chrome-devtools-mcp   # プロファイルをリセット（要再ログイン）
./dev.sh start                # まず start でログイン
./dev.sh dev                  # その後 dev
```

## Notes

- デバッグ用Chromeは `.chrome-devtools-mcp/` を user data dir として使用（通常のChromeと独立）
- port 9222 は `wxt.config.ts` の `runner.chromiumArgs` で固定
- テストチャットURL: `https://gemini.google.com/app/6cbdc99490e24d7e`
