"use client";

import { useState } from "react";
import { Buffer } from "buffer";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { explorerAddress, explorerTx } from "../lib/anchor";
import type { MarketKind } from "../lib/markets";

// The piece other apps don't show: the on-chain settlement proof. The digest is
// a SHA-256 commitment the program verified against the TxODDS-confirmed result,
// so anyone can recompute settlement — and this component does it, in the
// browser, on click. For score markets the preimage is "market_id:home:away",
// so recomputing also *recovers the final score* from the digest alone.
const sha256Hex = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
};

interface Verified {
  ok: boolean;
  preimage?: string;
  score?: string;
  txSig?: string | null;
}

export function SettlementProof({
  winner,
  digest,
  marketPubkey,
  marketId,
  kind,
}: {
  winner: "YES" | "NO";
  digest: number[];
  marketPubkey?: string;
  marketId: string;
  kind: MarketKind;
}) {
  const { connection } = useConnection();
  const hex = Buffer.from(digest).toString("hex");
  const href = marketPubkey ? explorerAddress(marketPubkey) : undefined;
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<Verified | null>(null);

  const preimageTemplate =
    kind === "custom" ? `${marketId}:${winner}` : `${marketId}:<home>:<away>`;

  // Recompute the digest client-side. Custom markets hash "market_id:YES|NO";
  // score markets brute-force the scoreline (0..15 goals each side), which both
  // checks the commitment and recovers the final score from it.
  async function recompute(): Promise<Verified> {
    if (kind === "custom") {
      const pre = `${marketId}:${winner}`;
      return (await sha256Hex(pre)) === hex ? { ok: true, preimage: pre } : { ok: false };
    }
    for (let h = 0; h <= 15; h++) {
      for (let a = 0; a <= 15; a++) {
        const pre = `${marketId}:${h}:${a}`;
        if ((await sha256Hex(pre)) === hex) return { ok: true, preimage: pre, score: `${h}–${a}` };
      }
    }
    return { ok: false };
  }

  // Best-effort: find the settle transaction in the market account's history
  // (the one that ran PostResult / PostCustomResult). Public devnet RPC can
  // rate-limit; the proof verdict above never depends on this.
  async function findSettleTx(): Promise<string | null> {
    if (!marketPubkey) return null;
    try {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(marketPubkey), { limit: 15 });
      for (const s of sigs) {
        const tx = await connection.getTransaction(s.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        const logs = tx?.meta?.logMessages?.join("\n") ?? "";
        if (logs.includes("Instruction: PostResult") || logs.includes("Instruction: PostCustomResult"))
          return s.signature;
      }
    } catch {
      /* explorer link on the market covers this */
    }
    return null;
  }

  async function verify() {
    setBusy(true);
    try {
      const result = await recompute();
      result.txSig = result.ok ? await findSettleTx() : null;
      setVerified(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="proof">
      <div className="proof-head">
        <span className="proof-label">✓ Settled on-chain</span>
        <span className={`pill ${winner === "YES" ? "pill-yes" : "pill-no"}`}>{winner} won</span>
      </div>
      <div className="proof-digest">
        <span>result digest</span>
        <code title={hex}>
          {hex.slice(0, 18)}…{hex.slice(-6)}
        </code>
      </div>
      <div className="proof-digest">
        <span>preimage</span>
        <code title={verified?.preimage ?? preimageTemplate}>{verified?.preimage ?? preimageTemplate}</code>
      </div>

      {verified === null ? (
        <button className="btn proof-verify" disabled={busy} onClick={verify}>
          {busy ? "Recomputing…" : "Recompute proof in browser"}
        </button>
      ) : verified.ok ? (
        <div className="proof-result proof-ok">
          ✓ sha256(&quot;{verified.preimage}&quot;) matches the on-chain digest
          {verified.score && (
            <>
              {" "}
              — final score <strong>{verified.score}</strong>, recovered from the digest alone
            </>
          )}
        </div>
      ) : (
        <div className="proof-result proof-bad">✕ digest did not match — settlement would be disputable</div>
      )}

      <div className="proof-links">
        {verified?.txSig && (
          <a className="proof-link" href={explorerTx(verified.txSig)} target="_blank" rel="noopener noreferrer">
            Settle transaction ↗
          </a>
        )}
        {href && (
          <a className="proof-link" href={href} target="_blank" rel="noopener noreferrer">
            Market on Explorer ↗
          </a>
        )}
      </div>
    </div>
  );
}
