import { formatUnits } from "viem";

export function shorten(addr?: string): string {
  if (!addr || addr.length < 12) return addr ?? "an unknown address";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatAmount(amount: bigint, decimals?: number): string {
  try {
    return formatUnits(amount, decimals ?? 18);
  } catch {
    return amount.toString();
  }
}

/**
 * Honest amount rendering: only divide by 10^decimals when decimals are known.
 * Otherwise show the raw integer labelled as base units — never silently assume
 * 18 (which would misreport a USDC/USDT amount by a factor of 10^12).
 */
export function describeAmount(amount: bigint, decimals?: number): string {
  return decimals === undefined ? `${amount.toString()} base units` : formatAmount(amount, decimals);
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isZeroAddress(addr?: string): boolean {
  return typeof addr === "string" && addr.toLowerCase() === ZERO_ADDRESS;
}
