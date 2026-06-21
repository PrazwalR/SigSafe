import { createPublicClient, http, parseAbiItem, type Address, type PublicClient } from "viem";
import type { PartialIntent, TokenInfo } from "../types.js";
import type { ResolvedOptions } from "../options.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ERC20_DECIMALS = parseAbiItem("function decimals() view returns (uint8)");
const ERC20_SYMBOL = parseAbiItem("function symbol() view returns (string)");

/**
 * Best-effort online enrichment. No-ops offline or without an rpcUrl. Every
 * network call is wrapped — a dead or slow RPC must never break a decode, it
 * just leaves the relevant hints unresolved.
 *
 *  1. eth_getCode on the spender/delegate → EOA-vs-contract (powers permit-to-eoa).
 *  2. ERC-20 symbol()/decimals() on the token → honest amounts and labels.
 */
export async function enrich(partial: PartialIntent, opts: ResolvedOptions): Promise<PartialIntent> {
  if (opts.offline || !opts.rpcUrl) return partial;

  // Enrich each inner call so rules like permit-to-eoa fire inside a multicall.
  if (partial.details.kind === "batch") {
    const calls = await Promise.all(partial.details.calls.map((c) => enrich(c, opts)));
    return { ...partial, details: { ...partial.details, calls } };
  }

  let client: PublicClient;
  try {
    client = createPublicClient({ transport: http(opts.rpcUrl) });
  } catch {
    return partial;
  }

  let p = await enrichCode(partial, client);
  p = await enrichToken(p, client);
  return p;
}

async function enrichCode(partial: PartialIntent, client: PublicClient): Promise<PartialIntent> {
  const d = partial.details;
  const target =
    d.kind === "permit" || d.kind === "approval" ? d.spender : d.kind === "delegation" ? d.delegateTo : undefined;
  if (!target || isZero(target)) return partial;

  const hasCode = await fetchHasCode(client, target);
  if (hasCode === undefined) return partial;

  if (d.kind === "permit" || d.kind === "approval") {
    return { ...partial, details: { ...d, spenderHasCode: hasCode, spenderIsEoa: !hasCode } };
  }
  if (d.kind === "delegation") {
    return { ...partial, details: { ...d, delegateHasCode: hasCode } };
  }
  return partial;
}

async function enrichToken(partial: PartialIntent, client: PublicClient): Promise<PartialIntent> {
  const d = partial.details;
  const token: TokenInfo | undefined =
    d.kind === "permit" || d.kind === "approval"
      ? d.token
      : d.kind === "transfer" && d.token !== "native"
        ? d.token
        : undefined;
  if (!token || isZero(token.address)) return partial;
  if (token.decimals !== undefined && token.symbol) return partial; // already known

  const [decimals, symbol] = await Promise.all([
    token.decimals === undefined ? fetchDecimals(client, token.address) : Promise.resolve(token.decimals),
    token.symbol ? Promise.resolve(token.symbol) : fetchSymbol(client, token.address),
  ]);

  const merged: TokenInfo = { ...token, decimals: decimals ?? token.decimals, symbol: symbol ?? token.symbol };
  if (d.kind === "permit" || d.kind === "approval" || d.kind === "transfer") {
    return { ...partial, details: { ...d, token: merged } };
  }
  return partial;
}

async function fetchHasCode(client: PublicClient, address: Address): Promise<boolean | undefined> {
  try {
    const code = await client.getCode({ address });
    return code !== undefined && code !== "0x" && code.length > 2;
  } catch {
    return undefined;
  }
}

async function fetchDecimals(client: PublicClient, address: Address): Promise<number | undefined> {
  try {
    return Number(await client.readContract({ address, abi: [ERC20_DECIMALS], functionName: "decimals" }));
  } catch {
    return undefined;
  }
}

// Symbols are short (USDC, WETH). The token contract is attacker-chosen, so a
// hostile symbol() could return megabytes — bound it before it reaches the UI.
const MAX_SYMBOL_CHARS = 32;

async function fetchSymbol(client: PublicClient, address: Address): Promise<string | undefined> {
  try {
    const s = await client.readContract({ address, abi: [ERC20_SYMBOL], functionName: "symbol" });
    if (typeof s !== "string" || s.length === 0) return undefined;
    return s.length > MAX_SYMBOL_CHARS ? s.slice(0, MAX_SYMBOL_CHARS) : s;
  } catch {
    return undefined;
  }
}

function isZero(addr?: string): boolean {
  return !addr || addr.toLowerCase() === ZERO_ADDRESS;
}
