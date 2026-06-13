import { parseTransaction, type Hex } from "viem";
import { InputType } from "../types.js";

export const MAX_INPUT_CHARS = 1_048_576;

export function detectInputType(input: string | object): InputType {
  if (typeof input === "object" && input !== null) {
    return classifyObject(input as Record<string, unknown>);
  }
  if (typeof input !== "string") return InputType.CALLDATA;

  const s = input.trim();
  if ((s.startsWith("{") || s.startsWith("[")) && s.length <= MAX_INPUT_CHARS) {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object") return classifyObject(obj as Record<string, unknown>);
    } catch {
      // not JSON — fall through to hex/text handling
    }
  }
  return classifyHex(s);
}

function classifyObject(o: Record<string, unknown>): InputType {
  if ("domain" in o && "types" in o && "message" in o) return InputType.EIP712_TYPED;
  if (
    ("address" in o || "contractAddress" in o) &&
    "nonce" in o &&
    !("to" in o) &&
    !("data" in o)
  ) {
    return InputType.EIP7702_AUTH;
  }
  if ("to" in o || "data" in o || "value" in o) return InputType.RAW_TRANSACTION;
  return InputType.EIP712_TYPED;
}

function classifyHex(s: string): InputType {
  const lower = s.toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(lower)) return InputType.PERSONAL_SIGN;

  const body = lower.slice(2);
  if (body.length === 0) return InputType.RAW_TRANSACTION;
  if (body.length % 2 !== 0) return InputType.PERSONAL_SIGN;

  const parseable = lower.length <= MAX_INPUT_CHARS;
  const b0 = parseInt(body.slice(0, 2), 16);
  if (b0 >= 0x01 && b0 <= 0x04 && body.length >= 4) {
    const b1 = parseInt(body.slice(2, 4), 16);
    if (b1 >= 0xc0 && parseable && isSerializedTx(lower)) return InputType.RAW_TRANSACTION;
  }
  if (b0 >= 0xf8 && parseable && isSerializedTx(lower)) return InputType.RAW_TRANSACTION;
  if (body.length >= 8) return InputType.CALLDATA;
  return InputType.PERSONAL_SIGN;
}

function isSerializedTx(hex: string): boolean {
  try {
    parseTransaction(hex as Hex);
    return true;
  } catch {
    return false;
  }
}
