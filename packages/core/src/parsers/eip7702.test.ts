import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decode } from "../index.js";
import { Action, RiskLevel } from "../types.js";

const DELEGATE = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;

describe("EIP-7702 delegation decoding", () => {
  it("an authorization object is decoded as a CRITICAL delegation", async () => {
    const r = await decode({ chainId: 1, address: DELEGATE, nonce: 0 });
    expect(r.action).toBe(Action.DELEGATION);
    expect(r.risk).toBe(RiskLevel.CRITICAL);
    if (r.details.kind !== "delegation") throw new Error("expected delegation");
    expect(r.details.delegateTo.toLowerCase()).toBe(DELEGATE);
    expect(r.flags.map((f) => f.id)).toContain("eip7702-delegation");
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it("leaves authority zero when no signature is present (cannot recover)", async () => {
    const r = await decode({ chainId: 1, address: DELEGATE, nonce: 5 });
    if (r.details.kind !== "delegation") throw new Error("expected delegation");
    expect(r.details.authority).toBe("0x0000000000000000000000000000000000000000");
    expect(r.details.nonce).toBe(5n);
  });

  it("a blocklisted delegate target also raises known-drainer", async () => {
    const r = await decode({ chainId: 1, address: DELEGATE, nonce: 0 }, { customBlocklist: [DELEGATE] });
    const ids = r.flags.map((f) => f.id);
    expect(ids).toContain("eip7702-delegation");
    expect(ids).toContain("known-drainer");
  });

  it("recovers the real authorizing EOA from a signed authorization", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const signed = await account.signAuthorization({ contractAddress: DELEGATE, chainId: 1, nonce: 7 });
    const r = await decode({ ...signed });
    if (r.details.kind !== "delegation") throw new Error("expected delegation");
    expect(r.details.authority.toLowerCase()).toBe(account.address.toLowerCase());
    expect(r.details.delegateTo.toLowerCase()).toBe(DELEGATE.toLowerCase());
    expect(r.details.nonce).toBe(7n);
  });
});
