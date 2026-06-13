import type { RiskRule } from "../engine.js";
import { RiskLevel } from "../../types.js";
import { isZeroAddress } from "../../util/format.js";

/** Transfer recipient or approval/permit spender is the zero address — burn or mistake. */
export const zeroAddressRule: RiskRule = (partial) => {
  const d = partial.details;
  const target =
    d.kind === "transfer" ? d.recipient : d.kind === "approval" || d.kind === "permit" ? d.spender : undefined;
  if (!isZeroAddress(target)) return null;

  const isTransfer = d.kind === "transfer";
  return {
    id: "zero-address",
    severity: RiskLevel.WARNING,
    title: isTransfer ? "Transfer to the zero address" : "Approval to the zero address",
    message: isTransfer
      ? "The recipient is the zero address (0x0). Tokens sent there are burned — permanently destroyed."
      : "The spender is the zero address (0x0). This is malformed or a mistake.",
    advice: "Double-check the destination address before signing.",
    confidence: "high",
  };
};
