import { describe, expect, it } from "vitest";
import { decode, MAX_INPUT_CHARS } from "./index.js";
import { Action, InputType, RiskLevel } from "./types.js";
import type { DecodedIntent } from "./types.js";

function assertValidIntent(r: DecodedIntent) {
  expect(typeof r.summary).toBe("string");
  expect(Object.values(Action)).toContain(r.action);
  expect(Object.values(RiskLevel)).toContain(r.risk);
  expect(Object.values(InputType)).toContain(r.inputType);
  expect(Array.isArray(r.flags)).toBe(true);
  expect(typeof r.raw).toBe("string");
  expect(r.details).toBeDefined();
  expect(typeof (r.details as { kind: string }).kind).toBe("string");
}

const eip712 = {
  domain: { name: "X", chainId: 1, verifyingContract: "0x1111111111111111111111111111111111111111" },
  primaryType: "Permit",
  types: { Permit: [{ name: "owner", type: "address" }] },
  message: { owner: "0x1111111111111111111111111111111111111111" },
};

const battery: (string | object)[] = [
  "0x095ea7b3000000000000000000000000abababababababababababababababababababab",
  "0x",
  "",
  "hello",
  "0xzz",
  "{ broken json",
  eip712,
  JSON.stringify(eip712),
  {},
  { chainId: 1, address: "0x1111111111111111111111111111111111111111", nonce: 0 },
];

describe("decode (phase 1 skeleton)", () => {
  it("never throws and always returns a valid intent", async () => {
    for (const input of battery) {
      const r = await decode(input);
      assertValidIntent(r);
    }
  });

  it("never throws on hostile objects (circular ref + throwing toJSON)", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const evil = {
      toJSON() {
        throw new Error("boom");
      },
    };
    await expect(decode(circular)).resolves.toBeDefined();
    await expect(decode(evil)).resolves.toBeDefined();
    assertValidIntent(await decode(circular));
    assertValidIntent(await decode(evil));
  });

  it("bounds oversized input (DoS guard) without hanging or echoing it back", async () => {
    const huge = "0x" + "a".repeat(MAX_INPUT_CHARS + 100);
    const started = Date.now();
    const r = await decode(huge);
    expect(Date.now() - started).toBeLessThan(1000);
    assertValidIntent(r);
    expect(r.flags.map((f) => f.id)).toContain("input-too-large");
    expect(r.risk).toBe(RiskLevel.WARNING);
    expect(r.raw.length).toBeLessThan(400);
  });

  it("undecoded payloads return UNKNOWN + WARNING + a flag", async () => {
    const r = await decode("0x095ea7b3");
    expect(r.action).toBe(Action.UNKNOWN);
    expect(r.risk).toBe(RiskLevel.WARNING);
    expect(r.flags.length).toBeGreaterThanOrEqual(1);
    expect(r.flags[0]?.id).toBe("undecoded-payload");
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it("propagates the detected inputType", async () => {
    expect((await decode("0x095ea7b3aabbccdd")).inputType).toBe(InputType.CALLDATA);
    expect((await decode(eip712)).inputType).toBe(InputType.EIP712_TYPED);
    expect((await decode("Sign in")).inputType).toBe(InputType.PERSONAL_SIGN);
  });

  it("defaults chainId to 1 and honors an override", async () => {
    expect((await decode("0x095ea7b3")).chainId).toBe(1);
    expect((await decode("0x095ea7b3", { chainId: 8453 })).chainId).toBe(8453);
  });

  it("echoes raw input back", async () => {
    expect((await decode("0xdeadbeef")).raw).toBe("0xdeadbeef");
    expect((await decode(eip712)).raw).toContain("Permit");
  });
});
