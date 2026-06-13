import type { RiskRule } from "../engine.js";
import { RiskLevel, type RiskFlag } from "../../types.js";

const TEN_YEARS_SECONDS = 10n * 365n * 24n * 60n * 60n;

/** Permit deadline sanity: already expired, or absurdly far in the future. */
export const deadlineRules: RiskRule = (partial) => {
  if (partial.details.kind !== "permit") return null;
  const deadline = partial.details.deadline;
  if (deadline <= 0n) return null; // 0 = no deadline; nothing to flag

  const now = BigInt(Math.floor(Date.now() / 1000));
  const flags: RiskFlag[] = [];

  if (deadline < now) {
    flags.push({
      id: "expired-deadline",
      severity: RiskLevel.INFO,
      title: "Permit already expired",
      message: "This permit's deadline is in the past, so it is no longer usable. Often harmless, but unexpected if a dApp just asked you to sign it.",
      confidence: "high",
    });
  } else if (deadline > now + TEN_YEARS_SECONDS) {
    flags.push({
      id: "far-future-deadline",
      severity: RiskLevel.INFO,
      title: "Effectively unlimited deadline",
      message: "This permit's deadline is so far in the future it never practically expires. Drainers set far-future deadlines so a stolen signature stays usable indefinitely.",
      advice: "Prefer short-lived permits. Be cautious if you did not expect an open-ended approval.",
      confidence: "low",
    });
  }

  return flags.length > 0 ? flags : null;
};
