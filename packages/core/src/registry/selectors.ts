import { toFunctionSelector, type Hex } from "viem";

const SIGNATURES = {
  approve: "function approve(address spender, uint256 amount)",
  increaseAllowance: "function increaseAllowance(address spender, uint256 addedValue)",
  decreaseAllowance: "function decreaseAllowance(address spender, uint256 subtractedValue)",
  transfer: "function transfer(address to, uint256 amount)",
  transferFrom: "function transferFrom(address from, address to, uint256 amount)",
  safeTransferFrom721: "function safeTransferFrom(address from, address to, uint256 tokenId)",
  safeTransferFrom721Data: "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  safeTransferFrom1155: "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  safeBatchTransferFrom1155:
    "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)",
  setApprovalForAll: "function setApprovalForAll(address operator, bool approved)",
  transferOwnership: "function transferOwnership(address newOwner)",
  renounceOwnership: "function renounceOwnership()",
  permit2612:
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  permitDai:
    "function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)",
  permit2Approve: "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  upgradeTo: "function upgradeTo(address newImplementation)",
  upgradeToAndCall: "function upgradeToAndCall(address newImplementation, bytes data)",
} as const;

export const SEL = Object.fromEntries(
  Object.entries(SIGNATURES).map(([name, sig]) => [name, toFunctionSelector(sig)]),
) as Record<keyof typeof SIGNATURES, Hex>;

export const KNOWN_SELECTORS: Record<string, string> = Object.fromEntries(
  Object.values(SIGNATURES).map((sig) => [toFunctionSelector(sig).toLowerCase(), sig]),
);
