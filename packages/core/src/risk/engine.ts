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
import { blindHashSignRule } from "./rules/blind-hash-sign.js";

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
  blindHashSignRule,
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
  const flags = collectFlags(partial, opts);
  return dedupe(flags).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/** Run every rule on this intent, then recurse into batch children so a danger
 *  hidden inside a multicall still surfaces at the top. */
function collectFlags(partial: PartialIntent, opts: ResolvedOptions): RiskFlag[] {
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
  if (partial.details.kind === "batch") {
    for (const child of partial.details.calls) flags.push(...collectFlags(child, opts));
  }
  return flags;
}

/** Collapse duplicate flag ids (common across batch children), keeping the most severe. */
function dedupe(flags: RiskFlag[]): RiskFlag[] {
  const byId = new Map<string, RiskFlag>();
  for (const f of flags) {
    const cur = byId.get(f.id);
    if (!cur || severityRank(f.severity) > severityRank(cur.severity)) byId.set(f.id, f);
  }
  return [...byId.values()];
}

/** The overall risk is the max severity across all flags; no flags means SAFE. */
export function aggregateRisk(flags: RiskFlag[]): RiskLevel {
  return flags.reduce<RiskLevel>(
    (max, f) => (severityRank(f.severity) > severityRank(max) ? f.severity : max),
    RiskLevel.SAFE,
  );
}
