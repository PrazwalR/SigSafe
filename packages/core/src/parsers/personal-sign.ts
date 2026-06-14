import { hexToString, isHex, size, type Hex } from "viem";
import { Action, InputType } from "../types.js";
import type { MessageDetails, PartialIntent } from "../types.js";

const SIWE_MARKER = "wants you to sign in with your ethereum account";

// Whitespace control chars allowed inside printable text: tab, LF, CR.
const ALLOWED_CONTROL = new Set<number>([0x09, 0x0a, 0x0d]);

/**
 * personal_sign / EIP-191 arbitrary message. Usually benign (dApp logins,
 * SIWE), so it must NOT default to a scary WARNING — that trains users to
 * click through. The one genuinely dangerous case is a raw 32-byte hash dressed
 * up as a message: signing it blind-authorises whatever digest it represents
 * (a UserOp, an order, a tx). That case is flagged by the blind-hash-sign rule.
 */
export function parsePersonalSign(input: string, chainId: number): PartialIntent {
  const details = describe(input);
  return {
    action: Action.MESSAGE_SIGN,
    inputType: InputType.PERSONAL_SIGN,
    chainId,
    details,
    raw: input,
  };
}

function describe(input: string): MessageDetails {
  if (isHex(input)) {
    const text = tryHexToText(input as Hex);
    const byteLength = safeSize(input as Hex);
    // 32 bytes of hex that don't decode to readable text == a hash to blind-sign.
    const looksLikeHash = byteLength === 32 && text === undefined;
    return {
      kind: "message",
      text,
      isHex: true,
      byteLength,
      looksLikeHash,
      isSiwe: text ? isSiwe(text) : false,
    };
  }

  return {
    kind: "message",
    text: input,
    isHex: false,
    byteLength: new TextEncoder().encode(input).length,
    looksLikeHash: false,
    isSiwe: isSiwe(input),
  };
}

function tryHexToText(hex: Hex): string | undefined {
  try {
    const s = hexToString(hex);
    return isPrintable(s) ? s : undefined;
  } catch {
    return undefined;
  }
}

/** Printable = non-empty and free of control characters (tab/newline/CR allowed). */
function isPrintable(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 && !ALLOWED_CONTROL.has(code)) return false;
    if (code === 0x7f) return false;
  }
  return true;
}

function isSiwe(text: string): boolean {
  return text.toLowerCase().includes(SIWE_MARKER);
}

function safeSize(hex: Hex): number {
  try {
    return size(hex);
  } catch {
    return 0;
  }
}
