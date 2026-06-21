import { decodeFunctionData, parseAbiItem, slice, type Address, type Hex } from "viem";
import { Action, InputType } from "../types.js";
import type { PartialIntent } from "../types.js";
import { KNOWN_SELECTORS } from "../registry/selectors.js";
import { classifyAction } from "../classify/action.js";
import { isAggregatorSelector, unwrapAggregator } from "./aggregate.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/** Max nesting of batches (multicall-in-multicall). */
export const MAX_BATCH_DEPTH = 4;
/** Global cap on total inner calls decoded across the whole tree (DoS guard). */
const MAX_TOTAL_CALLS = 256;

interface Budget {
  remaining: number;
}

export interface CalldataInput {
  to?: Address;
  value: bigint;
  data: Hex;
  chainId: number;
  inputType: InputType;
  depth: number;
  /** Top-level throws on a known-but-undecodable selector; nested calls fall back to a generic call. */
  strict: boolean;
}

export function decodeCalldata(p: CalldataInput): PartialIntent {
  return decodeInner(p, { remaining: MAX_TOTAL_CALLS });
}

function decodeInner(p: CalldataInput, budget: Budget): PartialIntent {
  const { to, value, data, chainId, inputType, depth, strict } = p;

  if (data.length <= 2) {
    return {
      action: Action.NATIVE_TRANSFER,
      inputType,
      chainId,
      details: { kind: "transfer", token: "native", recipient: to ?? ZERO_ADDRESS, amount: value },
      raw: data,
    };
  }

  if (data.length < 10) {
    return genericCall(p);
  }

  const selector = slice(data, 0, 4);

  // Unwrap batch wrappers — depth- and budget-bounded so hostile nesting can't blow up.
  if (depth < MAX_BATCH_DEPTH && budget.remaining > 0 && isAggregatorSelector(selector)) {
    const batch = unwrapAggregator({ selector, data, to, value, chainId, inputType, depth }, (inner) => {
      if (budget.remaining <= 0) return genericCall({ ...p, to: inner.to, value: inner.value, data: inner.data });
      budget.remaining--;
      return decodeInner(
        { to: inner.to, value: inner.value, data: inner.data, chainId, inputType, depth: inner.depth, strict: false },
        budget,
      );
    });
    if (batch) return batch;
  }

  const signature = KNOWN_SELECTORS[selector.toLowerCase()];
  let args: readonly unknown[] | undefined;
  if (signature) {
    try {
      const decoded = decodeFunctionData({ abi: [parseAbiItem(signature)], data });
      args = decoded.args as readonly unknown[];
    } catch {
      // Known selector but arguments don't decode. Top-level bails to UNKNOWN; a
      // nested call just stays a generic call rather than nuking the whole batch.
      if (strict) throw new Error(`could not decode arguments for ${signature}`);
      args = undefined;
    }
  }

  return classifyAction({ to, value, selector, functionSignature: signature, args, chainId, inputType, raw: data });
}

function genericCall(p: CalldataInput): PartialIntent {
  const selector = (p.data.length >= 10 ? slice(p.data, 0, 4) : p.data) as Hex;
  return {
    action: Action.CONTRACT_CALL,
    inputType: p.inputType,
    chainId: p.chainId,
    details: { kind: "call", to: p.to, value: p.value, selector },
    raw: p.data,
  };
}
