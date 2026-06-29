import { Buffer } from "buffer";
import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import { Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

// A self-signing, in-memory wallet used ONLY for the devnet demo recording, so
// the real bet / claim flows can be driven without a browser-extension popup.
// Enabled by NEXT_PUBLIC_DEMO_WALLET=1 with a throwaway, pre-funded devnet
// keypair in NEXT_PUBLIC_DEMO_SECRET (JSON secret-key array). Never use a real
// wallet here — the secret ships to the client by design.
export const DEMO_WALLET_NAME = "Demo Wallet" as WalletName<"Demo Wallet">;

const ICON =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#5ee7df"/><text x="24" y="33" font-family="Arial" font-size="26" font-weight="bold" text-anchor="middle" fill="#0b1020">A</text></svg>`,
  ).toString("base64");

export class DemoWalletAdapter extends BaseSignerWalletAdapter {
  name = DEMO_WALLET_NAME;
  url = "https://ante.markets";
  icon = ICON;
  readonly supportedTransactionVersions = null;

  private _keypair: Keypair;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  readyState = WalletReadyState.Installed;

  constructor(secret: number[]) {
    super();
    this._keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }
  get connecting(): boolean {
    return this._connecting;
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    try {
      this._connecting = true;
      this._publicKey = this._keypair.publicKey;
      // Defer the 'connect' emit to a macrotask: WalletProvider attaches its
      // event listener in a parent effect that runs *after* this child effect,
      // so a synchronous emit would be missed. setTimeout(0) fires after the
      // effect flush, once the provider is subscribed.
      await new Promise((r) => setTimeout(r, 0));
      this.emit("connect", this._publicKey);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this._keypair]);
    } else {
      (tx as Transaction).partialSign(this._keypair);
    }
    return tx;
  }
}

export function makeDemoWallet(): DemoWalletAdapter | null {
  if (process.env.NEXT_PUBLIC_DEMO_WALLET !== "1") return null;
  const raw = process.env.NEXT_PUBLIC_DEMO_SECRET;
  if (!raw) return null;
  try {
    return new DemoWalletAdapter(JSON.parse(raw) as number[]);
  } catch {
    return null;
  }
}
