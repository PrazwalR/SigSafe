import { useEffect, useState } from "react";
import { decode } from "@sigsafe/core";
import type { DecodedIntent, DecodeOptions } from "@sigsafe/core";

export interface UseDecodeResult {
  /** The decoded intent, or null while loading / before the first result. */
  intent: DecodedIntent | null;
  isLoading: boolean;
  /** Only set if decode itself rejected — rare, since decode normally returns an UNKNOWN intent. */
  error: Error | null;
}

/**
 * Decode a signable payload reactively. Re-runs whenever the payload or options
 * change, and ignores stale results if they change again mid-flight.
 */
export function useDecode(payload: string | object, options: DecodeOptions = {}): UseDecodeResult {
  const [intent, setIntent] = useState<DecodedIntent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stable dependency so we re-decode only when the input actually changes.
  const key = stableKey(payload, options);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    decode(payload, options).then(
      (result) => {
        if (cancelled) return;
        setIntent(result);
        setIsLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // payload/options are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { intent, isLoading, error };
}

function stableKey(payload: string | object, options: DecodeOptions): string {
  try {
    return JSON.stringify({ p: payload, o: options }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(payload);
  }
}
