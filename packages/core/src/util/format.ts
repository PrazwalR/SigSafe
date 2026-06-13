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

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isZeroAddress(addr?: string): boolean {
  return typeof addr === "string" && addr.toLowerCase() === ZERO_ADDRESS;
}
