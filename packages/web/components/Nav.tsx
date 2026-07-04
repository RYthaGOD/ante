"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function Nav() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [bal, setBal] = useState<number | null>(null);

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
          <a href="/#how">How it works</a>
          <a href="/#settlement">Settlement</a>
          <a href="/markets">Markets</a>
          <a href="/#protocol">Protocol</a>
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
      </div>
    </header>
  );
}
