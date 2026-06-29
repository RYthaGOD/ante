"use client";

import { Buffer } from "buffer";
import { explorerAddress } from "../lib/anchor";

// The piece other apps don't show: the on-chain settlement proof. The digest is
// a SHA-256 commitment the feeder posted and the program verified against the
// TxODDS-confirmed result, so settlement is auditable rather than "trust us".
export function SettlementProof({
  winner,
  digest,
  marketPubkey,
}: {
  winner: "YES" | "NO";
  digest: number[];
  marketPubkey?: string;
}) {
  const hex = Buffer.from(digest).toString("hex");
  const href = marketPubkey ? explorerAddress(marketPubkey) : undefined;
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
      <div className="proof-note">
        SHA-256 commitment verified on-chain against the TxODDS-confirmed result.
      </div>
      {href && (
        <a className="proof-link" href={href} target="_blank" rel="noopener noreferrer">
          View on Solana Explorer ↗
        </a>
      )}
    </div>
  );
}
