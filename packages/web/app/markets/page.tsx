"use client";

import { useMemo, useState } from "react";
import { Buffer } from "buffer";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { MarketCard } from "../../components/MarketCard";
import { Nav } from "../../components/Nav";
import { Stats, Footer, Ticker } from "../../components/Landing";
import { useMarkets } from "../../lib/useMarkets";
import { metaById } from "../../lib/markets";
import { explorerAddress } from "../../lib/anchor";

type Filter = "all" | "home_win" | "over_2_5" | "settled";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const marketKind = (a: any): "home_win" | "over_2_5" | "custom" =>
  "homeWin" in a.kind ? "home_win" : "over25" in a.kind ? "over_2_5" : "custom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isSettled = (a: any) => "resolved" in a.status || "voided" in a.status;

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All markets" },
  { key: "home_win", label: "Match Result" },
  { key: "over_2_5", label: "Goals" },
  { key: "settled", label: "Settled" },
];

export default function MarketsPage() {
  const { markets, loading, reload, open, settled, pooled } = useMarkets();
  const { publicKey } = useWallet();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: markets.length, home_win: 0, over_2_5: 0, settled: 0 };
    for (const m of markets) {
      const k = marketKind(m.account);
      if (k === "home_win") c.home_win++;
      if (k === "over_2_5") c.over_2_5++;
      if (isSettled(m.account)) c.settled++;
    }
    return c;
  }, [markets]);

  const shown = useMemo(() => {
    if (filter === "all") return markets;
    if (filter === "settled") return markets.filter((m) => isSettled(m.account));
    return markets.filter((m) => marketKind(m.account) === filter);
  }, [markets, filter]);

  const recentlySettled = useMemo(
    () => markets.filter((m) => "resolved" in m.account.status).slice(0, 8),
    [markets],
  );

  return (
    <>
      <Nav />
      <main>
        <section className="section markets-page" id="markets">
          <div className="markets-ticker">
            <Ticker
              variant="lime"
              items={[
                <><b>TOTAL STAKED</b> ◎ {pooled.toFixed(2)}</>,
                <><b>MARKETS OPEN</b> {open}</>,
                <><b>ON-CHAIN PROOFS</b> {settled}</>,
                <><b>SETTLED FROM</b> TxODDS</>,
                <><b>NETWORK</b> SOLANA DEVNET</>,
              ]}
            />
          </div>

          <div className="dash-head">
            <div>
              <div className="eyebrow">Prediction markets · Solana devnet</div>
              <h1>
                Live World Cup <span className="cyan">Markets.</span>
              </h1>
            </div>
            <div className="dash-total">
              <div className="l">Total staked</div>
              <div className="n">◎ {pooled.toFixed(2)}</div>
            </div>
          </div>

          <div className="filter-tabs">
            <span className="filter-label">Filter</span>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`filter-tab ${filter === t.key ? "on" : ""}`}
                onClick={() => setFilter(t.key)}
                type="button"
              >
                {t.label} <span className="filter-count">{counts[t.key]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="loading">Loading markets…</div>
          ) : markets.length === 0 ? (
            <div className="loading">
              Couldn&rsquo;t reach the markets just now — the devnet RPC may be busy. Please refresh.
            </div>
          ) : (
            <div className="dash-layout">
              <div>
                {shown.length === 0 ? (
                  <div className="loading">No markets in this filter yet.</div>
                ) : (
                  <div className="grid">
                    {shown.map((m) => (
                      <MarketCard key={m.publicKey.toBase58()} market={m} onChange={reload} />
                    ))}
                  </div>
                )}
              </div>

              <div className="dash-side">
                <aside className="settled-rail">
                  <h3><i className="dot dot-lime" /> Recently settled</h3>
                  {recentlySettled.length === 0 ? (
                    <p className="settled-empty">No settled markets yet — proofs appear here the moment a match is final.</p>
                  ) : (
                    <div className="settled-list">
                      {recentlySettled.map((m) => {
                        const meta = metaById(m.account.marketId);
                        const won = "yes" in m.account.winningOutcome ? "YES" : "NO";
                        const hex = Buffer.from(m.account.resultDigest).toString("hex");
                        return (
                          <a
                            key={m.publicKey.toBase58()}
                            className="settled-item"
                            href={explorerAddress(m.publicKey.toBase58())}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <div className="settled-top">
                              <span className="title">{meta?.title ?? m.account.marketId}</span>
                              <span className={`pill ${won === "YES" ? "pill-yes" : "pill-no"}`}>{won}</span>
                            </div>
                            <div className="settled-meta">
                              <code className="digest">sha256 · {hex.slice(0, 10)}…{hex.slice(-4)}</code>
                              <span className="settled-go">Explorer ↗</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <a className="link-cyan settled-viewall" href="#markets" onClick={() => setFilter("settled")}>
                    View all settled →
                  </a>
                </aside>

                <div className="action-card">
                  <h3>Start predicting</h3>
                  {publicKey ? (
                    <p>Wallet connected. Pick a market and back your side — settlement and payout run on Solana.</p>
                  ) : (
                    <>
                      <p>Connect a Devnet wallet to back a side in a live World Cup market. Grab free test SOL from the faucet.</p>
                      <WalletMultiButton />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        <Stats count={markets.length} open={open} settled={settled} pooled={pooled} />
      </main>
      <Footer />
    </>
  );
}
