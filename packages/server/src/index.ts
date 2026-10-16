import { createMcpHandler } from "@modelcontextprotocol/server";
import { PLAIN_SESSION_PREFIX, UI_SESSION_PREFIX, createServer, uiSupportFromRequest } from "./server";
import { VERSION } from "./ui.generated";

export interface Env {
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

// The decision for each request travels with the request itself, in an internal header the factory reads.
const UI_HEADER = "x-point-by-point-ui";

const handler = createMcpHandler(({ requestInfo }) => createServer({ ui: requestInfo?.headers.get(UI_HEADER) === "1" }), {
  // The error name only: a message can quote the request, which could hold conversation text.
  onerror: (error) => console.error(`mcp error: ${error.name}`),
});

async function readJson(request: Request): Promise<unknown> {
  if (request.method !== "POST") return undefined;
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

function methodOf(body: unknown): unknown {
  const message = Array.isArray(body) ? body[0] : body;
  return (message as { method?: unknown } | undefined)?.method;
}

function isInitialize(body: unknown): boolean {
  return methodOf(body) === "initialize";
}

// Logs name a method or a protocol version only when it is one of these, so a request can never
// put its own text, which could be conversation text, into a log line.
const LOGGED_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "notifications/cancelled",
  "ping",
  "server/discover",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/templates/list",
  "resources/read",
  "prompts/list",
]);
const PROTOCOL_VERSION = /^\d{4}-\d{2}-\d{2}$/;

function loggable(value: unknown, allowed: (value: string) => boolean): string {
  if (value === undefined || value === null) return "none";
  return typeof value === "string" && allowed(value) ? value : "other";
}

async function serveMcp(request: Request): Promise<Response> {
  const body = await readJson(request);
  const method = methodOf(body);
  const { ui, reason } = uiSupportFromRequest(body, request.headers.get("mcp-session-id"));
  // Which clients list or call the tool without rendering the interface, and why we think so.
  if (!ui && (method === "tools/list" || method === "tools/call")) {
    console.log(`${method} from a client without the interface: ${reason}`);
  }
  const headers = new Headers(request.headers);
  headers.delete(UI_HEADER);
  if (ui) headers.set(UI_HEADER, "1");
  const response = await handler.fetch(new Request(request, { headers }));

  // 2025 requests name their method only in the body, out of sight of `wrangler tail`: trace each
  // one with the decision taken, from fixed strings only.
  if (!request.headers.has("mcp-method")) {
    const version = loggable(request.headers.get("mcp-protocol-version"), (v) => PROTOCOL_VERSION.test(v));
    const name = loggable(method, (m) => LOGGED_METHODS.has(m));
    const verb = loggable(request.method, (v) => ["GET", "POST", "DELETE"].includes(v));
    console.log(
      `2025 ${verb} ${name}, protocol ${version}, status ${response.status}, ` +
        `interface ${ui ? "yes" : "no"}: ${reason}`,
    );
  }

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

MCP server: annotate the assistant's responses (Claude, ChatGPT) sentence by sentence.
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
