# modern-salesforce-help: VS Code Extension — Help Copilot

## Context

Building a VS Code extension that reads editor context (file, language, selection), calls the Salesforce LLM Gateway Express (OpenAI-compatible) with a manual MCP tool_use loop for Salesforce docs, and renders reformatted help in a sidebar WebviewPanel. No external server, no scraping. Secrets live in VS Code's `context.secrets` API, not settings.json.

---

## Resolved prerequisites

**MCP server auth: resolved — no token required.**
`POST https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp` responds without auth. GET returns 405 (expected).

**LLM API: resolved — Salesforce LLM Gateway Express.**
- Base URL: `https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl`
- Auth: Bearer token from Vibes 2.0 → Agent Harness → Express API Key
- Protocol: OpenAI-compatible `/chat/completions`
- Model alias: `claude-sonnet-4-5`
- Key stored via `context.secrets.store('sfHelp.llmKey', key)` — never in `settings.json`
- **Unverified:** whether `{ role: "system" }` is supported — verify in first test run. If rejected, prepend system prompt into the first user message instead.

---

## Directory structure

```
modern-salesforce-help/
├── CLAUDE.md
├── PLAN.md
├── PRD.md
├── TRACKER.md
├── prompts/systemPrompt.md         (exists)
├── schema/helpDoc.ts               (exists)
├── samples/AccountTrigger.trigger  (exists — used as F5 test workspace)
├── test-pipeline.mjs               (exists — pipeline smoke test)
│
└── extension/
    ├── package.json                (VS Code manifest)
    ├── tsconfig.json
    ├── esbuild.js                  (bundler config)
    ├── .vscodeignore
    ├── .vscode/
    │   └── launch.json             (F5 Extension Development Host config)
    │
    └── src/
        ├── extension.ts            (activate, register command, secrets prompt)
        ├── contextGatherer.ts      (language, selection, surroundingLines, hasSFDX)
        ├── claudePipeline.ts       (MCP tool discovery + manual tool_use loop → HelpDoc JSON)
        └── webview/
            ├── panel.ts            (create/update WebviewPanel, retainContextWhenHidden)
            ├── webview.html        (CSP shell with <div id="root">, nonce via string replace)
            ├── webviewScript.tsx   (React entry — mounts to #root, runs in Electron browser)
            └── scriptBuilder.ts    (generates TTS scripts from HelpDoc for audio playback)
```

---

## npm dependencies (extension/package.json)

```json
{
  "dependencies": {},
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.0.0",
    "esbuild": "^0.20.0",
    "@vscode/vsce": "^2.0.0"
  }
}
```

No `node-fetch` (use built-in `fetch`). No `cheerio`. No `express`. React is bundled by esbuild — not loaded from CDN, not a runtime dependency.

---

## VS Code manifest (extension/package.json) — critical keys

```json
{
  "name": "sf-help-copilot",
  "displayName": "Salesforce Help Copilot",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "activationEvents": [
    "onLanguage:apex",
    "workspaceContains:sfdx-project.json"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [{
      "command": "sfHelp.generate",
      "title": "Generate Salesforce Help"
    }],
    "menus": {
      "editor/context": [{
        "command": "sfHelp.generate",
        "when": "editorHasSelection",
        "group": "navigation"
      }]
    },
    "configuration": {
      "properties": {
        "sfHelp.sendContext": { "type": "boolean", "default": true }
      }
    }
  }
}
```

API key goes in `context.secrets`, not `configuration`.

---

## tsconfig.json (extension/tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "jsx": "react-jsx",
    "types": ["vscode", "node", "react", "react-dom"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`lib: ["ES2020", "DOM"]` covers both Node.js (extension host) and browser (webview) type needs. esbuild handles the actual compilation — tsc is used for type-checking only.

---

## esbuild config (extension/esbuild.js)

Two separate bundles with different targets — combining them breaks both:

```js
const esbuild = require('esbuild');

// Extension host — Node.js, vscode is external (provided by VS Code runtime)
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
});

// Webview — browser context, React JSX, no Node APIs, no vscode module
esbuild.build({
  entryPoints: ['src/webview/webviewScript.tsx'],
  bundle: true,
  outfile: 'dist/webviewScript.js',
  platform: 'browser',
  jsx: 'automatic',
  sourcemap: true,
});
```

---

## .vscodeignore (extension/.vscodeignore)

```
src/
node_modules/
.vscode/
esbuild.js
tsconfig.json
**/*.map
**/*.ts
**/*.tsx
!dist/**
```

Packages only `dist/`, `package.json`, and any static assets. Keeps `.vsix` small.

---

## launch.json (extension/.vscode/launch.json)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "${workspaceFolder}/../samples"
      ],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

`../samples` opens the `samples/` directory as the workspace — `AccountTrigger.trigger` activates the extension immediately.

---

## Loading the system prompt at runtime

`prompts/systemPrompt.md` lives outside the `extension/` directory. At runtime, read it using `context.extensionUri`:

```ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function loadSystemPrompt(context: vscode.ExtensionContext): string {
  // extensionUri points to the extension/ directory
  // systemPrompt.md is one level up in prompts/
  const promptPath = path.join(context.extensionUri.fsPath, '..', 'prompts', 'systemPrompt.md');
  return fs.readFileSync(promptPath, 'utf8');
}
```

Called once during `activate()` and passed into `claudePipeline`. Do not re-read on every query.

---

## Context gathering (contextGatherer.ts)

```ts
interface EditorContext {
  language: string;          // e.g. "apex"
  filePath: string;          // relative to workspace root
  selectedText: string;      // truncated to 3000 chars if over
  surroundingLines: string;  // ±10 lines around cursor
  hasSFDX: boolean;          // sfdx-project.json exists in workspace root
}
```

If `sfHelp.sendContext` is false, return `null` — pipeline sends user query only.

---

## System prompt + buildPrompt (claudePipeline.ts)

The system prompt is passed as `{ role: "system", content: STYLE_SYSTEM_PROMPT }` — first message in the array. This is correct for OpenAI-compatible APIs.

`buildPrompt(context, userQuery)` constructs the user message:

```
The developer is working in a <language> file: <filePath>

Selected code:
<selectedText>

Surrounding context:
<surroundingLines>

Their question or intent: <userQuery or "infer from the code above">

Detect the Salesforce feature they're working with. Search the Salesforce docs for the most relevant topic. Fetch and reformat it. Return only the HelpDoc JSON.
```

**Verify on first test run** that Claude respects the JSON-only constraint. If it adds preamble or markdown fences, add "Do not include any text before or after the JSON object." to the system prompt.

---

## Claude pipeline (claudePipeline.ts)

### Phase A — discover MCP tools (once on activate, cached in module scope)

```ts
const res = await fetch(MCP_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});
const { result } = await res.json();
const oaiTools = result.tools.map(t => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.inputSchema },
}));
```

### callMcpTool helper

```ts
async function callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: Date.now(), method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const json = await res.json();
  return json.result?.content?.[0]?.text ?? JSON.stringify(json.result);
}
```

### Phase B — tool_use loop (per query, max 10 iterations)

```ts
const messages = [
  { role: "system", content: systemPrompt },
  { role: "user", content: buildPrompt(editorContext, userQuery) },
];

while (iterations < MAX) {
  const res = await fetch(`${SF_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmKey}` },
    body: JSON.stringify({ model: SF_MODEL, messages, tools: oaiTools, tool_choice: "auto", max_tokens: 4096 }),
  });
  const { choices } = await res.json();
  const { finish_reason, message } = choices[0];
  messages.push(message);

  if (finish_reason === "tool_calls") {
    for (const tc of message.tool_calls) {
      const result = await callMcpTool(tc.function.name, JSON.parse(tc.function.arguments));
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    continue;
  }
  break; // finish_reason === "stop"
}
```

### Phase C — parse and validate

`JSON.parse()` final message content → check all 7 keys (`title`, `summary`, `prerequisites`, `steps`, `codeExamples`, `notes`, `relatedLinks`) → `postMessage({ type: 'update', payload: helpDoc })`.

On parse failure or missing keys: `postMessage({ type: 'error', message: 'Something went wrong — try again' })`. Webview shows error + Retry button. No silent retry, no raw text fallback.

---

## Loading states

Three observable states posted via `postMessage`:

1. `{ type: 'loading', message: 'Fetching Salesforce help…' }` — before first LLM call
2. `{ type: 'loading', message: 'Reading the docs…' }` — each time a tool_call fires
3. `{ type: 'update', payload: HelpDoc }` — after successful parse

---

## Webview HTML (webview.html)

`panel.ts` reads `webview.html` as a string, replaces `{{nonce}}` and `{{scriptUri}}` tokens at runtime:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-{{nonce}}';
             style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div id="root"></div>
  <script nonce="{{nonce}}" src="{{scriptUri}}"></script>
</body>
</html>
```

`panel.ts` replacement:
```ts
const nonce = crypto.randomUUID().replace(/-/g, '');
const scriptUri = panel.webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'dist', 'webviewScript.js')
);
html = html.replace(/{{nonce}}/g, nonce).replace('{{scriptUri}}', scriptUri.toString());
```

---

## Webview state

`panel.ts` creates WebviewPanel with `retainContextWhenHidden: true`. State survives hide/show. No rehydration logic needed.

---

## Webview styling

Local CSS only. VS Code theme variables:

```css
body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
.panel-border { border: 1px solid var(--vscode-panel-border); }
.button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; padding: 4px 10px; border-radius: 2px; }
pre { background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 4px; overflow-x: auto; }
code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
```

### codeExamples rendering

Each renders as a labelled block with a Copy button:

```
┌─ {label} ──────────────────────── [Copy] ┐
│  <pre><code>{code}</code></pre>           │
└───────────────────────────────────────────┘
```

Copy button calls `navigator.clipboard.writeText(code)`, briefly shows "Copied ✓" for 1.5s. No CSP change needed — Electron grants clipboard access in webviews automatically.

---

## Refine input

After results render, the panel shows:

```
Detected: Apex Trigger · Account · before insert   [Refine ▾]
```

"Refine" fires `vscode.window.showInputBox({ prompt: 'Refine your query', value: detectedContext })`. On confirm, re-runs the pipeline with the user's typed string as `userQuery`, replacing the inferred context. On cancel/escape, does nothing.

This is handled in `extension.ts` by listening for `{ type: 'refine' }` postMessages from the webview and calling `vscode.window.showInputBox`.

---

## Audio (scriptBuilder.ts + webviewScript.tsx)

`scriptBuilder.ts` lives in `src/webview/` — it's bundled into the webview bundle, not the extension host.

```ts
export function buildSummaryScript(doc: HelpDoc): string {
  // title + summary + "There are N steps." + related topic names
}

export function buildWalkthroughScript(doc: HelpDoc): string {
  // title intro + prerequisites + "Step N: label. detail." for each step + notes
}

// Sanitize for TTS: strip markdown, expand abbreviations, replace dashes with commas
function sanitize(text: string): string { ... }
```

`SpeechSynthesisUtterance` config: `rate: 0.9`, `lang: 'en-US'`. Check `window.speechSynthesis !== undefined` — hide audio buttons silently if unavailable.

- "Play summary" → `buildSummaryScript`
- "Play walkthrough" → `buildWalkthroughScript`
- "Stop" visible only while speaking

---

## Build and run

```bash
cd extension
npm install
node esbuild.js          # → dist/extension.js + dist/webviewScript.js
```

Press **F5** in VS Code (from the `extension/` folder) → Extension Development Host opens with `samples/` as workspace → `AccountTrigger.trigger` triggers activation.

Select code in the trigger file → right-click → "Generate Salesforce Help".

Package:
```bash
npx vsce package         # → sf-help-copilot-0.0.1.vsix
```

---

## Edge cases

| Scenario | Behavior |
|----------|----------|
| MCP server unreachable | Panel shows: "Couldn't reach Salesforce docs. Try again." + Retry |
| LLM proxy unreachable | Panel shows: "Couldn't reach the AI service. Try again." + Retry |
| No docs found | Claude responds from training; note shown: "No official docs matched — based on general knowledge" |
| Selection > 3000 chars | Truncate, note "[Selection truncated]" in prompt |
| No selection | Use surrounding lines; show Refine input immediately |
| No LLM key configured | Panel prompts to enter key on first use; stored via `context.secrets` |
| `sendContext: false` | Only user-typed query sent, no file context |
| Max iterations reached | Treat as error — show error + Retry |

---

## Deferred

- CodeLens ("Get Help for this" above functions)
- "Insert into code" / snippet injection
- "Explain this code" mode
- Caching (query + URL + version)
- Streaming partial content
- `DocProvider` abstraction (swap in internal docs, Markdown in repo, etc.)
- Marketplace publish

---

## Verification

### Setup
Open `extension/` in VS Code. Run `npm install && node esbuild.js`. Press F5 — Extension Development Host opens with `samples/` as workspace.

### Secrets
- [ ] On first run, panel prompts for Salesforce LLM Gateway key (Vibes 2.0 → Agent Harness → Express API Key)
- [ ] Key persists across VS Code restarts
- [ ] Key never appears in `settings.json`, workspace storage, or logs

### Activation
- [ ] Extension activates when `AccountTrigger.trigger` is opened
- [ ] Extension does NOT activate in a plain Node.js or React project

### Pipeline
- [ ] Select Apex code → right-click → "Generate Salesforce Help" visible
- [ ] Panel shows "Fetching Salesforce help…" within 200ms
- [ ] "Reading the docs…" appears when MCP tool fires
- [ ] Final render shows all 7 schema sections; empty arrays render without errors
- [ ] Refine opens VS Code input box pre-filled with detected context

### Webview
- [ ] Dark and light VS Code themes both render readably
- [ ] Panel re-show after hide preserves last result
- [ ] DevTools console: zero CSP violations

### Code examples
- [ ] `<pre>` block renders with monospace font
- [ ] Copy button changes to "Copied ✓" for 1.5s then resets

### Audio
- [ ] macOS: summary and walkthrough both play
- [ ] Stop halts mid-sentence
- [ ] Audio buttons hidden if `speechSynthesis` is undefined

### End-to-end
- [ ] Select trigger code → steps populated, verb-first, no "you can", contractions present
- [ ] JSON output constraint respected — no preamble, no markdown fences
- [ ] Nonsense selection → graceful fallback, no crash
- [ ] Kill network → error shown in panel, no unhandled rejection in console
- [ ] Max iterations reached → error shown, not a hang
