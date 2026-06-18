import type { CSSProperties } from "react";
import type { DecodeOptions, RiskFlag, RiskLevel } from "@sigsafe/core";
import { useDecode } from "./useDecode";

export interface SignatureGuardProps {
  /** The payload about to be signed (typed data, permit, calldata, tx, 7702 auth, message). */
  payload: string | object;
  /** Decode options forwarded to @sigsafe/core (chainId, rpcUrl, offline, customBlocklist, …). */
  options?: DecodeOptions;
  /** Render nothing when false. Default: true. */
  open?: boolean;
  /** Disable the confirm button when risk is CRITICAL. Default: true. */
  blockOnCritical?: boolean;
  /** Heading shown at the top of the modal. */
  title?: string;
  /** Called when the user confirms (only reachable when not blocked). */
  onConfirm: () => void;
  /** Called when the user cancels or dismisses. */
  onCancel: () => void;
}

const RISK_COLOR: Record<RiskLevel, string> = {
  SAFE: "#2ecc71",
  INFO: "#4f9cff",
  WARNING: "#f5a623",
  CRITICAL: "#ff4d4f",
} as Record<RiskLevel, string>;

/**
 * Drop-in modal that decodes a payload and shows a risk-graded warning before
 * the user signs. Wrap your wallet/dApp signing flow with it. Self-contained
 * styling — no CSS import required.
 */
export function SignatureGuard({
  payload,
  options,
  open = true,
  blockOnCritical = true,
  title = "Review before signing",
  onConfirm,
  onCancel,
}: SignatureGuardProps) {
  const { intent, isLoading } = useDecode(payload, options ?? {});

  if (!open) return null;

  const risk = intent?.risk;
  const accent = risk ? RISK_COLOR[risk] : "#8a93a6";
  const blocked = blockOnCritical && risk === "CRITICAL";

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div style={{ ...styles.modal, borderTop: `4px solid ${accent}` }}>
        <div style={styles.header}>{title}</div>

        {isLoading || !intent ? (
          <div style={styles.loading}>Decoding…</div>
        ) : (
          <>
            <div style={styles.badgeRow}>
              <span style={{ ...styles.badge, background: accent, color: risk === "WARNING" ? "#0b0e14" : "#fff" }}>
                {risk}
              </span>
              <span style={styles.action}>{intent.action}</span>
            </div>

            <p style={styles.summary}>{intent.summary}</p>

            {intent.flags.length > 0 && (
              <div style={styles.flags}>
                {intent.flags.map((flag) => (
                  <FlagRow key={flag.id} flag={flag} />
                ))}
              </div>
            )}

            <div style={styles.actions}>
              <button style={styles.cancel} onClick={onCancel}>
                Cancel
              </button>
              <button
                style={{ ...styles.confirm, background: accent, opacity: blocked ? 0.45 : 1 }}
                onClick={onConfirm}
                disabled={blocked}
              >
                {blocked ? "Blocked — too risky" : "Sign"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FlagRow({ flag }: { flag: RiskFlag }) {
  const color = RISK_COLOR[flag.severity] ?? "#8a93a6";
  return (
    <div style={styles.flag}>
      <div style={styles.flagTop}>
        <span style={{ ...styles.dot, background: color }} />
        <strong style={styles.flagTitle}>{flag.title}</strong>
        <span style={styles.flagSev}>{flag.severity}</span>
      </div>
      <div style={styles.flagMsg}>{flag.message}</div>
      {flag.advice && <div style={styles.flagAdvice}>↳ {flag.advice}</div>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5, 8, 14, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2147483647,
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: "min(440px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 64px)",
    overflowY: "auto",
    background: "#141925",
    color: "#e6e9ef",
    borderRadius: 14,
    padding: 20,
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  header: { fontSize: 14, fontWeight: 600, color: "#8a93a6", marginBottom: 12 },
  loading: { padding: "24px 0", textAlign: "center", color: "#8a93a6" },
  badgeRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  badge: { fontSize: 12, fontWeight: 700, letterSpacing: 0.5, padding: "3px 10px", borderRadius: 6 },
  action: {
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    color: "#8a93a6",
    border: "1px solid #283041",
    padding: "3px 8px",
    borderRadius: 6,
  },
  summary: { fontSize: 16, lineHeight: 1.5, margin: "0 0 14px" },
  flags: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  flag: { background: "#1b2230", border: "1px solid #283041", borderRadius: 10, padding: "10px 12px" },
  flagTop: { display: "flex", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  flagTitle: { fontSize: 14 },
  flagSev: { fontSize: 11, fontWeight: 700, color: "#8a93a6", marginLeft: "auto" },
  flagMsg: { fontSize: 13, lineHeight: 1.5, marginTop: 6 },
  flagAdvice: { fontSize: 12.5, color: "#8a93a6", marginTop: 4 },
  actions: { display: "flex", gap: 10, justifyContent: "flex-end" },
  cancel: {
    background: "transparent",
    color: "#e6e9ef",
    border: "1px solid #283041",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    cursor: "pointer",
  },
  confirm: { color: "#fff", border: 0, borderRadius: 8, padding: "9px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
