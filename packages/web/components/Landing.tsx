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
          <div className="eyebrow">Prediction markets · Solana</div>
          <h1>
            Bet on the World Cup.
            <br />
            <span className="grad">Settled on-chain, in the open.</span>
          </h1>
          <p className="lede">
            ANTE settles every market from TxODDS match results and writes the outcome — plus a
            SHA-256 proof — to Solana. Most apps just tell you that you won. ANTE lets you check.
          </p>
          <div className="cta-row">
            <a className="btn-primary" href="/markets">Explore live markets →</a>
            <a className="btn-ghost" href="#how">See how it works</a>
          </div>
          <div className="trust-row">
            <span><i className="dot dot-green" /> Live on Devnet</span>
            <span><i className="dot dot-cyan" /> TxODDS results</span>
            <span><i className="dot dot-gold" /> Built on Solana</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="showcase-card">
            <div className="sc-art">
              <img src="/art/spain.png" alt="Spain match market" />
              <span className="sc-kind">Match Result</span>
              <span className="sc-live">● SETTLED</span>
            </div>
            <div className="sc-body">
              <h3>La Roja Roll the Desert Hawks</h3>
              <div className="sc-odds"><span className="sc-yes" /></div>
              <div className="sc-proof">
                <div className="sc-proof-head">
                  <span>✓ Settled on-chain</span>
                  <span className="pill pill-yes">YES won</span>
                </div>
                <code>sha256 · a51a13321266…8f8642</code>
                <span className="sc-proof-note">Checked against the TxODDS result</span>
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
    { icon: I.list, t: "Pick a market", d: "Yes/no questions on World Cup match results, total goals, and player props." },
    { icon: I.coin, t: "Stake your side", d: "Your SOL goes into a shared pool the program controls — not a company wallet." },
    { icon: I.shield, t: "Settle from the result", d: "When the match ends, the TxODDS result is posted on-chain. The program recomputes the SHA-256 digest and settles only if it matches." },
    { icon: I.trophy, t: "Claim your share", d: "Winners take their share of the pool directly on-chain. No middleman, no waiting." },
  ];
  const flow = [
    { icon: I.feed, t: "TxODDS feed", s: "match results" },
    { icon: I.bolt, t: "Oracle / feeder", s: "posts on-chain" },
    { icon: I.globe, t: "Solana program", s: "checks + settles" },
    { icon: I.trophy, t: "You", s: "claim winnings" },
  ];
  return (
    <section className="section" id="how">
      <div className="section-head">
        <div className="eyebrow">How it works</div>
        <h2>Four steps, start to finish.</h2>
        <p>Every step is a real Solana transaction that anyone can look up.</p>
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
    { icon: I.feed, t: "One feeder", d: "Only the market's assigned oracle can post a result." },
    { icon: I.lock, t: "Time-locked", d: "A market can't settle before its scheduled time." },
    { icon: I.shield, t: "Hash-checked", d: "The program recomputes the SHA-256 digest and rejects any mismatch." },
    { icon: I.trophy, t: "Once, and public", d: "A market settles one time, and the proof stays on-chain." },
  ];
  return (
    <section className="section settle" id="settlement">
      <div className="section-head">
        <div className="eyebrow">Settlement</div>
        <h2>Settlement you can check</h2>
        <p>
          Most apps decide the result on a private server. ANTE writes the winning outcome and a
          SHA-256 proof on-chain, so anyone can recompute it from the public match result.
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
            <span>Winner and SHA-256 proof on-chain, with a link to Solana Explorer.</span>
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
            ◎ {pooled.toFixed(2)} pooled on-chain so far. Connect a Devnet wallet, get free test SOL,
            and place a real bet. Settlement and payout run on Solana.
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
    { icon: I.globe, t: "Solana", d: "Fast, low-fee transactions for bets, settlement, and payouts." },
    { icon: I.coin, t: "Parimutuel pools", d: "Bets pool in a program-owned account and pay winners pro-rata." },
    { icon: I.shield, t: "On-chain proofs", d: "Every settlement writes a SHA-256 digest of the match result." },
    { icon: I.feed, t: "TxODDS feed", d: "Live World Cup results, read through one adapter." },
  ];
  const roadmap = ["Multiple feeders", "On-chain dispute window", "Mainnet launch", "More competitions & sports"];
  return (
    <section className="section protocol" id="protocol">
      <div className="section-head">
        <div className="eyebrow">The protocol</div>
        <h2>Under the hood</h2>
        <p>Markets settle from the live TxODDS World Cup feed, read through one adapter the rest of the code depends on.</p>
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
          <p>Prediction markets that settle on-chain.</p>
        </div>
        <div className="footer-links">
          <a href="/#how">How it works</a>
          <a href="/markets">Markets</a>
          <a href="https://github.com/RYthaGOD/ante" target="_blank" rel="noreferrer">GitHub ↗</a>
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
