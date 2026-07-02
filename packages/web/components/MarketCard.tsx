"use client";

import { useEffect, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { getProgram, getReadonlyProgram, betPda } from "../lib/anchor";
import { metaById, kindLabel, MarketKind } from "../lib/markets";
import { artFor } from "../lib/art";
import { ArtImage } from "./Art";
import { SettlementProof } from "./SettlementProof";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MarketCard({ market, onChange }: { market: any; onChange: () => Promise<void> }) {
  const account = market.account;
  const meta = metaById(account.marketId);
  const art = artFor(meta?.art);
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The outcome byte THIS wallet can claim: a winning bet on a resolved market,
  // or either side's stake refund on a voided one. null = nothing to claim.
  const [claimOutcome, setClaimOutcome] = useState<number | null>(null);

  const yes = account.poolYes.toNumber() / LAMPORTS_PER_SOL;
  const no = account.poolNo.toNumber() / LAMPORTS_PER_SOL;
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((100 * yes) / total) : 50;
  // Parimutuel preview: after your stake joins the pool, winners split the
  // whole pot pro-rata — payout = stake * (total + stake) / (side + stake).
  const stake = parseFloat(amount) || 0;
  const payoutIf = (side: "yes" | "no") => {
    if (stake <= 0) return null;
    const sidePool = side === "yes" ? yes : no;
    return (stake * (total + stake)) / (sidePool + stake);
  };
  const previewFor = (side: "yes" | "no") => {
    const p = payoutIf(side);
    return p === null ? null : `◎${p.toFixed(2)} (×${(p / stake).toFixed(2)})`;
  };
  const resolved = "resolved" in account.status;
  const voided = "voided" in account.status;
  const winner: "YES" | "NO" | null = resolved ? ("yes" in account.winningOutcome ? "YES" : "NO") : null;
  const kind: MarketKind =
    "homeWin" in account.kind ? "home_win" : "over25" in account.kind ? "over_2_5" : "custom";
  const resolveDate = new Date(account.settleAfter.toNumber() * 1000);

  // Only surface a Claim button when this wallet actually holds an unclaimed
  // position: the winning side on a resolved market, either side on a voided one.
  useEffect(() => {
    let live = true;
    if ((!resolved && !voided) || !wallet) {
      setClaimOutcome(null);
      return;
    }
    const candidates = voided ? [1, 2] : [winner === "YES" ? 1 : 2];
    (async () => {
      for (const ob of candidates) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b: any = await getReadonlyProgram(connection).account.bet.fetchNullable(
            betPda(market.publicKey, wallet.publicKey, ob),
          );
          if (b && !b.claimed && b.amount.toNumber() > 0) {
            if (live) setClaimOutcome(ob);
            return;
          }
        } catch {
          /* try the other side */
        }
      }
      if (live) setClaimOutcome(null);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, voided, winner, wallet, connection, market.publicKey]);

  async function send(action: "yes" | "no" | "claim") {
    if (!wallet) return;
    setBusy(action);
    setErr(null);
    try {
      const program = getProgram(new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      if (action === "claim") {
        if (claimOutcome === null) return;
        await program.methods
          .claim()
          .accountsPartial({
            market: market.publicKey,
            bet: betPda(market.publicKey, wallet.publicKey, claimOutcome),
            bettor: wallet.publicKey,
          })
          .rpc();
        setClaimOutcome(null);
      } else {
        const outcomeByte = action === "yes" ? 1 : 2;
        const lamports = new BN(Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL));
        await program.methods
          .placeBet(action === "yes" ? { yes: {} } : { no: {} }, lamports)
          .accountsPartial({
            market: market.publicKey,
            bet: betPda(market.publicKey, wallet.publicKey, outcomeByte),
            bettor: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }
      await onChange();
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m.split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`card ${resolved ? "card-resolved" : ""}`}>
      <div className="card-art" style={{ background: art.grad }}>
        <ArtImage artKey={meta?.art} />
        <span className="card-kind">{kindLabel[kind]}</span>
      </div>
      <div className="card-body">
        <h3>{meta?.title ?? account.marketId}</h3>
        <p className="blurb">{meta?.blurb ?? ""}</p>

        {(!resolved || total > 0) && (
          <div className="odds">
            <div className="odds-bar">
              <div className="odds-yes" style={{ width: `${yesPct}%` }} />
            </div>
            <div className="odds-row">
              <span className="yes">YES {yesPct}%</span>
              <span className="no">NO {100 - yesPct}%</span>
            </div>
            <div className="pool">
              {resolved ? "Final pool" : "Pool"} {total.toFixed(2)} SOL · {yes.toFixed(2)} / {no.toFixed(2)}
            </div>
          </div>
        )}

        {resolved && winner ? (
          <>
            <SettlementProof
              winner={winner}
              digest={account.resultDigest}
              marketPubkey={market.publicKey.toBase58()}
              marketId={account.marketId}
              kind={kind}
            />
            {wallet && claimOutcome !== null && (
              <button className="btn btn-claim" disabled={busy !== null} onClick={() => send("claim")}>
                {busy === "claim" ? "Claiming…" : `Claim ${winner} winnings`}
              </button>
            )}
          </>
        ) : voided ? (
          <>
            <div className="proof">
              <div className="proof-head">
                <span className="proof-label" style={{ color: "var(--muted)" }}>∅ Market voided</span>
                <span className="pill">VOID</span>
              </div>
              <div className="proof-note">
                The fixture never produced a result, so every stake is refundable in full — no
                house discretion, enforced by the program.
              </div>
            </div>
            {wallet && claimOutcome !== null && (
              <button className="btn btn-claim" disabled={busy !== null} onClick={() => send("claim")}>
                {busy === "claim" ? "Reclaiming…" : "Reclaim your stake"}
              </button>
            )}
          </>
        ) : (
          <div className="bet">
            <div className="resolve-at">Betting closes {resolveDate.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
            {wallet ? (
              <>
                <input
                  className="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  aria-label="Stake in SOL"
                />
                <div className="bet-btns">
                  <button className="btn btn-yes" disabled={busy !== null} onClick={() => send("yes")}>
                    {busy === "yes" ? "…" : "Bet YES"}
                  </button>
                  <button className="btn btn-no" disabled={busy !== null} onClick={() => send("no")}>
                    {busy === "no" ? "…" : "Bet NO"}
                  </button>
                </div>
                {stake > 0 && (
                  <div className="payout-preview">
                    <span className="yes">YES wins → {previewFor("yes")}</span>
                    <span className="no">NO wins → {previewFor("no")}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="hint">Connect a wallet to bet</div>
            )}
          </div>
        )}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
