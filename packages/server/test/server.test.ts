import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import {
  MAX_MARKDOWN_LENGTH,
  NO_INTERFACE_RESULT_TEXT,
  SERVER_INSTRUCTIONS,
  TOOL_NAME,
  TOOL_RESULT_TEXT,
} from "../src/server";
import { UI_URI } from "../src/ui.generated";

const UI_CAPABILITIES = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
type Era = "legacy" | "modern";

async function connect(options: { ui: boolean | object; era: Era }) {
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    {
      capabilities: options.ui === true ? UI_CAPABILITIES : options.ui || {},
      versionNegotiation: { mode: options.era === "modern" ? { pin: "2026-07-28" } : "legacy" },
    },
  );
  const transport = new StreamableHTTPClientTransport(new URL("https://pbp.test/mcp"), {
    fetch: (input, init) => worker.fetch(new Request(input, init), {}),
  });
  await client.connect(transport);
  return client;
}

describe.each<Era>(["legacy", "modern"])("%s protocol", (era) => {
  it("exposes the tool to a client that renders interfaces", async () => {
    const client = await connect({ ui: true, era });
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === TOOL_NAME);
    expect(tool).toBeDefined();
    expect(tool?._meta).toMatchObject({ ui: { resourceUri: UI_URI } });
    expect(UI_URI).toMatch(/^ui:\/\/point-by-point\/annotate-v\d+\.\d+\.html$/);
    await client.close();
  });

  it("serves the same tool list and instructions to a client without interface support", async () => {
    const withUi = await connect({ ui: true, era });
    const withoutUi = await connect({ ui: false, era });
    expect((await withoutUi.listTools()).tools).toEqual((await withUi.listTools()).tools);
    expect(withUi.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    expect(withoutUi.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    await withUi.close();
    await withoutUi.close();
  });

  it("asks Claude to answer in the chat when the client cannot show the interface", async () => {
    const client = await connect({ ui: false, era });
    const result = await client.callTool({ name: TOOL_NAME, arguments: { markdown: "Hello. World." } });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: NO_INTERFACE_RESULT_TEXT }]);
    expect(result.structuredContent).toBeUndefined();
    await client.close();
  });

  it("exposes the tool when the ui extension lists no MIME type", async () => {
    const client = await connect({ ui: { extensions: { "io.modelcontextprotocol/ui": {} } }, era });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain(TOOL_NAME);
    await client.close();
  });

  it("serves the interface as an MCP App resource", async () => {
    const client = await connect({ ui: true, era });
    const { contents } = await client.readResource({ uri: UI_URI });
    expect(contents[0]).toMatchObject({ uri: UI_URI, mimeType: "text/html;profile=mcp-app" });
    expect((contents[0] as { text: string }).text).toContain("<html");
    await client.close();
  });

  it("keeps serving the interface under the URIs of earlier releases", async () => {
    const client = await connect({ ui: true, era });
    const earlier = "ui://point-by-point/annotate-v0.0.html";
    const { contents } = await client.readResource({ uri: earlier });
    expect(contents[0]).toMatchObject({ uri: earlier, mimeType: "text/html;profile=mcp-app" });
    expect((contents[0] as { text: string }).text).toContain("<html");
    await expect(client.readResource({ uri: "ui://point-by-point/other.html" })).rejects.toThrow();
    await client.close();
  });

  it("returns a short result with a creation time", async () => {
    const client = await connect({ ui: true, era });
    const result = await client.callTool({ name: TOOL_NAME, arguments: { markdown: "Hello. World." } });
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: TOOL_RESULT_TEXT }]);
    expect(typeof (result.structuredContent as { createdAt: unknown }).createdAt).toBe("number");
    await client.close();
  });

  it("refuses an empty or oversized response", async () => {
    const client = await connect({ ui: true, era });
    const empty = await client.callTool({ name: TOOL_NAME, arguments: { markdown: "  \n " } });
    expect(empty.isError).toBe(true);
    const long = await client.callTool({ name: TOOL_NAME, arguments: { markdown: "a".repeat(MAX_MARKDOWN_LENGTH + 1) } });
    expect(long.isError).toBe(true);
    expect(JSON.stringify(long.content)).toContain("too long");
    await client.close();
  });
});

/** One raw JSON-RPC request, as a host sends it, without the SDK client. */
async function post(body: object, headers: Record<string, string> = {}) {
  const response = await worker.fetch(
    new Request("https://pbp.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    }),
    {},
  );
  const text = await response.text();
  const data = text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
  return JSON.parse(data ?? "null");
}

function modernToolsList(capabilities: object, cursor?: string) {
  return post(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        ...(cursor ? { cursor } : {}),
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": capabilities,
        },
      },
    },
    { "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
  );
}

describe("interface decisions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exposes the tool to a 2025 request without a session id", async () => {
    const reply = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "mcp-protocol-version": "2025-06-18" });
    expect(reply.result.tools.map((tool: { name: string }) => tool.name)).toContain(TOOL_NAME);
  });

  it("logs a fixed line, and nothing from the request, for a client without the interface", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const reply = await modernToolsList({ sampling: {} }, "conversation-text-must-not-leak");
    expect(reply.result.tools.map((tool: { name: string }) => tool.name)).toContain(TOOL_NAME);
    expect(log.mock.calls).toEqual([["tools/list from a client without the interface: 2026 envelope without the ui extension"]]);
  });

  it("traces each 2025 request with its method and the decision taken", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "python", version: "1" } },
    });
    expect(log.mock.calls).toEqual([
      ["2025 POST initialize, protocol none, status 200, interface no: 2025 initialize without the ui extension"],
    ]);
  });

  it("names neither an unknown method nor an odd protocol version in the trace", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await post(
      { jsonrpc: "2.0", id: 1, method: "conversation-text-must-not-leak" },
      { "mcp-protocol-version": "conversation text too" },
    );
    expect(log).toHaveBeenCalledTimes(1);
    const [line] = log.mock.calls[0] ?? [];
    expect(line).toMatch(/^2025 POST other, protocol other, status \d+, interface yes: /);
    expect(line).not.toContain("conversation");
  });

  it("shows the interface to ChatGPT even when it does not announce the ui extension", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const chatGpt = { _meta: { "openai/locale": "fr-FR" } };
    await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "openai-mcp", version: "1" }, ...chatGpt },
    });
    expect(log.mock.calls).toEqual([["2025 POST initialize, protocol none, status 200, interface yes: ChatGPT hints in _meta"]]);

    // A tool call on a session opened without the extension still gets the interface.
    const reply = await post(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: TOOL_NAME, arguments: { markdown: "Hi." }, ...chatGpt } },
      { "mcp-protocol-version": "2025-06-18", "mcp-session-id": "plain.0" },
    );
    expect(reply.result.content).toEqual([{ type: "text", text: TOOL_RESULT_TEXT }]);
  });

  it("logs nothing for a client that renders the interface", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const reply = await modernToolsList(UI_CAPABILITIES);
    expect(reply.result.tools.map((tool: { name: string }) => tool.name)).toContain(TOOL_NAME);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("http surface", () => {
  it("answers on / and 404s elsewhere", async () => {
    expect((await worker.fetch(new Request("https://pbp.test/"), {})).status).toBe(200);
    expect((await worker.fetch(new Request("https://pbp.test/other"), {})).status).toBe(404);
  });

  it("applies the rate limiter when bound", async () => {
    const env = { RATE_LIMITER: { limit: async () => ({ success: false }) } };
    const response = await worker.fetch(new Request("https://pbp.test/mcp", { method: "POST", body: "{}" }), env);
    expect(response.status).toBe(429);
  });
});
