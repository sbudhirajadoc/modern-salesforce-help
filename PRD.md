# Product Requirements Document — Help Copilot

> **Status:** Filed 2026-05-05. Three sections contain conflicts with current architecture decisions — marked with ⚠️. Resolve before treating those sections as authoritative.

---

## 1. Overview

**Help Copilot** is a VS Code extension that generates structured, task-oriented help content based on a developer's current context (selected code, file type, cursor position).

It retrieves relevant Salesforce documentation, rewrites it using Microsoft Writing Style Guide principles, structures it into a consistent schema, and presents it in a developer-friendly sidebar UI with optional audio playback.

---

## 2. Goals

### Primary goal

Deliver highly relevant, actionable help inside VS Code with minimal user effort.

### Secondary goals

- Reduce time spent searching documentation
- Improve comprehension through structured content
- Enable multimodal consumption (read + listen)
- Create reusable structured documentation output

---

## 3. Target users

### Primary

Salesforce developers (Apex, LWC)

### Secondary

- Salesforce admins
- Technical writers (internal docs workflows)

---

## 4. Core use cases

### UC1: Generate help from selected code

**Trigger:** User selects code → right-click → "Generate Help"

**Outcome:** Structured help topic appears in sidebar, including steps, examples, and best practices.

---

### UC2: Understand an Apex pattern

**Trigger:** User selects unfamiliar code

**Outcome:** Explanation + related best practices + optional audio narration.

---

### UC3: Learn while building

**Trigger:** User manually invokes command

**Outcome:** Context-aware guide tailored to the current file.

---

## 5. Functional requirements

### 5.1 Context extraction

Capture:
- Programming language
- Selected text (if any)
- File name
- Cursor position

---

### 5.2 Help generation

The system must:
- Fetch relevant Salesforce documentation
- Extract key sections
- Rewrite content using style rules
- Structure output into the predefined schema

---

### 5.3 Output schema

> **Resolved 2026-05-05.** Schema reconciled: `codeExamples` added from PRD; `bestPractices` folded into `notes` with `type: "tip"`; `relatedTopics` replaced by `relatedLinks` (URLs more useful than names); `audioText` rejected (derived at render time, not stored in schema). Source of truth: `schema/helpDoc.ts`.

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

---

### 5.4 UI rendering (Webview)

Display:
- Title
- Summary
- Step-by-step instructions
- Code examples (copyable)
- Best practices
- Audio playback control

---

### 5.5 Audio playback

- Use browser `SpeechSynthesis` API
- Allow play/pause
- Support section-level playback

---

### 5.6 Commands and entry points

- Command Palette: `Generate Contextual Help`
- Right-click context menu (when text is selected)

---

## 6. Non-goals (MVP)

- Multi-document aggregation
- Offline support
- Voice input
- Full personalization
- Perfect SLDS parity

---

## 7. Content transformation rules

The rewrite engine must:
- Use imperative voice ("Create…", "Avoid…")
- Prefer short sentences
- Convert paragraphs into steps
- Highlight best practices explicitly
- Remove redundancy
- Preserve technical accuracy

---

## 8. System architecture ⚠️

> **Conflict:** The PRD specifies a separate Node/Express backend. This was explicitly rejected — the user cannot host a server. The actual architecture has the extension host (Node.js inside VS Code) call the Anthropic API directly, with the Salesforce Docs MCP server attached. There is no separate backend process. See `CLAUDE.md` for the current architecture.

PRD-proposed architecture (not current):
- **Client (VS Code Extension):** context extraction, command handling, Webview UI
- **Backend (Node/Express):** documentation fetching, content extraction, rewrite engine, JSON formatter

---

## 9. API specification ⚠️

> **Conflict:** Follows from section 8. There is no `POST /generate-help` endpoint. The equivalent is a direct `anthropic.messages.create()` call in `claudePipeline.ts` with `mcp_servers` attached. See `PLAN.md` for the pipeline design.

PRD-proposed endpoint (not current):

`POST /generate-help`

Request:
```json
{
  "language": "string",
  "selection": "string",
  "intentHint": "string | null"
}
```

Response: see Output Schema above.

---

## 10. Performance requirements ⚠️

> **Conflict:** The "< 3 seconds" target is not achievable with the current architecture. A single Anthropic API call with an MCP-backed tool_use loop realistically takes 8–15 seconds on a cold call. The 200ms loading state target is achievable. Revise the response time target to "< 15 seconds with loading state shown within 200ms" until caching (Phase 2) reduces repeat-query latency.

- Initial response: < 3s (target — **not achievable at MVP; revise to < 15s**)
- Loading state shown: within 200ms of command invoke ✓
- Partial rendering: future (Phase 2)

---

## 11. Security and privacy

- Do not store user code by default
- Send minimal context required
- Provide user setting to disable context sharing (`sfHelp.sendContext`)

---

## 12. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Irrelevant help content | Improve context extraction; allow user refinement |
| Slow response time | Caching + progressive rendering (Phase 2) |
| Fragile doc parsing | MCP server handles parsing; fallback to Claude training knowledge |

---

## 13. Success metrics

- % of sessions where help is generated successfully
- User repeat usage rate
- Time to first meaningful content
- User satisfaction (qualitative)

---

## 14. Roadmap

### Phase 1 — MVP
- Manual trigger
- Basic context extraction
- Extension host pipeline (no separate backend)
- Webview UI
- Audio playback

### Phase 2
- Improved relevance (intent detection tuning)
- Caching layer (query + URL)
- Better loading states / streaming

### Phase 3
- CodeLens integration ("Get Help for this" above functions)
- "Insert into file" feature
- Explain mode vs Generate mode

### Phase 4
- Multi-source docs (`DocProvider` abstraction)
- Personalization
- Advanced UI interactions

---

## 15. Future opportunities

- Internal company documentation integration
- Export structured help to Markdown/Docs
- AI-assisted code generation from help topics
- Team knowledge sharing

---

## 16. Open questions

1. How accurate can intent detection be without user input?
2. What is the best fallback when no relevant docs are found?
3. Should users be able to edit generated help before saving?
4. How much context is too much (privacy vs usefulness)?
5. ~~Should `codeExamples` and `bestPractices` be added to the schema?~~ Resolved: `codeExamples` added; `bestPractices` folded into `notes` with `type: "tip"`.
