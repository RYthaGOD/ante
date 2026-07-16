"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { Nav } from "../../../components/Nav";
import { Footer, VerifiedByCode } from "../../../components/Landing";
import { ArtImage } from "../../../components/Art";
import { SettlementProof } from "../../../components/SettlementProof";
import { getProgram, getReadonlyProgram, betPda, explorerAddress, PROGRAM_ID } from "../../../lib/anchor";
import { metaById, kindLabel, MarketKind } from "../../../lib/markets";
import { artFor } from "../../../lib/art";

const QUICK_STAKES = ["0.1", "0.25", "0.5", "1"];
const PROGRAM_SHORT = `${PROGRAM_ID.toBase58().slice(0, 4)}…${PROGRAM_ID.toBase58().slice(-4)}`;

function friendlyError(raw: string): string {
  if (/BettingClosed|betting is closed/i.test(raw)) return "Betting closed at kickoff — this match is under way.";
  if (/insufficient lamports|Attempt to debit an account but found no record/i.test(raw))
    return "Not enough devnet SOL — grab free test SOL from the faucet link in the header.";
  if (/User rejected|rejected the request|Approval Denied/i.test(raw)) return "Transaction cancelled in the wallet.";
  return raw.split("\n")[0];
}

function countdown(secs: number): string {
  if (secs <= 0) return "00:00:00";
  if (secs >= 86400) {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    return `${d}d ${String(h).padStart(2, "0")}h`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

const I = {
  feed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1.6" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  chip: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v1a4 4 0 0 0 3 3.9M17 6h3v1a4 4 0 0 1-3 3.9M9 20h6M12 14v6" />
    </svg>
  ),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Acct = any;

export default function MarketDetailPage() {
  const params = useParams();
  const raw = params?.market;
  const keyStr = Array.isArray(raw) ? raw[0] : raw;

  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [pubkey, setPubkey] = useState<PublicKey | null>(null);
  const [account, setAccount] = useState<Acct | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [claimable, setClaimable] = useState<{ outcome: number; payout: number } | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      setPubkey(keyStr ? new PublicKey(keyStr) : null);
    } catch {
      setPubkey(null);
      setNotFound(true);
      setLoading(false);
    }
  }, [keyStr]);

  const load = useCallback(async () => {
    if (!pubkey) return;
    try {
      const acc = await getReadonlyProgram(connection).account.market.fetch(pubkey);
      setAccount(acc);
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [connection, pubkey]);

  useEffect(() => {
    load();
  }, [load]);

  // Live account updates (bets, settlement) push straight into the view.
  useEffect(() => {
    if (!pubkey) return;
    let sub: number | null = null;
    try {
      sub = connection.onAccountChange(pubkey, (info) => {
        try {
          setAccount(getReadonlyProgram(connection).coder.accounts.decode("market", info.data));
        } catch {
          /* ignore non-market payloads */
        }
      }, "confirmed");
    } catch {
      /* refresh still works */
    }
    return () => {
      if (sub !== null) connection.removeAccountChangeListener(sub).catch(() => {});
    };
  }, [connection, pubkey]);

  useEffect(() => {
    if (!publicKey) {
      setBal(null);
      return;
    }
    let live = true;
    connection.getBalance(publicKey).then((b) => live && setBal(b / LAMPORTS_PER_SOL)).catch(() => {});
    return () => {
      live = false;
    };
  }, [publicKey, connection, flash]);

  const meta = account ? metaById(account.marketId) : undefined;
  const art = artFor(meta?.art);

  const yes = account ? account.poolYes.toNumber() / LAMPORTS_PER_SOL : 0;
  const no = account ? account.poolNo.toNumber() / LAMPORTS_PER_SOL : 0;
  const total = yes + no;
  const yesPct = total > 0 ? Math.round((100 * yes) / total) : 50;
  const resolved = account ? "resolved" in account.status : false;
  const voided = account ? "voided" in account.status : false;
  const cutoff = account ? account.settleAfter.toNumber() : 0;
  const bettingOpen = account ? !resolved && !voided && cutoff > nowSec : false;
  const awaitingResult = account ? !resolved && !voided && !bettingOpen : false;
  const winner: "YES" | "NO" | null = resolved ? ("yes" in account.winningOutcome ? "YES" : "NO") : null;
  const kind: MarketKind = account
    ? "homeWin" in account.kind ? "home_win" : "over25" in account.kind ? "over_2_5" : "custom"
    : "custom";

  const stake = parseFloat(amount) || 0;
  const stakeValid = Number.isFinite(stake) && stake > 0;
  const mult = (sidePool: number) => (sidePool > 0 && total > 0 ? total / sidePool : null);
  const previewFor = (s: "yes" | "no") => {
    if (!stakeValid) return null;
    const sidePool = s === "yes" ? yes : no;
    const p = (stake * (total + stake)) / (sidePool + stake);
    return p;
  };

  // Surface Claim only when this wallet holds an unclaimed winning/refundable bet.
  useEffect(() => {
    let live = true;
    if (!account || (!resolved && !voided) || !wallet || !pubkey) {
      setClaimable(null);
      return;
    }
    const candidates = voided ? [1, 2] : [winner === "YES" ? 1 : 2];
    (async () => {
      for (const ob of candidates) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b: any = await getReadonlyProgram(connection).account.bet.fetchNullable(
            betPda(pubkey, wallet.publicKey, ob),
          );
          if (b && !b.claimed && b.amount.toNumber() > 0) {
            const stakeSol = b.amount.toNumber() / LAMPORTS_PER_SOL;
            let payout = stakeSol;
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
  }, [resolved, voided, winner, wallet, connection, pubkey, account]);

  async function send(action: "yes" | "no" | "claim") {
    if (!wallet || !pubkey) return;
    setBusy(action);
    setErr(null);
    setFlash(null);
    try {
      const program = getProgram(new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      if (action === "claim") {
        if (!claimable) return;
        await program.methods
          .claim()
          .accountsPartial({ market: pubkey, bet: betPda(pubkey, wallet.publicKey, claimable.outcome), bettor: wallet.publicKey })
          .rpc();
        setFlash(`✓ Claimed ◎${claimable.payout.toFixed(2)} — paid straight to your wallet`);
        setClaimable(null);
      } else {
        const outcomeByte = action === "yes" ? 1 : 2;
        const lamports = new BN(Math.floor(stake * LAMPORTS_PER_SOL));
        await program.methods
          .placeBet(action === "yes" ? { yes: {} } : { no: {} }, lamports)
          .accountsPartial({
            market: pubkey,
            bet: betPda(pubkey, wallet.publicKey, outcomeByte),
            bettor: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        setFlash(`✓ Bet placed — ◎${stake.toFixed(2)} on ${action.toUpperCase()}`);
      }
      await load();
    } catch (e: unknown) {
      setErr(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  const yesLabel = kind === "over_2_5" ? "OVER 2.5" : "YES";
  const noLabel = kind === "over_2_5" ? "UNDER" : "NO";

  return (
    <>
      <Nav />
      <main>
        <section className="section detail-page">
          <a className="detail-back" href="/markets">← All markets</a>

          {loading ? (
            <div className="loading">Loading market…</div>
          ) : notFound || !account ? (
            <div className="pf-connect">
              <h3>Market not found</h3>
              <p>This market isn&rsquo;t on-chain, or the address is invalid.</p>
              <a className="btn-primary lg" href="/markets">Back to markets →</a>
            </div>
          ) : (
            <>
              {/* hero */}
              <div className="detail-hero">
                <div>
                  <span className={`detail-badge ${resolved || voided ? "settled" : awaitingResult ? "await" : "live"}`}>
                    <i className={`dot ${resolved || voided ? "dot-lime" : "dot-cyan"}`} />
                    {resolved ? "Settled market" : voided ? "Voided market" : awaitingResult ? "Match under way" : "Live prediction market"}
                  </span>
                  <h1>{meta?.title ?? account.marketId}</h1>
                  <p className="desc">
                    {meta?.blurb ? meta.blurb + " " : ""}
                    Betting closes at kickoff. The outcome is settled on-chain from the TxODDS result,
                    with the feed&rsquo;s ed25519 signature and a SHA-256 proof.
                  </p>
                  <div className="detail-metrics">
                    <div className="detail-metric">
                      <div className="l">{bettingOpen ? "Betting closes in" : resolved ? "Status" : "Kickoff"}</div>
                      <div className="n cyan">
                        {bettingOpen ? countdown(cutoff - nowSec) : resolved ? "Resolved" : voided ? "Voided" : "Under way"}
                      </div>
                    </div>
                    <div className="detail-metric">
                      <div className="l">{resolved ? "Final pool" : "Total staked"}</div>
                      <div className="n">◎ {total.toFixed(2)}</div>
                    </div>
                    <div className="detail-metric">
                      <div className="l">Market type</div>
                      <div className="n" style={{ fontSize: 20 }}>{kindLabel[kind]}</div>
                    </div>
                  </div>
                </div>
                <div className="detail-art-card" style={{ background: art.grad }}>
                  <ArtImage artKey={meta?.art} />
                  <span className="art-cluster">Cluster · {account.marketId}</span>
                </div>
              </div>

              {/* body: stake box + proof sidebar */}
              <div className="detail-body">
                <div>
                  {resolved && winner ? (
                    <div className="stake-box">
                      <div className="stake-head">
                        <h2>Settled</h2>
                        <span className="tag">Parimutuel pool</span>
                      </div>
                      <SettlementProof
                        winner={winner}
                        digest={account.resultDigest}
                        marketPubkey={pubkey!.toBase58()}
                        marketId={account.marketId}
                        kind={kind}
                      />
                      {wallet && claimable && (
                        <button className="btn btn-claim" disabled={busy !== null} onClick={() => send("claim")}>
                          {busy === "claim" ? "Claiming…" : `Claim ◎${claimable.payout.toFixed(2)}`}
                        </button>
                      )}
                    </div>
                  ) : voided ? (
                    <div className="stake-box">
                      <div className="stake-head">
                        <h2>Voided</h2>
                        <span className="tag">Refundable</span>
                      </div>
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
                    </div>
                  ) : awaitingResult ? (
                    <div className="stake-box">
                      <div className="stake-head">
                        <h2>Match under way</h2>
                        <span className="tag">Live</span>
                      </div>
                      <div className="proof proof-live">
                        <div className="proof-head">
                          <span className="proof-label proof-label-live">⏱ Awaiting result</span>
                          <span className="pill pill-live">LIVE</span>
                        </div>
                        <div className="proof-note">
                          Betting closed at kickoff. When the match is final, the settler posts the TxODDS
                          result with the feed&rsquo;s ed25519 signature and this market settles automatically —
                          the proof will appear right here.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="stake-box">
                      <div className="stake-head">
                        <h2>Stake your side</h2>
                        <span className="tag">Parimutuel pool</span>
                      </div>
                      <div className="outcome-row">
                        <button
                          className={`outcome-btn yes ${side === "yes" ? "on" : ""}`}
                          onClick={() => setSide("yes")}
                          type="button"
                        >
                          <span className="ol">Outcome · {yesLabel}</span>
                          <div>
                            <span className="ox">{mult(yes) ? `${mult(yes)!.toFixed(2)}x` : "—"}</span>
                            <span className="om">{yesPct}% of pool</span>
                          </div>
                          <div className="obar"><span style={{ width: `${yesPct}%` }} /></div>
                        </button>
                        <button
                          className={`outcome-btn no ${side === "no" ? "on" : ""}`}
                          onClick={() => setSide("no")}
                          type="button"
                        >
                          <span className="ol">Outcome · {noLabel}</span>
                          <div>
                            <span className="ox">{mult(no) ? `${mult(no)!.toFixed(2)}x` : "—"}</span>
                            <span className="om">{100 - yesPct}% of pool</span>
                          </div>
                          <div className="obar"><span style={{ width: `${100 - yesPct}%` }} /></div>
                        </button>
                      </div>

                      {wallet ? (
                        <>
                          <div className="stake-field">
                            <label>
                              Enter stake amount
                              {bal !== null && <span className="bal">Bal: ◎ {bal.toFixed(2)}</span>}
                            </label>
                            <div className="stake-input-wrap">
                              <input
                                className="amount"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                inputMode="decimal"
                                placeholder="0.00"
                                aria-label="Stake in SOL"
                              />
                              <span className="sol">SOL</span>
                            </div>
                            <div className="stake-quick">
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

                          <div className="stake-preview">
                            <div className="col">
                              <div className="pl">Est. payout if {side === "yes" ? yesLabel : noLabel} wins</div>
                              <div className="pv lime">
                                {stakeValid && previewFor(side) !== null
                                  ? `◎ ${previewFor(side)!.toFixed(2)}`
                                  : "◎ 0.00"}
                              </div>
                            </div>
                            <div className="col right">
                              <div className="pl">Return</div>
                              <div className="pv right">
                                {stakeValid && previewFor(side) !== null
                                  ? `×${(previewFor(side)! / stake).toFixed(2)}`
                                  : "—"}
                              </div>
                            </div>
                          </div>

                          <button
                            className="stake-submit"
                            disabled={busy !== null || !stakeValid}
                            onClick={() => send(side)}
                          >
                            {busy === side ? "Confirming…" : `Execute stake on ${side === "yes" ? yesLabel : noLabel}`}
                          </button>
                        </>
                      ) : (
                        <div className="hint">Connect a Devnet wallet to stake on this market.</div>
                      )}
                    </div>
                  )}
                  {flash && <div className="flash pf-flash">{flash}</div>}
                  {err && <div className="err pf-flash">{err}</div>}
                </div>

                {/* settlement proof sidebar */}
                <aside className="detail-side">
                  <div className="proof-panel">
                    <h3><i className="dot dot-lime" /> Settlement proof</h3>
                    <div className="pp-row">
                      <span className="k">Data oracle</span>
                      <span className="v">TxODDS real-time feed</span>
                    </div>
                    <div className="pp-row">
                      <span className="k">Settle mechanism</span>
                      <span className="v mono-body">
                        Requires a valid <code>ed25519</code> signature from the feed. The
                        <code>SHA-256</code> digest is recomputed and verified on-chain against the match result.
                      </span>
                    </div>
                    <div className="pp-row">
                      <span className="k">Program id · devnet</span>
                      <span className="v" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <code>{PROGRAM_SHORT}</code>
                        <a className="link-cyan" href={explorerAddress(PROGRAM_ID.toBase58())} target="_blank" rel="noreferrer">Explorer ↗</a>
                      </span>
                    </div>
                    <a className="link-cyan" href={explorerAddress(pubkey!.toBase58())} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6 }}>
                      View this market on Explorer →
                    </a>
                  </div>

                  <div className="proof-panel" style={{ borderColor: "var(--line)" }}>
                    <h3 style={{ color: "var(--cyan)" }}><i className="dot dot-cyan" /> Pool composition</h3>
                    <div className="pp-row">
                      <span className="k">{yesLabel} pool</span>
                      <span className="v">◎ {yes.toFixed(2)} <span style={{ color: "var(--muted-2)" }}>· {yesPct}%</span></span>
                    </div>
                    <div className="pp-row">
                      <span className="k">{noLabel} pool</span>
                      <span className="v">◎ {no.toFixed(2)} <span style={{ color: "var(--muted-2)" }}>· {100 - yesPct}%</span></span>
                    </div>
                    <div className="pp-row" style={{ marginBottom: 0 }}>
                      <span className="k">Total staked</span>
                      <span className="v">◎ {total.toFixed(2)}</span>
                    </div>
                  </div>
                </aside>
              </div>

              {/* how this market settles */}
              <div className="pipeline">
                <div className="section-head" style={{ marginBottom: 34 }}>
                  <div className="eyebrow">Transparency protocol</div>
                  <h2>How this market settles</h2>
                </div>
                <div className="pipeline-grid">
                  <div className="pipeline-node">
                    <span className="pn-icon cyan">{I.feed}</span>
                    <h4>TxODDS feed</h4>
                    <p>Match result broadcast with an ed25519 signature payload.</p>
                  </div>
                  <div className="pipeline-node">
                    <span className="pn-icon lime">{I.bolt}</span>
                    <h4>Oracle feeder</h4>
                    <p>The feeder posts the signed result on-chain to Solana devnet.</p>
                  </div>
                  <div className="pipeline-node">
                    <span className="pn-icon cyan">{I.chip}</span>
                    <h4>Solana program</h4>
                    <p>Verifies the signature and recomputes the SHA-256 proof before settling.</p>
                  </div>
                  <div className="pipeline-node">
                    <span className="pn-icon lime">{I.trophy}</span>
                    <h4>Settlement</h4>
                    <p>The winning pool unlocks for pro-rata on-chain claiming.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <VerifiedByCode />
      </main>
      <Footer />
    </>
  );
}
