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
  // Whether THIS wallet has an unclaimed winning position on a resolved market.
  const [claimable, setClaimable] = useState(false);

  const yes = account.poolYes.toNumber() / LAMPORTS_PER_SOL;
  const no = account.poolNo.toNumber() / LAMPORTS_PER_SOL;
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((100 * yes) / total) : 50;
  const resolved = "resolved" in account.status;
  const winner: "YES" | "NO" | null = resolved ? ("yes" in account.winningOutcome ? "YES" : "NO") : null;
  const kind: MarketKind =
    "homeWin" in account.kind ? "home_win" : "over25" in account.kind ? "over_2_5" : "custom";
  const resolveDate = new Date(account.settleAfter.toNumber() * 1000);

  // Only surface a Claim button when this wallet actually holds an unclaimed
  // winning bet — otherwise resolved markets just show the proof.
  useEffect(() => {
    let live = true;
    if (!resolved || !wallet || !winner) {
      setClaimable(false);
      return;
    }
    const outcomeByte = winner === "YES" ? 1 : 2;
    getReadonlyProgram(connection)
      .account.bet.fetchNullable(betPda(market.publicKey, wallet.publicKey, outcomeByte))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((b: any) => live && setClaimable(!!b && !b.claimed && b.amount.toNumber() > 0))
      .catch(() => live && setClaimable(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, winner, wallet, connection, market.publicKey]);

  async function send(action: "yes" | "no" | "claim") {
    if (!wallet) return;
    setBusy(action);
    setErr(null);
    try {
      const program = getProgram(new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      if (action === "claim") {
        const outcomeByte = winner === "YES" ? 1 : 2;
        await program.methods
          .claim()
          .accountsPartial({
            market: market.publicKey,
            bet: betPda(market.publicKey, wallet.publicKey, outcomeByte),
            bettor: wallet.publicKey,
          })
          .rpc();
        setClaimable(false);
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
            <SettlementProof winner={winner} digest={account.resultDigest} marketPubkey={market.publicKey.toBase58()} />
            {wallet && claimable && (
              <button className="btn btn-claim" disabled={busy !== null} onClick={() => send("claim")}>
                {busy === "claim" ? "Claiming…" : `Claim ${winner} winnings`}
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
