import {
  decodeFunctionData,
  parseAbiItem,
  parseTransaction as parseSerializedTx,
  slice,
  type Address,
  type Hex,
} from "viem";
import { Action, InputType } from "../types.js";
import type { PartialIntent } from "../types.js";
import type { ResolvedOptions } from "../options.js";
import { KNOWN_SELECTORS } from "../registry/selectors.js";
import { classifyAction } from "../classify/action.js";
import { safeStringify } from "../util/serialize.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function parseTransaction(input: string | object, opts: ResolvedOptions): PartialIntent {
  const { to, value, data, chainId, inputType } = extract(input, opts.chainId);
  const raw = typeof input === "string" ? input : safeStringify(input);

  if (data.length <= 2) {
    return {
      action: Action.NATIVE_TRANSFER,
      inputType,
      chainId,
      details: { kind: "transfer", token: "native", recipient: to ?? ZERO_ADDRESS, amount: value },
      raw,
    };
  }

  if (data.length < 10) {
    return {
      action: Action.CONTRACT_CALL,
      inputType,
      chainId,
      details: { kind: "call", to, value, selector: data },
      raw,
    };
  }

  const selector = slice(data, 0, 4);
  const signature = KNOWN_SELECTORS[selector.toLowerCase()];
  let args: readonly unknown[] | undefined;
  if (signature) {
    try {
      const decoded = decodeFunctionData({ abi: [parseAbiItem(signature)], data });
      args = decoded.args as readonly unknown[];
    } catch {
      // Known selector but the arguments don't decode (truncated/malformed).
      // Don't fabricate a confident classification from missing data — bail to
      // the UNKNOWN + WARNING path rather than pretend we parsed it.
      throw new Error(`could not decode arguments for ${signature}`);
    }
  }

  return classifyAction({ to, value, selector, functionSignature: signature, args, chainId, inputType, raw });
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
