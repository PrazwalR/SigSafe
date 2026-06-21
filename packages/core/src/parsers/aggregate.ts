import { decodeFunctionData, parseAbiItem, toFunctionSelector, type AbiFunction, type Address, type Hex } from "viem";
import { Action, type InputType } from "../types.js";
import type { BatchDetails, PartialIntent } from "../types.js";

/** Hard cap on inner calls decoded per single aggregator (DoS guard). */
const MAX_BATCH_CALLS = 48;

export type DecodeInner = (inner: { to?: Address; value: bigint; data: Hex; depth: number }) => PartialIntent;

type AggKind = "self" | "targeted" | "safe";

interface Handler {
  aggregator: string;
  kind: AggKind;
  abi: AbiFunction;
  argIndex: number; // which decoded arg holds the inner calls
}

// Aggregators drainers hide behind. `self` = inner calls target the same contract
// (Uniswap-style multicall); `targeted` = each inner call carries its own target
// (Multicall3); `safe` = a single nested call (Gnosis Safe execTransaction).
const DEFS: { sig: string; aggregator: string; kind: AggKind; argIndex: number }[] = [
  { sig: "function multicall(bytes[] data)", aggregator: "multicall", kind: "self", argIndex: 0 },
  { sig: "function multicall(uint256 deadline, bytes[] data)", aggregator: "multicall", kind: "self", argIndex: 1 },
  { sig: "function multicall(bytes32 previousBlockhash, bytes[] data)", aggregator: "multicall", kind: "self", argIndex: 1 },
  {
    sig: "function aggregate3((address target,bool allowFailure,bytes callData)[] calls)",
    aggregator: "multicall3",
    kind: "targeted",
    argIndex: 0,
  },
  {
    sig: "function aggregate((address target,bytes callData)[] calls)",
    aggregator: "multicall3",
    kind: "targeted",
    argIndex: 0,
  },
  {
    sig: "function tryAggregate(bool requireSuccess,(address target,bytes callData)[] calls)",
    aggregator: "multicall3",
    kind: "targeted",
    argIndex: 1,
  },
  {
    sig: "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures)",
    aggregator: "safe",
    kind: "safe",
    argIndex: 0,
  },
];

const HANDLERS = new Map<string, Handler>(
  DEFS.map((d) => {
    const abi = parseAbiItem(d.sig) as AbiFunction;
    return [toFunctionSelector(abi).toLowerCase(), { aggregator: d.aggregator, kind: d.kind, abi, argIndex: d.argIndex }];
  }),
);

export function isAggregatorSelector(selector: string): boolean {
  return HANDLERS.has(selector.toLowerCase());
}

interface UnwrapCtx {
  selector: Hex;
  data: Hex;
  to?: Address;
  value: bigint;
  chainId: number;
  inputType: InputType;
  depth: number;
}

/** Decode an aggregator's inner calls into a BATCH intent, or null if it can't be unwrapped. */
export function unwrapAggregator(ctx: UnwrapCtx, decodeInner: DecodeInner): PartialIntent | null {
  const handler = HANDLERS.get(ctx.selector.toLowerCase());
  if (!handler) return null;

  let args: readonly unknown[];
  try {
    const decoded = decodeFunctionData({ abi: [handler.abi], data: ctx.data });
    args = (decoded.args ?? []) as readonly unknown[];
  } catch {
    return null; // wrapper undecodable -> caller falls back to a generic call
  }

  const inner = extractInner(handler, args, ctx);
  if (inner.length === 0) return null;

  const truncated = inner.length > MAX_BATCH_CALLS;
  const limited = truncated ? inner.slice(0, MAX_BATCH_CALLS) : inner;
  const calls = limited.map((c) => decodeInner({ to: c.to, value: c.value, data: c.data, depth: ctx.depth + 1 }));

  const details: BatchDetails = {
    kind: "batch",
    to: ctx.to,
    value: ctx.value,
    aggregator: handler.aggregator,
    calls,
    truncated: truncated || undefined,
  };
  return { action: Action.BATCH, inputType: ctx.inputType, chainId: ctx.chainId, details, raw: ctx.data };
}

interface Inner {
  to?: Address;
  value: bigint;
  data: Hex;
}

function extractInner(handler: Handler, args: readonly unknown[], ctx: UnwrapCtx): Inner[] {
  if (handler.kind === "self") {
    const arr = args[handler.argIndex];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((d): d is Hex => typeof d === "string")
      .map((data) => ({ to: ctx.to, value: 0n, data }));
  }

  if (handler.kind === "targeted") {
    const arr = args[handler.argIndex];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c) => c as { target?: string; callData?: string })
      .filter((c) => typeof c?.callData === "string")
      .map((c) => ({
        to: typeof c.target === "string" ? (c.target as Address) : undefined,
        value: 0n,
        data: c.callData as Hex,
      }));
  }

  // safe execTransaction(address to, uint256 value, bytes data, ...)
  const to = typeof args[0] === "string" ? (args[0] as Address) : undefined;
  const value = typeof args[1] === "bigint" ? (args[1] as bigint) : 0n;
  const data = typeof args[2] === "string" ? (args[2] as Hex) : "0x";
  if (data.length <= 2) return [];
  return [{ to, value, data }];
}
