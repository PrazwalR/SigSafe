import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, parseAbiItem, type Address } from "viem";
import { decode } from "../index.js";
import { Action } from "../types.js";

const SPENDER = "0xabababababababababababababababababababab" as Address;
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const TO = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd" as Address;
const UINT160_MAX = (1n << 160n) - 1n;

function cd(sig: string, args: unknown[]): string {
  return encodeFunctionData({ abi: [parseAbiItem(sig)], args });
}

describe("transaction / calldata parsing", () => {
  it("approve(spender, MAX) on a token -> unlimited TOKEN_APPROVAL", async () => {
    const data = cd("function approve(address,uint256)", [SPENDER, maxUint256]);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.TOKEN_APPROVAL);
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.spender.toLowerCase()).toBe(SPENDER);
    expect(r.details.token.address.toLowerCase()).toBe(TOKEN);
    expect(r.details.isUnlimited).toBe(true);
  });

  it("approve with a bounded amount is not unlimited", async () => {
    const data = cd("function approve(address,uint256)", [SPENDER, 1_000_000n]);
    const r = await decode({ to: TOKEN, data });
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.isUnlimited).toBe(false);
    expect(r.details.amount).toBe(1_000_000n);
  });

  it("an erc20 approve of uint160-max is NOT flagged unlimited (per-standard ceiling)", async () => {
    const data = cd("function approve(address,uint256)", [SPENDER, UINT160_MAX]);
    const r = await decode({ to: TOKEN, data });
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.isUnlimited).toBe(false);
  });

  it("Permit2 approve of uint160-max IS unlimited", async () => {
    const data = cd("function approve(address,address,uint160,uint48)", [TOKEN, SPENDER, UINT160_MAX, 0]);
    const r = await decode(data);
    expect(r.action).toBe(Action.TOKEN_APPROVAL);
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.isUnlimited).toBe(true);
  });

  it("transfer(to, amount) -> TOKEN_TRANSFER", async () => {
    const data = cd("function transfer(address,uint256)", [TO, 5n]);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.TOKEN_TRANSFER);
    if (r.details.kind !== "transfer") throw new Error("expected transfer");
    expect(r.details.recipient.toLowerCase()).toBe(TO);
    expect(r.details.amount).toBe(5n);
  });

  it("setApprovalForAll(operator, true) -> SET_APPROVAL_FOR_ALL", async () => {
    const data = cd("function setApprovalForAll(address,bool)", [SPENDER, true]);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.SET_APPROVAL_FOR_ALL);
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.isUnlimited).toBe(true);
  });

  it("setApprovalForAll(operator, false) is not unlimited", async () => {
    const data = cd("function setApprovalForAll(address,bool)", [SPENDER, false]);
    const r = await decode({ to: TOKEN, data });
    if (r.details.kind !== "approval") throw new Error("expected approval");
    expect(r.details.isUnlimited).toBe(false);
  });

  it("transferOwnership(newOwner) -> OWNERSHIP_TRANSFER", async () => {
    const data = cd("function transferOwnership(address)", [SPENDER]);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.OWNERSHIP_TRANSFER);
    if (r.details.kind !== "call") throw new Error("expected call");
    expect(String(r.details.decodedArgs?.newOwner).toLowerCase()).toBe(SPENDER);
  });

  it("eip-2612 permit() call -> PERMIT", async () => {
    const data = cd(
      "function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
      [SPENDER, TO, maxUint256, 0n, 27, `0x${"0".repeat(64)}`, `0x${"0".repeat(64)}`],
    );
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.PERMIT);
    if (r.details.kind !== "permit") throw new Error("expected permit");
    expect(r.details.standard).toBe("eip2612");
    expect(r.details.isUnlimited).toBe(true);
  });

  it("unknown selector -> generic CONTRACT_CALL", async () => {
    const r = await decode({ to: TOKEN, data: "0xdeadbeef00000000" });
    expect(r.action).toBe(Action.CONTRACT_CALL);
    if (r.details.kind !== "call") throw new Error("expected call");
    expect(r.details.selector.toLowerCase()).toBe("0xdeadbeef");
  });

  it("empty data with value -> NATIVE_TRANSFER", async () => {
    const r = await decode({ to: TO, value: 1_000_000_000_000_000_000n });
    expect(r.action).toBe(Action.NATIVE_TRANSFER);
    if (r.details.kind !== "transfer") throw new Error("expected transfer");
    expect(r.details.token).toBe("native");
    expect(r.details.amount).toBe(1_000_000_000_000_000_000n);
    expect(r.details.recipient.toLowerCase()).toBe(TO);
  });
});
