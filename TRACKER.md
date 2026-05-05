# Help Copilot — Project Tracker

> Move items right as work progresses: Planned → Building → Done.
> Claude updates this at the start of each session based on conversation context.

---

## Planned

### Foundation
- [ ] Resolve MCP auth — test `curl https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp` to confirm token required or not
- [ ] Scaffold `extension/` directory with `package.json`, `tsconfig.json`, `esbuild.js`, `.vscodeignore`
- [ ] Implement `contextGatherer.ts` — language, selection, surrounding lines, SFDX detection
- [ ] Implement `claudePipeline.ts` — single Anthropic API call with `mcp_servers`
- [ ] Implement `extension.ts` — activate, register command, secrets prompt on first run

### Webview
- [ ] Create `webview.html` shell with CSP (nonce, no external sources)
- [ ] Implement `webviewScript.ts` — postMessage listener, renders HelpDoc JSON
- [ ] Implement `panel.ts` — create/update WebviewPanel, `retainContextWhenHidden`
- [ ] Style with VS Code theme variables (dark + light)
- [ ] Add loading state ("Fetching Salesforce help…")

### Audio
- [ ] Implement `SpeechSynthesis` in webview — summary + walkthrough modes
- [ ] Add Stop button, hide audio controls if `speechSynthesis` unavailable

### Polish
- [ ] Add Refine input (pre-filled from detected context)
- [ ] Handle all edge cases (no selection, no API key, MCP unreachable, oversized selection)
- [ ] Verify all 7 schema fields render correctly including `codeExamples`

---

## Building

_(nothing in progress)_

---

## Done

- [x] Define HelpDoc schema — `schema/helpDoc.ts`
- [x] Write style system prompt — `prompts/systemPrompt.md`
- [x] Reconcile PRD schema with implementation schema (`codeExamples` added)
- [x] Write `CLAUDE.md`, `PLAN.md`, `PRD.md`
