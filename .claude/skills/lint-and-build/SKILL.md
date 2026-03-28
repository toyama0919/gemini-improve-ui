---
name: lint-and-build
description: ESLintでlintしてからwxtでビルドする。build実行、npm run build、ビルド、lint and build、lintしてbuildなどに使用。
---

# Lint and Build

## 手順

以下のコマンドをワークスペースルートで順番に実行する。

```bash
npm run lint && npm run build
```

## lintエラーがある場合

自動修正を試みてから再ビルド:

```bash
npm run lint:fix && npm run build
```

## 出力

- lint: エラー0件を確認
- build: `wxt build` が成功し `.output/` に生成物が出力される
