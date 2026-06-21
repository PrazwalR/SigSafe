import { isHex, type Hex } from "viem";
import type { DecodedIntent, PartialIntent, RiskFlag } from "./types.js";
import { Action, InputType, RiskLevel } from "./types.js";
import type { DecodeOptions, ResolvedOptions } from "./options.js";
import { detectInputType, MAX_INPUT_CHARS } from "./detect/input-type.js";
import { parseTransaction } from "./parsers/transaction.js";
import { parseEIP712 } from "./parsers/eip712.js";
import { parseEIP7702 } from "./parsers/eip7702.js";
import { parsePersonalSign } from "./parsers/personal-sign.js";
import { enrich } from "./enrich/code.js";
import { runRiskEngine, aggregateRisk } from "./risk/engine.js";
import { humanize } from "./explain/humanize.js";
import { safeStringify } from "./util/serialize.js";

export const VERSION = "0.1.0";

export async function decode(
  input: string | object,
  options: DecodeOptions = {},
): Promise<DecodedIntent> {
  const opts: ResolvedOptions = {
    chainId: 1,
    offline: false,
    ...options,
    chainIdExplicit: options.chainId !== undefined,
  };

  if (typeof input === "string" && input.length > MAX_INPUT_CHARS) {
    return makeOversizedIntent(input, opts.chainId);
  }

  let inputType: InputType;
  if (opts.inputType !== undefined) {
    inputType = opts.inputType;
  } else {
    try {
      inputType = detectInputType(input);
    } catch {
      inputType = InputType.CALLDATA;
    }
  }

  try {
    const partial = await routeToParser(inputType, input, opts);
    return await finalize(partial, opts);
  } catch (err) {
    return makeUnknownIntent(input, inputType, opts.chainId, err);
  }
}

async function routeToParser(
  inputType: InputType,
  input: string | object,
  opts: ResolvedOptions,
): Promise<PartialIntent> {
  switch (inputType) {
    case InputType.EIP712_TYPED:
      return parseEIP712(input, opts);
    case InputType.EIP7702_AUTH:
      return parseEIP7702(input, opts.chainId);
    case InputType.PERSONAL_SIGN:
      return parsePersonalSign(typeof input === "string" ? input : safeStringify(input), opts.chainId);
    case InputType.RAW_TRANSACTION:
    case InputType.CALLDATA:
      return parseTransaction(input, opts);
    default:
      throw new Error(`parser not yet implemented for ${inputType}`);
  }
}

async function finalize(partial: PartialIntent, opts: ResolvedOptions): Promise<DecodedIntent> {
  const enriched = await enrich(partial, opts);
  const flags: RiskFlag[] = runRiskEngine(enriched, opts);
  const risk = aggregateRisk(flags);
  const summary = humanize(enriched);
  return { ...enriched, flags, risk, summary };
}

function makeUnknownIntent(
  input: string | object,
  inputType: InputType,
  chainId: number,
  err?: unknown,
): DecodedIntent {
  const data = typeof input === "string" && isHex(input) ? (input as Hex) : undefined;
  return {
    summary: "Could not decode this payload. Treat with extreme caution.",
    action: Action.UNKNOWN,
    risk: RiskLevel.WARNING,
    inputType,
    flags: [
      {
        id: "undecoded-payload",
        severity: RiskLevel.WARNING,
        title: "Undecodable payload",
        message: err
          ? `sigsafe could not parse this input: ${errMessage(err)}`
          : "sigsafe could not parse this input.",
        advice: "If you did not expect to sign something complex, do not sign.",
      },
    ],
    details: { kind: "raw", data },
    raw: typeof input === "string" ? input : safeStringify(input),
    chainId,
  };
}

function makeOversizedIntent(input: string, chainId: number): DecodedIntent {
  return {
    summary: "Payload too large to decode safely. Treat with extreme caution.",
    action: Action.UNKNOWN,
    risk: RiskLevel.WARNING,
    inputType: InputType.CALLDATA,
    flags: [
      {
        id: "input-too-large",
        severity: RiskLevel.WARNING,
        title: "Oversized payload",
        message: `Input exceeds the ${MAX_INPUT_CHARS}-character safety limit and was not decoded.`,
        advice: "Legitimate signature payloads are small. Do not sign an unexpectedly huge payload.",
      },
    ],
    details: { kind: "raw" },
    raw: `${input.slice(0, 256)}…(truncated)`,
    chainId,
  };
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

// Primitives + engine internals, exported for advanced embedders who want to
// re-run rules, re-render summaries, or build on the registries directly.
export { detectInputType, MAX_INPUT_CHARS };
export { runRiskEngine, aggregateRisk, severityRank } from "./risk/engine.js";
export { humanize } from "./explain/humanize.js";
export { isKnownDrainer } from "./registry/known-bad.js";
export { resolveLabel, isKnownGood, PERMIT2_ADDRESS } from "./registry/known-good.js";
export { Action, RiskLevel, InputType } from "./types.js";

export type { DecodeOptions } from "./options.js";
export type { RiskRule } from "./risk/engine.js";
export type {
  DecodedIntent,
  PartialIntent,
  RiskFlag,
  Confidence,
  IntentDetails,
  TokenInfo,
  ApprovalDetails,
  TransferDetails,
  PermitDetails,
  DelegationDetails,
  SwapDetails,
  GenericCallDetails,
  BatchDetails,
  MessageDetails,
  RawDetails,
} from "./types.js";
