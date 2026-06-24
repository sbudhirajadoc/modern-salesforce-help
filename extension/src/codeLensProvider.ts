import * as vscode from 'vscode';

// Apex: class or trigger declaration line
const APEX_DECLARATION = /^\s*(?:(?:public|private|protected|global|abstract|virtual|with\s+sharing|without\s+sharing|inherited\s+sharing)\s+)*(?:class|trigger)\s+\w+/;

// LWC: export default class in a file under an lwc/ directory
const LWC_DECLARATION = /^\s*export\s+default\s+class\s+\w+/;

function isLwcFile(uri: vscode.Uri): boolean {
  return uri.fsPath.includes('/lwc/') || uri.fsPath.includes('\\lwc\\');
}

class HelpCopilotCodeLensProvider implements vscode.CodeLensProvider {
  private readonly pattern: RegExp;
  private readonly lwcOnly: boolean;

  constructor(pattern: RegExp, lwcOnly = false) {
    this.pattern = pattern;
    this.lwcOnly = lwcOnly;
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (this.lwcOnly && !isLwcFile(document.uri)) return [];

    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (this.pattern.test(line.text)) {
        lenses.push(new vscode.CodeLens(line.range, {
          title: '⚡ Get Salesforce Help',
          command: 'sfHelp.generate',
          tooltip: 'Generate contextual Salesforce help for this component',
        }));
      }
    }
    return lenses;
  }
}

export function registerCodeLensProviders(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'apex' },
      new HelpCopilotCodeLensProvider(APEX_DECLARATION),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: 'javascript' },
      new HelpCopilotCodeLensProvider(LWC_DECLARATION, /* lwcOnly */ true),
    ),
  );
}
