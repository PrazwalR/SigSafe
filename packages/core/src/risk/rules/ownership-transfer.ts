import type { RiskRule } from "../engine.js";
import { Action, RiskLevel } from "../../types.js";
import { shorten } from "../../util/format.js";

/** transferOwnership / renounceOwnership — critical for protocol/multisig safety. */
export const ownershipTransferRule: RiskRule = (partial) => {
  if (partial.action !== Action.OWNERSHIP_TRANSFER) return null;
  const d = partial.details;
  if (d.kind !== "call") return null;

  const newOwner = d.decodedArgs?.newOwner;
  const renounce = newOwner === undefined;
  return {
    id: "ownership-transfer",
    severity: RiskLevel.WARNING,
    title: renounce ? "Ownership renouncement" : "Ownership transfer",
    message: renounce
      ? "This renounces ownership of the contract. Admin control will be gone permanently and cannot be recovered."
      : `This transfers ownership of the contract to ${shorten(String(newOwner))}. The new owner gains full admin control.`,
    advice: "Only sign if you intend to hand over (or give up) control of this contract.",
    confidence: "medium",
  };
};
