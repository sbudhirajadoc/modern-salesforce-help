// Pipeline smoke test — issues #1 and #2
// Run: SF_LLM_KEY=<your-key> node test-pipeline.mjs
// Key source: Claude Code → Vibes 2.0 settings → Agent Harness → Express API Key

const SF_BASE_URL = "https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl";
const MCP_URL = "https://salesforce-docs-76258744c9d7.herokuapp.com/api/mcp";
const MODEL = "claude-sonnet-4-5";  // adjust if the proxy uses a different model alias

const apiKey = process.env.SF_LLM_KEY;
if (!apiKey) {
  console.error("✗  SF_LLM_KEY not set.");
  console.error("   Get it from: Vibes 2.0 → Agent Harness → Express API Key");
  console.error("   Run: SF_LLM_KEY=your-key node test-pipeline.mjs");
  process.exit(1);
}
console.log("✓  SF_LLM_KEY found.\n");

// ─── Step 1: MCP server — list available tools ───────────────────────────────
console.log("--- Step 1: Discovering MCP tools (issue #2) ---");
let mcpTools = [];
try {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  const json = await res.json();
  if (json.result?.tools) {
    mcpTools = json.result.tools;
    console.log(`✓  MCP server live. Tools available: ${mcpTools.map(t => t.name).join(", ")}`);
  } else {
    console.log("⚠️  Unexpected response:", JSON.stringify(json).slice(0, 200));
  }
} catch (err) {
  console.error("✗  MCP server unreachable:", err.message);
  process.exit(1);
}

// Convert MCP tool definitions to OpenAI function format
const oaiTools = mcpTools.map(t => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.inputSchema ?? { type: "object", properties: {} },
  },
}));

// ─── Step 2: Call Salesforce LLM proxy with tool loop (issue #1) ─────────────
console.log("\n--- Step 2: Testing Salesforce LLM proxy + manual tool loop (issue #1) ---");

async function callMcpTool(toolName, args) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const json = await res.json();
  return json.result?.content?.[0]?.text ?? JSON.stringify(json.result);
}

const messages = [
  {
    role: "user",
    content: "Search Salesforce docs for 'Apex trigger best practices'. Return only the title of the most relevant result.",
  },
];

let iterations = 0;
const MAX = 5;

while (iterations < MAX) {
  iterations++;
  console.log(`\nIteration ${iterations}: calling LLM...`);

  const res = await fetch(`${SF_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: oaiTools.length ? oaiTools : undefined,
      tool_choice: oaiTools.length ? "auto" : undefined,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`✗  LLM proxy error ${res.status}:`, err.slice(0, 300));
    break;
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;

  if (!msg) {
    console.error("✗  Unexpected response shape:", JSON.stringify(data).slice(0, 300));
    break;
  }

  messages.push(msg);

  if (choice.finish_reason === "tool_calls" && msg.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      console.log(`   → Tool call: ${tc.function.name}(${tc.function.arguments.slice(0, 80)})`);
      const result = await callMcpTool(tc.function.name, JSON.parse(tc.function.arguments));
      console.log(`   ← Result: ${result.slice(0, 120)}...`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    continue;
  }

  if (choice.finish_reason === "stop") {
    console.log("\n✓  Pipeline complete.");
    console.log("Final answer:", msg.content);
    break;
  }
}

if (iterations >= MAX) {
  console.warn("⚠️  Reached max iterations without stop.");
}
