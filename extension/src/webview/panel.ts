import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

let panel: vscode.WebviewPanel | undefined;

export function getOrCreatePanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return panel;
  }

  panel = vscode.window.createWebviewPanel(
    'sfHelpCopilot',
    'Salesforce Help',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    }
  );

  panel.webview.html = buildHtml(panel.webview, context);

  panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);

  // Forward refine requests from webview to VS Code input box
  panel.webview.onDidReceiveMessage(async (msg: { type: string }) => {
    if (msg.type === 'refine') {
      const refined = await vscode.window.showInputBox({
        prompt: 'Refine your query',
        ignoreFocusOut: true,
      });
      if (refined !== undefined) {
        panel?.webview.postMessage({ type: 'refineResult', query: refined });
      }
    }
  }, null, context.subscriptions);

  return panel;
}

export function postMessage(p: vscode.WebviewPanel, message: unknown): void {
  p.webview.postMessage(message);
}

function buildHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const htmlPath = path.join(context.extensionUri.fsPath, 'media', 'webview.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webviewScript.js')
  );

  html = html.replace(/{{nonce}}/g, nonce).replace('{{scriptUri}}', scriptUri.toString());
  return html;
}
