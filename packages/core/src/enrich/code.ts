import { createPublicClient, http, type Address } from "viem";
import type { PartialIntent } from "../types.js";
import type { ResolvedOptions } from "../options.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Optionally resolve whether a spender / delegate target is an EOA or a
 * contract, via a single eth_getCode call. This powers the strongest rule,
 * permit-to-eoa: a token approval to a personal wallet is a near-certain
 * drainer, because legitimate spenders are always contracts.
 *
 * No-ops offline or without an rpcUrl. Any network failure is swallowed — a
 * dead RPC must never break a decode; the rule simply stays unconfirmed.
 */
export async function enrichWithCode(partial: PartialIntent, opts: ResolvedOptions): Promise<PartialIntent> {
  if (opts.offline || !opts.rpcUrl) return partial;

  const d = partial.details;
  const target =
    (d.kind === "permit" || d.kind === "approval") ? d.spender : d.kind === "delegation" ? d.delegateTo : undefined;
  if (!target || target.toLowerCase() === ZERO_ADDRESS) return partial;

  const hasCode = await fetchHasCode(opts.rpcUrl, target);
  if (hasCode === undefined) return partial;

  if (d.kind === "permit" || d.kind === "approval") {
    return { ...partial, details: { ...d, spenderHasCode: hasCode, spenderIsEoa: !hasCode } };
  }
  if (d.kind === "delegation") {
    return { ...partial, details: { ...d, delegateHasCode: hasCode } };
  }
  return partial;
}

async function fetchHasCode(rpcUrl: string, address: Address): Promise<boolean | undefined> {
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const code = await client.getCode({ address });
    return code !== undefined && code !== "0x" && code.length > 2;
  } catch {
    return undefined;
  }
}
