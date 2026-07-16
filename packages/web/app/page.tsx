"use client";

import { useMarkets } from "../lib/useMarkets";
import { Nav } from "../components/Nav";
import { MarketCard } from "../components/MarketCard";
import {
  Hero,
  Stats,
  SettleFlow,
  VerifiedByCode,
  MarketsCTA,
  GolazoCTA,
  Protocol,
  BottomTicker,
  Footer,
} from "../components/Landing";

export default function Home() {
  const { markets, open, settled, pooled, reload } = useMarkets();
  const preview = markets.slice(0, 3);
  return (
    <>
      <Nav />
      <main>
        <Hero open={open} settled={settled} pooled={pooled} />
        <Stats count={markets.length} open={open} settled={settled} pooled={pooled} />

        {preview.length > 0 && (
          <section className="section" id="markets">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">Live on devnet</div>
                <h2>Live markets</h2>
                <p className="sub">Real markets, settling from the TxODDS World Cup feed.</p>
              </div>
              <a className="link-cyan" href="/markets">View all markets →</a>
            </div>
            <div className="grid preview">
              {preview.map((m) => (
                <MarketCard key={m.publicKey.toBase58()} market={m} onChange={reload} />
              ))}
            </div>
          </section>
        )}

        <SettleFlow />
        <VerifiedByCode />
        <MarketsCTA open={open} pooled={pooled} />
        <GolazoCTA />
        <Protocol />
      </main>
      <BottomTicker />
      <Footer />
    </>
  );
}
