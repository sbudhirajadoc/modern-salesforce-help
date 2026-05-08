import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface EditorContext {
  language: string;
  filePath: string;
  selectedText: string;
  surroundingLines: string;
  hasSFDX: boolean;
}

const MAX_SELECTION = 3000;
const SURROUNDING_LINES = 10;

export function gatherContext(): EditorContext | null {
  const config = vscode.workspace.getConfiguration('sfHelp');
  if (!config.get<boolean>('sendContext', true)) return null;

  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const doc = editor.document;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

  const rawSelection = doc.getText(editor.selection);
  const selectedText = rawSelection.length > MAX_SELECTION
    ? rawSelection.slice(0, MAX_SELECTION) + '\n[Selection truncated]'
    : rawSelection;

  const cursorLine = editor.selection.active.line;
  const startLine = Math.max(0, cursorLine - SURROUNDING_LINES);
  const endLine = Math.min(doc.lineCount - 1, cursorLine + SURROUNDING_LINES);
  const surroundingLines = doc.getText(
    new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length)
  );

  const hasSFDX = workspaceRoot
    ? fs.existsSync(path.join(workspaceRoot, 'sfdx-project.json'))
    : false;

  return {
    language: doc.languageId,
    filePath: workspaceRoot ? path.relative(workspaceRoot, doc.uri.fsPath) : doc.uri.fsPath,
    selectedText,
    surroundingLines,
    hasSFDX,
  };
}
