# Plan: Paste from system clipboard when `clipboard=true`

## Goal

Support opening Gemini with a URL flag so **large prompts** (e.g. CSV pasted via shell `pbcopy`) fill the chat input **without** putting the payload in the query string. Shell scripts avoid GET URL length limits; the extension reads the clipboard only when explicitly requested via the URL.

## Background

- [`gemini.sh`](https://github.com/user/script) (external): currently builds `https://gemini.google.com/app?q=...` and rejects long URLs via `GEMINI_INPUT_MAX_URL`.
- This repo already handles URL-driven prefills in [`src/chat.ts`](../../src/chat.ts): `setQueryFromUrl()` reads `q` / `qt` and optional `send`.

## URL contract

| Parameter       | Meaning |
|----------------|---------|
| `clipboard`    | When truthy (`1`, `true`, empty value `clipboard` or `clipboard=`), after load the extension reads **system clipboard** text and writes it into the main compose area (same DOM path as `setQueryFromUrl`). |
| `q` / `qt`     | Unchanged: optional **short** instruction text (e.g. “Analyze this CSV”). If present together with `clipboard`, behavior is defined below. |
| `send`         | Unchanged: after filling, optionally auto-send (same semantics as today). |

### Combining `clipboard` with `q`

**Recommended behavior (to implement):**

1. If only `clipboard=true`: paste clipboard text only.
2. If `q` (or `qt`) **and** `clipboard=true`: set textarea to **instruction first, then clipboard body** (e.g. two paragraphs or `instruction + "\n\n" + clipboard`), then dispatch `input`. Exact join format can match product preference (single block is fine).

Strip `clipboard` (and optionally normalize URL) from the address bar after handling **once** so reload does not re-paste.

## Implementation outline

1. **Manifest** ([`wxt.config.ts`](../../wxt.config.ts)): add [`clipboardRead`](https://developer.chrome.com/docs/extensions/reference/permissions-list) to `manifest.permissions` so `navigator.clipboard.readText()` is allowed in the extension context when user-gesture rules are satisfied.

2. **Logic placement**: extend `setQueryFromUrl()` in [`src/chat.ts`](../../src/chat.ts) **or** extract a small helper (e.g. `applyClipboardParamIfPresent`) called from the same init path as `setQueryFromUrl()` so one place owns “URL → textarea” behavior.

3. **Clipboard read + paste**:
   - Reuse the same textarea discovery and fill pattern as `setQueryFromUrl()` (`contenteditable` textbox, clear children, `<p>` + text, `input` event, optional send button click).
   - **First attempt** shortly after textarea appears (same polling loop as today).
   - If `readText()` throws (e.g. no user gesture / permission edge case): show a **small in-page affordance** (“Paste from clipboard”) that calls `readText()` on **click** (guaranteed gesture), then paste and remove affordance.

4. **Idempotency**: use `sessionStorage` key e.g. `gemini-improve-ui-clipboard-applied` scoped by initial URL or a one-shot flag so SPA navigations do not double-paste.

5. **Privacy**: only read clipboard when `clipboard` param is present; do not read on normal visits.

## Shell integration (external)

Example flow for oversized content:

```bash
printf '%s\n' "$large_body" | pbcopy
open "https://gemini.google.com/app?clipboard=true&q=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "Analyze this")"
```

(`q` should stay short; full body lives in clipboard only.)

## Risks / limitations

- Clipboard API may still fail on load without gesture → fallback button is required for reliability.
- Very large clipboard payloads may stress the page; acceptable for “CSV analysis” use case; document no hard size guarantee.
- Gemini DOM selectors can change; keep logic next to existing `setQueryFromUrl` selectors.

## Testing checklist

- [ ] `/app?clipboard=true` with clipboard text → textarea filled.
- [ ] Same with `q=` short prompt → combined content order correct.
- [ ] `send=false` does not click send; `send=true` still works.
- [ ] Reload after strip does not re-paste.
- [ ] Without `clipboard`, clipboard is never read.
- [ ] Fallback button works when automatic read fails.

## Out of scope (for this plan)

- Changing external `gemini.sh` in-repo (different repo); only document the URL shape here.
- Binary clipboard types (images/files); text only.
