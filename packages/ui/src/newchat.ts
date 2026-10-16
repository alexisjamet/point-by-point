import { normalizeSpaces } from "./compose";

/** Where a new conversation opens: the app the interface is shown in. */
export type ChatApp = "claude" | "chatgpt";

/** Both apps prefill a new conversation from `q` (tested by hand: ChatGPT also reads `prompt`, Claude does not). */
const NEW_CHAT_URLS: Record<ChatApp, string> = {
  claude: "https://claude.ai/new",
  chatgpt: "https://chatgpt.com/",
};

/** Kept well under the URL lengths browsers and both apps accept. */
export const MAX_URL_LENGTH = 8000;

/**
 * ChatGPT when its widget bridge (`window.openai`) is present or the host names itself so;
 * Claude otherwise, the app this interface was first made for.
 */
export function chatAppFor(hostName: string | undefined, hasOpenAiBridge: boolean): ChatApp {
  return hasOpenAiBridge || /chatgpt|openai/i.test(hostName ?? "") ? "chatgpt" : "claude";
}

/** The first message of the new conversation: an intro line, the passage as a blockquote, then the note. */
export function newChatPrompt(quote: string, note: string, intro: string): string {
  const parts = [intro, `> ${normalizeSpaces(quote)}`];
  if (note.trim() !== "") parts.push(note.trim());
  return parts.join("\n\n");
}

function urlFor(app: ChatApp, prompt: string): string {
  return `${NEW_CHAT_URLS[app]}?q=${encodeURIComponent(prompt)}`;
}

/**
 * The link that opens a new conversation prefilled with the passage and the note. When the link
 * would be too long, the passage is shortened, never the note.
 */
export function newChatUrl(app: ChatApp, quote: string, note: string, intro: string): string {
  const passage = Array.from(normalizeSpaces(quote));
  const full = urlFor(app, newChatPrompt(passage.join(""), note, intro));
  if (full.length <= MAX_URL_LENGTH) return full;
  // An encoded character takes 1 to 12 URL characters: search for the longest start that fits.
  const cut = (length: number) => urlFor(app, newChatPrompt(`${passage.slice(0, length).join("").trimEnd()}…`, note, intro));
  let low = 0;
  let high = passage.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (cut(middle).length <= MAX_URL_LENGTH) low = middle;
    else high = middle - 1;
  }
  return cut(low);
}
