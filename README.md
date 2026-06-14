<div align="center">

# sigsafe

**Open-source signature & transaction decoder for EVM wallets.**

Takes any raw transaction, EIP-712 typed-data payload, or token approval and returns a plain-English, structured breakdown of exactly what it will do — with risk flags — **before** you sign.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-70%20passing-brightgreen.svg)](#testing)
[![Package](https://img.shields.io/badge/%40sigsafe%2Fcore-0.1.0-blue.svg)](./packages/core)

</div>

---

## Table of contents

- [The problem: blind signing](#the-problem-blind-signing)
- [Classic attacks, decoded](#classic-attacks-decoded)
- [Why existing tooling falls short](#why-existing-tooling-falls-short)
- [How sigsafe mitigates it](#how-sigsafe-mitigates-it)
- [Core concepts in depth](#core-concepts-in-depth)
- [The risk rules](#the-risk-rules)
- [Install & usage](#install--usage)
- [Architecture](#architecture)
- [Security](#security)
- [Honest limitations](#honest-limitations)
- [Roadmap](#roadmap)

---

## The problem: blind signing

In 2025, signature phishing drained **$83.85M across 106,106 victims**. The dominant attack is not a stolen private key — it is a **signature the victim approved themselves**, because they could not read what it did.

A wallet that asks you to sign one of these typically shows an opaque hex blob or an under-explained typed-data prompt:

```
Sign this message?

Permit
owner:    0x1a2b…
spender:  0x9f8e…
value:    115792089237316195423570985008687907853269984665640564039457584007913129639935
nonce:    0
deadline: 1799999999
```

Almost nobody recognises that `value: 115792089237316195423570985008687907853269984665640564039457584007913129639935` is `2²⁵⁶ − 1` — **unlimited** — and that `spender: 0x9f8e…` is a stranger's wallet. Sign it, and the attacker can move **all** of that token out of your wallet, now and forever, in a single later transaction. No further confirmation. No gas paid by you at signing time, so nothing looks like it happened.

This is **blind signing**: the data is technically visible, but not *legible*. sigsafe makes it legible.

---

## Classic attacks, decoded

These are the four patterns that account for the overwhelming majority of signature-phishing losses. For each: what the attacker presents, why it is dangerous, and what `sigsafe` returns.

### 1. The unlimited `Permit` (EIP-2612) — the #1 drainer

**What you're asked to sign** (an `eth_signTypedData_v4` payload):

```json
{
  "domain": { "name": "USD Coin", "chainId": 1, "verifyingContract": "0xA0b8…eB48" },
  "primaryType": "Permit",
  "message": {
    "owner":    "0xYourWallet…",
    "spender":  "0x9f8e…dead",
    "value":    "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    "nonce":    "0",
    "deadline": "1799999999"
  }
}
```

**Why it's lethal:** a `Permit` is an *off-chain* approval. Signing it costs no gas and creates no on-chain trace — so the victim sees nothing happen and moves on. The attacker now holds a signature that grants unlimited spend rights, which they redeem whenever they like.

**What sigsafe returns:**

```
summary: Off-chain permit (no gas): let 0x9f8e…dead spend UNLIMITED USD Coin from your wallet.
action : PERMIT          risk: CRITICAL
flags  : unlimited-approval (CRITICAL / high)
```

### 2. Permit2 (`PermitSingle` / `PermitBatch`)

Uniswap's [Permit2](https://github.com/Uniswap/permit2) standardises approvals across tokens. Drainers abuse it because a single signature can grant allowances on **many** tokens at once (`PermitBatch`), and the amount uses a `uint160` ceiling rather than `uint256` — so the naïve "is it max-uint256?" check misses it.

sigsafe applies the **correct per-standard ceiling**: a `uint160`-max Permit2 amount IS flagged unlimited; the same value under an ERC-20 approval is NOT (because there it's a normal, bounded number).

### 3. `setApprovalForAll` — the NFT collection drain

```solidity
setApprovalForAll(operator = 0x9f8e…dead, approved = true)
```

One call hands `operator` the right to transfer **every NFT in the collection**, current and future. Fake "claim your airdrop" / "verify your wallet" sites farm these.

```
summary: Approve 0x9f8e…dead to transfer ANY NFT from this collection.
action : SET_APPROVAL_FOR_ALL     risk: CRITICAL
flags  : setapprovalforall (CRITICAL / high)
```

### 4. EIP-7702 delegation — the post-Pectra account takeover

After the Pectra upgrade, an EOA can sign an **authorization** that sets its account code to a contract — [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702). Useful for account abstraction; catastrophic when phished. Signing a malicious authorization doesn't grant *one token* — it hands the attacker the ability to **execute as your account**, persistently, draining everything until revoked.

```
summary: Delegate full control of your account to 0xC0DE…dead. This contract will be able to act as you.
action : DELEGATION     risk: CRITICAL
flags  : eip7702-delegation (CRITICAL / high)
```

sigsafe decodes the authorization tuple and, when the signature is present, **recovers the authorizing EOA** via viem's native 7702 utilities — so you can confirm *which* account is being delegated.

---

## Why existing tooling falls short

| | The gap |
| --- | --- |
| **It's all proprietary** | The tools that decode this risk well — Blockaid, Web3Firewall, Hypernative — are closed-source and enterprise-priced. There is no clean, MIT-licensed, **embeddable** library a developer can drop into their own wallet, dApp, or bot. |
| **Wallets still blind-sign** | Many wallets render typed data as near-raw fields. "value: 1157…935" is shown, but not *explained*. |
| **Simulation can be spoofed** | Some drainers defeat transaction simulation — they fabricate simulation results, so the user sees a benign preview while signing something malicious. A simulator that trusts an RPC can be lied to. |

---

## How sigsafe mitigates it

sigsafe decodes the **static structure of the payload itself** — the actual bytes you are about to sign. There is no RPC round-trip to spoof and no simulation to fake. **The signature *is* the data, and the data doesn't lie.**

Everything flows through one pipeline:

```
                                 sigsafe
   Raw input            ┌───────────────────────────┐         DecodedIntent
┌──────────────┐        │ 1. detect   input type    │      ┌──────────────────┐
│ • EIP-712    │        │ 2. parse    structure     │      │ summary: "…"     │
│ • Permit/2   │ ─────► │ 3. classify action        │ ───► │ action:  PERMIT  │
│ • EIP-7702   │        │ 4. flag     risk rules    │      │ risk:    CRITICAL│
│ • raw tx     │        │ 5. explain  plain English │      │ flags:   [ … ]   │
│ • calldata   │        │   (+ optional RPC enrich) │      │ details: { … }   │
│ • message    │        └───────────────────────────┘      └──────────────────┘
└──────────────┘
```

The **same `DecodedIntent` shape** comes out regardless of input type. A wallet renders it as a warning screen; a bot checks `risk` and aborts; a CI pipeline exits non-zero on `CRITICAL`.

> This is harm-reduction, not a firewall. A decoder tells you *what* a payload is, not every downstream effect of executing it. Pair it with simulation for full coverage — sigsafe handles the half that simulation can't be trusted for.

---

## Core concepts in depth

### `parse → classify → flag → explain`

1. **Detect** — Is this raw transaction hex? Calldata? EIP-712 typed data? A 7702 authorization? A personal_sign message? Detection is heuristic on shape (object keys, hex prefixes, RLP probing via viem). Because a hex-encoded `personal_sign` message is byte-identical to calldata, callers can pass an explicit `inputType` to remove the ambiguity (a wallet always knows the signing method).
2. **Parse** — Route to the matching parser, which pulls out the structured fields (token, spender, amount, deadline, delegate target, …). Parsers **never throw out** to the caller; a parse failure degrades to an `UNKNOWN` intent with a `WARNING`.
3. **Classify** — Map the decoded data to an `Action` (`PERMIT`, `TOKEN_APPROVAL`, `DELEGATION`, `SET_APPROVAL_FOR_ALL`, `OWNERSHIP_TRANSFER`, `TOKEN_TRANSFER`, `NATIVE_TRANSFER`, `MESSAGE_SIGN`, `CONTRACT_CALL`, …).
4. **Flag** — Run every risk rule over the structured intent. Each rule is independent and wrapped so one failing rule can never break the decode.
5. **Explain** — Produce one plain-English `summary` safe to show a user directly.

### `DecodedIntent` — the contract

```ts
interface DecodedIntent {
  summary: string;        // one sentence, safe to show a user
  action: Action;         // PERMIT | TOKEN_APPROVAL | DELEGATION | …
  risk: RiskLevel;        // SAFE | INFO | WARNING | CRITICAL (max across all flags)
  flags: RiskFlag[];      // every risk raised, sorted by severity descending
  inputType: InputType;   // what kind of payload was decoded
  details: IntentDetails; // structured data, discriminated by `kind`
  raw: string;            // the input echoed back (bounded)
  chainId?: number;
}
```

### `RiskLevel` — the severity ladder

| Level | Meaning |
| --- | --- |
| `SAFE` | Nothing suspicious. |
| `INFO` | Worth noting, not dangerous. |
| `WARNING` | Be careful, verify the details. |
| `CRITICAL` | High probability of fund loss — do not sign blindly. |

The overall `risk` is the **maximum** severity across all flags. No flags → `SAFE`.

### `confidence` — the alert-fatigue fix

Every `RiskFlag` carries a `confidence` of `"low" | "medium" | "high"`. This is deliberate: anti-phishing tools die from **false positives**. If every prompt screams CRITICAL, users learn to click through. Confidence lets a consumer tune its own threshold:

- a **wallet** shows everything, styling by severity;
- a **bot** blocks only `CRITICAL` + `high` and lets `medium` through;
- a **CI pipeline** picks its own bar.

### Offline vs online

sigsafe works **fully offline** from static data. Provide an `rpcUrl` to unlock two best-effort enrichments — both fail-safe, so a dead or slow RPC never breaks a decode:

- **`permit-to-eoa`** — `eth_getCode` on the spender reveals whether it's a contract or a personal wallet. An approval to a personal wallet is a near-certain drainer (legitimate spenders are always contracts). This is the single strongest structural signal, and it needs an RPC to fire.
- **Token metadata** — `symbol()` / `decimals()` give accurate amounts and labels. Without it, bounded amounts are reported honestly in **base units** rather than silently assuming 18 decimals (which would misreport a USDC amount by a factor of 10¹²).

---

## The risk rules

| Rule | Catches | Severity |
| --- | --- | --- |
| `known-drainer` | spender/delegate/recipient on a blocklist (or your `customBlocklist`) | CRITICAL |
| `eip7702-delegation` | any EIP-7702 account delegation | CRITICAL |
| `permit-to-eoa` | approval/permit to a wallet, not a contract *(needs `rpcUrl`)* | CRITICAL |
| `unlimited-approval` | max-uint approval/permit | CRITICAL / WARNING |
| `setapprovalforall` | collection-wide NFT approval | CRITICAL / WARNING |
| `ownership-transfer` | `transferOwnership` / `renounceOwnership` | WARNING |
| `chain-mismatch` | typed-data `chainId` ≠ the chain you're on *(needs explicit `chainId`)* | CRITICAL |
| `unknown-spender` | bounded approval to an unlabelled address | WARNING / INFO |
| `expired-deadline` / `far-future-deadline` | permit deadline sanity | INFO |
| `zero-address` | transfer/approval to `0x0` | WARNING |
| `blind-hash-sign` | `personal_sign` of a raw 32-byte hash (unreadable) | WARNING |

Severities that show two values escalate based on context — e.g. an unlimited approval to a **recognised** router is `WARNING`, but to an **unknown** address it's `CRITICAL`.

---

## Install & usage

```bash
npm install @sigsafe/core
```

```ts
import { decode } from "@sigsafe/core";

const intent = await decode(payload, { chainId: 1 });

if (intent.risk === "CRITICAL") {
  // block the signature, show intent.summary + intent.flags
}
```

`decode()` accepts: EIP-712 typed data (object or JSON string), EIP-2612 / DAI / Permit2 permits, EIP-7702 authorizations, raw transactions (`0x02…`, legacy), calldata, raw-transaction objects, and `personal_sign` messages. It **never throws** on malformed input — it returns an `UNKNOWN` intent with a parse-error flag instead.

Full API docs: [`packages/core/README.md`](./packages/core/README.md).

---

## Architecture

```
sigsafe/                         # pnpm monorepo
├── packages/
│   ├── core/                    # @sigsafe/core — the engine (TypeScript, published)
│   │   └── src/
│   │       ├── index.ts         # public API: decode()
│   │       ├── detect/          # input-type detection
│   │       ├── parsers/         # transaction, eip712, permit, eip7702, personal-sign
│   │       ├── classify/        # decoded data → Action
│   │       ├── risk/            # engine + one file per rule
│   │       ├── enrich/          # optional RPC enrichment (code + token metadata)
│   │       ├── explain/         # humanize → plain English
│   │       └── registry/        # known-good labels, drainer blocklist, selectors
│   └── cli/                     # @sigsafe/cli — command-line tool (in progress)
└── …
```

**Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), [viem](https://viem.sh) `^2.52` (used for typed-data hashing, transaction parsing, and **native EIP-7702 authorization recovery**), tsup (ESM + CJS + types), vitest, pnpm.

---

## Security

sigsafe ingests **attacker-controlled input by definition** — the whole point is to feed it the thing you don't trust. Input robustness is therefore the core security property. The engine is built to **fail closed**: a parse error, a throwing rule, or a dead RPC degrades to a louder warning, never a silent crash or a false "safe".

A full audit, threat model, and responsible-disclosure policy live in [`SECURITY.md`](./SECURITY.md). Summary of the design guarantees:

- `decode()` never throws and never hangs on hostile input (size-bounded, fail-closed).
- Every risk rule is sandboxed — one failing rule cannot suppress the others.
- No dynamic property writes from attacker keys (no prototype-pollution sink).
- Attacker-influenced strings (`raw` echo, on-chain `symbol()`) are length-bounded.

---

## Honest limitations

1. **A decoder is not a simulator.** sigsafe reports what a payload *is*, not every downstream effect. A call into a malicious contract can look benign at the selector level. Pair with simulation.
2. **The blocklist is reactive.** A brand-new drainer address won't be on any list. The **structural** rules (`permit-to-eoa`, `unlimited-approval`) are the real defence; the blocklist is a bonus.
3. **It cannot stop a determined user.** If someone reads "CRITICAL: unlimited approval to unknown wallet" and signs anyway, the loss still happens.
4. **`permit-to-eoa` needs an RPC.** Offline, the strongest rule can't confirm EOA-vs-contract and stays silent.
5. **Not a substitute for hardware wallets or multisig.** sigsafe protects the moment of signing, not compromised keys or malicious RPC endpoints.

---

## Roadmap

- [x] `@sigsafe/core` — engine, parsers, risk rules, humanizer
- [ ] `@sigsafe/cli` — `sigsafe decode`, clipboard `watch`, CI `check`
- [ ] `@sigsafe/react` — drop-in `<SignatureGuard>` modal + `useDecode` hook
- [ ] `data/known-drainers.json` — community-maintained blocklist
- [ ] Rust crate for high-throughput backend screening

---

## License

MIT © [Prazwal Ratti](https://github.com/PrazwalR)
