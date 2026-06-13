import { describe, expect, it } from "vitest";
import type { Address } from "viem";
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
});
