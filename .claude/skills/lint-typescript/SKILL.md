---
name: lint-typescript
description: TypeScriptファイルのESLintチェックと自動修正を行う。lint実行、lint修正、ESLintエラー確認、型チェック、コード品質確認などに使用。
---

# TypeScript Lint

## セットアップ

- ESLint 10 + `@typescript-eslint` (flat config)
- 設定: `eslint.config.js`
- 対象: `src/**/*.ts`, `entrypoints/**/*.ts`

## コマンド

```bash
# チェックのみ
npm run lint

# 自動修正
npm run lint:fix
```

## ルール

| ルール | レベル |
|--------|--------|
| `@typescript-eslint/recommended` の全ルール | error/warn |
| `no-explicit-any` | warn |
| `no-unused-vars` (`_` プレフィックスは除外) | warn |

## よくある修正パターン

**未使用の catch 変数**

```typescript
// before
} catch (e) {

// after
} catch {
```

**未使用変数**

```typescript
// before
const _unused = foo();

// after (使わないなら削除、または _ プレフィックスで警告抑制)
```

**`any` 型**

```typescript
// before
function foo(x: any) {}

// after
function foo(x: unknown) {}
```

## ワークフロー

1. `npm run lint` で警告/エラーを確認
2. `npm run lint:fix` で自動修正可能なものを修正
3. 残った警告を手動修正
4. `npm run lint` で0件を確認
