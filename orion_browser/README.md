# Gemini Deep Dive — Orion Browser (iOS) Userscript

Deep Dive機能のみのスタンドアロンUserscript。Orion for iOSで動作する。

## インストール

### URLから直接

Orion for iOSで以下のURLを開く:

```
https://raw.githubusercontent.com/toyama0919/gemini-improve-ui/main/orion_browser/gemini-deep-dive.user.js
```

Orionがスクリプトを自動検出して「Install Userscript」ダイアログを表示する。

### 手動

1. Orion設定 → Userscripts → 有効にする
2. `gemini-deep-dive.user.js` をファイルとして追加

### 動作確認

`https://gemini.google.com/app` を開く → Geminiの応答に「↳」ボタンが表示される。

## 操作方法

| 操作 | 動作 |
|---|---|
| タップ | 引用 + プロンプトで送信 |
| 長押し (500ms) | テンプレート選択ポップアップ |
| `+` / `-` ボタン | セクション内の子要素を展開/折りたたみ |
| ⚙ ボタン | 設定パネルを開く |

## 設定

画面右下の ⚙ ボタンをタップすると設定パネルが開く。

- モードの追加・編集・削除が可能
- **ID**: ドロップダウンに表示される名前
- **プロンプト**: 深掘り時に引用の後に付加されるテキスト
- 「保存」で `localStorage` に永続化
- モードが2つ以上ある場合、⚙ の横にモード切替セレクタが表示される

## Chrome拡張との違い

| 項目 | Chrome拡張 | このUserscript |
|---|---|---|
| 対象 | Chrome / Edge / Orion (macOS) | Orion (iOS) |
| 機能 | 全機能 | Deep Diveのみ |
| 設定保存 | `chrome.storage.sync` | `GM_setValue` / `localStorage` |
| 設定UI | options.html | ページ内⚙パネル |
| タッチ操作 | Ctrl+Click | 長押し |
