import { describe, expect, it } from "vitest";
import {
  encodeFunctionData,
  maxUint256,
  parseAbiItem,
  parseTransaction as viemParseTransaction,
  serializeTransaction,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decode } from "../index.js";
import { Action, RiskLevel } from "../types.js";
import type { DecodedIntent } from "../types.js";

const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const DRAINER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Address;
const TO = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd" as Address;
const SIG = { r: `0x${"11".repeat(32)}` as Hex, s: `0x${"22".repeat(32)}` as Hex, yParity: 1 } as const;
const cd = (sig: string, args: unknown[]): Hex => encodeFunctionData({ abi: [parseAbiItem(sig)], args });

function assertValid(r: DecodedIntent) {
  expect(typeof r.summary).toBe("string");
  expect(Object.values(Action)).toContain(r.action);
  expect(Object.values(RiskLevel)).toContain(r.risk);
  expect(Array.isArray(r.flags)).toBe(true);
  expect(r.details).toBeDefined();
}

// ─────────────────────────── try to break it ───────────────────────────
describe("adversarial: hostile / malformed input never crashes", () => {
  const hostile: (string | object)[] = [
    "0xac9650d8" + "00".repeat(20), // multicall selector, truncated/garbage args
    "0x82ad56cb" + "ff".repeat(64), // aggregate3 selector, nonsense
    cd("function multicall(bytes[])", [[]]), // empty batch
    cd("function multicall(bytes[])", [["0x", "0xff", "0xdeadbeef"]]), // junk inner calls
    "0x" + "ab".repeat(5000), // long random hex
    { domain: {}, types: {}, message: {} }, // empty typed data
    { domain: { chainId: "not-a-number" }, primaryType: "Permit", message: { value: "abc" } },
    { chainId: 1, address: DRAINER, nonce: 0, r: "0xzz", s: "0x", yParity: 9 }, // bad 7702 sig
    { to: TOKEN }, // object, no data
    "0x095ea7b3", // known selector, no args
    "0xa9059cbb" + "00", // odd/short args
    "",
    "not hex at all 你好",
  ];

  for (const [i, input] of hostile.entries()) {
    it(`hostile #${i} resolves to a valid intent`, async () => {
      const start = Date.now();
      const r = await decode(input, { offline: true });
      expect(Date.now() - start).toBeLessThan(1000);
      assertValid(r);
    });
  }

  it("an empty multicall is a plain call, not a zero-length batch", async () => {
    const r = await decode({ to: TOKEN, data: cd("function multicall(bytes[])", [[]]) }, { offline: true });
    expect(r.details.kind).not.toBe("batch");
  });

  it("a 200-entry multicall is bounded (DoS) and marked truncated", async () => {
    const inner = cd("function approve(address,uint256)", [DRAINER, maxUint256]);
    const data = cd("function multicall(bytes[])", [Array.from({ length: 200 }, () => inner)]);
    const start = Date.now();
    const r = await decode({ to: TOKEN, data }, { offline: true });
    expect(Date.now() - start).toBeLessThan(1000);
    if (r.details.kind !== "batch") throw new Error("expected batch");
    expect(r.details.calls.length).toBeLessThanOrEqual(48);
    expect(r.details.truncated).toBe(true);
    expect(r.risk).toBe(RiskLevel.CRITICAL);
  });
});

// ─────────────────── real decode, verified against viem ───────────────────
describe("oracle: decode reflects real bytes (cross-checked with viem)", () => {
  it("a serialized EIP-1559 tx decodes to the same to/chainId viem reports, and the inner transfer", async () => {
    const data = cd("function transfer(address,uint256)", [TO, 12345n]);
    const serialized = serializeTransaction(
      { type: "eip1559", chainId: 1, nonce: 7, to: TOKEN, value: 0n, gas: 60000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, data },
      SIG,
    );
    const oracle = viemParseTransaction(serialized);
    const r = await decode(serialized, { offline: true });

    expect(r.chainId).toBe(oracle.chainId);
    expect(r.action).toBe(Action.TOKEN_TRANSFER);
    if (r.details.kind !== "transfer") throw new Error("expected transfer");
    expect(r.details.recipient.toLowerCase()).toBe(TO);
    expect(r.details.amount).toBe(12345n);
    expect(r.details.token).not.toBe("native");
    if (r.details.token !== "native") expect(r.details.token.address.toLowerCase()).toBe(TOKEN);
  });

  it("permit fields are extracted verbatim from the message (not fabricated)", async () => {
    const message = { owner: TO, spender: DRAINER, value: "123456789", nonce: "42", deadline: "1888888888" };
    const r = await decode(
      { domain: { name: "USD Coin", chainId: 1, verifyingContract: TOKEN }, primaryType: "Permit", types: { Permit: [] }, message },
      { offline: true },
    );
    if (r.details.kind !== "permit") throw new Error("expected permit");
    expect(r.details.spender.toLowerCase()).toBe(DRAINER);
    expect(r.details.owner.toLowerCase()).toBe(TO);
    expect(r.details.amount).toBe(123456789n);
    expect(r.details.nonce).toBe(42n);
    expect(r.details.deadline).toBe(1888888888n);
    expect(r.details.isUnlimited).toBe(false);
  });

  it("EIP-7702 authority is a real ecrecover of the signer", async () => {
    const account = privateKeyToAccount(`0x${"a1".repeat(32)}`);
    const signed = await account.signAuthorization({ contractAddress: DRAINER, chainId: 1, nonce: 3 });
    const r = await decode({ ...signed });
    if (r.details.kind !== "delegation") throw new Error("expected delegation");
    expect(r.details.authority.toLowerCase()).toBe(account.address.toLowerCase());
  });
});

// ─────────────────────────── boundary conditions ───────────────────────────
describe("boundaries", () => {
  it("erc20 amount exactly at the unlimited threshold is flagged; just below is not", async () => {
    const ceiling = maxUint256;
    const atThreshold = ceiling - ceiling / 1000n; // smallest value still treated as unlimited
    const belowThreshold = atThreshold - 1n;

    const a = await decode({ to: TOKEN, data: cd("function approve(address,uint256)", [DRAINER, atThreshold]) }, { offline: true });
    const b = await decode({ to: TOKEN, data: cd("function approve(address,uint256)", [DRAINER, belowThreshold]) }, { offline: true });
    if (a.details.kind !== "approval" || b.details.kind !== "approval") throw new Error("expected approvals");
    expect(a.details.isUnlimited).toBe(true);
    expect(b.details.isUnlimited).toBe(false);
  });
});

// ─────────────────── batch + blocklist interaction ───────────────────
describe("batch + blocklist", () => {
  it("a blocklisted spender hidden inside a multicall is caught", async () => {
    const inner = cd("function approve(address,uint256)", [DRAINER, 1000n]); // bounded, would otherwise be low-risk
    const data = cd("function multicall(bytes[])", [[inner]]);
    const r = await decode({ to: TOKEN, data }, { offline: true, customBlocklist: [DRAINER] });
    expect(r.flags.map((f) => f.id)).toContain("known-drainer");
    expect(r.risk).toBe(RiskLevel.CRITICAL);
  });

  it("a blocklisted call target inside a Multicall3 aggregate3 is caught", async () => {
    const data = cd("function aggregate3((address target,bool allowFailure,bytes callData)[])", [
      [{ target: DRAINER, allowFailure: false, callData: "0xdeadbeef00000000" as Hex }],
    ]);
    const r = await decode(data, { offline: true, customBlocklist: [DRAINER] });
    expect(r.flags.map((f) => f.id)).toContain("known-drainer");
  });
});
