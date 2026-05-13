# modern-salesforce-help

A VS Code extension that reads editor context (active file, language, selected code) and generates contextual Salesforce help — reformatted and structured — in a sidebar panel.

## What this is

A developer-facing Help Copilot for Salesforce development. Select Apex code, invoke the command, and the extension calls the Salesforce LLM Gateway with a manual MCP tool_use loop to fetch and reformat official docs into a structured sidebar panel.

## Current state

**Phase 2 complete.** Extension is fully built, packaged as `.vsix`, and working.

## Architecture

```
Extension Host (Node.js inside VS Code)
  ├── extension.ts          activate, command registration, secrets, pipeline orchestration
  ├── contextGatherer.ts    language, selection, surrounding lines, SFDX detection
  ├── claudePipeline.ts     MCP tool discovery + manual tool_use loop → HelpDoc JSON
  └── webview/panel.ts      WebviewPanel lifecycle, refine/retry message handling

Webview (Electron browser, React 18)
  ├── webviewScript.tsx     React UI — renders HelpDoc, Refine button, error/loading states
  └── scriptBuilder.ts      TTS script builder (deferred — kept for Phase 3)

Salesforce LLM Gateway Express (remote, OpenAI-compatible)
  └── model: claude-sonnet-4-6
      └── Salesforce Docs MCP → https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp
```

## Key technical decisions

- **Manual tool_use loop** — Salesforce proxy is OpenAI-compatible, not Anthropic SDK; `mcp_servers` param is unavailable; tools discovered via `tools/list` POST, exposed as OpenAI function definitions
- **`context.secrets` for API key** — never `settings.json`; key from Vibes 2.0 → Agent Harness → Express API Key
- **SLDS 2 CSS bundled locally** — `@salesforce-ux/design-system-2` copied to `media/slds/slds2.css` at build time; no CDN; CSP uses `webview.cspSource`
- **`retainContextWhenHidden: true`** — panel state survives hide/show without rehydration
- **Activation scoped** — `onLanguage:apex` and `workspaceContains:sfdx-project.json` only
- **Audio removed** — Web Speech API quality was unacceptable; deferred to Phase 3 with real TTS API

## HelpDoc schema

Source of truth: `schema/helpDoc.ts`

```json
{
  "title": "string",
  "summary": "string",
  "prerequisites": ["string"],
  "steps": [{ "label": "string", "detail": "string" }],
  "codeExamples": [{ "label": "string", "code": "string" }],
  "notes": [{ "type": "note|warning|tip", "body": "string" }],
  "relatedLinks": [{ "label": "string", "url": "string" }]
}
```

## Style rules

Full rules in `prompts/systemPrompt.md` — passed as the `system` message on every LLM call. Do not duplicate here.

## Plans

Save plans as `PLAN.md` in this directory. Do not use `~/.claude/plans/`.

## Resolved questions

- MCP server auth: not required
- `{ role: "system" }` support: confirmed working
- Model alias: `claude-sonnet-4-5` invalid — use `claude-sonnet-4-6`
- Audio: Web Speech API removed; real TTS deferred to Phase 3

## References

- `PLAN.md` — phase roadmap and decisions
- `prompts/systemPrompt.md` — LLM style rules
- `schema/helpDoc.ts` — HelpDoc TypeScript interface
- Salesforce Docs MCP: `https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp`
- VS Code Extension API: https://code.visualstudio.com/api
- OpenAI API reference: https://platform.openai.com/docs/api-reference/chat
