import { maxUint256, type Address } from "viem";
import { Action, InputType } from "../types.js";
import type { PartialIntent, PermitDetails } from "../types.js";
import { isUnlimitedAmount } from "../util/amount.js";
import { resolveLabel } from "../registry/known-good.js";
import { safeStringify } from "../util/serialize.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

interface TypedData {
  domain?: { chainId?: number | string; verifyingContract?: string; name?: string };
  primaryType?: string;
  message?: Record<string, unknown>;
}

/** Returns a permit PartialIntent if the typed data is a recognised permit standard, else null. */
export function parsePermit(typed: TypedData, defaultChainId: number): PartialIntent | null {
  const msg = typed.message ?? {};
  const primaryType = typed.primaryType;
  const chainId = num(typed.domain?.chainId) ?? defaultChainId;
  const verifyingContract = str(typed.domain?.verifyingContract);
  const domainName = typeof typed.domain?.name === "string" ? typed.domain.name : undefined;

  // DAI-style permit: boolean `allowed` flag instead of a value.
  if (primaryType === "Permit" && "allowed" in msg) {
    return buildDai(msg, chainId, verifyingContract, domainName, typed);
  }
  // EIP-2612 permit: has a `value`.
  if (primaryType === "Permit" && "value" in msg) {
    return buildEip2612(msg, chainId, verifyingContract, domainName, typed);
  }
  // Uniswap Permit2 — PermitSingle / PermitBatch.
  if (primaryType === "PermitSingle" || primaryType === "PermitBatch" || "details" in msg) {
    return buildPermit2(msg, chainId, verifyingContract, domainName, typed);
  }
  return null;
}

function buildEip2612(
  msg: Record<string, unknown>,
  chainId: number,
  verifyingContract: string | undefined,
  domainName: string | undefined,
  typed: TypedData,
): PartialIntent {
  const amount = big(msg.value);
  const spender = addr(msg.spender);
  const details: PermitDetails = {
    kind: "permit",
    standard: "eip2612",
    // The token IS the verifying contract for a 2612 permit.
    token: { address: (verifyingContract as Address) ?? ZERO_ADDRESS, symbol: domainName },
    owner: addr(msg.owner),
    spender,
    spenderLabel: resolveLabel(spender),
    amount,
    isUnlimited: isUnlimitedAmount(amount, "eip2612"),
    deadline: big(msg.deadline),
    nonce: big(msg.nonce),
    verifyingContract: verifyingContract as Address | undefined,
    domainName,
  };
  return permitIntent(details, chainId, typed);
}

function buildDai(
  msg: Record<string, unknown>,
  chainId: number,
  verifyingContract: string | undefined,
  domainName: string | undefined,
  typed: TypedData,
): PartialIntent {
  const allowed = msg.allowed === true;
  const spender = addr(msg.spender);
  const details: PermitDetails = {
    kind: "permit",
    standard: "dai",
    token: { address: (verifyingContract as Address) ?? ZERO_ADDRESS, symbol: domainName },
    owner: addr(msg.holder),
    spender,
    spenderLabel: resolveLabel(spender),
    amount: allowed ? maxUint256 : 0n,
    isUnlimited: allowed,
    deadline: big(msg.expiry),
    nonce: big(msg.nonce),
    verifyingContract: verifyingContract as Address | undefined,
    domainName,
  };
  return permitIntent(details, chainId, typed);
}

function buildPermit2(
  msg: Record<string, unknown>,
  chainId: number,
  verifyingContract: string | undefined,
  domainName: string | undefined,
  typed: TypedData,
): PartialIntent {
  // PermitSingle: details is an object. PermitBatch: details is an array — take the
  // first entry (the unlimited-approval rule still fires on it; full batch
  // breakdown is a future enhancement).
  const rawDetails = msg.details;
  const d = (Array.isArray(rawDetails) ? rawDetails[0] : rawDetails) as Record<string, unknown> | undefined;
  const amount = big(d?.amount);
  const spender = addr(msg.spender);
  const details: PermitDetails = {
    kind: "permit",
    standard: "permit2",
    token: { address: addr(d?.token) },
    // Permit2 owner is the signer — not present in the message.
    owner: ZERO_ADDRESS,
    spender,
    spenderLabel: resolveLabel(spender),
    amount,
    isUnlimited: isUnlimitedAmount(amount, "permit2"),
    // sigDeadline gates the signature; expiration gates the allowance. Surface sigDeadline.
    deadline: big(msg.sigDeadline ?? d?.expiration),
    nonce: big(d?.nonce),
    verifyingContract: verifyingContract as Address | undefined,
    domainName,
  };
  return permitIntent(details, chainId, typed);
}

function permitIntent(details: PermitDetails, chainId: number, typed: TypedData): PartialIntent {
  return {
    action: Action.PERMIT,
    inputType: InputType.EIP712_TYPED,
    chainId,
    details,
    raw: safeStringify(typed),
  };
}

function addr(v: unknown): Address {
  return typeof v === "string" && v.startsWith("0x") ? (v as Address) : ZERO_ADDRESS;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function big(v: unknown): bigint {
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
