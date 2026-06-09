import { isHex, type Hex } from "viem";
import type { DecodedIntent, RiskFlag } from "./types.js";
import { Action, InputType, RiskLevel } from "./types.js";
import { detectInputType } from "./detect/input-type.js";

export const VERSION = "0.0.0";

export interface DecodeOptions {
  chainId?: number;
  rpcUrl?: string;
  offline?: boolean;
  customBlocklist?: string[];
}

interface ResolvedOptions extends DecodeOptions {
  chainId: number;
  offline: boolean;
}

export type PartialIntent = Omit<DecodedIntent, "summary" | "risk" | "flags">;

export async function decode(
  input: string | object,
  options: DecodeOptions = {},
): Promise<DecodedIntent> {
  const opts: ResolvedOptions = { chainId: 1, offline: false, ...options };

  let inputType: InputType;
  try {
    inputType = detectInputType(input);
  } catch {
    inputType = InputType.CALLDATA;
  }

  try {
    const partial = await routeToParser(inputType, input, opts);
    return finalize(partial);
  } catch (err) {
    return makeUnknownIntent(input, inputType, opts.chainId, err);
  }
}

async function routeToParser(
  inputType: InputType,
  _input: string | object,
  _opts: ResolvedOptions,
): Promise<PartialIntent> {
  throw new Error(`parser not yet implemented for ${inputType}`);
}

function finalize(partial: PartialIntent): DecodedIntent {
  const flags: RiskFlag[] = [];
  return { ...partial, flags, risk: RiskLevel.INFO, summary: "" };
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

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "unknown error";
  }
}

function safeStringify(v: unknown): string {
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

export { detectInputType };
export { Action, RiskLevel, InputType } from "./types.js";
export type {
  DecodedIntent,
  RiskFlag,
  IntentDetails,
  TokenInfo,
  ApprovalDetails,
  TransferDetails,
  PermitDetails,
  DelegationDetails,
  SwapDetails,
  GenericCallDetails,
  RawDetails,
} from "./types.js";
