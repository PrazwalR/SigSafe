import { describe, expect, it } from "vitest";
import { maxUint256, type Address } from "viem";
import { decode } from "../index.js";
import { Action, RiskLevel } from "../types.js";

const VICTIM = "0x1111111111111111111111111111111111111111" as Address;
const DRAINER = "0xbadbadbadbadbadbadbadbadbadbadbadbadbad0" as Address;
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3" as Address;
const MAX = maxUint256.toString();
const UINT160_MAX = ((1n << 160n) - 1n).toString();

function eip2612(over: Record<string, unknown> = {}, domain: Record<string, unknown> = {}) {
  return {
    domain: { name: "USD Coin", chainId: 1, verifyingContract: USDC, ...domain },
    primaryType: "Permit",
    types: { Permit: [{ name: "owner", type: "address" }] },
    message: { owner: VICTIM, spender: DRAINER, value: MAX, nonce: "0", deadline: "99999999999", ...over },
  };
}

describe("EIP-712 permit decoding", () => {
  it("unlimited eip2612 permit to an unknown spender is CRITICAL", async () => {
    const r = await decode(eip2612(), { offline: true });
    expect(r.action).toBe(Action.PERMIT);
    expect(r.risk).toBe(RiskLevel.CRITICAL);
    if (r.details.kind !== "permit") throw new Error("expected permit");
    expect(r.details.standard).toBe("eip2612");
    expect(r.details.isUnlimited).toBe(true);
    expect(r.details.token.address.toLowerCase()).toBe(USDC);
    expect(r.flags.map((f) => f.id)).toContain("unlimited-approval");
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it("attaches confidence to flags", async () => {
    const r = await decode(eip2612(), { offline: true });
    const flag = r.flags.find((f) => f.id === "unlimited-approval");
    expect(flag?.confidence).toBe("high");
  });

  it("a bounded eip2612 permit is not unlimited", async () => {
    const r = await decode(eip2612({ value: "1000000" }), { offline: true });
    if (r.details.kind !== "permit") throw new Error("expected permit");
    expect(r.details.isUnlimited).toBe(false);
    expect(r.details.amount).toBe(1_000_000n);
  });

  it("accepts a JSON string payload too", async () => {
    const r = await decode(JSON.stringify(eip2612()), { offline: true });
    expect(r.action).toBe(Action.PERMIT);
  });

  it("DAI permit with allowed=true is unlimited", async () => {
    const dai = {
      domain: { name: "Dai Stablecoin", chainId: 1, verifyingContract: USDC },
      primaryType: "Permit",
      types: { Permit: [] },
      message: { holder: VICTIM, spender: DRAINER, nonce: "0", expiry: "0", allowed: true },
    };
    const r = await decode(dai, { offline: true });
    if (r.details.kind !== "permit") throw new Error("expected permit");
    expect(r.details.standard).toBe("dai");
    expect(r.details.isUnlimited).toBe(true);
  });

  it("Permit2 PermitSingle of uint160-max is unlimited", async () => {
    const p2 = {
      domain: { name: "Permit2", chainId: 1, verifyingContract: PERMIT2 },
      primaryType: "PermitSingle",
      types: { PermitSingle: [] },
      message: {
        details: { token: USDC, amount: UINT160_MAX, expiration: "281474976710655", nonce: "0" },
        spender: DRAINER,
        sigDeadline: "281474976710655",
      },
    };
    const r = await decode(p2, { offline: true });
    if (r.details.kind !== "permit") throw new Error("expected permit");
    expect(r.details.standard).toBe("permit2");
    expect(r.details.isUnlimited).toBe(true);
    expect(r.details.token.address.toLowerCase()).toBe(USDC);
  });

  it("flags a wrong-chain signature only when chainId is explicit", async () => {
    const onChain137 = eip2612({}, { chainId: 137 });
    const implicit = await decode(onChain137); // no chainId passed -> no false positive
    expect(implicit.flags.map((f) => f.id)).not.toContain("chain-mismatch");

    const explicit = await decode(onChain137, { chainId: 1, offline: true });
    expect(explicit.flags.map((f) => f.id)).toContain("chain-mismatch");
    expect(explicit.risk).toBe(RiskLevel.CRITICAL);
  });

  it("custom blocklist escalates a known drainer", async () => {
    const r = await decode(eip2612(), { offline: true, customBlocklist: [DRAINER] });
    expect(r.flags.map((f) => f.id)).toContain("known-drainer");
    expect(r.risk).toBe(RiskLevel.CRITICAL);
  });

  it("unrecognised typed data is not falsely flagged dangerous", async () => {
    const order = {
      domain: { name: "Seaport", chainId: 1, verifyingContract: VICTIM },
      primaryType: "OrderComponents",
      types: { OrderComponents: [] },
      message: { offerer: VICTIM, startTime: "0", endTime: "1" },
    };
    const r = await decode(order, { offline: true });
    expect(r.risk).toBe(RiskLevel.SAFE);
    expect(r.summary.length).toBeGreaterThan(0);
  });
});
