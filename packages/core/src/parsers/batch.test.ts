import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, parseAbiItem, type Address, type Hex } from "viem";
import { decode } from "../index.js";
import { Action, RiskLevel } from "../types.js";

const DRAINER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Address;
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const NFT = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d" as Address;
const SAFE = "0x1111111111111111111111111111111111111111" as Address;
const TO = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const cd = (sig: string, args: unknown[]): Hex => encodeFunctionData({ abi: [parseAbiItem(sig)], args });

const approveMax = cd("function approve(address,uint256)", [DRAINER, maxUint256]);
const smallTransfer = cd("function transfer(address,uint256)", [TO, 1n]);

describe("batch / multicall recursive decoding", () => {
  it("unwraps a self-multicall and surfaces a hidden unlimited approval as CRITICAL", async () => {
    const data = cd("function multicall(bytes[])", [[smallTransfer, approveMax, smallTransfer]]);
    const r = await decode({ to: TOKEN, data }, { offline: true });

    expect(r.action).toBe(Action.BATCH);
    if (r.details.kind !== "batch") throw new Error("expected batch");
    expect(r.details.calls).toHaveLength(3);
    expect(r.details.aggregator).toBe("multicall");
    // The danger hidden in the middle bubbles up.
    expect(r.risk).toBe(RiskLevel.CRITICAL);
    expect(r.flags.map((f) => f.id)).toContain("unlimited-approval");
    // Inner actions are classified.
    expect(r.details.calls[1]?.action).toBe(Action.TOKEN_APPROVAL);
    expect(r.details.calls[0]?.action).toBe(Action.TOKEN_TRANSFER);
  });

  it("inner calls inherit the multicall target (self aggregator)", async () => {
    const data = cd("function multicall(bytes[])", [[approveMax]]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    if (r.details.kind !== "batch") throw new Error("expected batch");
    const inner = r.details.calls[0];
    if (inner?.details.kind !== "approval") throw new Error("expected approval");
    expect(inner.details.token.address.toLowerCase()).toBe(TOKEN);
  });

  it("decodes a Multicall3 aggregate3 with per-call targets", async () => {
    const data = cd("function aggregate3((address target,bool allowFailure,bytes callData)[])", [
      [{ target: TOKEN, allowFailure: false, callData: approveMax }],
    ]);
    const r = await decode(data, { offline: true });
    expect(r.action).toBe(Action.BATCH);
    if (r.details.kind !== "batch") throw new Error("expected batch");
    expect(r.details.aggregator).toBe("multicall3");
    const inner = r.details.calls[0];
    if (inner?.details.kind !== "approval") throw new Error("expected approval");
    expect(inner.details.token.address.toLowerCase()).toBe(TOKEN);
    expect(r.risk).toBe(RiskLevel.CRITICAL);
  });

  it("unwraps a Gnosis Safe execTransaction wrapping setApprovalForAll", async () => {
    const inner = cd("function setApprovalForAll(address,bool)", [DRAINER, true]);
    const data = cd(
      "function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)",
      [NFT, 0n, inner, 0, 0n, 0n, 0n, ZERO, ZERO, "0x"],
    );
    const r = await decode({ to: SAFE, data }, { offline: true });
    expect(r.action).toBe(Action.BATCH);
    if (r.details.kind !== "batch") throw new Error("expected batch");
    expect(r.details.aggregator).toBe("safe");
    expect(r.details.calls[0]?.action).toBe(Action.SET_APPROVAL_FOR_ALL);
    expect(r.flags.map((f) => f.id)).toContain("setapprovalforall");
  });

  it("a benign multicall of small transfers stays low-risk", async () => {
    const data = cd("function multicall(bytes[])", [[smallTransfer, smallTransfer]]);
    const r = await decode({ to: TOKEN, data });
    expect(r.action).toBe(Action.BATCH);
    if (r.details.kind !== "batch") throw new Error("expected batch");
    expect(r.details.calls).toHaveLength(2);
    expect(r.risk).not.toBe(RiskLevel.CRITICAL);
  });

  it("handles nested multicall (batch within a batch)", async () => {
    const innerMulti = cd("function multicall(bytes[])", [[approveMax]]);
    const outer = cd("function multicall(bytes[])", [[innerMulti]]);
    const r = await decode({ to: TOKEN, data: outer }, { offline: true });
    if (r.details.kind !== "batch") throw new Error("expected outer batch");
    expect(r.details.calls[0]?.details.kind).toBe("batch");
    expect(r.risk).toBe(RiskLevel.CRITICAL); // still finds the buried approval
  });

  it("humanizes a batch by listing its inner actions", async () => {
    const data = cd("function multicall(bytes[])", [[approveMax, smallTransfer]]);
    const r = await decode({ to: TOKEN, data }, { offline: true });
    expect(r.summary).toContain("Batched 2 actions");
    expect(r.summary.toLowerCase()).toContain("approve");
  });

  it("does not hang or over-decode a hostile deeply-nested batch", async () => {
    // Build 6 levels of nested multicall — deeper than MAX_BATCH_DEPTH.
    let data = approveMax;
    for (let i = 0; i < 6; i++) data = cd("function multicall(bytes[])", [[data]]);
    const started = Date.now();
    const r = await decode({ to: TOKEN, data }, { offline: true });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(r.details.kind).toBe("batch");
  });
});
