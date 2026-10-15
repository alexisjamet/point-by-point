/** What a widget needs to rebuild its unsent annotations after a reload. */
export interface DraftAnnotation {
  kind: "sentence" | "selection";
  /** Sentence index, for annotations made by clicking a sentence. */
  sentence?: number;
  /** Character offsets of the quoted passage in the response text. */
  start: number;
  end: number;
  quote: string;
  text: string;
}

export interface Draft {
  annotations: DraftAnnotation[];
  remark: string;
}

const PREFIX = "point-by-point:draft:";

export interface DraftStore {
  readonly durable: boolean;
  load(key: string): Draft | null;
  save(key: string, draft: Draft): void;
  clear(key: string): void;
}

/** localStorage, wrapped so a blocked or missing store degrades to memory instead of throwing. */
export function createDraftStore(storage: Storage | undefined = safeLocalStorage()): DraftStore {
  const memory = new Map<string, string>();
  const durable = storage !== undefined && probe(storage);
  const get = (key: string) => (durable ? tryRun(() => storage!.getItem(key)) : memory.get(key)) ?? null;
  const set = (key: string, value: string) => (durable ? tryRun(() => storage!.setItem(key, value)) : memory.set(key, value));
  const remove = (key: string) => (durable ? tryRun(() => storage!.removeItem(key)) : memory.delete(key));

  return {
    durable,
    load(key) {
      const raw = get(PREFIX + key);
      if (!raw) return null;
      try {
        const draft = JSON.parse(raw) as Draft;
        return Array.isArray(draft.annotations) && typeof draft.remark === "string" ? draft : null;
      } catch {
        return null;
      }
    },
    save(key, draft) {
      if (draft.annotations.length === 0 && draft.remark === "") remove(PREFIX + key);
      else set(PREFIX + key, JSON.stringify(draft));
    },
    clear(key) {
      remove(PREFIX + key);
    },
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function probe(storage: Storage): boolean {
  try {
    const key = `${PREFIX}probe`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function tryRun<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/** Short stable hash (FNV-1a) used to key drafts by the response text. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
