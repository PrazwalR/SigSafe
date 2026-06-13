import { getAddress, type Address } from "viem";

/**
 * Canonical, chain-agnostic contracts worth labelling. Kept deliberately tiny
 * and high-confidence — a wrong label here is worse than no label, because a
 * recognised spender downgrades the unlimited-approval severity.
 *
 * Per-chain router/vault addresses belong in a future data/ registry, not here.
 */
const KNOWN_GOOD: Record<string, string> = {
  // Uniswap Permit2 — same address on every chain.
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
};

export function resolveLabel(address?: string): string | undefined {
  if (!address) return undefined;
  return KNOWN_GOOD[address.toLowerCase()];
}

export function isKnownGood(address?: string): boolean {
  return resolveLabel(address) !== undefined;
}

/** The canonical Permit2 contract, exported for parsers that need to recognise it. */
export const PERMIT2_ADDRESS = getAddress("0x000000000022d473030f116ddee9f6b43ac78ba3") as Address;
