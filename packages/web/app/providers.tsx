"use client";

import { Buffer } from "buffer";
import { ReactNode, useEffect, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_URL } from "../lib/anchor";
import { makeDemoWallet, DEMO_WALLET_NAME } from "../lib/demoWallet";

// web3.js / anchor expect a global Buffer in the browser.
if (typeof window !== "undefined") {
  (window as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
}

// In demo mode, auto-select + auto-connect the in-memory demo wallet so the
// bet / claim flows are ready to record with no extension popup.
function DemoAutoConnect() {
  const { select, connect, connected, wallet, connecting } = useWallet();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_WALLET !== "1") return;
    if (!wallet) select(DEMO_WALLET_NAME);
  }, [wallet, select]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_WALLET !== "1") return;
    if (wallet && !connected && !connecting) connect().catch(() => {});
  }, [wallet, connected, connecting, connect]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  // Phantom & friends register as Standard Wallets and are auto-detected.
  // The demo wallet is added explicitly only when NEXT_PUBLIC_DEMO_WALLET=1.
  const wallets = useMemo(() => {
    const demo = makeDemoWallet();
    return demo ? [demo] : [];
  }, []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <DemoAutoConnect />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
