# modern-salesforce-help: VS Code Extension — Help Copilot

## Context

Building a VS Code extension that reads editor context (file, language, selection), calls the Anthropic API with an MCP server for Salesforce docs, and renders reformatted help in a sidebar WebviewPanel. No external server, no manual scraping — the Anthropic API calls the MCP tools server-side. Secrets live in VS Code's `context.secrets` API, not settings.json.

---

## Resolved prerequisites

**MCP server auth (issue #2): resolved — no token required.**
`POST https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp` responds without auth. GET returns 405 (expected for MCP servers).

**LLM API (issue #1): resolved — use Salesforce LLM Gateway Express, not direct Anthropic API.**
- Base URL: `https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl`
- Auth: Bearer token from Vibes 2.0 → Agent Harness → Express API Key
- Protocol: OpenAI-compatible `/chat/completions`
- Consequence: `mcp_servers` beta param is unavailable; use manual tool_use loop instead

Key stored via `context.secrets.store('sfHelp.llmKey', key)` — never in `settings.json`.

---

## Directory structure

```
modern-salesforce-help/
├── CLAUDE.md
├── PLAN.md
├── prompts/systemPrompt.md       (exists)
├── schema/helpDoc.ts             (exists)
│
└── extension/
    ├── package.json              (VS Code manifest)
    ├── tsconfig.json
    ├── esbuild.js                (bundler config)
    ├── .vscodeignore
    │
    └── src/
        ├── extension.ts          (activate, register command, secrets prompt)
        ├── contextGatherer.ts    (language, selection, surroundingLines, hasSFDX)
        ├── claudePipeline.ts     (single Anthropic API call with mcp_servers)
        └── webview/
            ├── panel.ts          (create/update WebviewPanel, retainContextWhenHidden)
            ├── webview.html      (CSP shell, nonce injected at runtime)
            └── webviewScript.tsx (React entry point, bundled separately, runs in Electron browser context)
```

---

## npm dependencies

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "typescript": "^5.0.0",
    "esbuild": "^0.20.0",
    "@vscode/vsce": "^2.0.0"
  }
}
```

No `node-fetch` (use built-in `fetch`). No `cheerio` (no scraping). No `express`.

Webview UI uses React (bundled by esbuild — not loaded from CDN). React is a devDependency of the extension, bundled into `dist/webviewScript.js`. The extension host itself stays plain TypeScript with no React dependency.

---

## VS Code manifest (extension/package.json) — critical keys

```json
{
  "name": "sf-help-copilot",
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

API key and MCP token go in `context.secrets`, not `configuration`.

---

## esbuild config (extension/esbuild.js)

Two separate bundles with different targets — this is non-obvious and breaks if combined:

```js
const esbuild = require('esbuild');

// Extension host bundle — Node.js, vscode is external (provided by VS Code runtime)
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
});

// Webview bundle — browser context, React JSX, no Node APIs, no vscode module
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

## Context gathering (contextGatherer.ts)

```ts
{
  language: string,          // e.g. "apex"
  filePath: string,          // relative to workspace root
  selectedText: string,      // truncated to 3000 chars if over
  surroundingLines: string,  // ±10 lines around cursor
  hasSFDX: boolean           // sfdx-project.json exists in workspace root
}
```

If `sfHelp.sendContext` is false, send only the user's typed query — no file context.

---

## System prompt (buildPrompt in claudePipeline.ts)

`buildPrompt(context, userQuery)` constructs the user message. The system parameter is the full content of `prompts/systemPrompt.md`.

User message structure:
```
The developer is working in a <language> file: <filePath>
Selected code:
<selectedText>

Surrounding context:
<surroundingLines>

Their question or intent: <userQuery or "infer from context">

Detect the Salesforce feature they're working with. Search the Salesforce docs for the most relevant topic. Fetch and reformat it. Return only the HelpDoc JSON.
```

This is one prompt that handles intent detection, doc search, fetch, and reformatting. No separate normalizer call.

---

## Claude pipeline (claudePipeline.ts)

Two phases: tool discovery on first run (cached in memory), then a manual tool_use loop per query.

### Phase A — discover MCP tools (once, cached)
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

### Phase B — tool_use loop (per query, max 10 iterations)
```ts
const messages = [
  { role: "system", content: STYLE_SYSTEM_PROMPT },
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
`JSON.parse()` the final message content → validate all 7 keys present → `postMessage` to webview.

On parse failure or missing keys: `postMessage({ type: 'error', message: 'Something went wrong — try again' })`. The webview shows the error with a Retry button that re-fires the original query. No silent retry, no raw text fallback.

---

## Loading states

Now that the pipeline is a multi-iteration loop, more states are observable. Post three states:

1. `{ type: 'loading', message: 'Fetching Salesforce help…' }` — before first LLM call
2. `{ type: 'loading', message: 'Reading the docs…' }` — when a tool_call is detected
3. `{ type: 'update', payload: HelpDoc }` — after successful parse

---

## Webview state

`panel.ts` creates WebviewPanel with `retainContextWhenHidden: true`. State survives panel hide/show. No rehydration logic needed.

---

## Webview CSP

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           script-src 'nonce-${nonce}';
           style-src 'unsafe-inline';">
```

No external sources. `unsafe-inline` for styles only (VS Code theme variables need it). Scripts use nonce.

`navigator.clipboard.writeText()` works inside VS Code webviews without any additional CSP directive — the Electron context grants clipboard access automatically. No `clipboard-write` permission needed.

---

## Webview styling

Local CSS only. VS Code theme variables:

```css
body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
.panel-border { border: 1px solid var(--vscode-panel-border); }
.button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
pre { background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 4px; overflow-x: auto; }
code { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
```

### codeExamples rendering

Each `codeExample` renders as:
```
┌─ {label} ──────────────────────── [Copy] ┐
│  <pre><code>{code}</code></pre>           │
└───────────────────────────────────────────┘
```

Copy button calls `navigator.clipboard.writeText(code)` and briefly changes label to "Copied ✓" for 1.5s. No CSP change needed — Electron grants clipboard access in webviews automatically.

---

## Audio (SpeechSynthesis)

Check at runtime: `if (!window.speechSynthesis)` — hide buttons silently, no error.

- "Play summary" → title + summary + step count sentence
- "Play walkthrough" → step-by-step narration
- "Stop" visible only while speaking

---

## Build and run

```bash
cd extension
npm install
node esbuild.js          # builds dist/extension.js + dist/webviewScript.js
```

Press **F5** in VS Code → opens Extension Development Host with a Salesforce project workspace.

To test: open any `.cls` or `.trigger` file, select some code, right-click → "Generate Salesforce Help".

Package for local install:
```bash
npx vsce package         # produces sf-help-copilot-x.x.x.vsix
```

---

## Edge cases

| Scenario | Behavior |
|----------|----------|
| MCP server unreachable | Show in panel: "Couldn't reach Salesforce docs. Try again." |
| No docs found | Claude responds from training; note shown: "No official docs matched — based on general knowledge" |
| Selection > 3000 chars | Truncate, note "[Selection truncated]" in prompt |
| No selection | Use surrounding lines; show refine input immediately |
| No API key | Panel prompts to enter key; stored via `context.secrets` |
| `sendContext: false` | Only user-typed query sent, no code context |

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
Open a workspace containing at least one `.cls` or `.trigger` file (or an `sfdx-project.json`). Without this the extension won't activate.

### Secrets
- [ ] On first run, panel prompts for Anthropic API key
- [ ] Key persists across VS Code restarts
- [ ] Key never appears in `settings.json`, workspace storage, or logs

### Activation
- [ ] Extension activates when a `.cls` file is opened
- [ ] Extension does NOT activate in a plain Node.js or React project

### Pipeline
- [ ] Select Apex code → right-click → "Generate Salesforce Help" is visible in context menu
- [ ] Panel opens and shows "Fetching Salesforce help…" immediately
- [ ] Final render shows all 6 schema sections; empty arrays don't break layout
- [ ] Refine input opens pre-filled with detected context

### Webview
- [ ] Dark and light VS Code themes both render readably
- [ ] Panel re-show after hide preserves last result
- [ ] DevTools (Help > Toggle Developer Tools): zero CSP violations in console

### Audio
- [ ] macOS: summary and walkthrough play to completion
- [ ] Stop halts mid-sentence
- [ ] Audio buttons hidden if `speechSynthesis` is undefined

### End-to-end
- [ ] Selection: Apex trigger on Account → steps populated, verb-first, no "you can", contractions present
- [ ] Nonsense selection → graceful fallback, no crash, no unhandled rejection in console
- [ ] Kill network → MCP unreachable error shown in panel, no crash
