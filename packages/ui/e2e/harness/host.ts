// A minimal MCP Apps host for end-to-end tests: mounts the built interface in an iframe and records
// what it asks of the host.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";

export interface MountOptions {
  args: Record<string, unknown>;
  partials?: Record<string, unknown>[];
  context?: McpUiHostContext;
  createdAt?: number;
  failMessages?: boolean;
  allowFullscreen?: boolean;
}

interface Recorded {
  messages: string[];
  links: string[];
  displayModes: string[];
}

declare global {
  interface Window {
    mount(options: MountOptions): Promise<number>;
    recorded: Recorded;
  }
}

window.recorded = { messages: [], links: [], displayModes: [] };
let count = 0;

window.mount = async (options) => {
  const index = count++;
  const iframe = document.createElement("iframe");
  iframe.dataset.index = String(index);
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  document.body.append(iframe);

  const context: McpUiHostContext = {
    theme: "light",
    locale: "en-US",
    displayMode: "inline",
    availableDisplayModes: options.allowFullscreen ? ["inline", "fullscreen"] : ["inline"],
    toolInfo: { id: `call-${index}`, tool: { name: "annotate_response", inputSchema: { type: "object" } } },
    ...options.context,
  };
  const bridge = new AppBridge(
    null,
    { name: "test-host", version: "1.0.0" },
    { openLinks: {}, message: { text: {} }, logging: {} },
    { hostContext: context },
  );
  bridge.onmessage = async (params) => {
    const text = params.content.map((block) => ("text" in block ? block.text : "")).join("");
    if (options.failMessages) return { isError: true };
    window.recorded.messages.push(text);
    return {};
  };
  bridge.onopenlink = async ({ url }) => {
    window.recorded.links.push(url);
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    window.recorded.displayModes.push(mode);
    const granted = mode === "fullscreen" && !options.allowFullscreen ? "inline" : mode;
    void bridge.sendHostContextChange({ displayMode: granted });
    return { mode: granted };
  };
  bridge.onsizechange = ({ height }) => {
    if (height !== undefined) iframe.style.height = `${height}px`;
  };

  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve();
  });
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  iframe.src = "/annotation.html";
  await initialized;

  for (const partial of options.partials ?? []) await bridge.sendToolInputPartial({ arguments: partial });
  await bridge.sendToolInput({ arguments: options.args });
  await bridge.sendToolResult({
    content: [{ type: "text", text: "Response displayed to the user for annotation." }],
    structuredContent: { createdAt: options.createdAt ?? Date.now() },
  });
  return index;
};
