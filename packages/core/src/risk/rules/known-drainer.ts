import type { RiskRule } from "../engine.js";
import { RiskLevel } from "../../types.js";
import { isKnownDrainer } from "../../registry/known-bad.js";
import { shorten } from "../../util/format.js";

/** Spender / delegate / recipient is on the drainer blocklist or caller's custom list. */
export const knownDrainerRule: RiskRule = (partial, opts) => {
  const d = partial.details;
  const target =
    d.kind === "permit" || d.kind === "approval"
      ? d.spender
      : d.kind === "delegation"
        ? d.delegateTo
        : d.kind === "transfer"
          ? d.recipient
          : d.kind === "call"
            ? d.to
            : undefined;

  if (!isKnownDrainer(target, opts.customBlocklist)) return null;

  return {
    id: "known-drainer",
    severity: RiskLevel.CRITICAL,
    title: "Known drainer address",
    message: `${shorten(target)} is on a drainer blocklist. Interacting with it is overwhelmingly likely to steal your assets.`,
    advice: "Do not sign. This address has been reported as malicious.",
    confidence: "high",
  };
};
