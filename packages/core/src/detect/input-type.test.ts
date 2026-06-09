import { describe, expect, it } from "vitest";
import { serializeTransaction, type Hex } from "viem";
import { detectInputType } from "../index.js";
import { InputType } from "../types.js";

const ADDR = "0x1111111111111111111111111111111111111111" as const;
const SIG = { r: `0x${"11".repeat(32)}` as Hex, s: `0x${"22".repeat(32)}` as Hex };

const tx1559 = serializeTransaction(
  {
    type: "eip1559",
    chainId: 1,
    nonce: 0,
    to: ADDR,
    value: 0n,
    gas: 21000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
  },
  { ...SIG, yParity: 1 },
);

const txLegacy = serializeTransaction(
  { type: "legacy", chainId: 1, nonce: 0, to: ADDR, value: 0n, gas: 21000n, gasPrice: 1n },
  { ...SIG, v: 37n },
);

const eip712 = {
  domain: { name: "USD Coin", chainId: 1, verifyingContract: ADDR },
  primaryType: "Permit",
  types: { Permit: [{ name: "owner", type: "address" }] },
  message: { owner: ADDR, spender: ADDR, value: "1", nonce: "0", deadline: "0" },
};

const APPROVE_UNLIMITED =
  "0x095ea7b3000000000000000000000000abababababababababababababababababababab" +
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

describe("detectInputType", () => {
  const cases: [string, string | object, InputType][] = [
    ["eip1559 serialized tx", tx1559, InputType.RAW_TRANSACTION],
    ["legacy serialized tx", txLegacy, InputType.RAW_TRANSACTION],
    ["empty data 0x", "0x", InputType.RAW_TRANSACTION],
    ["approve calldata", APPROVE_UNLIMITED, InputType.CALLDATA],
    ["bare selector", "0x095ea7b3", InputType.CALLDATA],
    ["supportsInterface selector (tx-prefix collision)", "0x01ffc9a700000000", InputType.CALLDATA],
    ["eip712 object", eip712, InputType.EIP712_TYPED],
    ["eip712 json string", JSON.stringify(eip712), InputType.EIP712_TYPED],
    ["7702 auth object", { chainId: 1, address: ADDR, nonce: 0 }, InputType.EIP7702_AUTH],
    ["personal_sign text", "Sign in to dApp", InputType.PERSONAL_SIGN],
    ["non-hex garbage", "hello world", InputType.PERSONAL_SIGN],
    ["odd-length hex", "0xabc", InputType.PERSONAL_SIGN],
  ];

  for (const [name, input, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(detectInputType(input)).toBe(expected);
    });
  }

  it("never throws on hostile inputs", () => {
    const hostile: (string | object)[] = ["", "0x", "{", "[]", "{bad json", {}, [], "0xzz"];
    for (const h of hostile) {
      expect(() => detectInputType(h)).not.toThrow();
    }
  });
});
