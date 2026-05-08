import React, { useEffect, useReducer, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpDoc } from '../../../schema/helpDoc';
import { buildSummaryScript, buildWalkthroughScript } from './scriptBuilder';

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
  const speakingRef = useRef(false);

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
  return <HelpDocView doc={state.doc} speakingRef={speakingRef} />;
}

// ── Views ──────────────────────────────────────────────────────────────────

function IdleView() {
  return (
    <div style={styles.container}>
      <p style={styles.muted}>Select Apex code and run <strong>Generate Salesforce Help</strong> to get started.</p>
    </div>
  );
}

function LoadingView({ message }: { message: string }) {
  return (
    <div style={styles.container}>
      <div style={styles.loadingRow}>
        <Spinner />
        <span style={styles.muted}>{message}</span>
      </div>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div style={styles.container}>
      <div style={{ ...styles.card, borderLeft: '3px solid var(--vscode-errorForeground)' }}>
        <p style={{ color: 'var(--vscode-errorForeground)', margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}

function HelpDocView({ doc, speakingRef }: { doc: HelpDoc; speakingRef: React.MutableRefObject<boolean> }) {
  const hasSpeech = typeof window !== 'undefined' && window.speechSynthesis !== undefined;

  function speak(script: string) {
    if (!hasSpeech) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(script);
    utt.rate = 0.9;
    utt.lang = 'en-US';
    utt.onend = () => { speakingRef.current = false; };
    speakingRef.current = true;
    window.speechSynthesis.speak(utt);
  }

  function stop() {
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
  }

  function handleRefine() {
    vscode.postMessage({ type: 'refine' });
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>{doc.title}</h1>
        <button style={styles.refineBtn} onClick={handleRefine}>Refine ▾</button>
      </div>

      {/* Summary */}
      <p style={styles.summary}>{doc.summary}</p>

      {/* Audio controls */}
      {hasSpeech && (
        <div style={styles.audioRow}>
          <button style={styles.btn} onClick={() => speak(buildSummaryScript(doc))}>▶ Summary</button>
          <button style={styles.btn} onClick={() => speak(buildWalkthroughScript(doc))}>▶ Walkthrough</button>
          <button style={styles.btn} onClick={stop}>◼ Stop</button>
        </div>
      )}

      {/* Prerequisites */}
      {doc.prerequisites.length > 0 && (
        <Section title="Prerequisites">
          <ul style={styles.list}>
            {doc.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Section>
      )}

      {/* Steps */}
      {doc.steps.length > 0 && (
        <Section title="Steps">
          <ol style={styles.list}>
            {doc.steps.map((s, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <strong>{s.label}</strong>
                <p style={{ margin: '4px 0 0 0' }}>{s.detail}</p>
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
          <ul style={styles.list}>
            {doc.relatedLinks.map((l, i) => (
              <li key={i}>
                <a href={l.url} style={styles.link}>{l.label}</a>
              </li>
            ))}
          </ul>
          <p style={{ ...styles.muted, fontSize: 11, marginTop: 4 }}>Links are AI-generated — verify before use.</p>
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
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
    }).catch(() => {
      // Clipboard unavailable — silently ignore
    });
  }

  return (
    <div style={styles.codeBlock}>
      <div style={styles.codeHeader}>
        <span style={styles.codeLabel}>{label}</span>
        <button style={styles.copyBtn} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <pre style={styles.pre}><code>{code}</code></pre>
    </div>
  );
}

function NoteBlock({ type, body }: { type: 'note' | 'warning' | 'tip'; body: string }) {
  const colors: Record<string, string> = {
    warning: 'var(--vscode-editorWarning-foreground, #f0a500)',
    tip:     'var(--vscode-terminal-ansiGreen, #4caf50)',
    note:    'var(--vscode-editor-foreground)',
  };
  const labels: Record<string, string> = { warning: '⚠ Warning', tip: '💡 Tip', note: 'ℹ Note' };

  return (
    <div style={{ ...styles.noteBlock, borderLeftColor: colors[type] }}>
      <strong style={{ color: colors[type] }}>{labels[type]}</strong>
      <p style={{ margin: '4px 0 0 0' }}>{body}</p>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: 14, height: 14,
      border: '2px solid var(--vscode-panel-border)',
      borderTopColor: 'var(--vscode-button-background)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginRight: 8,
    }} />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: 'var(--vscode-font-size)',
    color: 'var(--vscode-editor-foreground)',
    background: 'var(--vscode-editor-background)',
    maxWidth: 680,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: '#0176D3',
    flex: 1,
  },
  summary: {
    margin: '0 0 16px',
    lineHeight: 1.5,
    color: 'var(--vscode-editor-foreground)',
  },
  audioRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid var(--vscode-panel-border)',
  },
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#0176D3',
  },
  list: {
    margin: 0,
    paddingLeft: 20,
    lineHeight: 1.6,
  },
  codeBlock: {
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  codeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 10px',
    background: 'var(--vscode-textBlockQuote-background)',
    borderBottom: '1px solid var(--vscode-panel-border)',
  },
  codeLabel: {
    fontSize: 12,
    color: 'var(--vscode-descriptionForeground)',
  },
  pre: {
    margin: 0,
    padding: 12,
    background: 'var(--vscode-textBlockQuote-background)',
    overflowX: 'auto',
    fontFamily: 'var(--vscode-editor-font-family)',
    fontSize: 'var(--vscode-editor-font-size)',
  },
  noteBlock: {
    borderLeft: '3px solid var(--vscode-editor-foreground)',
    paddingLeft: 10,
    marginBottom: 10,
  },
  btn: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: 2,
    fontSize: 12,
  },
  copyBtn: {
    background: 'transparent',
    color: 'var(--vscode-descriptionForeground)',
    border: '1px solid var(--vscode-panel-border)',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: 2,
    fontSize: 11,
  },
  refineBtn: {
    background: 'transparent',
    color: 'var(--vscode-descriptionForeground)',
    border: '1px solid var(--vscode-panel-border)',
    cursor: 'pointer',
    padding: '3px 8px',
    borderRadius: 2,
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  link: {
    color: '#0176D3',
  },
  muted: {
    color: 'var(--vscode-descriptionForeground)',
    margin: 0,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
  },
};

// Inject spinner keyframe animation
const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);

// ── Mount ──────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
