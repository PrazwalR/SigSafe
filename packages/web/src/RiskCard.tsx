import type { DecodedIntent, RiskFlag } from "@sigsafe/core";

export function RiskCard({ intent }: { intent: DecodedIntent }) {
  return (
    <section className="card" data-risk={intent.risk}>
      <div className="card-head">
        <span className="badge">{intent.risk}</span>
        <div className="tags">
          <span className="tag">{intent.action}</span>
          <span className="tag muted">{intent.inputType}</span>
          {intent.chainId !== undefined && <span className="tag muted">chain {intent.chainId}</span>}
        </div>
      </div>

      <p className="summary">{intent.summary}</p>

      {intent.flags.length > 0 ? (
        <ul className="flags">
          {intent.flags.map((f) => (
            <FlagRow key={f.id} flag={f} />
          ))}
        </ul>
      ) : (
        <p className="no-flags">No risk flags raised.</p>
      )}

      <Details details={intent.details} />
    </section>
  );
}

function FlagRow({ flag }: { flag: RiskFlag }) {
  return (
    <li className="flag" data-severity={flag.severity}>
      <div className="flag-top">
        <span className="dot" />
        <strong>{flag.title}</strong>
        <span className="sev">{flag.severity}</span>
        {flag.confidence && <span className="conf">confidence: {flag.confidence}</span>}
      </div>
      <p className="flag-msg">{flag.message}</p>
      {flag.advice && <p className="flag-advice">↳ {flag.advice}</p>}
    </li>
  );
}

function Details({ details }: { details: DecodedIntent["details"] }) {
  const rows = flatten(details);
  if (rows.length === 0) return null;
  return (
    <table className="details">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className="k">{k}</td>
            <td className="v">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Flatten an intent's details into printable key/value pairs (bigint-safe). */
function flatten(details: DecodedIntent["details"]): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(details as unknown as Record<string, unknown>)) {
    if (key === "kind" || value === undefined) continue;
    if (value !== null && typeof value === "object") {
      // e.g. the nested TokenInfo
      const inner = Object.entries(value as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .map(([ik, iv]) => `${ik}: ${stringify(iv)}`)
        .join(", ");
      out.push([key, inner || "{}"]);
    } else {
      out.push([key, stringify(value)]);
    }
  }
  return out;
}

function stringify(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
