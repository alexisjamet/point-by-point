import {
  RESOURCE_MIME_TYPE,
  getUiCapability,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import {
  CLIENT_CAPABILITIES_META_KEY,
  McpServer,
  ResourceTemplate,
  type ClientCapabilities,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { UI_HTML, UI_URI, VERSION } from "./ui.generated";

export const TOOL_NAME = "annotate_response";
export const UI_URI_TEMPLATE = "ui://point-by-point/annotate-v{version}.html";
export const MAX_MARKDOWN_LENGTH = 100_000;

export const TOOL_DESCRIPTION =
  "Displays your response in an interface where the user can annotate any sentence and send all their " +
  "annotations back in a single message. Use this tool for EVERY response meant for the user, instead of " +
  "writing the text in the chat. Pass the complete response as markdown, sources and follow-up questions " +
  "included. Write nothing else in the chat, and do not use another widget or a question form instead. " +
  "The user's reply quotes each sentence they react to between backticks, followed by their answer or " +
  "question; address each point in order, then any general remark at the end. When there are two points " +
  "or more, open the answer to each with a blockquote of the user's note alone, cut to about ten words; " +
  "always open the answer to the general remark the same way. Use blockquotes for nothing else: the " +
  "interface shows them as the user's points.";

export const TOOL_RESULT_TEXT =
  "Response displayed to the user for annotation. End your turn now without writing anything else: " +
  "any text you add appears under the interface. The user will reply through it.";

/**
 * True when the client announced the MCP Apps extension. The MIME types it lists are not checked:
 * hosts cache a tool list, so one wrong "no" leaves the connector without tools until it is refreshed.
 */
export function supportsUi(capabilities: ClientCapabilities | null | undefined): boolean {
  return getUiCapability(capabilities) !== undefined;
}

type JsonRpcMessage = { method?: unknown; params?: { capabilities?: unknown; _meta?: Record<string, unknown> } };

/** Whether to declare the tool, and which evidence decided it. `reason` is a fixed string, safe to log. */
export type UiSupport = { ui: boolean; reason: string };

/**
 * Reads the client's UI support from one HTTP request, without any server-side state:
 * - 2026-07-28 requests carry the client capabilities in their `_meta` envelope;
 * - a 2025 `initialize` carries them in its params;
 * - later 2025 requests echo the session id handed out at `initialize`, which encodes the answer.
 * A 2025 request without that session id is assumed to render interfaces: an empty tool list would
 * stick in the host's cache, which costs more than the tool reaching a client that cannot show it.
 */
export function uiSupportFromRequest(body: unknown, sessionId: string | null): UiSupport {
  const message = (Array.isArray(body) ? body[0] : body) as JsonRpcMessage | undefined;
  const envelope = message?.params?._meta?.[CLIENT_CAPABILITIES_META_KEY];
  if (envelope && typeof envelope === "object") {
    return supportsUi(envelope as ClientCapabilities)
      ? { ui: true, reason: "2026 envelope with the ui extension" }
      : { ui: false, reason: "2026 envelope without the ui extension" };
  }
  if (message?.method === "initialize") {
    return supportsUi(message.params?.capabilities as ClientCapabilities)
      ? { ui: true, reason: "2025 initialize with the ui extension" }
      : { ui: false, reason: "2025 initialize without the ui extension" };
  }
  if (sessionId?.startsWith(PLAIN_SESSION_PREFIX)) return { ui: false, reason: "2025 session opened without the ui extension" };
  if (sessionId?.startsWith(UI_SESSION_PREFIX)) return { ui: true, reason: "2025 session opened with the ui extension" };
  return { ui: true, reason: "2025 request without a session id of ours" };
}

export const UI_SESSION_PREFIX = "ui.";
export const PLAIN_SESSION_PREFIX = "plain.";

const inputSchema = {
  markdown: z
    .string()
    .max(MAX_MARKDOWN_LENGTH, `The response is too long: keep it under ${MAX_MARKDOWN_LENGTH} characters.`)
    .describe("The complete response, in markdown (headings, lists, tables and links allowed)."),
  title: z.string().max(200).optional().describe("Optional short title shown above the response."),
};

/**
 * One server instance per request. The annotation tool is only declared to clients that render
 * interfaces: elsewhere the user would see nothing, since Claude no longer writes in the chat.
 */
export function createServer(options: { ui: boolean }): McpServer {
  const server = new McpServer(
    { name: "point-by-point", title: "Point by point", version: VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: options.ui
        ? `Send every response meant for the user through ${TOOL_NAME}, with nothing else in the chat.`
        : undefined,
    },
  );

  registerAppResource(
    server,
    "Annotation interface",
    UI_URI,
    {
      description: "Read-only view of a response where each sentence can be annotated.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [
        { uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: UI_HTML, _meta: { ui: { prefersBorder: false } } },
      ],
    }),
  );

  // Widgets already in conversations point at the URI of the release they were made with. Each
  // release changes the URI so no host serves a stale cached interface, and earlier URIs keep
  // loading, with the current interface.
  server.registerResource(
    "Annotation interface, earlier releases",
    new ResourceTemplate(UI_URI_TEMPLATE, { list: undefined }),
    {
      description: "The annotation interface, for widgets created by earlier releases.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: { ui: { prefersBorder: false } },
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: UI_HTML, _meta: { ui: { prefersBorder: false } } },
      ],
    }),
  );

  if (options.ui) {
    registerAppTool(
      server,
      TOOL_NAME,
      {
        title: "Annotate response",
        description: TOOL_DESCRIPTION,
        inputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: UI_URI } },
      },
      async ({ markdown }) => {
        if (markdown.trim() === "") {
          return {
            isError: true,
            content: [{ type: "text", text: "The response is empty: pass the complete response as markdown." }],
          };
        }
        return {
          content: [{ type: "text", text: TOOL_RESULT_TEXT }],
          structuredContent: { createdAt: Date.now() },
        };
      },
    );
  }

  return server;
}
