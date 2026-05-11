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

// ── Root ───────────────────────────────────────────────────────────────────

function App() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Action;
      dispatch(msg);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (state.status === 'idle') return <IdleView />;
  if (state.status === 'loading') return <LoadingView message={state.message} />;
  if (state.status === 'error') return <ErrorView message={state.message} />;
  return <HelpDocView doc={state.doc} />;
}

// ── Views ──────────────────────────────────────────────────────────────────

function IdleView() {
  return (
    <div className="slds-p-around_medium">
      <p className="slds-text-color_weak">Select Apex code and run <strong>Generate Salesforce Help</strong> to get started.</p>
    </div>
  );
}

function LoadingView({ message }: { message: string }) {
  return (
    <div className="slds-p-around_medium">
      <div className="slds-media slds-media_center">
        <div className="slds-media__figure">
          <Spinner />
        </div>
        <div className="slds-media__body">
          <p className="slds-text-color_weak">{message}</p>
        </div>
      </div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="slds-p-around_medium">
      <div className="slds-box slds-theme_error slds-p-around_small">
        <p className="slds-m-bottom_small">{message}</p>
        <button className="slds-button slds-button_neutral" onClick={() => vscode.postMessage({ type: 'retry' })}>Retry</button>
      </div>
    </div>
  );
}

function HelpDocView({ doc }: { doc: HelpDoc }) {
  return (
    <div className="slds-p-around_medium">
      {/* Header */}
      <div className="slds-grid slds-grid_align-spread slds-m-bottom_small">
        <h1 className="slds-text-heading_medium slds-text-color_brand">{doc.title}</h1>
        <button className="slds-button slds-button_neutral slds-shrink-none" onClick={() => vscode.postMessage({ type: 'refine' })}>Refine ▾</button>
      </div>

      {/* Summary */}
      <p className="slds-text-body_regular slds-m-bottom_medium">{doc.summary}</p>

      {/* Prerequisites */}
      {doc.prerequisites.length > 0 && (
        <Section title="Prerequisites">
          <ul className="slds-list_dotted slds-m-left_medium">
            {doc.prerequisites.map((p, i) => <li key={i} className="slds-item">{p}</li>)}
          </ul>
        </Section>
      )}

      {/* Steps */}
      {doc.steps.length > 0 && (
        <Section title="Steps">
          <ol className="slds-list_ordered slds-m-left_medium">
            {doc.steps.map((s, i) => (
              <li key={i} className="slds-item slds-m-bottom_x-small">
                <strong>{s.label}</strong>
                <p className="slds-m-top_xx-small">{s.detail}</p>
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
          <ul className="slds-list_dotted slds-m-left_medium">
            {doc.relatedLinks.map((l, i) => (
              <li key={i} className="slds-item">
                <a href={l.url} className="slds-text-link">{l.label}</a>
              </li>
            ))}
          </ul>
          <p className="slds-text-body_small slds-text-color_weak slds-m-top_xx-small">Links are AI-generated — verify before use.</p>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="slds-m-bottom_medium slds-p-bottom_medium" style={{ borderBottom: '1px solid var(--slds-g-color-border-base-1, #e5e5e5)' }}>
      <h2 className="slds-text-title_caps slds-text-color_brand slds-m-bottom_x-small">{title}</h2>
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
    <div className="slds-box slds-box_x-small slds-m-bottom_small" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="slds-grid slds-grid_align-spread slds-p-horizontal_small slds-p-vertical_xx-small" style={{ background: 'var(--slds-g-color-neutral-base-95, #f3f3f3)', borderBottom: '1px solid var(--slds-g-color-border-base-1, #e5e5e5)' }}>
        <span className="slds-text-body_small slds-text-color_weak">{label}</span>
        <button className="slds-button slds-button_neutral slds-button_x-small" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <pre className="slds-p-around_small" style={{ margin: 0, overflowX: 'auto', fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 'var(--vscode-editor-font-size, 13px)', background: 'var(--slds-g-color-neutral-base-95, #f3f3f3)' }}><code>{code}</code></pre>
    </div>
  );
}

function NoteBlock({ type, body }: { type: 'note' | 'warning' | 'tip'; body: string }) {
  const themeMap: Record<string, string> = {
    warning: 'slds-theme_warning',
    tip:     'slds-theme_success',
    note:    'slds-theme_info',
  };
  const labels: Record<string, string> = { warning: '⚠ Warning', tip: '💡 Tip', note: 'ℹ Note' };

  return (
    <div className={`slds-box slds-box_x-small slds-m-bottom_x-small ${themeMap[type]}`}>
      <strong className="slds-m-right_xx-small">{labels[type]}</strong>
      <span>{body}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="slds-spinner slds-spinner_x-small" role="status">
      <span className="slds-assistive-text">Loading</span>
      <div className="slds-spinner__dot-a"></div>
      <div className="slds-spinner__dot-b"></div>
    </div>
  );
}

// ── Dark mode overrides ────────────────────────────────────────────────────

const darkModeOverrides = document.createElement('style');
darkModeOverrides.textContent = `
  body {
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
  }
  .slds-text-color_brand { color: #0176D3; }
  .slds-text-color_weak, .slds-text-body_small { color: var(--vscode-descriptionForeground); }
  pre, .slds-box { background: var(--vscode-textBlockQuote-background, #2d2d2d); color: var(--vscode-editor-foreground); }
  .slds-button_neutral {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    border-color: var(--vscode-panel-border);
  }
  .slds-theme_error { background: transparent; border-left: 3px solid var(--vscode-errorForeground); color: var(--vscode-errorForeground); }
`;
document.head.appendChild(darkModeOverrides);

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
        <div className="slds-p-around_medium">
          <div className="slds-box slds-theme_error slds-p-around_small">
            <p className="slds-m-bottom_small">Something went wrong rendering the panel.</p>
            <button className="slds-button slds-button_neutral" onClick={() => vscode.postMessage({ type: 'retry' })}>Retry</button>
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
