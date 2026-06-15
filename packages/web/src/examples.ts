export interface Example {
  id: string;
  label: string;
  note: string;
  value: string;
}

const MAX_UINT256 = "f".repeat(64);
const DEADBEEF_20 = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"; // 20-byte fake spender
const pad32 = (addr20: string) => "0".repeat(24) + addr20;

const maliciousPermit = JSON.stringify(
  {
    domain: { name: "USD Coin", chainId: 1, verifyingContract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
    primaryType: "Permit",
    types: { Permit: [] },
    message: {
      owner: "0x1111111111111111111111111111111111111111",
      spender: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      nonce: "0",
      deadline: "1799999999",
    },
  },
  null,
  2,
);

const delegation7702 = JSON.stringify(
  { chainId: 1, address: "0xc0debad00000000000000000000000000000bad0", nonce: 0 },
  null,
  2,
);

export const EXAMPLES: Example[] = [
  {
    id: "permit",
    label: "☠️ Unlimited Permit",
    note: "EIP-2612 — the #1 drainer. Off-chain, no gas, unlimited spend to a stranger.",
    value: maliciousPermit,
  },
  {
    id: "7702",
    label: "☠️ EIP-7702 delegation",
    note: "Post-Pectra account takeover — hands full control of your EOA to a contract.",
    value: delegation7702,
  },
  {
    id: "approve",
    label: "⚠️ Unlimited approve()",
    note: "ERC-20 approve(spender, MAX) calldata.",
    value: `0x095ea7b3${pad32(DEADBEEF_20)}${MAX_UINT256}`,
  },
  {
    id: "approvalforall",
    label: "⚠️ setApprovalForAll",
    note: "Collection-wide NFT approval — one signature drains the whole collection.",
    value: `0xa22cb465${pad32(DEADBEEF_20)}${"0".repeat(63)}1`,
  },
  {
    id: "transfer",
    label: "✅ Token transfer",
    note: "A normal transfer(to, 1000000) — should come back low-risk.",
    value: `0xa9059cbb${pad32("cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd")}${"0".repeat(58)}f4240`,
  },
  {
    id: "login",
    label: "✅ Login message",
    note: "A plain personal_sign message — readable, no funds move.",
    value: "app.example.com wants you to sign in with your Ethereum account.",
  },
];
