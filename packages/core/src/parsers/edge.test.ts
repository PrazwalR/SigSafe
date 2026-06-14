import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, parseAbiItem, type Address } from "viem";
import { decode } from "../index.js";
import { Action, RiskLevel } from "../types.js";

const SPENDER = "0xabababababababababababababababababababab" as Address;
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const FROM = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd" as Address;

const cd = (sig: string, args: unknown[]) => encodeFunctionData({ abi: [parseAbiItem(sig)], args });

describe("calldata edge cases", () => {
  it("increaseAllowance(spender, MAX) is an unlimited approval", async () => {
    const data = cd("function increaseAllowance(address,uint256)", [SPENDER, maxUint256]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    expect(r.action).toBe(Action.TOKEN_APPROVAL);
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.isUnlimited).toBe(true);
  });

  it("transferFrom(from, to, amount) takes the recipient from arg 1", async () => {
    const data = cd("function transferFrom(address,address,uint256)", [FROM, TO, 5n]);
    const r = await decode({ to: TOKEN, data });
    if (r.details.kind !== "transfer") throw new Error("expected transfer");
    expect(r.details.recipient.toLowerCase()).toBe(TO);
    expect(r.details.amount).toBe(5n);
  });

  it("ERC-1155 safeTransferFrom decodes recipient and amount", async () => {
    const data = cd("function safeTransferFrom(address,address,uint256,uint256,bytes)", [FROM, TO, 1n, 9n, "0x"]);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.TOKEN_TRANSFER);
    if (r.details.kind !== "transfer") throw new Error("expected transfer");
    expect(r.details.recipient.toLowerCase()).toBe(TO);
    expect(r.details.amount).toBe(9n);
  });

  it("renounceOwnership() (no args) classifies without throwing", async () => {
    const data = cd("function renounceOwnership()", []);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.OWNERSHIP_TRANSFER);
    expect(r.flags.map((f) => f.id)).toContain("ownership-transfer");
  });

  it("offline mode never resolves EOA hints (no permit-to-eoa, stays decidable)", async () => {
    const data = cd("function approve(address,uint256)", [SPENDER, maxUint256]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.spenderIsEoa).toBeUndefined();
    expect(r.flags.map((f) => f.id)).not.toContain("permit-to-eoa");
  });

  it("reports bounded amounts in base units when decimals are unknown (no fake 18)", async () => {
    // 1_000_000 of a 6-decimal token must NOT be rendered as 0.000000000001.
    const permit = {
      domain: { name: "USD Coin", chainId: 1, verifyingContract: TOKEN },
      primaryType: "Permit",
      types: { Permit: [] },
      message: { owner: FROM, spender: SPENDER, value: "1000000", nonce: "0", deadline: "0" },
    };
    const r = await decode(permit, { offline: true });
    expect(r.summary).toContain("1000000 base units");
    expect(r.summary).not.toContain("0.000000000001");
    expect(r.risk).not.toBe(RiskLevel.CRITICAL); // bounded, unknown spender offline -> not critical
  });
});
