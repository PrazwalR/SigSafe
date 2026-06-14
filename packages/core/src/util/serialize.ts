// Cap on the serialized `raw` echo. Object inputs bypass the decode() string
// length guard, so without this a giant object would pin unbounded memory in
// the returned intent. The transient stringify is GC'd; only the cap is kept.
const MAX_RAW_CHARS = 100_000;

export function safeStringify(v: unknown, maxLen: number = MAX_RAW_CHARS): string {
  let out: string;
  try {
    out = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  } catch {
    try {
      out = String(v);
    } catch {
      return "[unserializable]";
    }
  }
  if (out === undefined) return "";
  return out.length > maxLen ? `${out.slice(0, maxLen)}…(truncated)` : out;
}
