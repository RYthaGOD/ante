"use client";

import { MarketCard } from "../../components/MarketCard";
import { Nav } from "../../components/Nav";
import { Footer } from "../../components/Landing";
import { useMarkets } from "../../lib/useMarkets";

export default function MarketsPage() {
  const { markets, loading, reload, open } = useMarkets();
  return (
    <>
      <Nav />
      <main>
        <section className="section markets-page" id="markets">
          <div className="section-head">
            <div className="eyebrow">Live on Solana devnet</div>
            <h2>Live markets</h2>
            <p>
              {open} open · connect a wallet set to <strong>Devnet</strong>, grab free test SOL from the
              faucet, and place a real on-chain bet.
            </p>
          </div>
          {loading ? (
            <div className="loading">Loading markets…</div>
          ) : markets.length === 0 ? (
            <div className="loading">
              Couldn&rsquo;t reach the markets just now — the devnet RPC may be busy. Please refresh.
            </div>
          ) : (
            <div className="grid">
              {markets.map((m) => (
                <MarketCard key={m.publicKey.toBase58()} market={m} onChange={reload} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
