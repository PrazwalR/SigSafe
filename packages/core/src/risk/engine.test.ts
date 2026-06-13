import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, parseAbiItem, type Address } from "viem";
import { decode } from "../index.js";
import { RiskLevel } from "../types.js";

const SPENDER = "0xabababababababababababababababababababab" as Address;
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const TO = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const cd = (sig: string, args: unknown[]) => encodeFunctionData({ abi: [parseAbiItem(sig)], args });

describe("risk engine (calldata path)", () => {
  it("a plain native transfer is SAFE with no flags", async () => {
    const r = await decode({ to: TO, value: 10n ** 18n });
    expect(r.risk).toBe(RiskLevel.SAFE);
    expect(r.flags).toHaveLength(0);
  });

  it("unlimited approve to an unknown spender is CRITICAL", async () => {
    const data = cd("function approve(address,uint256)", [SPENDER, maxUint256]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    expect(r.risk).toBe(RiskLevel.CRITICAL);
    expect(r.flags.map((f) => f.id)).toContain("unlimited-approval");
  });

  it("setApprovalForAll(true) raises the NFT collection flag", async () => {
    const data = cd("function setApprovalForAll(address,bool)", [SPENDER, true]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    expect(r.flags.map((f) => f.id)).toContain("setapprovalforall");
  });

  it("ownership transfer is WARNING", async () => {
    const data = cd("function transferOwnership(address)", [SPENDER]);
    const r = await decode({ to: TOKEN, data });
    expect(r.flags.map((f) => f.id)).toContain("ownership-transfer");
    expect(r.risk).toBe(RiskLevel.WARNING);
  });

  it("a bounded approve to an unknown spender is a low-noise hint when offline", async () => {
    const data = cd("function approve(address,uint256)", [SPENDER, 1000n]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    const flag = r.flags.find((f) => f.id === "unknown-spender");
    expect(flag?.severity).toBe(RiskLevel.INFO);
    expect(r.risk).toBe(RiskLevel.INFO);
  });

  it("a transfer to the zero address is flagged as a burn", async () => {
    const data = cd("function transfer(address,uint256)", [ZERO, 5n]);
    const r = await decode({ to: TOKEN, data });
    expect(r.flags.map((f) => f.id)).toContain("zero-address");
  });
});
