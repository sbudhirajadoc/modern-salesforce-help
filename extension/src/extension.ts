import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { gatherContext } from './contextGatherer';
import { runPipeline } from './claudePipeline';
import { getOrCreatePanel, postMessage } from './webview/panel';

let systemPrompt: string;

export function activate(context: vscode.ExtensionContext) {
  systemPrompt = loadSystemPrompt(context);

  const cmd = vscode.commands.registerCommand('sfHelp.generate', async () => {
    const llmKey = await getOrPromptKey(context);
    if (!llmKey) return;

    const panel = getOrCreatePanel(context);
    postMessage(panel, { type: 'loading', message: 'Fetching Salesforce help…' });
    await runWithKey(context, llmKey, panel);
  });

  context.subscriptions.push(cmd);
}

export function deactivate() {}

async function runWithKey(
  context: vscode.ExtensionContext,
  llmKey: string,
  panel: ReturnType<typeof getOrCreatePanel>
) {
  const editorContext = gatherContext();
  try {
    const helpDoc = await runPipeline({
      systemPrompt,
      editorContext,
      userQuery: '',
      llmKey,
      onToolCall: () => postMessage(panel, { type: 'loading', message: 'Reading the docs…' }),
    });
    postMessage(panel, { type: 'update', payload: helpDoc });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Something went wrong — try again';
    if (message.startsWith('API key rejected')) {
      await context.secrets.delete('sfHelp.llmKey');
      const newKey = await getOrPromptKey(context);
      if (newKey) {
        postMessage(panel, { type: 'loading', message: 'Fetching Salesforce help…' });
        await runWithKey(context, newKey, panel);
        return;
      }
    }
    postMessage(panel, { type: 'error', message });
  }
}

function loadSystemPrompt(context: vscode.ExtensionContext): string {
  const promptPath = path.join(context.extensionUri.fsPath, 'media', 'systemPrompt.md');
  return fs.readFileSync(promptPath, 'utf8');
}

async function getOrPromptKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const existing = await context.secrets.get('sfHelp.llmKey');
  if (existing) return existing;

  const key = await vscode.window.showInputBox({
    prompt: 'Enter your Salesforce LLM Gateway key (Vibes 2.0 → Agent Harness → Express API Key)',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'Paste your key here',
  });

  if (key?.trim()) {
    await context.secrets.store('sfHelp.llmKey', key.trim());
    return key.trim();
  }

  return undefined;
}
