import { maxUint256 } from "viem";

const UINT160_MAX = (1n << 160n) - 1n;

export type AmountStandard = "erc20" | "eip2612" | "dai" | "permit2";

export function isUnlimitedAmount(amount: bigint, standard: AmountStandard): boolean {
  if (amount <= 0n) return false;
  const ceiling = standard === "permit2" ? UINT160_MAX : maxUint256;
  return amount >= ceiling - ceiling / 1000n;
}
