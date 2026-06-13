import type { RiskRule } from "../engine.js";
import { Action, RiskLevel } from "../../types.js";
import { isKnownGood } from "../../registry/known-good.js";
import { shorten } from "../../util/format.js";

/** Collection-wide NFT approval — a common NFT drainer vector. */
export const setApprovalForAllRule: RiskRule = (partial) => {
  if (partial.action !== Action.SET_APPROVAL_FOR_ALL) return null;
  const d = partial.details;
  if (d.kind !== "approval" || !d.isUnlimited) return null;

  const recognised = Boolean(d.spenderLabel) || isKnownGood(d.spender);
  const who = d.spenderLabel ?? shorten(d.spender);
  return {
    id: "setapprovalforall",
    severity: recognised ? RiskLevel.WARNING : RiskLevel.CRITICAL,
    title: "Collection-wide NFT approval",
    message: `This lets ${who} transfer ANY NFT from this collection out of your wallet, now and in the future. A single setApprovalForAll can drain an entire collection.`,
    advice: "Only approve marketplaces you trust. Revoke it when you are done.",
    confidence: recognised ? "medium" : "high",
  };
};
