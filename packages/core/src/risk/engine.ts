import type { PartialIntent, RiskFlag } from "../types.js";
import { RiskLevel } from "../types.js";
import type { ResolvedOptions } from "../options.js";

import { knownDrainerRule } from "./rules/known-drainer.js";
import { eip7702DelegationRule } from "./rules/eip7702-delegation.js";
import { permitToEoaRule } from "./rules/permit-to-eoa.js";
import { unlimitedApprovalRule } from "./rules/unlimited-approval.js";
import { setApprovalForAllRule } from "./rules/setapprovalforall.js";
import { unknownSpenderRule } from "./rules/unknown-spender.js";
import { ownershipTransferRule } from "./rules/ownership-transfer.js";
import { chainMismatchRule } from "./rules/chain-mismatch.js";
import { deadlineRules } from "./rules/deadline.js";
import { zeroAddressRule } from "./rules/zero-address.js";

export type RiskRule = (partial: PartialIntent, opts: ResolvedOptions) => RiskFlag | RiskFlag[] | null;

// Order is priority: highest-severity / most-specific rules first. The engine
// runs them all regardless, but order makes the sorted output stable.
const ALL_RULES: RiskRule[] = [
  knownDrainerRule,
  eip7702DelegationRule,
  permitToEoaRule,
  unlimitedApprovalRule,
  setApprovalForAllRule,
  ownershipTransferRule,
  chainMismatchRule,
  unknownSpenderRule,
  deadlineRules,
  zeroAddressRule,
];

const RANK: Record<RiskLevel, number> = {
  [RiskLevel.SAFE]: 0,
  [RiskLevel.INFO]: 1,
  [RiskLevel.WARNING]: 2,
  [RiskLevel.CRITICAL]: 3,
};

export function severityRank(level: RiskLevel): number {
  return RANK[level] ?? 0;
}

export function runRiskEngine(partial: PartialIntent, opts: ResolvedOptions): RiskFlag[] {
  const flags: RiskFlag[] = [];
  for (const rule of ALL_RULES) {
    try {
      const out = rule(partial, opts);
      if (!out) continue;
      if (Array.isArray(out)) flags.push(...out);
      else flags.push(out);
    } catch {
      // A single misbehaving rule must never break the whole decode.
    }
  }
  return flags.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/** The overall risk is the max severity across all flags; no flags means SAFE. */
export function aggregateRisk(flags: RiskFlag[]): RiskLevel {
  return flags.reduce<RiskLevel>(
    (max, f) => (severityRank(f.severity) > severityRank(max) ? f.severity : max),
    RiskLevel.SAFE,
  );
}
