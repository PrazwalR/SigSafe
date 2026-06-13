import type { RiskRule } from "../engine.js";
import { RiskLevel } from "../../types.js";
import { isKnownGood } from "../../registry/known-good.js";
import { shorten } from "../../util/format.js";

/**
 * Soft signal: a bounded approval/permit to an unlabelled, unverified spender.
 * Deliberately low-noise — suppressed when a stronger flag (unlimited-approval,
 * permit-to-eoa) already explains the spender, so it only adds signal to the
 * otherwise-quiet "bounded approval to a random address" case.
 */
export const unknownSpenderRule: RiskRule = (partial, opts) => {
  const d = partial.details;
  if (d.kind !== "approval" && d.kind !== "permit") return null;
  if (d.isUnlimited) return null; // unlimited-approval owns this case
  if (d.spenderIsEoa === true) return null; // permit-to-eoa owns this case
  if (d.spenderLabel || isKnownGood(d.spender)) return null;
  if (d.spenderHasCode === true) return null; // verified contract, unlabelled but fine

  // Offline we can't verify code, so this is only a faint hint.
  const offline = opts.offline || !opts.rpcUrl;
  return {
    id: "unknown-spender",
    severity: offline ? RiskLevel.INFO : RiskLevel.WARNING,
    title: "Unrecognised spender",
    message: `The spender ${shorten(d.spender)} has no known label${offline ? "" : " and no verified contract"}. Make sure you recognise who you are granting access to.`,
    advice: "Confirm this address belongs to the app you intended to use.",
    confidence: "low",
  };
};
