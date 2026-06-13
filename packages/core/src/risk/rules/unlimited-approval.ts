import type { RiskRule } from "../engine.js";
import { Action, RiskLevel } from "../../types.js";
import { isKnownGood } from "../../registry/known-good.js";

/**
 * Unlimited (max-uint) token approval or permit. CRITICAL when the spender is
 * unrecognised; WARNING when it carries a known-good label or confirmed code,
 * since unlimited approvals to trusted routers are routine in DeFi.
 *
 * NFT collection-wide approval (SET_APPROVAL_FOR_ALL) is handled separately.
 */
export const unlimitedApprovalRule: RiskRule = (partial) => {
  if (partial.action !== Action.TOKEN_APPROVAL && partial.action !== Action.PERMIT) return null;
  const d = partial.details;
  if (d.kind !== "approval" && d.kind !== "permit") return null;
  if (!d.isUnlimited) return null;

  const recognised = Boolean(d.spenderLabel) || isKnownGood(d.spender) || d.spenderHasCode === true;
  const symbol = d.token.symbol ?? "this token";
  const who = d.spenderLabel ?? "an unrecognised address";

  return {
    id: "unlimited-approval",
    severity: recognised ? RiskLevel.WARNING : RiskLevel.CRITICAL,
    title: "Unlimited spending approval",
    message: `This grants UNLIMITED access to your ${symbol} to ${who}. They can move all of your ${symbol}, now and in the future, until you revoke it.`,
    advice: "Approve a specific amount instead, or only grant unlimited access to contracts you fully trust.",
    confidence: recognised ? "medium" : "high",
  };
};
