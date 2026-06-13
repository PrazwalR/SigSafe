import { recoverAuthorizationAddress } from "viem/utils";
import type { Address, Hex } from "viem";
import { Action, InputType } from "../types.js";
import type { DelegationDetails, PartialIntent } from "../types.js";
import { resolveLabel } from "../registry/known-good.js";
import { safeStringify } from "../util/serialize.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/**
 * EIP-7702 SetCode authorization: [chain_id, address, nonce, y_parity, r, s].
 * Signing it lets `address`'s code execute AS the signer's EOA — full,
 * persistent account takeover if `address` is hostile.
 *
 * Accepts the structured object form wallets pass to eth_signAuthorization.
 * When the signature (r/s/yParity) is present we recover the authorizing EOA.
 */
export async function parseEIP7702(input: string | object, defaultChainId: number): Promise<PartialIntent> {
  const o = normalize(input);
  const delegateTo = addr(o.address ?? o.contractAddress);
  const chainId = num(o.chainId) ?? defaultChainId;
  const nonce = big(o.nonce);

  const authority = await recoverAuthority(o, delegateTo, chainId, nonce);

  const details: DelegationDetails = {
    kind: "delegation",
    authority,
    delegateTo,
    delegateLabel: resolveLabel(delegateTo),
    chainId,
    nonce,
  };

  return {
    action: Action.DELEGATION,
    inputType: InputType.EIP7702_AUTH,
    chainId,
    details,
    raw: safeStringify(input),
  };
}

async function recoverAuthority(
  o: Record<string, unknown>,
  delegateTo: Address,
  chainId: number,
  nonce: bigint,
): Promise<Address> {
  const r = hex(o.r);
  const s = hex(o.s);
  if (!r || !s) return ZERO_ADDRESS;
  const yParity = num(o.yParity) ?? (num(o.v) !== undefined ? Number(o.v) % 2 : undefined);
  if (yParity === undefined) return ZERO_ADDRESS;
  try {
    return await recoverAuthorizationAddress({
      authorization: { address: delegateTo, chainId, nonce: Number(nonce), r, s, yParity },
    });
  } catch {
    return ZERO_ADDRESS;
  }
}

function normalize(input: string | object): Record<string, unknown> {
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (input ?? {}) as Record<string, unknown>;
}

function addr(v: unknown): Address {
  return typeof v === "string" && v.startsWith("0x") ? (v as Address) : ZERO_ADDRESS;
}

function hex(v: unknown): Hex | undefined {
  return typeof v === "string" && v.startsWith("0x") ? (v as Hex) : undefined;
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
