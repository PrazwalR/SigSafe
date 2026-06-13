import type { RiskRule } from "../engine.js";
import { InputType, RiskLevel } from "../../types.js";

/**
 * Typed-data domain.chainId differs from the chain the caller says they are on.
 * Classic replay / cross-chain phishing signal. Only fires when the caller
 * passed an explicit chainId — otherwise the default would false-positive on
 * every legitimate L2 signature.
 */
export const chainMismatchRule: RiskRule = (partial, opts) => {
  if (!opts.chainIdExplicit) return null;
  if (partial.inputType !== InputType.EIP712_TYPED) return null;
  if (partial.chainId === undefined || partial.chainId === opts.chainId) return null;

  return {
    id: "chain-mismatch",
    severity: RiskLevel.CRITICAL,
    title: "Wrong-chain signature",
    message: `This payload targets chain ${partial.chainId}, but you appear to be on chain ${opts.chainId}. A signature for another chain you did not intend can be replayed against you.`,
    advice: "Verify the dApp and the network. Do not sign a payload for a chain you are not using.",
    confidence: "medium",
  };
};
