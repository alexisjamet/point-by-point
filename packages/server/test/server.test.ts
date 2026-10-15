import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { MAX_MARKDOWN_LENGTH, TOOL_NAME, TOOL_RESULT_TEXT } from "../src/server";
import { UI_URI } from "../src/ui.generated";

const UI_CAPABILITIES = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
type Era = "legacy" | "modern";

async function connect(options: { ui: boolean; era: Era }) {
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    {
      capabilities: options.ui ? UI_CAPABILITIES : {},
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

  it("hides the tool from a client without interface support", async () => {
    const client = await connect({ ui: false, era });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain(TOOL_NAME);
    await client.close();
  });

  it("serves the interface as an MCP App resource", async () => {
    const client = await connect({ ui: true, era });
    const { contents } = await client.readResource({ uri: UI_URI });
    expect(contents[0]).toMatchObject({ uri: UI_URI, mimeType: "text/html;profile=mcp-app" });
    expect((contents[0] as { text: string }).text).toContain("<html");
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
