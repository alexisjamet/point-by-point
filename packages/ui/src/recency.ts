/**
 * Tells a widget whether a newer response exists in the conversation, so a message sent from it can
 * say it is about an earlier response.
 *
 * Widgets of one conversation share an origin, so they compare creation times over a
 * BroadcastChannel. Once a widget learns it is not the latest, it remembers that in storage under its
 * own key, so the answer survives a reload even if the newer widget is not mounted yet.
 */
const CHANNEL = "point-by-point:recency";
const PREVIOUS_PREFIX = "point-by-point:previous:";

type Message = { type: "hello" | "here"; createdAt: number };

export function watchRecency(key: string, createdAt: number, onPrevious: () => void): () => void {
  let previous = readFlag(key);
  const markPrevious = () => {
    if (previous) return;
    previous = true;
    writeFlag(key);
    onPrevious();
  };
  if (previous) onPrevious();

  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (!message || typeof message.createdAt !== "number") return;
    if (message.createdAt > createdAt) markPrevious();
    if (message.type === "hello" && message.createdAt !== createdAt) {
      channel.postMessage({ type: "here", createdAt } satisfies Message);
    }
  };
  channel.postMessage({ type: "hello", createdAt } satisfies Message);
  return () => channel.close();
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(PREVIOUS_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(PREVIOUS_PREFIX + key, "1");
  } catch {
    // No durable storage: the flag lives as long as the widget.
  }
}
