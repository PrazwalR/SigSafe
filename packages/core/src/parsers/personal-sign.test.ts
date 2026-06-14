import { describe, expect, it } from "vitest";
import { stringToHex } from "viem";
import { decode } from "../index.js";
import { Action, InputType, RiskLevel } from "../types.js";

describe("personal_sign / message decoding", () => {
  it("a plain login message is SAFE, not a scary WARNING", async () => {
    const r = await decode("Sign in to dApp");
    expect(r.action).toBe(Action.MESSAGE_SIGN);
    expect(r.risk).toBe(RiskLevel.SAFE);
    expect(r.flags).toHaveLength(0);
    if (r.details.kind !== "message") throw new Error("expected message");
    expect(r.details.text).toBe("Sign in to dApp");
    expect(r.details.isHex).toBe(false);
  });

  it("recognises a Sign-In with Ethereum (EIP-4361) message", async () => {
    const siwe =
      "service.org wants you to sign in with your Ethereum account:\n0xAbC\n\nURI: https://service.org\nNonce: xyz";
    const r = await decode(siwe);
    if (r.details.kind !== "message") throw new Error("expected message");
    expect(r.details.isSiwe).toBe(true);
    expect(r.risk).toBe(RiskLevel.SAFE);
    expect(r.summary.toLowerCase()).toContain("sign in");
  });

  // Hex-encoded messages are byte-identical to calldata, so the wallet passes
  // the known method explicitly via { inputType }.
  it("decodes hex-encoded readable text and stays SAFE", async () => {
    const r = await decode(stringToHex("gm wagmi"), { inputType: InputType.PERSONAL_SIGN });
    if (r.details.kind !== "message") throw new Error("expected message");
    expect(r.details.isHex).toBe(true);
    expect(r.details.text).toBe("gm wagmi");
    expect(r.details.looksLikeHash).toBe(false);
    expect(r.risk).toBe(RiskLevel.SAFE);
  });

  it("flags a raw 32-byte hash as a blind-sign WARNING", async () => {
    // keccak256("hello") — first byte 0x1c is a control char, so not readable text.
    const hash = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8";
    const r = await decode(hash, { inputType: InputType.PERSONAL_SIGN });
    if (r.details.kind !== "message") throw new Error("expected message");
    expect(r.details.looksLikeHash).toBe(true);
    expect(r.details.byteLength).toBe(32);
    expect(r.risk).toBe(RiskLevel.WARNING);
    expect(r.flags.map((f) => f.id)).toContain("blind-hash-sign");
  });

  it("an odd-length / non-hex garbage string is a benign message, not a crash", async () => {
    const r = await decode("0xabc"); // odd-length hex -> treated as text message
    expect(r.action).toBe(Action.MESSAGE_SIGN);
    expect(r.risk).toBe(RiskLevel.SAFE);
  });
});
