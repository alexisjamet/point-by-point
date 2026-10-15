import { createMcpHandler } from "@modelcontextprotocol/server";
import { PLAIN_SESSION_PREFIX, UI_SESSION_PREFIX, createServer, uiSupportFromRequest } from "./server";
import { VERSION } from "./ui.generated";

export interface Env {
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

// The decision for each request travels with the request itself, in an internal header the factory reads.
const UI_HEADER = "x-point-by-point-ui";

const handler = createMcpHandler(({ requestInfo }) => createServer({ ui: requestInfo?.headers.get(UI_HEADER) === "1" }), {
  // Errors only, and never the request content.
  onerror: (error) => console.error(`mcp error: ${error.name}: ${error.message.slice(0, 200)}`),
});

async function readJson(request: Request): Promise<unknown> {
  if (request.method !== "POST") return undefined;
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

function isInitialize(body: unknown): boolean {
  const message = Array.isArray(body) ? body[0] : body;
  return (message as { method?: unknown } | undefined)?.method === "initialize";
}

async function serveMcp(request: Request): Promise<Response> {
  const body = await readJson(request);
  const ui = uiSupportFromRequest(body, request.headers.get("mcp-session-id"));
  const headers = new Headers(request.headers);
  headers.delete(UI_HEADER);
  if (ui) headers.set(UI_HEADER, "1");
  const response = await handler.fetch(new Request(request, { headers }));

  // 2025 clients: hand out a session id that carries the UI decision, so later requests can be
  // answered without the server remembering anything.
  if (isInitialize(body) && response.ok && !response.headers.has("mcp-session-id")) {
    const headers = new Headers(response.headers);
    headers.set("mcp-session-id", `${ui ? UI_SESSION_PREFIX : PLAIN_SESSION_PREFIX}${crypto.randomUUID()}`);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
}

const INFO = `point-by-point ${VERSION}

MCP server: annotate Claude's responses sentence by sentence.
Endpoint: /mcp
Source: https://github.com/alexisjamet/point-by-point
This server stores nothing, logs no content and makes no outbound calls.
`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/" && request.method === "GET") {
      return new Response(INFO, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (pathname !== "/mcp") return new Response("Not found\n", { status: 404 });

    if (env.RATE_LIMITER) {
      const key = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key });
      if (!success) return new Response("Too many requests\n", { status: 429, headers: { "retry-after": "60" } });
    }
    return serveMcp(request);
  },
} satisfies ExportedHandler<Env>;
