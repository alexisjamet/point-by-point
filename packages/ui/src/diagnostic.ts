import type { App } from "@modelcontextprotocol/ext-apps";
import type { Strings } from "./i18n";

/** Sending this exact text as the response opens the display diagnostic instead of a response. */
export const DIAGNOSTIC_COMMAND = "/point-by-point-diagnostic";

export function isDiagnosticRequest(markdown: string): boolean {
  return markdown.trim() === DIAGNOSTIC_COMMAND;
}

/**
 * Shows what the host announces about display modes and devices, and what happens when the widget
 * asks for fullscreen. Used to choose between the fullscreen sheet and the focus mode on mobile.
 */
export function renderDiagnostic(
  root: HTMLElement,
  app: App,
  s: Strings,
  isTouch: () => boolean,
  durableStorage: boolean,
) {
  const log: string[] = [];
  const title = document.createElement("h2");
  title.textContent = s.diagnosticTitle;
  const output = document.createElement("pre");
  output.className = "diagnostic-output";
  // One line updated in place: appending a log line per resize would grow the page, make the host
  // grow the frame, fire another resize, and loop.
  const viewportLine = document.createElement("p");
  viewportLine.className = "diagnostic-viewport";
  const field = document.createElement("textarea");
  field.rows = 2;
  field.placeholder = "Keyboard test / test du clavier";
  const actions = document.createElement("div");
  actions.className = "diagnostic-actions";
  const request = document.createElement("button");
  request.type = "button";
  request.textContent = s.diagnosticRequest;
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = s.diagnosticBack;
  const report = document.createElement("button");
  report.type = "button";
  report.className = "primary";
  report.textContent = s.send;
  actions.append(request, back, report);
  root.replaceChildren(title, output, viewportLine, field, actions);

  const viewportStats = { resizes: 0, minHeight: Infinity, maxHeight: 0 };
  const showViewport = () => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const height = Math.round(viewport.height);
    viewportStats.minHeight = Math.min(viewportStats.minHeight, height);
    viewportStats.maxHeight = Math.max(viewportStats.maxHeight, height);
    viewportLine.textContent =
      `visualViewport ${Math.round(viewport.width)}×${height}px · ` +
      `min ${viewportStats.minHeight}px · max ${viewportStats.maxHeight}px · ${viewportStats.resizes} resizes`;
  };

  const snapshot = () => {
    const context = app.getHostContext();
    return {
      host: app.getHostVersion(),
      platform: context?.platform,
      userAgent: context?.userAgent,
      locale: context?.locale,
      theme: context?.theme,
      displayMode: context?.displayMode,
      availableDisplayModes: context?.availableDisplayModes,
      containerDimensions: context?.containerDimensions,
      safeAreaInsets: context?.safeAreaInsets,
      deviceCapabilities: context?.deviceCapabilities,
      hostCapabilities: Object.keys(app.getHostCapabilities() ?? {}),
      pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
      touchDetected: isTouch(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visualViewport: window.visualViewport
        ? { width: Math.round(window.visualViewport.width), height: Math.round(window.visualViewport.height) }
        : null,
      durableStorage,
      broadcastChannel: typeof BroadcastChannel !== "undefined",
      clipboard: typeof navigator.clipboard?.writeText === "function",
      cssHighlights: typeof CSS !== "undefined" && "highlights" in CSS,
      viewportStats,
    };
  };

  const show = () => {
    output.textContent = `${JSON.stringify(snapshot(), null, 2)}\n\n${log.join("\n")}`;
  };
  const note = (line: string) => {
    log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
    show();
  };

  const requestMode = async (mode: "fullscreen" | "inline") => {
    note(`requestDisplayMode(${mode})…`);
    try {
      const result = await app.requestDisplayMode({ mode });
      note(`→ ${JSON.stringify(result)}`);
    } catch (error) {
      note(`→ error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  request.addEventListener("click", () => void requestMode("fullscreen"));
  back.addEventListener("click", () => void requestMode("inline"));
  field.addEventListener("focus", () => note("field focus"));
  field.addEventListener("blur", () => note("field blur"));
  let viewportFrame = 0;
  window.visualViewport?.addEventListener("resize", () => {
    viewportStats.resizes++;
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(showViewport);
  });
  // A summary only: the full context carries every style variable and the tool definition.
  app.addEventListener("hostcontextchanged", (params) =>
    note(
      `hostcontextchanged ${JSON.stringify({
        keys: Object.keys(params),
        toolCallId: params.toolInfo?.id,
        displayMode: params.displayMode,
        availableDisplayModes: params.availableDisplayModes,
        theme: params.theme,
        locale: params.locale,
        containerDimensions: params.containerDimensions,
      })}`,
    ),
  );
  report.addEventListener("click", () => {
    // A fresh snapshot: the one on screen dates from the last log line.
    showViewport();
    show();
    const text = `Point-by-point diagnostic\n\n\`\`\`json\n${output.textContent}\n\`\`\``;
    void app
      .sendMessage({ role: "user", content: [{ type: "text", text }] })
      .then((result) => note(`sendMessage → ${JSON.stringify(result)}`))
      .catch((error) => note(`sendMessage error: ${String(error)}`));
  });
  showViewport();
  show();
}
