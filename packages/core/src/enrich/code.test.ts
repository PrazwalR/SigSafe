import { describe, expect, it } from "vitest";
import { classifyCode } from "./code.js";

const ADDR40 = "abababababababababababababababababababab"; // 20 bytes
const EIP7702_DESIGNATOR = `0xef0100${ADDR40}`; // 23 bytes total

describe("classifyCode (EOA vs contract vs 7702-delegated)", () => {
  it("undefined code means NO code — a plain EOA (viem returns undefined for empty accounts)", () => {
    // This is the #1 drainer case; it must classify as EOA, not 'unknown'.
    expect(classifyCode(undefined)).toEqual({ isEoa: true, isContract: false, is7702: false });
  });

  it("empty code is an EOA", () => {
    const c = classifyCode("0x");
    expect(c).toEqual({ isEoa: true, isContract: false, is7702: false });
  });

  it("real bytecode is a contract", () => {
    const c = classifyCode("0x6080604052348015600f57600080fd5b50");
    expect(c).toEqual({ isEoa: false, isContract: true, is7702: false });
  });

  it("a 7702 designator is a delegated EOA, NOT a contract", () => {
    const c = classifyCode(EIP7702_DESIGNATOR);
    expect(c).toEqual({ isEoa: true, isContract: false, is7702: true });
  });

  it("is case-insensitive on the 7702 prefix", () => {
    const c = classifyCode(`0xEF0100${ADDR40.toUpperCase()}`);
    expect(c?.is7702).toBe(true);
    expect(c?.isEoa).toBe(true);
  });

  it("a malformed short 0xef0100 (no address) is not treated as a delegated EOA", () => {
    const c = classifyCode("0xef0100");
    expect(c?.is7702).toBe(false);
    expect(c?.isContract).toBe(true);
  });
});
