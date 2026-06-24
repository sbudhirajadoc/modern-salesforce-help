# Testing Plan — Salesforce Help Copilot

## How to install for testing

```bash
code --install-extension extension/sf-help-copilot-0.0.1.vsix
```

Open a workspace that contains `sfdx-project.json`.

---

## CodeLens

### Apex — class declaration

| # | File | Action | Expected |
|---|------|--------|----------|
| 1 | Any `.cls` with `public class Foo` | Open file | `⚡ Get Salesforce Help` appears above the class line |
| 2 | Any `.cls` with `public with sharing class Foo` | Open file | Lens appears (multi-modifier declaration) |
| 3 | Any `.trigger` with `trigger Foo on ...` | Open file | Lens appears |
| 4 | A `.cls` file with only a method (no class declaration) | Open file | No lens appears |
| 5 | Click the CodeLens | — | Help panel opens; help is scoped to the class/trigger |

### LWC — export default class

| # | File | Action | Expected |
|---|------|--------|----------|
| 6 | `force-app/main/default/lwc/*/foo.js` with `export default class Foo` | Open file | Lens appears |
| 7 | A plain JS file outside `/lwc/` with `export default class Foo` | Open file | No lens appears (lwcOnly guard) |
| 8 | LWC `.html` template file | Open file | No lens appears (no class declaration) |
| 9 | Click the CodeLens on an LWC file | — | Panel opens with LWC-specific help (not generic JS) |

### Edge cases

| # | Scenario | Expected |
|---|----------|----------|
| 10 | Class declaration is commented out (`// public class Foo`) | No lens appears |
| 11 | Two classes in one file (inner class pattern) | Lens appears on each class line |
| 12 | `editor.codeLens` disabled in user settings | No lens appears; right-click still works |

---

## Pipeline (existing, regression)

| # | Scenario | Expected |
|---|----------|----------|
| 13 | Select Apex code → right-click → Generate Salesforce Help | Panel opens with structured HelpDoc |
| 14 | Select LWC JS code → right-click → Generate Salesforce Help | Panel opens with LWC-specific docs |
| 15 | Click Refine → type follow-up → submit | Panel updates with refined content |
| 16 | Click Retry from error state | Pipeline re-runs |
| 17 | Enter invalid API key | Error shown; key deleted; re-prompt on next invoke |
| 18 | Invoke command with no selection | Panel does not appear (command gated on `editorHasSelection`) |
| 19 | Invoke command twice in rapid succession | Second invocation is a no-op (pipelineRunning guard) |
| 20 | Hide and re-show the panel | Content is preserved (`retainContextWhenHidden`) |

---

## Sample files for manual testing

| File | Tests |
|------|-------|
| `samples/AccountTrigger.trigger` | Cases 1, 3, 5, 13 |
| `samples/CommunitiesLandingControllerTest.cls` | Cases 1, 2, 13 |
| `samples/OrderController.cls` | Cases 1, 13 |
| `samples/BarCodeScanner/barcodeScanner.js` | Cases 6, 9, 14 |
