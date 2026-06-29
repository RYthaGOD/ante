/* eslint-disable @next/next/no-img-element */
import React from "react";

const PROGRAM = "G1tgXodmDq9X3MTtdHLNpjDWscUqsjiW29fcpUHvJoHu";
const EXPLORER = `https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`;
const short = `${PROGRAM.slice(0, 4)}…${PROGRAM.slice(-4)}`;

/* ---------- icons (line style, on-brand) ---------- */
const I = {
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7 9h10M7 13h10M7 17h6" />
    </svg>
  ),
  coin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <ellipse cx="12" cy="6.5" rx="8" ry="3.2" /><path d="M4 6.5v11c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-11M4 12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v1a4 4 0 0 0 3 3.9M17 6h3v1a4 4 0 0 1-3 3.9M9 20h6M12 14v6" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
    </svg>
  ),
  feed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1.6" />
    </svg>
  ),
};

/* ---------- hero ---------- */
export function Hero() {
  return (
    <section className="hero">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">Settlement-first prediction markets · Solana</div>
          <h1>
            Bet on the World Cup.
            <br />
            <span className="grad">Settled on-chain, verifiably.</span>
          </h1>
          <p className="lede">
            ANTE resolves every market against TxODDS-confirmed results and writes the outcome — with a
            SHA-256 proof — straight to Solana. Most apps say &ldquo;redeem for cash, trust us.&rdquo;
            ANTE shows the receipt.
          </p>
          <div className="cta-row">
            <a className="btn-primary" href="/markets">Explore live markets →</a>
            <a className="btn-ghost" href="#how">See how it works</a>
          </div>
          <div className="trust-row">
            <span><i className="dot dot-green" /> Live on Devnet</span>
            <span><i className="dot dot-cyan" /> Powered by TxODDS</span>
            <span><i className="dot dot-gold" /> Built on Solana</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="showcase-card">
            <div className="sc-art">
              <img src="/art/spain.png" alt="La Roja market art" />
              <span className="sc-kind">Match Result</span>
              <span className="sc-live">● SETTLED</span>
            </div>
            <div className="sc-body">
              <h3>La Roja Lay Down a Marker</h3>
              <div className="sc-odds"><span className="sc-yes" /></div>
              <div className="sc-proof">
                <div className="sc-proof-head">
                  <span>✓ Settled on-chain</span>
                  <span className="pill pill-yes">YES won</span>
                </div>
                <code>sha256 · 84a3e320d788…603fdd</code>
                <span className="sc-proof-note">Verified against the TxODDS-confirmed result</span>
              </div>
            </div>
          </div>
          <div className="float-chip chip-a">SHA-256 verified ✓</div>
          <div className="float-chip chip-b">◎ paid pro-rata</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- live stats ---------- */
export function Stats({ count, open, settled, pooled }: { count: number; open: number; settled: number; pooled: number }) {
  const items = [
    { n: count, l: "Markets" },
    { n: open, l: "Open now" },
    { n: `◎ ${pooled.toFixed(2)}`, l: "Total pooled" },
    { n: settled, l: "On-chain proofs" },
  ];
  return (
    <section className="stats">
      {items.map((it) => (
        <div className="stat" key={it.l}>
          <div className="stat-n">{it.n}</div>
          <div className="stat-l">{it.l}</div>
        </div>
      ))}
    </section>
  );
}

/* ---------- how it works ---------- */
export function HowItWorks() {
  const steps = [
    { icon: I.list, t: "Pick a market", d: "Binary YES/NO questions on World Cup results, goals and player props." },
    { icon: I.coin, t: "Stake your side", d: "Your SOL joins a parimutuel pool held by a program-owned vault — never a company wallet." },
    { icon: I.shield, t: "Verified settlement", d: "When the match ends, the TxODDS result is posted; the program recomputes a SHA-256 digest and settles only if it matches." },
    { icon: I.trophy, t: "Claim, trustlessly", d: "Winners claim their pro-rata share directly from the on-chain pool. No middleman, no waiting." },
  ];
  const flow = [
    { icon: I.feed, t: "TxODDS feed", s: "verified results" },
    { icon: I.bolt, t: "Oracle / feeder", s: "posts on-chain" },
    { icon: I.globe, t: "Solana program", s: "checks + settles" },
    { icon: I.trophy, t: "You", s: "claim winnings" },
  ];
  return (
    <section className="section" id="how">
      <div className="section-head">
        <div className="eyebrow">How it works</div>
        <h2>Four steps. Zero &ldquo;trust us.&rdquo;</h2>
        <p>Every step a bettor takes is a real Solana transaction — public and auditable from the first lamport.</p>
      </div>
      <div className="steps">
        {steps.map((s, i) => (
          <div className="step" key={s.t}>
            <div className="step-top">
              <span className="step-icon">{s.icon}</span>
              <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
      <div className="flow">
        {flow.map((f, i) => (
          <React.Fragment key={f.t}>
            <div className="flow-node">
              <span className="flow-icon">{f.icon}</span>
              <div>
                <div className="flow-t">{f.t}</div>
                <div className="flow-s">{f.s}</div>
              </div>
            </div>
            {i < flow.length - 1 && <span className="flow-arrow">→</span>}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

/* ---------- settlement spotlight ---------- */
export function Settlement() {
  const guards = [
    { icon: I.feed, t: "Authorized feeder", d: "Only the market's designated oracle can post a result." },
    { icon: I.lock, t: "After the match only", d: "Settlement is gated to the market's settle window." },
    { icon: I.shield, t: "Hash-checked", d: "The program recomputes the SHA-256 digest and rejects any mismatch." },
    { icon: I.trophy, t: "One-time + public", d: "A market settles once; the proof lives on-chain forever." },
  ];
  return (
    <section className="section settle" id="settlement">
      <div className="section-head">
        <div className="eyebrow">The differentiator</div>
        <h2>Settlement you can verify</h2>
        <p>
          Other apps hide resolution on a private server. ANTE commits the winning outcome and a
          cryptographic proof of it on-chain — so anyone can recompute settlement from the public result.
        </p>
      </div>
      <div className="settle-grid">
        <div className="compare">
          <div className="compare-row bad">
            <span className="compare-tag">Most apps</span>
            <span>&ldquo;You won — redeem for cash.&rdquo; <em>Source: a private server.</em></span>
          </div>
          <div className="compare-row good">
            <span className="compare-tag">ANTE</span>
            <span>Winner + SHA-256 digest on-chain, with a one-click Solana Explorer link.</span>
          </div>
          <a className="btn-ghost" href={EXPLORER} target="_blank" rel="noreferrer">View the program on Solana Explorer →</a>
        </div>
        <div className="guards">
          {guards.map((g) => (
            <div className="guard" key={g.t}>
              <span className="guard-icon">{g.icon}</span>
              <div>
                <div className="guard-t">{g.t}</div>
                <div className="guard-d">{g.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- markets CTA band ---------- */
export function MarketsCTA({ open, pooled }: { open: number; pooled: number }) {
  return (
    <section className="section">
      <div className="markets-cta" id="markets">
        <div className="markets-cta-copy">
          <div className="eyebrow">Live on devnet</div>
          <h2>{open} markets open right now</h2>
          <p>
            ◎ {pooled.toFixed(2)} already pooled on-chain. Connect a wallet on Devnet, grab free test SOL,
            and place a real bet — settlement and payout happen trustlessly on Solana.
          </p>
        </div>
        <a className="btn-primary markets-cta-btn" href="/markets">Browse all markets →</a>
      </div>
    </section>
  );
}

/* ---------- protocol + roadmap ---------- */
export function Protocol() {
  const facts = [
    { icon: I.globe, t: "Built on Solana", d: "Fast, low-fee, composable settlement and payouts." },
    { icon: I.coin, t: "Parimutuel pools", d: "Stakes pool in a program-owned PDA and pay winners pro-rata." },
    { icon: I.shield, t: "On-chain proofs", d: "Every settlement commits a SHA-256 digest of the verified result." },
    { icon: I.feed, t: "TxODDS feed", d: "Verified ground-truth results behind a single, swappable adapter." },
  ];
  const roadmap = ["M-of-N feeder set", "On-chain dispute window", "Mainnet launch", "More competitions & sports"];
  return (
    <section className="section protocol" id="protocol">
      <div className="section-head">
        <div className="eyebrow">The protocol</div>
        <h2>A settlement layer, not just a betting app</h2>
        <p>The whole stack depends only on the TxODDS adapter interface — mock today, live feed with one swap.</p>
      </div>
      <div className="facts">
        {facts.map((f) => (
          <div className="fact" key={f.t}>
            <span className="fact-icon">{f.icon}</span>
            <div className="fact-t">{f.t}</div>
            <div className="fact-d">{f.d}</div>
          </div>
        ))}
      </div>
      <div className="protocol-foot">
        <a className="prog-chip" href={EXPLORER} target="_blank" rel="noreferrer">
          <span>Program (devnet)</span>
          <code>{short}</code>
          <span className="prog-go">↗</span>
        </a>
        <div className="roadmap">
          <span className="roadmap-label">Roadmap</span>
          {roadmap.map((r) => (
            <span className="roadmap-item" key={r}>{r}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- footer ---------- */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <span className="logo">ANTE</span>
          <p>Verifiable settlement for prediction markets.</p>
        </div>
        <div className="footer-links">
          <a href="/#how">How it works</a>
          <a href="/markets">Markets</a>
          <a href={EXPLORER} target="_blank" rel="noreferrer">Program ↗</a>
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">Devnet faucet ↗</a>
        </div>
      </div>
      <div className="footer-bot">
        Built for the TxODDS World Cup Hackathon — Prediction Markets &amp; Settlement.
      </div>
    </footer>
  );
}
