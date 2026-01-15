# 開発ガイド

## Chrome DevTools MCPとの連携

この拡張機能は、AIエージェントがGeminiページのDOM構造を認識できるように設計されている。
HTML構造が変更されても、AIエージェントに現在の状態を伝えることで、適切なセレクターを提案できる。

### セットアップ方法

#### 1. Chromeをリモートデバッグモードで起動

通常のChromeを全て終了してから、以下のコマンドで起動：

```bash
# macOSの場合
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/Users/hiroshi.toyama/agent-chrome-profile"

# Linuxの場合
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/agent-chrome-profile"

# Windowsの場合
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%USERPROFILE%\agent-chrome-profile"
```

**重要な注意点:**
- `--user-data-dir`は必須。デフォルトプロファイルではリモートデバッグが無効化されている
- ポート9222は他のアプリケーションと競合しないこと
- このプロファイルは開発・テスト専用として使用すること

#### 2. MCP設定ファイルの作成

Cursor/ClaudeのMCP設定ファイル（通常は`~/.cursor/mcp.json`または`~/github/dotfiles/.cursor/mcp.json`）に以下を追加：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browserUrl=http://127.0.0.1:9222"
      ]
    }
  }
}
```

**設定のポイント:**
- `--browserUrl`は既存のChromeインスタンスに接続するためのオプション
- `--remote-debugging-port`（旧設定）は新しいChromeを起動してしまうため使わない
- Nodeのバージョンは20.19.0以上が必要

#### 3. Cursorを再起動

MCP設定を反映させるため、Cursorを完全に再起動する。

#### 4. 動作確認

MCPツールを使ってページ情報を取得：

```javascript
// ページ一覧を表示
list_pages()

// DOM構造を取得
take_snapshot()

// JavaScriptを実行
evaluate_script({
  function: "() => { return document.title; }"
})
```

### 拡張機能からDOM情報をエクスポート

#### 方法1: キーボードショートカット（推奨）

1. Geminiページで`Ctrl+Shift+D`を押す
2. クリップボードにDOM構造情報がコピーされる
3. AIチャットに貼り付けて分析を依頼

#### 方法2: コンソールから手動実行

DevTools（F12）のコンソールで：

```javascript
// DOM構造を確認
window.analyzePage()

// クリップボードにコピー
window.copyPageStructure()
```

### トラブルシューティング

#### MCPが「Server error」になる

**原因:** Nodeのバージョンが古い、または`npx`が見つからない

**解決方法:**
```bash
# Nodeのバージョン確認
node --version  # 20.19.0以上が必要

# nodenvを使っている場合
nodenv install 20.19.0
nodenv global 20.19.0
nodenv rehash
```

#### MCPが新しいChromeを起動してしまう

**原因:** 設定ファイルで`--remote-debugging-port`を指定している

**解決方法:** `--browserUrl=http://127.0.0.1:9222`に変更

#### ポート9222に接続できない

**原因:** Chromeが正しくリモートデバッグモードで起動していない

**確認方法:**
```bash
# ポートが開いているか確認
curl http://localhost:9222/json/list

# Chromeのプロセスを確認
ps aux | grep "remote-debugging-port=9222"
```

**解決方法:**
1. 全てのChromeを終了: `killall "Google Chrome"`
2. 再度リモートデバッグモードで起動

#### 拡張機能がログイン情報を保持しない

**原因:** 一時プロファイル（`/tmp`など）を使用している

**解決方法:** ホームディレクトリ配下の永続的なディレクトリを使用：
```bash
--user-data-dir="$HOME/agent-chrome-profile"
```

### セキュリティ上の注意

- リモートデバッグモードは、ローカルの任意のアプリケーションがChromeを制御できる
- 本番環境のアカウントではなく、テスト用アカウントを使用すること
- 機密情報を扱うサイトにはアクセスしないこと
- 使用後は通常モードのChromeで作業すること

### 開発ワークフロー

1. **DOM構造の変更を検知**
   - 拡張機能の動作がおかしくなったら、`Ctrl+Shift+D`でDOM情報を取得
   - AIに貼り付けて、新しいセレクターを提案してもらう

2. **セレクターの更新**
   - `src/dom-analyzer.js`の`elementSelectors`を更新
   - 複数のセレクター候補を安定性順に記述

3. **テスト**
   - MCPで実際のページを操作してテスト
   - `evaluate_script`で要素が正しく取得できるか確認

4. **コミット**
   - 変更をコミット
   - バージョン番号を更新（`manifest.json`）

## ファイル構成

### コアファイル

- `src/dom-analyzer.js` - DOM構造の解析とエクスポート
- `src/keyboard.js` - キーボードショートカットの処理
- `src/chat.js` - チャット画面の操作
- `src/history.js` - 履歴選択モード
- `src/search.js` - 検索ページの操作

### セレクターの管理

`dom-analyzer.js`の`elementSelectors`で管理：

```javascript
this.elementSelectors = {
  textarea: [
    '[aria-label*="プロンプト"]',           // 最も安定（ARIAラベル）
    '[role="textbox"][contenteditable="true"]', // セマンティック
    '.ql-editor.textarea',                   // クラス名（変更されやすい）
  ],
  // ...
};
```

**優先順位:**
1. ARIA属性（`aria-label`, `role`など）
2. セマンティックな属性（`data-*`など）
3. クラス名やタグ構造

## 参考リンク

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/)
