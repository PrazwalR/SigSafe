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

  const res = await fetchCode(client, target);
  if (!res) return partial; // RPC failed — leave hints unresolved
  const cls = classifyCode(res.code);

  if (d.kind === "permit" || d.kind === "approval") {
    return {
      ...partial,
      details: { ...d, spenderHasCode: cls.isContract, spenderIsEoa: cls.isEoa, spenderIs7702: cls.is7702 },
    };
  }
  if (d.kind === "delegation") {
    return { ...partial, details: { ...d, delegateHasCode: cls.isContract } };
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

export interface CodeClass {
  /** No real contract code — a personal/externally-owned wallet. */
  isEoa: boolean;
  /** Real deployed contract code. */
  isContract: boolean;
  /** An EIP-7702 delegated EOA: has code, but it's a 0xef0100|address designator, not a contract. */
  is7702: boolean;
}

/**
 * Classify the result of eth_getCode. Two subtleties this gets right:
 *  - viem returns `undefined` when an account has NO code — that's a plain EOA
 *    (the #1 drainer target), not "unknown". Unknown is handled before we get
 *    here (fetchCode returns null on RPC failure).
 *  - Post-Pectra, a 7702-delegated EOA has a 23-byte `0xef0100 || address`
 *    designator. That is still a *wallet*, not a contract — treating "has any
 *    code" as "safe contract" would let a drainer hide behind a delegated EOA.
 */
export function classifyCode(code: string | undefined): CodeClass {
  if (code === undefined) return { isEoa: true, isContract: false, is7702: false };
  const c = code.toLowerCase();
  if (c === "0x" || c.length <= 2) return { isEoa: true, isContract: false, is7702: false };
  // 0xef0100 (3 bytes) + 20-byte address = 23 bytes = 48 hex chars including "0x".
  if (c.startsWith("0xef0100") && c.length === 48) return { isEoa: true, isContract: false, is7702: true };
  return { isEoa: false, isContract: true, is7702: false };
}

/** Returns null only when the RPC call itself fails — distinct from "no code" (undefined). */
async function fetchCode(client: PublicClient, address: Address): Promise<{ code: string | undefined } | null> {
  try {
    return { code: await client.getCode({ address }) };
  } catch {
    return null;
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
