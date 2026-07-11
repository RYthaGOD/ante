"use client";

import { useMarkets } from "../lib/useMarkets";
import { Nav } from "../components/Nav";
import { Hero, Stats, HowItWorks, Settlement, MarketsCTA, GolazoCTA, Protocol, Footer } from "../components/Landing";

export default function Home() {
  const { markets, open, settled, pooled } = useMarkets();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stats count={markets.length} open={open} settled={settled} pooled={pooled} />
        <HowItWorks />
        <Settlement />
        <MarketsCTA open={open} pooled={pooled} />
        <Protocol />
        <GolazoCTA />
      </main>
      <Footer />
    </>
  );
}
