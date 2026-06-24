# modern-salesforce-help: Plan

## Phase history

| Phase | Tag | Status | Summary |
|-------|-----|--------|---------|
| Phase 1 | `rollback-to-plan` | ✅ Done | Scaffold + full extension implementation |
| Phase 2 | `phase-2` | ✅ Done | Verification fixes + SLDS 2 styling + Refine wired up |
| Phase 3 | `before-codelens` | 🔄 In progress | CodeLens ✅, streaming, TTS with real API |

---

## What's built (Phase 1 + 2)

**Extension files:**
- `extension/src/extension.ts` — activate, command, secrets prompt, pipeline orchestration, pipelineRunning guard
- `extension/src/contextGatherer.ts` — language, file, selection (truncated at 3000 chars), surrounding lines, SFDX detection
- `extension/src/claudePipeline.ts` — MCP `tools/list` discovery (cached), manual tool_use loop (max 10 iterations), HelpDoc JSON parse + validation
- `extension/src/webview/panel.ts` — WebviewPanel lifecycle, onRefine/onRetry callbacks, SLDS CSP token injection
- `extension/src/webview/webviewScript.tsx` — React 18 UI, SLDS 2 class names, dark mode overrides, ErrorBoundary, Retry button
- `extension/src/webview/scriptBuilder.ts` — TTS script builder (kept, unused — Phase 3)
- `extension/media/slds/slds2.css` — bundled SLDS 2 CSS (copied from `@salesforce-ux/design-system-2` at build time)
- `extension/scripts/copyAssets.js` — build step that copies SLDS CSS into media/

**Key behaviours:**
- Right-click → "Generate Salesforce Help" (when selection exists)
- Loading states: "Fetching Salesforce help…" → "Reading the docs…" → rendered panel
- Refine button: opens input box (`placeHolder: "e.g. How do I bulkify this trigger?"`), re-runs pipeline with typed query + editor context
- Retry button: re-runs pipeline from error state
- 401 key expiry: deletes stored key, re-prompts
- pipelineRunning guard: prevents concurrent runs
- `.vsix` size: ~648KB

---

## Phase 3 plan

> Start Phase 3 by creating a git tag `phase-3`.

### Task 1: CodeLens ✅ Done

Added "⚡ Get Salesforce Help" above Apex class/trigger declarations and LWC `export default class` lines.

- `extension/src/codeLensProvider.ts` — two `vscode.CodeLensProvider` instances: one for `apex`, one for `javascript` with an `lwcOnly` path guard (prevents false positives in non-SFDX JS files)
- Each CodeLens fires existing `sfHelp.generate` command — no new pipeline needed
- Registered in `extension.ts` via `registerCodeLensProviders(context)`
- `TESTING.md` — 20 manual test cases covering CodeLens, pipeline regression, and edge cases
- Checkpoint tag: `before-codelens`

### Task 2: Streaming

Stream the final LLM response so the panel fills progressively.

- Keep tool_call iterations non-streaming (need full response to parse arguments)
- Switch to `stream: true` only on the final stop iteration
- Show a progress animation in the panel while streaming; parse JSON silently at end
- If JSON parse fails on accumulated stream, show error + Retry (do not display raw partial JSON)
- Files: `claudePipeline.ts`, `extension.ts`, `webviewScript.tsx`

### Task 3: TTS with real API

Replace removed Web Speech API with a real TTS service.

- Candidate: OpenAI TTS (`tts-1-hd`, voices `nova` or `shimmer`) — requires separate API key
- Alternative: check whether Salesforce LLM Gateway exposes a TTS endpoint
- `scriptBuilder.ts` already generates the text — wire it to the TTS call
- Play audio as a blob URL in the webview (`<audio>` element, no SpeechSynthesisUtterance)

---

## Deferred (post-Phase 3)

- Insert generated snippet directly into editor
- "Explain this code" mode (no doc lookup — pure explanation)
- Response caching (query + URL + version)
- CodeLens on method declarations (Phase 3 scopes to class/trigger only)
- Marketplace publish
