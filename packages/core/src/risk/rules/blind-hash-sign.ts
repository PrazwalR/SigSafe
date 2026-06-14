import type { RiskRule } from "../engine.js";
import { RiskLevel } from "../../types.js";

/**
 * A personal_sign message that is just a raw 32-byte hash with no readable
 * text. You cannot see what you are authorising — the hash could be a UserOp,
 * an order, or a transaction digest. Legitimate logins are readable text.
 */
export const blindHashSignRule: RiskRule = (partial) => {
  if (partial.details.kind !== "message") return null;
  if (!partial.details.looksLikeHash) return null;

  return {
    id: "blind-hash-sign",
    severity: RiskLevel.WARNING,
    title: "Signing an unreadable hash",
    message:
      "This asks you to sign a raw 32-byte hash, not a readable message. You cannot tell what it authorises — it may be a transaction, order, or account-operation digest.",
    advice: "Only sign opaque hashes from apps you trust. A login request should be readable text, not a hash.",
    confidence: "medium",
  };
};
