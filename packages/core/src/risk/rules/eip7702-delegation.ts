import type { RiskRule } from "../engine.js";
import { RiskLevel } from "../../types.js";
import { shorten } from "../../util/format.js";

/**
 * Any EIP-7702 delegation. Signing it lets the target contract act AS your EOA,
 * persistently — the most dangerous thing a user can sign. Always CRITICAL.
 */
export const eip7702DelegationRule: RiskRule = (partial) => {
  if (partial.details.kind !== "delegation") return null;
  const d = partial.details;
  const who = d.delegateLabel ?? shorten(d.delegateTo);
  return {
    id: "eip7702-delegation",
    severity: RiskLevel.CRITICAL,
    title: "Account delegation request",
    message: `This delegates control of your account to ${who}. That contract will be able to execute transactions as you — moving any asset, persistently, until you revoke it.`,
    advice:
      "Only sign account delegations you deliberately initiated and understand. If you did not set up account abstraction, DO NOT SIGN.",
    confidence: "high",
  };
};
