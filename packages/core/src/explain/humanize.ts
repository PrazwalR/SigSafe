import { Action } from "../types.js";
import type { PartialIntent } from "../types.js";
import { describeAmount, formatAmount, shorten } from "../util/format.js";

/** Turn a decoded intent into one plain-English sentence safe to show a user. */
export function humanize(partial: PartialIntent): string {
  const d = partial.details;

  switch (d.kind) {
    case "permit": {
      const amt = d.isUnlimited ? "UNLIMITED" : describeAmount(d.amount, d.token.decimals);
      const sym = d.token.symbol ?? "tokens";
      const who = d.spenderLabel ?? shorten(d.spender);
      return `Off-chain permit (no gas): let ${who} spend ${amt} ${sym} from your wallet.`;
    }

    case "approval": {
      const who = d.spenderLabel ?? shorten(d.spender);
      if (partial.action === Action.SET_APPROVAL_FOR_ALL) {
        return d.isUnlimited
          ? `Approve ${who} to transfer ANY NFT from this collection.`
          : `Revoke ${who}'s approval for this NFT collection.`;
      }
      const amt = d.isUnlimited ? "UNLIMITED" : describeAmount(d.amount, d.token.decimals);
      const sym = d.token.symbol ?? "tokens";
      return `Approve ${who} to spend ${amt} ${sym}.`;
    }

    case "delegation": {
      const who = d.delegateLabel ?? shorten(d.delegateTo);
      return `Delegate full control of your account to ${who}. This contract will be able to act as you.`;
    }

    case "transfer": {
      const sym = d.token === "native" ? "ETH" : (d.token.symbol ?? "tokens");
      const amt = d.token === "native" ? formatAmount(d.amount, 18) : describeAmount(d.amount, d.token.decimals);
      return `Send ${amt} ${sym} to ${shorten(d.recipient)}.`;
    }

    case "swap":
      return `Swap ${formatAmount(d.amountIn, d.tokenIn.decimals)} ${d.tokenIn.symbol ?? "tokens"} for at least ${formatAmount(d.minOut, d.tokenOut.decimals)} ${d.tokenOut.symbol ?? "tokens"} via ${d.routerLabel ?? "a DEX"}.`;

    case "call": {
      if (partial.action === Action.OWNERSHIP_TRANSFER) {
        const newOwner = d.decodedArgs?.newOwner;
        return newOwner === undefined
          ? `Renounce ownership of ${d.toLabel ?? shorten(d.to)} — admin control is given up permanently.`
          : `Transfer ownership of ${d.toLabel ?? shorten(d.to)} to ${shorten(String(newOwner))}.`;
      }
      const fn = d.functionSignature?.match(/function\s+(\w+)/)?.[1] ?? d.functionSignature?.split("(")[0];
      return fn
        ? `Call ${fn}() on ${d.toLabel ?? shorten(d.to)}.`
        : `Call an unknown function (${d.selector}) on ${shorten(d.to)}.`;
    }

    case "batch": {
      const n = d.calls.length;
      if (n === 0) return `Batched call (${d.aggregator}) with no decodable inner actions.`;
      const parts = d.calls.map((c, i) => `${i + 1}) ${humanize(c)}`);
      const tail = d.truncated ? " (list truncated)" : "";
      return `Batched ${n} action${n > 1 ? "s" : ""} via ${d.aggregator}${tail}: ${parts.join("  ")}`;
    }

    case "message": {
      if (d.looksLikeHash) {
        return "Sign an unreadable 32-byte hash. You cannot see what it authorises — verify the source.";
      }
      if (d.isSiwe) return "Sign in to a dApp (Sign-In with Ethereum). No funds move.";
      if (d.text !== undefined) {
        const preview = d.text.length > 120 ? `${d.text.slice(0, 117)}…` : d.text;
        return `Sign a text message: “${preview.replace(/\s+/g, " ").trim()}”. No funds move from signing alone.`;
      }
      return `Sign a ${d.byteLength}-byte message. No funds move from signing alone.`;
    }

    case "raw":
      return d.to
        ? `Sign a structured (typed-data) message for ${shorten(d.to)}. No specific decoder matched — verify it carefully.`
        : "Unrecognised payload. Verify carefully before signing.";

    default:
      return "Unrecognised action. Verify carefully before signing.";
  }
}
