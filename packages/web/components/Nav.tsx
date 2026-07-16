"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const LINKS = [
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/#how", label: "How it works" },
  { href: "/#settlement", label: "Settlement" },
];

export function Nav() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [bal, setBal] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setBal(null);
      return;
    }
    let live = true;
    const refresh = () =>
      connection.getBalance(publicKey).then((b) => live && setBal(b / LAMPORTS_PER_SOL)).catch(() => {});
    refresh();
    // Keep the header balance fresh after bets/claims without cross-component wiring.
    const t = setInterval(refresh, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [publicKey, connection]);

  return (
    <header className="nav" id="top">
      <div className="nav-inner">
        <a className="nav-brand" href="/">
          <span className="logo">ANTE</span>
          <span className="nav-badge">Protocol</span>
        </a>
        <nav className="nav-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
          <a href="https://golazo-web-production.up.railway.app/" target="_blank" rel="noreferrer">
            Golazo ↗
          </a>
        </nav>
        <div className="wallet-area">
          {!publicKey && (
            <a className="devnet-hint" href="https://faucet.solana.com" target="_blank" rel="noreferrer">
              Devnet · faucet ↗
            </a>
          )}
          {bal !== null && <span className="bal">◎ {bal.toFixed(2)}</span>}
          <WalletMultiButton />
        </div>
        <button
          className="nav-toggle"
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label={menu ? "Close menu" : "Open menu"}
          aria-expanded={menu}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </div>

      {menu && (
        <nav className="nav-mobile">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenu(false)}>{l.label}</a>
          ))}
          <a
            href="https://golazo-web-production.up.railway.app/"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMenu(false)}
          >
            Golazo ↗
          </a>
        </nav>
      )}
    </header>
  );
}
