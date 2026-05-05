# modern-salesforce-help

A VS Code extension that reads editor context (active file, language, selected code) and generates contextual Salesforce help — reformatted, structured, and optionally narrated — in a sidebar panel.

## What this is

A developer-facing "Help Copilot" for Salesforce development. When a developer selects Apex code and invokes the command, the extension reads context, calls the Anthropic API with the Salesforce Docs MCP server attached, and renders a structured help topic in a sidebar WebviewPanel.

## Current state

Planning complete. Extension not yet scaffolded. Existing files:
- `prompts/systemPrompt.md` — style rules + JSON output constraint
- `schema/helpDoc.ts` — TypeScript interface for HelpDoc JSON
- `PLAN.md` — implementation plan

## Architecture (planned)

```
Extension Host (Node.js inside VS Code)
  ├── contextGatherer.ts     reads file, language, selection, workspace
  ├── claudePipeline.ts      single Anthropic API call with mcp_servers
  └── webview/panel.ts       creates/updates the sidebar WebviewPanel

Webview (Electron browser context)
  ├── renders HelpDoc JSON using VS Code theme CSS variables
  └── SpeechSynthesis for audio (summary or walkthrough)

Anthropic API (remote)
  └── Salesforce Docs MCP → https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp
```

## Key technical decisions

- **VS Code extension, not a web app or LWC** — user can't host a server or deploy; `.vsix` installs locally with no infrastructure
- **Salesforce LLM Gateway Express, not direct Anthropic API** — Salesforce internal proxy at `eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl`; speaks OpenAI-compatible `/chat/completions`; key from Vibes 2.0 → Agent Harness → Express API Key
- **Manual tool_use loop, not `mcp_servers`** — the Salesforce proxy is OpenAI-compatible, not Anthropic SDK; `mcp_servers` beta param is unavailable; instead: discover MCP tools via `tools/list` POST, expose as OpenAI function definitions, handle tool_calls loop manually (~50 lines)
- **`context.secrets` for API keys, not `settings.json`** — `settings.json` gets committed to dotfiles repos; `context.secrets` is encrypted per-machine
- **No SLDS CDN** — VS Code webview CSP blocks external stylesheets by default; relaxing it for a CDN is a security trade-off not worth making; use VS Code theme variables instead
- **`retainContextWhenHidden: true`** — without this, webview state is destroyed when the panel hides and rebuilds blank on re-show; memory cost is acceptable for a single panel
- **Activation scoped to Apex + SFDX workspaces** — activating on every workspace wastes resources and surprises non-Salesforce users

## HelpDoc schema

Source of truth: `schema/helpDoc.ts`. Shape:

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

Full rules are in `prompts/systemPrompt.md` — that file is the `system` parameter on every Claude API call, so keep it there. Summary:
- Verb-first sentences; cut "you can" and "there is/are"
- Contractions always; sentence-case headings; Oxford comma
- Bold UI labels; expand every acronym on first use
- Gender-neutral; no idioms; no slang

## Plans

Save plans as `PLAN.md` in this directory. Do not use `~/.claude/plans/`.

## Open questions

- [ ] Does the Salesforce Docs MCP server require an auth token? (Blocking — must resolve before first pipeline run)
- [ ] Audio: streaming TTS or section-level only at launch?
- [ ] i18n: which languages to support, if any?

## References

- `PLAN.md` — current implementation plan, check here before starting work
- `prompts/systemPrompt.md` — full style rules, read before editing prompts
- Salesforce Docs MCP: `https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp`
- VS Code Extension API: https://code.visualstudio.com/api — consult for webview, secrets, activation event patterns
- Anthropic Node SDK: https://github.com/anthropic-ai/anthropic-sdk-node — consult for `mcp_servers` parameter shape
- Microsoft Writing Style Guide: https://learn.microsoft.com/en-us/style-guide/welcome/ — consult when editing `prompts/systemPrompt.md`
