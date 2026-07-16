"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Landing";
import { getProgram, getReadonlyProgram, explorerAddress } from "../../lib/anchor";
import { metaById, kindLabel, MarketMeta, MarketKind } from "../../lib/markets";

/* Retry transient RPC failures (public devnet rate-limits getProgramAccounts). */
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

type MState = "open" | "awaiting" | "resolved" | "voided";

interface Position {
  betKey: PublicKey;
  marketKey: PublicKey;
  meta: MarketMeta | undefined;
  marketId: string;
  kind: MarketKind;
  stake: number;
  side: "YES" | "NO";
  state: MState;
  won: boolean | null;
  claimed: boolean;
  claimable: number; // 0 unless a winning/refundable, unclaimed position
  payout: number | null; // realized (won) or refundable (void) payout for display
  cutoff: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const kindOf = (a: any): MarketKind =>
  "homeWin" in a.kind ? "home_win" : "over25" in a.kind ? "over_2_5" : "custom";

// Read every Bet this wallet holds (memcmp on the `bettor` field at offset 40),
// then join each against its market to derive status, winnings, and what's
// claimable — the exact parimutuel math the market card uses.
function useMyPositions() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!publicKey) {
      setPositions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const program = getReadonlyProgram(connection);
      const bets = await retry(() =>
        program.account.bet.all([{ memcmp: { offset: 40, bytes: publicKey.toBase58() } }]),
      );
      const now = Math.floor(Date.now() / 1000);
      const cache = new Map<string, unknown>();
      const out: Position[] = [];
      for (const b of bets) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bet: any = b.account;
        const marketKey: PublicKey = bet.market;
        const key = marketKey.toBase58();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let m: any = cache.get(key);
        if (!m) {
          try {
            m = await program.account.market.fetch(marketKey);
            cache.set(key, m);
          } catch {
            continue; // market gone / undecodable — skip this bet
          }
        }
        const yes = m.poolYes.toNumber() / LAMPORTS_PER_SOL;
        const no = m.poolNo.toNumber() / LAMPORTS_PER_SOL;
        const total = yes + no;
        const resolved = "resolved" in m.status;
        const voided = "voided" in m.status;
        const cutoff = m.settleAfter.toNumber();
        const open = !resolved && !voided && cutoff > now;
        const state: MState = resolved ? "resolved" : voided ? "voided" : open ? "open" : "awaiting";
        const side: "YES" | "NO" = "yes" in bet.outcome ? "YES" : "NO";
        const winner: "YES" | "NO" | null = resolved ? ("yes" in m.winningOutcome ? "YES" : "NO") : null;
        const stake = bet.amount.toNumber() / LAMPORTS_PER_SOL;
        const won = resolved ? side === winner : null;

        let payout: number | null = null;
        if (resolved && won) {
          const winPool = winner === "YES" ? yes : no;
          const gross = winPool > 0 ? (stake * total) / winPool : 0;
          payout = gross * (1 - (m.feeBps ?? 0) / 10_000);
        } else if (voided) {
          payout = stake; // full refund
        }

        let claimable = 0;
        if (!bet.claimed) {
          if (resolved && won) claimable = payout ?? 0;
          else if (voided) claimable = stake;
        }

        out.push({
          betKey: b.publicKey,
          marketKey,
          meta: metaById(m.marketId),
          marketId: m.marketId,
          kind: kindOf(m),
          stake,
          side,
          state,
          won,
          claimed: bet.claimed,
          claimable,
          payout,
          cutoff,
        });
      }
      const rank = (p: Position) => (p.claimable > 0 ? 0 : p.state === "open" || p.state === "awaiting" ? 1 : 2);
      out.sort((a, c) => rank(a) - rank(c) || c.cutoff - a.cutoff);
      setPositions(out);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { positions, loading, reload };
}

function closesIn(secs: number): string {
  if (secs <= 0) return "closed";
  if (secs >= 86400) return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.max(1, Math.floor(secs / 60))}m`;
}

type HistFilter = "all" | "active" | "won" | "lost";

export default function PortfolioPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const { positions, loading, reload } = useMyPositions();
  const [bal, setBal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistFilter>("all");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

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

  const agg = useMemo(() => {
    const active = positions.filter((p) => p.state === "open" || p.state === "awaiting");
    const activeStake = active.reduce((s, p) => s + p.stake, 0);
    const activeMarkets = new Set(active.map((p) => p.marketKey.toBase58())).size;
    const pending = positions.filter((p) => p.state === "awaiting").length;
    const claimList = positions.filter((p) => p.claimable > 0);
    const claimTotal = claimList.reduce((s, p) => s + p.claimable, 0);
    return { activeCount: active.length, activeStake, activeMarkets, pending, claimList, claimTotal };
  }, [positions]);

  const shown = useMemo(() => {
    if (filter === "all") return positions;
    if (filter === "active") return positions.filter((p) => p.state === "open" || p.state === "awaiting");
    if (filter === "won") return positions.filter((p) => p.won === true);
    return positions.filter((p) => p.won === false);
  }, [positions, filter]);

  async function claimAll() {
    if (!wallet || agg.claimList.length === 0) return;
    setBusy(true);
    setErr(null);
    setFlash(null);
    try {
      const program = getProgram(new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      let done = 0;
      for (const p of agg.claimList) {
        await program.methods
          .claim()
          .accountsPartial({ market: p.marketKey, bet: p.betKey, bettor: wallet.publicKey })
          .rpc();
        done++;
      }
      setFlash(`✓ Claimed ${done} position${done === 1 ? "" : "s"} — ◎${agg.claimTotal.toFixed(2)} paid to your wallet`);
      await reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav />
      <main>
        <section className="section markets-page">
          <div className="dash-head">
            <div>
              <div className="eyebrow">Your dashboard</div>
              <h1>
                Portfolio <span className="cyan">Overview.</span>
              </h1>
              <p className="pf-sub">
                Your open positions, settled results, and claimable winnings — every one checkable on-chain.
              </p>
            </div>
            <div className="pf-balance">
              <div className="l">Wallet balance · devnet</div>
              <div className="n">◎ {bal !== null ? bal.toFixed(2) : "—"}</div>
            </div>
          </div>

          {!publicKey ? (
            <div className="pf-connect">
              <h3>Connect your wallet</h3>
              <p>Set your wallet to <strong>Devnet</strong> to see your positions, history, and winnings.</p>
              <WalletMultiButton />
            </div>
          ) : loading ? (
            <div className="loading">Reading your positions on-chain…</div>
          ) : positions.length === 0 ? (
            <div className="pf-connect">
              <h3>No positions yet</h3>
              <p>You haven&rsquo;t placed a bet on this wallet. Head to the markets and back a side.</p>
              <a className="btn-primary lg" href="/markets">Explore live markets →</a>
            </div>
          ) : (
            <>
              <div className="pf-cards">
                <div className="pf-card">
                  <span className="l">Total staked</span>
                  <div className="n">◎ {agg.activeStake.toFixed(2)}</div>
                  <div className="d">Across {agg.activeMarkets} active market{agg.activeMarkets === 1 ? "" : "s"}</div>
                </div>
                <div className="pf-card">
                  <span className="l">Active positions</span>
                  <div className="n cyan">{String(agg.activeCount).padStart(2, "0")}</div>
                  <div className="d">{agg.pending} pending settlement</div>
                </div>
                <div className={`pf-card claim ${agg.claimTotal > 0 ? "on" : ""}`}>
                  <span className="l">Claimable winnings</span>
                  <div className="n lime">◎ {agg.claimTotal.toFixed(2)}</div>
                  {agg.claimTotal > 0 ? (
                    <button className="btn btn-claim" disabled={busy} onClick={claimAll}>
                      {busy ? "Claiming…" : `Claim all (${agg.claimList.length})`}
                    </button>
                  ) : (
                    <div className="d">Nothing to claim right now — winners appear here the moment a market settles.</div>
                  )}
                </div>
              </div>
              {flash && <div className="flash pf-flash">{flash}</div>}
              {err && <div className="err pf-flash">{err}</div>}

              <div className="pf-grid">
                <div className="history">
                  <div className="history-head">
                    <h3>Betting history</h3>
                    <div className="filter-tabs compact">
                      {(["all", "active", "won", "lost"] as HistFilter[]).map((f) => (
                        <button
                          key={f}
                          className={`filter-tab ${filter === f ? "on" : ""}`}
                          onClick={() => setFilter(f)}
                          type="button"
                        >
                          {f[0].toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {shown.length === 0 ? (
                    <p className="settled-empty" style={{ padding: "22px" }}>Nothing in this filter.</p>
                  ) : (
                    <div className="h-table">
                      <table className="h-tbl">
                        <thead>
                          <tr>
                            <th>Market</th>
                            <th>Stake</th>
                            <th>Status</th>
                            <th>Receipt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((p) => (
                            <PositionRow key={p.betKey.toBase58()} p={p} now={now} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="pf-side">
                  <aside className="assurance">
                    <div className="assurance-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" /><path d="M9 12l2 2 4-4" />
                      </svg>
                    </div>
                    <h4>SHA-256 assurance</h4>
                    <p>
                      Every settled position links to an on-chain proof. The winning outcome and a
                      SHA-256 digest of the TxODDS result live on Solana — recompute it yourself from
                      any settled market. Winnings pay out pro-rata; refunds on a voided fixture are
                      exact, enforced by the program.
                    </p>
                    <a className="link-cyan" href="/#settlement">How settlement works →</a>
                  </aside>

                  <a className="featured" href="/markets">
                    <div
                      className="featured-art"
                      style={{ background: "radial-gradient(120% 120% at 80% 10%, rgba(0,219,231,0.28), transparent 60%), radial-gradient(120% 120% at 10% 90%, rgba(210,240,0,0.18), transparent 55%), #171c22" }}
                    />
                    <div className="featured-body">
                      <span className="tag">Live · devnet</span>
                      <h4>Find your next market</h4>
                      <div className="sub"><i className="dot dot-cyan" /> Open World Cup markets, settling on-chain</div>
                    </div>
                  </a>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function PositionRow({ p, now }: { p: Position; now: number }) {
  const meta = p.meta;
  const href = explorerAddress(p.marketKey.toBase58());
  let badge: { cls: string; label: string };
  let receipt: React.ReactNode;
  if (p.state === "resolved" && p.won) {
    badge = { cls: "pill-won", label: "WON" };
    receipt = <a href={href} target="_blank" rel="noreferrer">◎{(p.payout ?? 0).toFixed(2)} · verify ↗</a>;
  } else if (p.state === "resolved") {
    badge = { cls: "pill-lost", label: "LOST" };
    receipt = <a href={href} target="_blank" rel="noreferrer">proof ↗</a>;
  } else if (p.state === "voided") {
    badge = { cls: "pill-void", label: "VOID" };
    receipt = <a href={href} target="_blank" rel="noreferrer">refund ◎{(p.payout ?? p.stake).toFixed(2)} ↗</a>;
  } else if (p.state === "awaiting") {
    badge = { cls: "pill-pending", label: "PENDING" };
    receipt = <span className="muted">settling soon</span>;
  } else {
    badge = { cls: "pill-active", label: "ACTIVE" };
    receipt = <span className="muted">closes in {closesIn(p.cutoff - now)}</span>;
  }
  return (
    <tr>
      <td>
        <div className="h-market">
          <span className="t">{meta?.title ?? p.marketId}</span>
          <span className="s">{p.side} · {kindLabel[p.kind]}</span>
        </div>
      </td>
      <td className="h-stake">◎ {p.stake.toFixed(2)}</td>
      <td><span className={`pill ${badge.cls}`}>{badge.label}</span></td>
      <td className="h-action">{receipt}</td>
    </tr>
  );
}
