import { HelpDoc } from '../../schema/helpDoc';
import { EditorContext } from './contextGatherer';

const SF_BASE_URL = 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl';
const MCP_URL = 'https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp';
const SF_MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 10;

interface OAITool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

let cachedTools: OAITool[] | null = null;

async function getTools(): Promise<OAITool[]> {
  if (cachedTools) return cachedTools;

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const json = await res.json() as { result?: { tools?: Array<{ name: string; description: string; inputSchema: unknown }> } };
  const tools = json.result?.tools ?? [];

  cachedTools = tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema ?? { type: 'object', properties: {} } },
  }));

  return cachedTools;
}

async function callMcpTool(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const json = await res.json() as { result?: { content?: Array<{ text?: string }> } };
  return json.result?.content?.[0]?.text ?? JSON.stringify(json.result);
}

function buildPrompt(ctx: EditorContext | null, userQuery: string): string {
  if (!ctx) return userQuery || 'Search Salesforce docs for general Apex best practices.';

  const parts: string[] = [];
  parts.push(`The developer is working in a ${ctx.language} file: ${ctx.filePath}`);

  if (ctx.selectedText) {
    parts.push(`\nSelected code:\n${ctx.selectedText}`);
  }

  if (ctx.surroundingLines) {
    parts.push(`\nSurrounding context:\n${ctx.surroundingLines}`);
  }

  parts.push(`\nTheir question or intent: ${userQuery || 'infer from the code above'}`);
  parts.push('\nDetect the Salesforce feature they\'re working with. Search the Salesforce docs for the most relevant topic. Fetch and reformat it. Return only the HelpDoc JSON.');

  return parts.join('\n');
}

interface PipelineOptions {
  systemPrompt: string;
  editorContext: EditorContext | null;
  userQuery: string;
  llmKey: string;
  onToolCall?: () => void;
}

const REQUIRED_KEYS: (keyof HelpDoc)[] = ['title', 'summary', 'prerequisites', 'steps', 'codeExamples', 'notes', 'relatedLinks'];

export async function runPipeline(opts: PipelineOptions): Promise<HelpDoc> {
  const { systemPrompt, editorContext, userQuery, llmKey, onToolCall } = opts;

  const tools = await getTools().catch(() => {
    throw new Error("Couldn't reach Salesforce docs. Try again.");
  });

  const messages: unknown[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildPrompt(editorContext, userQuery) },
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const res = await fetch(`${SF_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmKey}`,
      },
      body: JSON.stringify({
        model: SF_MODEL,
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? 'auto' : undefined,
        max_tokens: 4096,
      }),
    });

    if (res.status === 401) {
      throw new Error('API key rejected — re-enter your Salesforce LLM Gateway key.');
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`LLM error ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json() as {
      choices?: Array<{
        finish_reason: string;
        message: {
          role: string;
          content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice) throw new Error("Couldn't reach the AI service. Try again.");

    const { finish_reason, message } = choice;
    messages.push(message);

    if (finish_reason === 'tool_calls' && message.tool_calls?.length) {
      onToolCall?.();
      for (const tc of message.tool_calls) {
        const result = await callMcpTool(tc.function.name, JSON.parse(tc.function.arguments));
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      continue;
    }

    if (finish_reason === 'stop') {
      const content = message.content ?? '';
      let parsed: unknown;
      try {
        // Strip markdown fences if the model wraps the JSON
        const cleaned = content.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error('Something went wrong — try again');
      }

      for (const key of REQUIRED_KEYS) {
        if (!(key in (parsed as object))) {
          throw new Error('Something went wrong — try again');
        }
      }

      return parsed as HelpDoc;
    }
  }

  throw new Error('Something went wrong — try again');
}
