import { HelpDoc } from '../../../schema/helpDoc';

export function buildSummaryScript(doc: HelpDoc): string {
  const parts: string[] = [];
  parts.push(doc.title + '.');
  parts.push(doc.summary);
  if (doc.steps.length) {
    parts.push(`There are ${doc.steps.length} step${doc.steps.length === 1 ? '' : 's'}.`);
  }
  if (doc.relatedLinks.length) {
    parts.push('Related topics: ' + doc.relatedLinks.map(l => l.label).join(', ') + '.');
  }
  return parts.map(sanitize).join(' ');
}

export function buildWalkthroughScript(doc: HelpDoc): string {
  const parts: string[] = [];
  parts.push(doc.title + '.');
  parts.push(doc.summary);

  if (doc.prerequisites.length) {
    parts.push('Before you start: ' + doc.prerequisites.map(sanitize).join('. ') + '.');
  }

  doc.steps.forEach((step, i) => {
    parts.push(`Step ${i + 1}: ${step.label}. ${step.detail}`);
  });

  if (doc.notes.length) {
    doc.notes.forEach(n => {
      const prefix = n.type === 'warning' ? 'Warning' : n.type === 'tip' ? 'Tip' : 'Note';
      parts.push(`${prefix}: ${n.body}`);
    });
  }

  return parts.map(sanitize).join(' ');
}

function sanitize(text: string): string {
  return text
    .replace(/[*_`#]/g, '')        // strip markdown symbols
    .replace(/\//g, ' or ')        // expand slashes
    .replace(/–|—/g, ',')          // replace dashes with commas for natural TTS pauses
    .replace(/\s+/g, ' ')
    .trim();
}
