import { describe, expect, it } from "vitest";
import { maxUint256 } from "viem";
import { isUnlimitedAmount } from "./amount.js";

const UINT160_MAX = (1n << 160n) - 1n;

describe("isUnlimitedAmount", () => {
  it("erc20 uint256 max is unlimited", () => {
    expect(isUnlimitedAmount(maxUint256, "erc20")).toBe(true);
    expect(isUnlimitedAmount(maxUint256, "eip2612")).toBe(true);
  });

  it("zero is never unlimited", () => {
    expect(isUnlimitedAmount(0n, "erc20")).toBe(false);
    expect(isUnlimitedAmount(0n, "permit2")).toBe(false);
  });

  it("permit2 uint160 max IS unlimited (per-standard ceiling)", () => {
    expect(isUnlimitedAmount(UINT160_MAX, "permit2")).toBe(true);
  });

  it("uint160 max is NOT unlimited under the erc20 ceiling", () => {
    expect(isUnlimitedAmount(UINT160_MAX, "erc20")).toBe(false);
  });

  it("bounded amounts are not unlimited", () => {
    expect(isUnlimitedAmount(1000n, "erc20")).toBe(false);
    expect(isUnlimitedAmount(1000n, "permit2")).toBe(false);
  });
});
