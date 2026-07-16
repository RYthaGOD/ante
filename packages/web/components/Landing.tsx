/* eslint-disable @next/next/no-img-element */
import React from "react";

const PROGRAM = "G1tgXodmDq9X3MTtdHLNpjDWscUqsjiW29fcpUHvJoHu";
const EXPLORER = `https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`;
const short = `${PROGRAM.slice(0, 4)}…${PROGRAM.slice(-4)}`;

// The settlement check, syntax-highlighted. HTML-escaped so `<`/`>`/`&` in the
// code render as text while the <span> class tags style it (injected as raw HTML).
const SETTLE_SNIPPET = `<span class="k">pub fn</span> post_result(ctx, home, away, sig) -&gt; Result&lt;()&gt; {
    <span class="c">// 1 · the score is signed by the TxODDS feed —</span>
    <span class="c">//     verify the ed25519 signature on-chain</span>
    verify_feed_sig(market.feed_pubkey, &amp;score, &amp;sig)<span class="e">?</span>;

    <span class="c">// 2 · recompute the SHA-256 commitment,</span>
    <span class="c">//     refuse to settle on any mismatch</span>
    <span class="k">let</span> digest = sha256(<span class="s">"&lt;market&gt;:&lt;home&gt;:&lt;away&gt;"</span>);
    require!(digest == expected, <span class="e">BadProof</span>);

    <span class="c">// 3 · settle once — winner + digest go on-chain</span>
    market.settle(outcome(home, away), digest)<span class="e">?</span>;
    Ok(())
}`;

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
  key: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 5l2 2M14 8l2 2" />
    </svg>
  ),
};

/* ---------- marquee ticker ---------- */
export function Ticker({ variant, items }: { variant: "lime" | "mono"; items: React.ReactNode[] }) {
  const track = (k: string, hidden: boolean) => (
    <div className="ticker-track" key={k} aria-hidden={hidden}>
      {items.map((it, i) => (
        <span className="ticker-item" key={`${k}-${i}`}>{it}</span>
      ))}
    </div>
  );
  return (
    <div className={`ticker ticker-${variant}`}>
      {track("a", false)}
      {track("b", true)}
    </div>
  );
}

/* ---------- hero ---------- */
export function Hero({ open, settled, pooled }: { open: number; settled: number; pooled: number }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="eyebrow">Prediction markets · Solana devnet</div>
        <h1>
          Bet on the <span className="cyan">World Cup.</span>
          <br />
          Settled on-chain.
        </h1>
        <p className="lede">
          ANTE settles every market from <span className="hl-lime">TxODDS</span> match results and
          writes the outcome — plus a <span className="hl-cyan">SHA-256 proof</span> — to Solana.
          Most apps just tell you that you won. ANTE lets you check.
        </p>
        <div className="cta-row">
          <a className="btn-primary lg" href="/markets">Explore live markets →</a>
          <a className="btn-ghost lg" href="#how">See how it works</a>
        </div>
        <div className="trust-row">
          <span><i className="dot dot-live" /> Live on Devnet</span>
          <span><i className="dot dot-cyan" /> TxODDS results</span>
          <span><i className="dot dot-lime" /> Built on Solana</span>
        </div>
      </div>
      <div className="hero-ticker">
        <Ticker
          variant="lime"
          items={[
            <><b>TOTAL STAKED</b> ◎ {pooled.toFixed(2)}</>,
            <><b>ON-CHAIN PROOFS</b> {settled}</>,
            <><b>MARKETS OPEN</b> {open}</>,
            <><b>SETTLED FROM</b> TxODDS</>,
            <><b>NETWORK</b> SOLANA DEVNET</>,
          ]}
        />
      </div>
    </section>
  );
}

/* ---------- live stats ---------- */
export function Stats({ count, open, settled, pooled }: { count: number; open: number; settled: number; pooled: number }) {
  const items = [
    { n: count, l: "Markets" },
    { n: open, l: "Open now" },
    { n: `◎ ${pooled.toFixed(2)}`, l: "Total staked" },
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

/* ---------- settlement flow (lime band) ---------- */
export function SettleFlow() {
  const steps = [
    { n: "01", t: "Pick", d: "Yes/no questions on World Cup match results, total goals, and player props — read from verified TxODDS feeds." },
    { n: "02", t: "Stake", d: "Commit SOL to a shared pool the program controls — not a company wallet." },
    { n: "03", t: "Settle", d: "The TxODDS result is posted on-chain. The program verifies the feed's ed25519 signature and the SHA-256 proof." },
    { n: "04", t: "Claim", d: "Winners take their pro-rata share of the pool directly on-chain. No middleman, no waiting." },
  ];
  return (
    <section className="settle-flow" id="how">
      <div className="settle-flow-inner">
        <h2>Settlement<br />without trust.</h2>
        <p className="flow-lede">
          Not a private server deciding who won. Every step below is a real Solana transaction anyone
          can look up — pick, stake, settle, and claim, in the open.
        </p>
        <div className="flow-steps">
          {steps.map((s) => (
            <div className="flow-step" key={s.n}>
              <div className="num">{s.n}</div>
              <h4>{s.t}</h4>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- verified by code ---------- */
export function VerifiedByCode() {
  const chips = [
    { icon: I.feed, tone: "cyan", t: "Feed-signed · ed25519 verified" },
    { icon: I.lock, tone: "lime", t: "Time-locked · closes at kickoff" },
    { icon: I.shield, tone: "cyan", t: "Hash-checked · SHA-256 recompute" },
    { icon: I.key, tone: "lime", t: "Settled once · proof stays on-chain" },
  ];
  return (
    <section className="section" id="settlement">
      <div className="verified-grid">
        <div className="verified-copy">
          <div className="eyebrow">Settlement</div>
          <h2>Verified by code.</h2>
          <p>
            Most apps decide the result on a private server. ANTE writes the winning outcome and a
            SHA-256 proof on-chain, so anyone can recompute it from the public TxODDS result.
          </p>
          <div className="compare">
            <div className="compare-row bad">
              <span className="compare-tag">Most apps</span>
              <span>&ldquo;You won — redeem for cash.&rdquo; <em>Source: a private server.</em></span>
            </div>
            <div className="compare-row good">
              <span className="compare-tag">ANTE</span>
              <span>Winner and SHA-256 proof on-chain, with a link to Solana Explorer.</span>
            </div>
          </div>
          <div className="verify-chips">
            {chips.map((c) => (
              <div className="verify-chip" key={c.t}>
                <span className={`vc-icon ${c.tone}`}>{c.icon}</span>
                <span className="vc-t">{c.t}</span>
                <span className="vc-check">✓</span>
              </div>
            ))}
          </div>
        </div>
        <div className="verified-code">
          <div className="code-card">
            <div className="code-dots"><i className="d1" /><i className="d2" /><i className="d3" /></div>
            <pre><code dangerouslySetInnerHTML={{ __html: SETTLE_SNIPPET }} /></pre>
          </div>
          <a className="btn-ghost" href={EXPLORER} target="_blank" rel="noreferrer" style={{ marginTop: 16 }}>
            View the program on Solana Explorer →
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- markets CTA band ---------- */
export function MarketsCTA({ open, pooled }: { open: number; pooled: number }) {
  return (
    <section className="section">
      <div className="cta-band">
        <div className="cta-copy">
          <div className="eyebrow">Live on devnet</div>
          <h2>{open} markets open right now</h2>
          <p>
            ◎ {pooled.toFixed(2)} staked on-chain so far. Connect a Devnet wallet, get free test SOL,
            and place a real bet. Settlement and payout run on Solana.
          </p>
        </div>
        <a className="btn-primary lg" href="/markets">Browse all markets →</a>
      </div>
    </section>
  );
}

/* ---------- golazo CTA band ---------- */
export function GolazoCTA() {
  return (
    <section className="section">
      <div className="cta-band golazo">
        <div className="cta-copy">
          <div className="eyebrow">From the same builders</div>
          <h2>The World Cup ends. Golazo doesn&rsquo;t.</h2>
          <p>
            A World Cup trading-card game on Solana — open packs, collect players rated from real
            stats, build your 5, and battle (or stake SOL on it). Golazo even uses ANTE&rsquo;s
            on-chain settlement to recompute match stats.
          </p>
        </div>
        <a className="btn-primary lg" href="https://golazo-web-production.up.railway.app/" target="_blank" rel="noreferrer">
          Try Golazo →
        </a>
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
    <section className="section" id="protocol">
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
          <span className="go">↗</span>
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

/* ---------- bottom mono ticker ---------- */
export function BottomTicker() {
  return (
    <div style={{ margin: "40px 0" }}>
      <Ticker
        variant="mono"
        items={[
          <><b>PROGRAM</b> {short}</>,
          <><b>NETWORK</b> SOLANA DEVNET</>,
          <><b>PROOF</b> SHA-256 + ED25519</>,
          <><b>FEED</b> TxODDS</>,
          <><b>SETTLEMENT</b> ON-CHAIN · PUBLIC</>,
          <><b>PAYOUT</b> PARIMUTUEL · PRO-RATA</>,
        ]}
      />
    </div>
  );
}

/* ---------- footer ---------- */
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <span className="logo">ANTE</span>
          <p>Prediction markets that settle on-chain — every outcome checkable against the public TxODDS result.</p>
        </div>
        <div className="footer-links">
          <a href="/#how">How it works</a>
          <a href="/#settlement">Settlement</a>
          <a href="/markets">Markets</a>
          <a href="https://golazo-web-production.up.railway.app/" target="_blank" rel="noreferrer">Golazo ↗</a>
          <a href="https://github.com/RYthaGOD/ante" target="_blank" rel="noreferrer">GitHub ↗</a>
          <a href={EXPLORER} target="_blank" rel="noreferrer">Program ↗</a>
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">Devnet faucet ↗</a>
        </div>
      </div>
      <div className="footer-bot">
        <span>Built for the TxODDS World Cup Hackathon — Prediction Markets &amp; Settlement.</span>
        <span className="footer-status"><i className="dot dot-lime" /> Solana devnet · live</span>
      </div>
    </footer>
  );
}
