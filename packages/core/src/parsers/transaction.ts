import { parseTransaction as parseSerializedTx, type Address, type Hex } from "viem";
import { InputType } from "../types.js";
import type { PartialIntent } from "../types.js";
import type { ResolvedOptions } from "../options.js";
import { decodeCalldata } from "./calldata.js";
import { safeStringify } from "../util/serialize.js";

export function parseTransaction(input: string | object, opts: ResolvedOptions): PartialIntent {
  const { to, value, data, chainId, inputType } = extract(input, opts.chainId);
  const raw = typeof input === "string" ? input : safeStringify(input);

  // Top-level decode is strict: a known-but-undecodable selector bails to UNKNOWN.
  const intent = decodeCalldata({ to, value, data, chainId, inputType, depth: 0, strict: true });

  // Echo the original input rather than just the calldata.
  return { ...intent, raw };
}

interface Extracted {
  to?: Address;
  value: bigint;
  data: Hex;
  chainId: number;
  inputType: InputType;
}

function extract(input: string | object, defaultChainId: number): Extracted {
  if (typeof input === "object" && input !== null) {
    const o = input as Record<string, unknown>;
    return {
      to: typeof o.to === "string" ? (o.to as Address) : undefined,
      value: toBigInt(o.value),
      data: typeof o.data === "string" ? (o.data as Hex) : "0x",
      chainId: toNumber(o.chainId) ?? defaultChainId,
      inputType: InputType.RAW_TRANSACTION,
    };
  }
  const hex = (input || "0x") as string;
  try {
    const tx = parseSerializedTx(hex as Hex);
    return {
      to: tx.to ?? undefined,
      value: tx.value ?? 0n,
      data: (tx.data ?? "0x") as Hex,
      chainId: tx.chainId ?? defaultChainId,
      inputType: InputType.RAW_TRANSACTION,
    };
  } catch {
    return { value: 0n, data: hex as Hex, chainId: defaultChainId, inputType: InputType.CALLDATA };
  }
}

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && v.length > 0) {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
