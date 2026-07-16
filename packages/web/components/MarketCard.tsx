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

// On-chain errors are for machines; bettors get one plain sentence.
function friendlyError(raw: string): string {
  if (/BettingClosed|betting is closed/i.test(raw)) return "Betting closed at kickoff — this match is under way.";
  if (/insufficient lamports|Attempt to debit an account but found no record/i.test(raw))
    return "Not enough devnet SOL — grab free test SOL from the faucet link in the header.";
  if (/User rejected|rejected the request|Approval Denied/i.test(raw)) return "Transaction cancelled in the wallet.";
  return raw.split("\n")[0];
}

const QUICK_STAKES = ["0.1", "0.25", "0.5"];

function closesIn(secs: number): string {
  if (secs >= 86400) return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.max(1, Math.floor(secs / 60))}m`;
}

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
  const [flash, setFlash] = useState<string | null>(null);
  // What THIS wallet can claim: [outcome byte, payout in SOL] — a winning bet on
  // a resolved market, or either side's stake refund on a voided one.
  const [claimable, setClaimable] = useState<{ outcome: number; payout: number } | null>(null);
  // Ticks so cards flip to "match under way" / countdowns stay fresh while open.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const yes = account.poolYes.toNumber() / LAMPORTS_PER_SOL;
  const no = account.poolNo.toNumber() / LAMPORTS_PER_SOL;
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((100 * yes) / total) : 50;
  const resolved = "resolved" in account.status;
  const voided = "voided" in account.status;
  const cutoff = account.settleAfter.toNumber();
  const bettingOpen = !resolved && !voided && cutoff > nowSec;
  const awaitingResult = !resolved && !voided && !bettingOpen;
  const winner: "YES" | "NO" | null = resolved ? ("yes" in account.winningOutcome ? "YES" : "NO") : null;
  const kind: MarketKind =
    "homeWin" in account.kind ? "home_win" : "over25" in account.kind ? "over_2_5" : "custom";
  const resolveDate = new Date(cutoff * 1000);

  // Parimutuel preview: after your stake joins the pool, winners split the
  // whole pot pro-rata — payout = stake * (total + stake) / (side + stake).
  const stake = parseFloat(amount) || 0;
  const stakeValid = Number.isFinite(stake) && stake > 0;
  const previewFor = (side: "yes" | "no") => {
    if (!stakeValid) return null;
    const sidePool = side === "yes" ? yes : no;
    const p = (stake * (total + stake)) / (sidePool + stake);
    return `◎${p.toFixed(2)} (×${(p / stake).toFixed(2)})`;
  };

  // Only surface a Claim button when this wallet actually holds an unclaimed
  // position — and say exactly how much it pays.
  useEffect(() => {
    let live = true;
    if ((!resolved && !voided) || !wallet) {
      setClaimable(null);
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
            const stakeSol = b.amount.toNumber() / LAMPORTS_PER_SOL;
            let payout = stakeSol; // voided: exact refund
            if (resolved) {
              const winPool = winner === "YES" ? yes : no;
              const gross = winPool > 0 ? (stakeSol * total) / winPool : 0;
              payout = gross * (1 - (account.feeBps ?? 0) / 10_000);
            }
            if (live) setClaimable({ outcome: ob, payout });
            return;
          }
        } catch {
          /* try the other side */
        }
      }
      if (live) setClaimable(null);
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
    setFlash(null);
    try {
      const program = getProgram(new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      if (action === "claim") {
        if (!claimable) return;
        await program.methods
          .claim()
          .accountsPartial({
            market: market.publicKey,
            bet: betPda(market.publicKey, wallet.publicKey, claimable.outcome),
            bettor: wallet.publicKey,
          })
          .rpc();
        setFlash(`✓ Claimed ◎${claimable.payout.toFixed(2)} — paid straight to your wallet`);
        setClaimable(null);
      } else {
        const outcomeByte = action === "yes" ? 1 : 2;
        const lamports = new BN(Math.floor(stake * LAMPORTS_PER_SOL));
        await program.methods
          .placeBet(action === "yes" ? { yes: {} } : { no: {} }, lamports)
          .accountsPartial({
            market: market.publicKey,
            bet: betPda(market.publicKey, wallet.publicKey, outcomeByte),
            bettor: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        setFlash(`✓ Bet placed — ◎${stake.toFixed(2)} on ${action.toUpperCase()}`);
      }
      await onChange();
    } catch (e: unknown) {
      setErr(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  const detailHref = `/markets/${market.publicKey.toBase58()}`;

  return (
    <div className={`card ${resolved ? "card-resolved" : ""}`}>
      <a className="card-art" href={detailHref} style={{ background: art.grad }} aria-label={`Open ${meta?.title ?? account.marketId}`}>
        <ArtImage artKey={meta?.art} />
        <span className="card-kind">{kindLabel[kind]}</span>
      </a>
      <div className="card-body">
        <a className="card-title-link" href={detailHref}>
          <h3>{meta?.title ?? account.marketId}</h3>
        </a>
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
            {wallet && claimable && (
              <button className="btn btn-claim" disabled={busy !== null} onClick={() => send("claim")}>
                {busy === "claim" ? "Claiming…" : `Claim ◎${claimable.payout.toFixed(2)}`}
              </button>
            )}
          </>
        ) : voided ? (
          <>
            <div className="proof">
              <div className="proof-head">
                <span className="proof-label" style={{ color: "var(--muted)" }}>∅ Market voided</span>
                <span className="pill pill-void">VOID</span>
              </div>
              <div className="proof-note">
                The fixture never produced a result, so every stake is refundable in full — no
                house discretion, enforced by the program.
              </div>
            </div>
            {wallet && claimable && (
              <button className="btn btn-claim" disabled={busy !== null} onClick={() => send("claim")}>
                {busy === "claim" ? "Reclaiming…" : `Reclaim ◎${claimable.payout.toFixed(2)}`}
              </button>
            )}
          </>
        ) : awaitingResult ? (
          <div className="proof proof-live">
            <div className="proof-head">
              <span className="proof-label proof-label-live">⏱ Match under way</span>
              <span className="pill pill-live">LIVE</span>
            </div>
            <div className="proof-note">
              Betting closed at kickoff. When the match is final, the settler posts the TxODDS
              result with the feed&rsquo;s ed25519 signature and this market settles automatically —
              the proof will appear right here.
            </div>
          </div>
        ) : (
          <div className="bet">
            <div className="resolve-at">
              Betting closes {resolveDate.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              <span className="closes-in"> · in {closesIn(cutoff - nowSec)}</span>
            </div>
            {wallet ? (
              <>
                <div className="stake-row">
                  <input
                    className="amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    aria-label="Stake in SOL"
                  />
                  <div className="chips">
                    {QUICK_STAKES.map((q) => (
                      <button
                        key={q}
                        className={`chip ${amount === q ? "chip-on" : ""}`}
                        onClick={() => setAmount(q)}
                        type="button"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bet-btns">
                  <button className="btn btn-yes" disabled={busy !== null || !stakeValid} onClick={() => send("yes")}>
                    {busy === "yes" ? "…" : "Bet YES"}
                  </button>
                  <button className="btn btn-no" disabled={busy !== null || !stakeValid} onClick={() => send("no")}>
                    {busy === "no" ? "…" : "Bet NO"}
                  </button>
                </div>
                {stakeValid ? (
                  <div className="payout-preview">
                    <span className="yes">YES wins → {previewFor("yes")}</span>
                    <span className="no">NO wins → {previewFor("no")}</span>
                  </div>
                ) : (
                  <div className="hint">Enter a stake in SOL to bet</div>
                )}
              </>
            ) : (
              <div className="hint">Connect a wallet to bet</div>
            )}
          </div>
        )}
        {flash && <div className="flash">{flash}</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
