import { useState } from "react";
import { decode } from "@sigsafe/core";
import type { DecodedIntent } from "@sigsafe/core";
import { EXAMPLES } from "./examples";
import { RiskCard } from "./RiskCard";

const CHAINS = [
  { id: 1, name: "Ethereum" },
  { id: 8453, name: "Base" },
  { id: 42161, name: "Arbitrum" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
];

export function App() {
  const [input, setInput] = useState("");
  const [chainId, setChainId] = useState(1);
  const [result, setResult] = useState<DecodedIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run(value: string, exampleNote?: string) {
    const payload = value.trim();
    if (!payload) return;
    setBusy(true);
    setNote(exampleNote ?? null);
    try {
      // offline: everything runs in the browser, nothing is sent anywhere.
      const r = await decode(payload, { chainId, offline: true });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  function loadExample(value: string, exampleNote: string) {
    setInput(value);
    void run(value, exampleNote);
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>
          sig<span className="accent">safe</span>
        </h1>
        <p className="tagline">See exactly what a signature does — before you sign it.</p>
        <p className="privacy">🔒 Runs entirely in your browser. Nothing is sent anywhere.</p>
      </header>

      <section className="examples">
        <span className="examples-label">Try an attack:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex.id} className="chip" title={ex.note} onClick={() => loadExample(ex.value, ex.note)}>
            {ex.label}
          </button>
        ))}
      </section>

      <section className="panel">
        <textarea
          className="input"
          spellCheck={false}
          placeholder="Paste a raw transaction, calldata, EIP-712 typed data, a permit, or an EIP-7702 authorization…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="controls">
          <label className="chain">
            Chain
            <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </label>
          <button className="decode" disabled={busy || input.trim().length === 0} onClick={() => run(input)}>
            {busy ? "Decoding…" : "Decode"}
          </button>
        </div>
      </section>

      {note && <p className="example-note">{note}</p>}

      {result && <RiskCard intent={result} />}

      <footer className="footer">
        Powered by{" "}
        <a href="https://www.npmjs.com/package/@sigsafe/core" target="_blank" rel="noreferrer">
          @sigsafe/core
        </a>{" "}
        · MIT · a decoder, not a firewall — harm reduction, not a guarantee.
      </footer>
    </div>
  );
}
