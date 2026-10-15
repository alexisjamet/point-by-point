import {
  RESOURCE_MIME_TYPE,
  getUiCapability,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { CLIENT_CAPABILITIES_META_KEY, McpServer, type ClientCapabilities } from "@modelcontextprotocol/server";
import { z } from "zod";
import { UI_HTML, UI_URI, VERSION } from "./ui.generated";

export const TOOL_NAME = "annotate_response";
export const MAX_MARKDOWN_LENGTH = 100_000;

export const TOOL_DESCRIPTION =
  "Displays your response in an interface where the user can annotate any sentence and send all their " +
  "annotations back in a single message. Use this tool for EVERY response meant for the user, instead of " +
  "writing the text in the chat. Pass the complete response as markdown. Write nothing else in the chat. " +
  "The user's reply quotes each sentence they react to between backticks, followed by their answer or " +
  "question; address each point in order, then any general remark at the end.";

export const TOOL_RESULT_TEXT =
  "Response displayed to the user for annotation. Do not repeat it in the chat; wait for their reply.";

/** True when the client announced it can render MCP Apps interfaces. */
export function supportsUi(capabilities: ClientCapabilities | null | undefined): boolean {
  return getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE) === true;
}

type JsonRpcMessage = { method?: unknown; params?: { capabilities?: unknown; _meta?: Record<string, unknown> } };

/**
 * Reads the client's UI support from one HTTP request, without any server-side state:
 * - 2026-07-28 requests carry the client capabilities in their `_meta` envelope;
 * - a 2025 `initialize` carries them in its params;
 * - later 2025 requests echo the session id handed out at `initialize`, which encodes the answer.
 */
export function uiSupportFromRequest(body: unknown, sessionId: string | null): boolean {
  const message = (Array.isArray(body) ? body[0] : body) as JsonRpcMessage | undefined;
  const envelope = message?.params?._meta?.[CLIENT_CAPABILITIES_META_KEY];
  if (envelope && typeof envelope === "object") return supportsUi(envelope as ClientCapabilities);
  if (message?.method === "initialize") return supportsUi(message.params?.capabilities as ClientCapabilities);
  return sessionId?.startsWith(UI_SESSION_PREFIX) === true;
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
