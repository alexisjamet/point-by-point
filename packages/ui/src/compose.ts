/** One annotation as the composer sees it: what was quoted and what the user wrote. */
export interface ComposableAnnotation {
  quote: string;
  text: string;
  /** Position in the document (character offset of the quote's start). Lower comes first. */
  order: number;
}

export interface ComposeOptions {
  /** Context line prepended when the message comes from an earlier response's widget. */
  contextLine?: string;
}

/** Collapses runs of whitespace and trims, so quotes read as one line. */
export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Backticks would close the quote early, so they become apostrophes. */
export function sanitizeQuote(quote: string): string {
  return normalizeSpaces(quote).replace(/`/g, "'");
}

/**
 * Builds the message sent back to the conversation:
 *
 *     `quoted sentence 1` reply 1
 *
 *     `quoted passage 2` reply 2
 *
 *     general remark
 *
 * Annotations come in document order, empty ones are skipped, the general remark comes last.
 * Returns an empty string when there is nothing to send.
 */
export function compose(
  annotations: readonly ComposableAnnotation[],
  remark: string,
  options: ComposeOptions = {},
): string {
  const parts = annotations
    .map((annotation, index) => ({ ...annotation, index }))
    .filter((annotation) => annotation.text.trim() !== "")
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((annotation) => `\`${sanitizeQuote(annotation.quote)}\` ${annotation.text.trim()}`);

  const trimmedRemark = remark.trim();
  if (trimmedRemark !== "") parts.push(trimmedRemark);
  if (parts.length === 0) return "";

  if (options.contextLine) parts.unshift(options.contextLine);
  return parts.join("\n\n");
}
