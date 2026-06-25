import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { gatherContext } from './contextGatherer';
import { runPipeline } from './claudePipeline';
import { getOrCreatePanel, postMessage } from './webview/panel';
import { registerCodeLensProviders } from './codeLensProvider';

let systemPrompt: string;
let pipelineRunning = false;

export function activate(context: vscode.ExtensionContext) {
  systemPrompt = loadSystemPrompt(context);

  const cmd = vscode.commands.registerCommand('sfHelp.generate', async () => {
    if (pipelineRunning) return;

    // CRITICAL: Capture editor context BEFORE showing any UI (which steals focus)
    const editorContext = gatherContext();

    const llmKey = await getOrPromptKey(context);
    if (!llmKey) return;

    const panel = getOrCreatePanel(
      context,
      (refinedQuery) => triggerRun(context, panel, refinedQuery, editorContext),
      () => triggerRun(context, panel, '', editorContext),
    );

    triggerRun(context, panel, '', editorContext);
  });

  context.subscriptions.push(cmd);
  registerCodeLensProviders(context);
}

export function deactivate() {}

function triggerRun(
  context: vscode.ExtensionContext,
  panel: ReturnType<typeof getOrCreatePanel>,
  userQuery: string,
  editorContext: ReturnType<typeof gatherContext>,
) {
  if (pipelineRunning) return;
  getOrPromptKey(context).then(llmKey => {
    if (!llmKey) return;
    postMessage(panel, { type: 'loading', message: 'Fetching Salesforce help…' });
    runWithKey(context, llmKey, panel, userQuery, editorContext);
  });
}

async function runWithKey(
  context: vscode.ExtensionContext,
  llmKey: string,
  panel: ReturnType<typeof getOrCreatePanel>,
  userQuery: string,
  editorContext: ReturnType<typeof gatherContext>,
) {
  pipelineRunning = true;
  try {
    const helpDoc = await runPipeline({
      systemPrompt,
      editorContext,
      userQuery,
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
        await runWithKey(context, newKey, panel, userQuery, editorContext);
        return;
      }
    }
    postMessage(panel, { type: 'error', message });
  } finally {
    pipelineRunning = false;
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
    prompt: 'Enter your Salesforce LLM Gateway key — find it in DevBar → Express LLM Gateway → Authentication Token',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'Paste your sk-... token here',
  });

  if (key?.trim()) {
    await context.secrets.store('sfHelp.llmKey', key.trim());
    return key.trim();
  }

  return undefined;
}
