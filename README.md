# Salesforce Help Copilot

A VS Code extension that reads your active Apex or LWC file and selection, fetches the relevant official Salesforce documentation, and renders a structured help panel — right where you're coding.

---

## What it does

Click **⚡ Get Salesforce Help** above any Apex class, trigger, or LWC component — or select code, right-click, and choose **Generate Salesforce Help**. The extension:

1. Captures your editor context (language, file path, selected code, surrounding lines)
2. Sends it to Claude via the Salesforce LLM Gateway
3. The model searches the Salesforce Docs MCP server for the most relevant topic
4. Returns a structured help document rendered in a sidebar panel

The panel renders with:
- A plain-language **summary**
- **Prerequisites** to be aware of
- **Step-by-step guidance**
- **Code examples** with one-click copy
- Contextual **notes, warnings, and tips**
- **Related links** to official Salesforce docs

Use the **Refine** button to ask a follow-up question — e.g. "How do I bulkify this trigger?" — without leaving the panel.

---

## Demo

```
Option A — CodeLens (most discoverable):
1. Open any Apex or LWC file in an SFDX project
2. Click ⚡ Get Salesforce Help above the class or trigger declaration
3. Panel opens with structured docs for the detected feature
4. Click Refine to ask a follow-up

Option B — Right-click:
1. Select specific code (e.g. a SOQL query, a trigger body, a @wire decorator)
2. Right-click → Generate Salesforce Help
3. Panel opens scoped to your selection
```

---

## Installation

The extension is distributed as a `.vsix` package.

```bash
code --install-extension extension/sf-help-copilot-0.0.1.vsix
```

Or: open VS Code → Extensions → `...` menu → **Install from VSIX**.

### Prerequisites

- VS Code 1.85+
- An SFDX project workspace (`sfdx-project.json` in the root)
- A **Salesforce LLM Gateway API key** (Vibes 2.0 → Agent Harness → Express API Key)

On first run, the extension prompts you for the key and stores it securely in VS Code's secret storage. It is never written to `settings.json`.

---

## Usage

| Action | How |
|--------|-----|
| Generate help via CodeLens | Click **⚡ Get Salesforce Help** above a class, trigger, or LWC component declaration |
| Generate help for selected code | Select code → right-click → **Generate Salesforce Help** |
| Ask a follow-up question | Click **Refine ▾** in the panel → type your question |
| Retry after an error | Click **Retry** in the error panel |
| Disable context sending | Set `sfHelp.sendContext: false` in settings |

The right-click command only appears when you have an active selection. CodeLens is always visible on declaration lines and does not require a selection — position your cursor inside the class body first for the most relevant context.

---

## Architecture

```
Extension Host (Node.js / VS Code)
  ├── extension.ts            Activation, command, secrets, pipeline orchestration
  ├── codeLensProvider.ts     ⚡ CodeLens on Apex class/trigger + LWC export default class
  ├── contextGatherer.ts      Captures language, file, selection (max 3000 chars), SFDX detection
  ├── claudePipeline.ts       MCP tool discovery (cached) + manual tool_use loop → HelpDoc JSON
  └── webview/panel.ts        WebviewPanel lifecycle, Refine/Retry callbacks

Webview (Electron renderer, React 18)
  └── webviewScript.tsx     UI — renders HelpDoc, handles loading/error/idle states

Remote services
  ├── Salesforce LLM Gateway   OpenAI-compatible proxy → claude-sonnet-4-6
  └── Salesforce Docs MCP      https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp
```

### How the pipeline works

The extension does not use the Anthropic SDK directly. The Salesforce LLM Gateway is an OpenAI-compatible proxy, so `mcp_servers` is unavailable. Instead:

1. On first run, `claudePipeline.ts` calls `tools/list` on the MCP server and caches the result as OpenAI function definitions.
2. It enters a loop (max 10 iterations): sends the user prompt + tools to the LLM, receives a response.
3. If the model returns `finish_reason: tool_calls`, the extension calls the named MCP tool and feeds the result back as a `tool` message.
4. When `finish_reason: stop`, the content is parsed as a `HelpDoc` JSON object and posted to the webview.

### HelpDoc schema

Defined in [schema/helpDoc.ts](schema/helpDoc.ts):

```ts
{
  title: string
  summary: string
  prerequisites: string[]
  steps: { label: string; detail: string }[]
  codeExamples: { label: string; code: string }[]
  notes: { type: 'note' | 'warning' | 'tip'; body: string }[]
  relatedLinks: { label: string; url: string }[]
}
```

---

## Building from source

```bash
cd extension
npm install
npm run build       # compiles TypeScript + copies SLDS 2 CSS
```

To package as `.vsix`:

```bash
npx vsce package
```

The build runs `esbuild` to bundle the extension host and React webview into `dist/`. SLDS 2 CSS is copied from `node_modules` into `media/slds/` at build time — no CDN dependency.

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sfHelp.sendContext` | `true` | Send file path, language, selection, and surrounding lines to the AI. Set to `false` to send only your typed Refine query. |

---

## Project structure

```
extension/
  src/
    extension.ts              Entry point
    codeLensProvider.ts       CodeLens for Apex + LWC
    contextGatherer.ts        Editor context capture
    claudePipeline.ts         LLM + MCP orchestration
    webview/
      panel.ts                WebviewPanel lifecycle
      webviewScript.tsx       React UI
      scriptBuilder.ts        TTS script builder (Phase 3, unused)
  media/
    webview.html              Webview shell
    systemPrompt.md           LLM system prompt (loaded at runtime)
    slds/slds2.css            Bundled SLDS 2 styles
  scripts/
    copyAssets.js             Build step — copies SLDS CSS
schema/
  helpDoc.ts                  HelpDoc TypeScript interface (source of truth)
prompts/
  systemPrompt.md             LLM style rules
samples/                      Sample Apex and LWC files for manual testing
TESTING.md                    Manual test plan (20 cases)
```

---

## Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 | Done | Scaffold, pipeline, webview, SLDS styling |
| Phase 2 | Done | Verification fixes, Refine button wired up |
| Phase 3 | In progress | CodeLens ✅, streaming responses, real TTS API |

Deferred (post-Phase 3): snippet insertion into editor, "Explain this code" mode (no doc lookup), response caching, Marketplace publish.

---

## Security notes

- The LLM Gateway API key is stored exclusively in VS Code's `context.secrets` — encrypted by the OS keychain, never in `settings.json` or on disk.
- The extension activates only for `onLanguage:apex` or workspaces containing `sfdx-project.json`. It does not run in unrelated projects.
- SLDS 2 CSS is bundled locally. The webview CSP allows only `webview.cspSource` — no external stylesheet CDN.
- Generated related links are AI-produced and may not be accurate. The UI displays a disclaimer to verify before use.
