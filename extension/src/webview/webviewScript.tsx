import React, { useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpDoc } from '../../../schema/helpDoc';

// ── Types ──────────────────────────────────────────────────────────────────

type State =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: HelpDoc };

type Action =
  | { type: 'loading'; message: string }
  | { type: 'update'; payload: HelpDoc }
  | { type: 'error'; message: string };

function reducer(_: State, action: Action): State {
  switch (action.type) {
    case 'loading': return { status: 'loading', message: action.message };
    case 'update':  return { status: 'ready', doc: action.payload };
    case 'error':   return { status: 'error', message: action.message };
  }
}

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

// ── Global styles ──────────────────────────────────────────────────────────

const globalStyles = document.createElement('style');
globalStyles.textContent = `
  *, *::before, *::after { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    line-height: 1.6;
  }

  a { color: var(--vscode-textLink-foreground); }
  a:hover { color: var(--vscode-textLink-activeForeground); }

  .panel { padding: 16px 20px 32px; }

  /* ── Header ── */
  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }
  .panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    line-height: 1.4;
  }

  /* ── Summary ── */
  .panel-summary {
    margin: 0 0 20px;
    color: var(--vscode-editor-foreground);
    opacity: 0.9;
  }

  /* ── Sections ── */
  .section { margin-bottom: 20px; }
  .section-title {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vscode-textLink-foreground);
  }

  /* ── Prerequisites ── */
  .prereq-list {
    margin: 0;
    padding: 0 0 0 20px;
    color: var(--vscode-editor-foreground);
  }
  .prereq-list li { margin-bottom: 4px; }

  /* ── Steps ── */
  .steps-list { margin: 0; padding: 0; list-style: none; }
  .step { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
  .step-number {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--vscode-textLink-foreground);
    color: var(--vscode-editor-background);
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
  }
  .step-body { flex: 1; }
  .step-label {
    font-weight: 600;
    color: var(--vscode-editor-foreground);
    margin-bottom: 2px;
  }
  .step-detail {
    color: var(--vscode-editor-foreground);
    opacity: 0.85;
    margin: 0;
  }

  /* ── Code blocks ── */
  .code-block {
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 10px;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  .code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 10px;
    background: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-tab-inactiveBackground));
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  .code-label {
    font-size: 11px;
    color: var(--vscode-tab-inactiveForeground, var(--vscode-editor-foreground));
    font-family: var(--vscode-font-family);
  }
  .code-body {
    margin: 0;
    padding: 12px 14px;
    background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    line-height: 1.5;
    overflow-x: auto;
    white-space: pre;
  }

  /* ── Notes ── */
  .note {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 12.5px;
    line-height: 1.5;
  }
  .note-warning {
    border-left: 3px solid var(--vscode-editorWarning-foreground, #e2a336);
    background: var(--vscode-inputValidation-warningBackground, rgba(226,163,54,0.1));
    color: var(--vscode-editor-foreground);
  }
  .note-tip {
    border-left: 3px solid var(--vscode-testing-iconPassed, #4caf50);
    background: rgba(76,175,80,0.08);
    color: var(--vscode-editor-foreground);
  }
  .note-note {
    border-left: 3px solid var(--vscode-textLink-foreground);
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.1));
    color: var(--vscode-editor-foreground);
  }
  .note-icon { flex-shrink: 0; font-size: 13px; margin-top: 1px; }
  .note-body { flex: 1; }

  /* ── Related links ── */
  .links-list { margin: 0; padding: 0; list-style: none; }
  .links-list li { margin-bottom: 6px; }
  .links-list a { font-size: 12.5px; }
  .links-disclaimer {
    margin-top: 8px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  /* ── Divider ── */
  .divider {
    border: none;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    margin: 0 0 20px;
  }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--vscode-button-secondaryBorder, var(--vscode-panel-border, rgba(128,128,128,0.4)));
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    white-space: nowrap;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.12));
  }
  .btn-copy {
    font-size: 11px;
    padding: 2px 8px;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: transparent;
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }

  /* ── Loading ── */
  .loading-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px;
    color: var(--vscode-descriptionForeground);
    font-size: 12.5px;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-top-color: var(--vscode-textLink-foreground);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Error ── */
  .error-wrap {
    padding: 16px 20px;
  }
  .error-box {
    padding: 12px 14px;
    border-left: 3px solid var(--vscode-editorError-foreground, #f44747);
    background: var(--vscode-inputValidation-errorBackground, rgba(244,71,71,0.1));
    border-radius: 0 4px 4px 0;
    margin-bottom: 10px;
  }
  .error-message {
    margin: 0 0 10px;
    color: var(--vscode-editor-foreground);
    font-size: 12.5px;
  }

  /* ── Idle ── */
  .idle-wrap {
    padding: 20px;
    color: var(--vscode-descriptionForeground);
    font-size: 12.5px;
  }
`;
document.head.appendChild(globalStyles);

// ── Root ───────────────────────────────────────────────────────────────────

function App() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  useEffect(() => {
    const handler = (event: MessageEvent) => dispatch(event.data as Action);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (state.status === 'idle')    return <IdleView />;
  if (state.status === 'loading') return <LoadingView message={state.message} />;
  if (state.status === 'error')   return <ErrorView message={state.message} />;
  return <HelpDocView doc={state.doc} />;
}

// ── Views ──────────────────────────────────────────────────────────────────

function IdleView() {
  return (
    <div className="idle-wrap">
      Click <strong>⚡ Get Salesforce Help</strong> above a class declaration, or select code and right-click → <strong>Generate Salesforce Help</strong>.
    </div>
  );
}

function LoadingView({ message }: { message: string }) {
  return (
    <div className="loading-wrap">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="error-wrap">
      <div className="error-box">
        <p className="error-message">{message}</p>
        <button className="btn" onClick={() => vscode.postMessage({ type: 'retry' })}>Retry</button>
      </div>
    </div>
  );
}

function HelpDocView({ doc }: { doc: HelpDoc }) {
  return (
    <div className="panel">
      {/* Header */}
      <div className="panel-header">
        <h1 className="panel-title">{doc.title}</h1>
        <button className="btn" onClick={() => vscode.postMessage({ type: 'refine' })}>Refine ▾</button>
      </div>

      {/* Summary */}
      <p className="panel-summary">{doc.summary}</p>

      <hr className="divider" />

      {/* Prerequisites */}
      {doc.prerequisites.length > 0 && (
        <Section title="Prerequisites">
          <ul className="prereq-list">
            {doc.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Section>
      )}

      {/* Steps */}
      {doc.steps.length > 0 && (
        <Section title="Steps">
          <ol className="steps-list">
            {doc.steps.map((s, i) => (
              <li key={i} className="step">
                <div className="step-number">{i + 1}</div>
                <div className="step-body">
                  <div className="step-label">{s.label}</div>
                  <p className="step-detail">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Code examples */}
      {doc.codeExamples.length > 0 && (
        <Section title="Code examples">
          {doc.codeExamples.map((ex, i) => (
            <CodeBlock key={i} label={ex.label} code={ex.code} />
          ))}
        </Section>
      )}

      {/* Notes */}
      {doc.notes.length > 0 && (
        <Section title="Notes">
          {doc.notes.map((n, i) => <NoteBlock key={i} type={n.type} body={n.body} />)}
        </Section>
      )}

      {/* Related links */}
      {doc.relatedLinks.length > 0 && (
        <Section title="Related links">
          <ul className="links-list">
            {doc.relatedLinks.map((l, i) => (
              <li key={i}><a href={l.url}>{l.label}</a></li>
            ))}
          </ul>
          <p className="links-disclaimer">Links are AI-generated — verify before use.</p>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-label">{label}</span>
        <button className="btn btn-copy" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <pre className="code-body"><code>{code}</code></pre>
    </div>
  );
}

function NoteBlock({ type, body }: { type: 'note' | 'warning' | 'tip'; body: string }) {
  const icons = { warning: '⚠', tip: '💡', note: 'ℹ' };
  const classMap = { warning: 'note note-warning', tip: 'note note-tip', note: 'note note-note' };

  return (
    <div className={classMap[type]}>
      <span className="note-icon">{icons[type]}</span>
      <span className="note-body">{body}</span>
    </div>
  );
}

// ── Error boundary ─────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { caught: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { caught: false };
  }
  static getDerivedStateFromError() { return { caught: true }; }
  render() {
    if (this.state.caught) {
      return (
        <div className="error-wrap">
          <div className="error-box">
            <p className="error-message">Something went wrong rendering the panel.</p>
            <button className="btn" onClick={() => vscode.postMessage({ type: 'retry' })}>Retry</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Mount ──────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<ErrorBoundary><App /></ErrorBoundary>);
