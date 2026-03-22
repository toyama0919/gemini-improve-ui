# Gemini Chat UI Improvements

Google Gemini の Web UI を強化する Chrome 拡張機能。キーボードショートカット、チャット幅調整、Deep Dive、会話マップなどを追加する。

## Features

- カスタマイズ可能なキーボードショートカット
- チャットエリア幅の調整（600px - 1600px）
- キーボードによるチャット履歴ナビゲーション
- 検索結果のキーボードブラウジング
- サイドバー要素の非表示（Gems リスト、My Stuff セクション）
- コピーボタンへのクイックアクセス
- **Deep Dive** — レスポンス内のセクション・リスト・テーブル・引用を深掘り
- **会話マップ** — 右サイドに固定表示されるチャットアウトライン（スクロール位置ハイライト付き）
- **クイックプロンプト** — プルダウンから定型プロンプトを選択して即送信（ページ遷移なし）
- **URL クエリパラメータ** — `?q=...` で新規チャットに質問を事前入力、`?qt=...` で既存会話スレッドにも入力可能
- オートコンプリート
- DOM 構造分析（AI 開発者向け）

## Keyboard Shortcuts

すべてのショートカットは拡張のオプションページでカスタマイズ可能。以下はデフォルト値。

### チャット画面

| キー | 動作 |
|------|------|
| `Insert` | 検索画面へ移動 |
| `Home` | サイドバーの開閉 |
| `End` | テキストエリア → アクションボタン → サイドバー → テキストエリアのサイクル |
| `PageUp` / `PageDown` | チャットエリアのスクロール |
| `↑` / `↓` | 履歴選択モードでのナビゲーション |
| `Enter` | 選択した履歴を開く |
| `Esc` | 履歴選択モード終了 |

### 検索画面

| キー | 動作 |
|------|------|
| `↑` / `↓` | 検索結果のナビゲーション |
| `Enter` | 選択した検索結果を開く |
| `PageUp` / `PageDown` | ページスクロール |

### Deep Dive ボタン

| キー | 動作 |
|------|------|
| `↑` / `↓`（テキストエリア空） | Deep Dive ボタンにフォーカス |
| `↑` / `↓`（ボタンフォーカス中） | 他の Deep Dive ボタンへ移動 |
| `→` | 子ボタンの展開/折りたたみ（+/- トグル） |
| `←` | 引用テンプレートメニューの表示/非表示 |
| `Enter` | フォーカス中のボタンをクリック |

### オートコンプリート

| キー | 動作 |
|------|------|
| `Tab` | 選択中のサジェストで補完 |
| `↑` / `↓` | サジェストの移動 |
| `Esc` | メニューを閉じる |

### AI 開発者向け

- `Ctrl+Shift+D`: ページの DOM 構造をクリップボードにコピー（AI 分析用）

## Deep Dive

Gemini のレスポンスをインラインボタンで深掘りする機能。以下の要素にボタンが表示される:

- **セクション見出し** (h1-h6)
- **リスト** (ol/ul)
- **テーブル**
- **引用** (blockquote)
- **孤立段落**（見出しに属さないパラグラフ群）

**使い方:**

1. ↳ ボタンをクリック → 引用 + プロンプトを送信
2. `Ctrl+クリック` → 引用のみ（プロンプトは自分で入力）

**モード:** 入力欄横のドロップダウンでプロンプトを切替。URL に `?mode_id=xxx` を付けても指定可能。オプションページで設定。

**細かい選択:**

1. `→` キーで `+` を `-` に切り替え、子要素ごとの ↳ ボタンを展開
2. 個別の段落やリストアイテムを選択して深掘り
3. `→` キーで再度トグルして折りたたみ
4. `←` キーで引用テンプレートメニューを表示

## 会話マップ

チャット画面の右側に固定表示されるアウトラインパネル。

- チャットページで常に表示
- 現在表示中のチャットターンをハイライト（IntersectionObserver ベース）
- クリックでそのターンにスムーズスクロール
- 新しいターン追加時に自動更新

## URL クエリパラメータ

URL に `q` パラメータを付けて Gemini を開くと、質問が事前入力される。

```
https://gemini.google.com/app?q=Pythonでソートアルゴリズムを教えて
```

既存の会話スレッド（`/app/xxxxx`）に追加質問したい場合は `qt` パラメータを使う。

```
https://gemini.google.com/app/abc123?qt=続きを教えて
```

| パラメータ | 対象パス | 説明 |
|-----------|---------|------|
| `q` | `/app` のみ | 新規チャットにプロンプトを入力 |
| `qt` | 任意の `/app/...` | 既存スレッド含む全パスでプロンプトを入力 |
| `send` | 共通 | `true`（デフォルト）で自動送信、`false` で入力のみ |

```bash
# ターミナルから
open "https://gemini.google.com/app?q=Debug this error: $(cat error.log)"
# 既存会話に追加
open "https://gemini.google.com/app/abc123?qt=この結果をもっと詳しく"
```

## クイックプロンプト

入力エリア横のボタンからプルダウンメニューを開き、定型プロンプトを選択して即送信できる。ページ遷移は発生しない。

デフォルトのプロンプト:
- ここまでの内容をまとめて
- 続きを教えて
- もっと詳しく教えて
- 具体例を挙げて

設定画面（Options）でプロンプトの追加・編集・削除が可能。

## Settings

1. 拡張アイコンを右クリック → "Options"
2. キーボードショートカット、チャット幅、Deep Dive モード、クイックプロンプト等を設定
3. "Save Settings" で保存

## Installation

```bash
git clone https://github.com/toyama0919/gemini-improve-ui.git
cd gemini-improve-ui
npm install
npm run build
```

1. Chrome で `chrome://extensions/` を開く
2. 右上の "Developer mode" を有効化
3. "Load unpacked" をクリック
4. `dist/chrome-mv3/` ディレクトリを選択

## Development

WXT ベースのビルドシステムを使用。

```bash
./dev.sh dev      # WXT dev server + Chrome 起動（ホットリロード）
./dev.sh stop     # Chrome 停止
./dev.sh status   # 接続確認
```

### ファイル構成

```
gemini-improve-ui/
├── wxt.config.ts           # WXT 設定
├── package.json
├── dev.sh                  # 開発ヘルパースクリプト
├── entrypoints/
│   ├── content/index.ts    # Content Script エントリポイント
│   └── options/main.ts     # オプションページ
├── src/
│   ├── settings.ts         # 設定管理・ストレージ
│   ├── keyboard.ts         # キーボードイベントハンドラ
│   ├── chat.ts             # チャット UI（テキストエリア、サイドバー、スクロール）
│   ├── deep-dive.ts        # Deep Dive ボタン
│   ├── map.ts              # 会話マップパネル
│   ├── history.ts          # チャット履歴選択モード
│   ├── search.ts           # 検索ページ
│   ├── autocomplete.ts     # オートコンプリート
│   ├── export.ts           # Zettelkasten エクスポート
│   └── dom-analyzer.ts     # DOM 構造分析
├── public/icons/           # 拡張アイコン
└── .cursor/mcp.json        # Chrome DevTools MCP 設定
```

### Chrome DevTools MCP

Cursor で Chrome DevTools MCP を使ったデバッグが可能。`.cursor/mcp.json` に設定済み。

```bash
./dev.sh dev          # Chrome + MCP 接続
curl http://localhost:9222/json/list   # 接続確認
```

### セレクター戦略

1. ARIA 属性（`aria-label`, `role`）— 最も安定
2. セマンティック属性（`data-test-id`）— 中程度
3. クラス名 — 最終手段、フォールバック

## License

MIT License

## Author

toyama0919
