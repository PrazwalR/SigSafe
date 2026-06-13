import { Action, InputType } from "../types.js";
import type { PartialIntent } from "../types.js";
import type { ResolvedOptions } from "../options.js";
import { parsePermit } from "./permit.js";
import { safeStringify } from "../util/serialize.js";

interface TypedData {
  domain?: { chainId?: number | string; verifyingContract?: string; name?: string };
  primaryType?: string;
  message?: Record<string, unknown>;
}

export function parseEIP712(input: string | object, opts: ResolvedOptions): PartialIntent {
  const typed = normalize(input);

  const permit = parsePermit(typed, opts.chainId);
  if (permit) return permit;

  // Well-formed typed data we don't have a specific decoder for (orders, votes,
  // SIWE-over-712, etc.). Not "undecodable" — just no known dangerous pattern.
  // Surface what it is; the risk engine decides if anything about it is alarming.
  const chainId = num(typed.domain?.chainId) ?? opts.chainId;
  return {
    action: Action.UNKNOWN,
    inputType: InputType.EIP712_TYPED,
    chainId,
    details: {
      kind: "raw",
      to: typeof typed.domain?.verifyingContract === "string"
        ? (typed.domain.verifyingContract as `0x${string}`)
        : undefined,
    },
    raw: safeStringify(input),
  };
}

function normalize(input: string | object): TypedData {
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as TypedData;
    } catch {
      return {};
    }
  }
  return (input ?? {}) as TypedData;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
