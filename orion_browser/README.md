# Gemini Deep Dive — Orion Browser (iOS)

Deep Dive機能のみの軽量Chrome拡張。Orion for iOSで動作する。

## インストール

Orion iOSはChrome拡張を直接サポートしている。

### 手順

1. **Orion設定でChrome拡張を有効化**
   - ••• メニュー → Settings → Extensions → Chrome extensions を ON

2. **拡張ファイルをiPhoneに転送**
   - `orion_browser/` ディレクトリ内の2ファイルをiPhoneに送る（AirDrop、iCloud Drive等）
     - `manifest.json`
     - `gemini-deep-dive.js`

3. **Orionで拡張をインストール**
   - ••• メニュー → Extensions → `+` ボタン → 「ファイルから」を選択
   - 転送したファイルを指定

4. **動作確認**
   - `https://gemini.google.com/app` を開く
   - Geminiの応答に「↳」ボタンが表示される

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

## ファイル構成

```
orion_browser/
├── manifest.json          ← Chrome MV3 マニフェスト
├── gemini-deep-dive.js    ← Content script (Deep Dive機能)
└── README.md
```

## Chrome拡張版との違い

| 項目 | 本体Chrome拡張 | この拡張 |
|---|---|---|
| 対象 | Chrome / Edge / Orion (macOS) | Orion (iOS) |
| 機能 | 全機能 | Deep Diveのみ |
| 設定保存 | `chrome.storage.sync` | `localStorage` |
| 設定UI | options.html | ページ内⚙パネル |
| タッチ操作 | Ctrl+Click | 長押し |
| ビルド | WXT (TypeScript) | 不要（素のJS） |
