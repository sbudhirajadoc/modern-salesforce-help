export interface HelpDocNote {
  type: "note" | "warning" | "tip";
  body: string;
}

export interface HelpDocStep {
  label: string;
  detail: string;
}

export interface HelpDocLink {
  label: string;
  url: string;
}

export interface HelpDocCodeExample {
  label: string;
  code: string;
}

export interface HelpDoc {
  title: string;
  summary: string;
  prerequisites: string[];
  steps: HelpDocStep[];
  codeExamples: HelpDocCodeExample[];
  notes: HelpDocNote[];
  relatedLinks: HelpDocLink[];
}
