import type { RiskRule } from "../engine.js";
import { RiskLevel } from "../../types.js";
import { shorten } from "../../util/format.js";

/**
 * A permit / approval whose spender is a personal wallet (no contract code) is
 * a near-certain drainer: legitimate spenders are always contracts (routers,
 * vaults). Requires an rpcUrl to confirm — without one, spenderIsEoa is unset
 * and this rule stays silent (unknown-spender covers the softer case).
 */
export const permitToEoaRule: RiskRule = (partial) => {
  const d = partial.details;
  if (d.kind !== "permit" && d.kind !== "approval") return null;
  if (d.spenderIsEoa !== true) return null;

  return {
    id: "permit-to-eoa",
    severity: RiskLevel.CRITICAL,
    title: "Approval to a personal wallet",
    message: `You are granting token spending rights to ${shorten(d.spender)}, which is a personal wallet, not a smart contract. Legitimate apps grant approvals to contracts — this is a strong sign of a phishing/drainer attack.`,
    advice: "Do not sign. Legitimate DeFi approvals always target a contract (a router or vault), never a wallet.",
    confidence: "high",
  };
};
