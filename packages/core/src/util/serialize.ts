export function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  } catch {
    try {
      return String(v);
    } catch {
      return "[unserializable]";
    }
  }
}
