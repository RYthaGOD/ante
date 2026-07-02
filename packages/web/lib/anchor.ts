import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl/ante_market.json";
import type { AnteMarket } from "./idl/ante_market";

export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC ?? "http://127.0.0.1:8899";

// The wallet that created the markets (PDA seed). Set for devnet so the client
// can derive market PDAs and batch-fetch them instead of using the heavily
// rate-limited getProgramAccounts.
export const MARKET_AUTHORITY = process.env.NEXT_PUBLIC_MARKET_AUTHORITY
  ? new PublicKey(process.env.NEXT_PUBLIC_MARKET_AUTHORITY)
  : null;

export function marketPda(authority: PublicKey, marketId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), authority.toBuffer(), Buffer.from(marketId)],
    PROGRAM_ID,
  )[0];
}

// Solana Explorer links for the on-chain settlement proof.
export const EXPLORER_CLUSTER = RPC_URL.includes("devnet")
  ? "devnet"
  : RPC_URL.includes("testnet")
    ? "testnet"
    : RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost")
      ? "custom"
      : "mainnet-beta";

export function explorerAddress(addr: string): string {
  const base = `https://explorer.solana.com/address/${addr}`;
  return EXPLORER_CLUSTER === "mainnet-beta" ? base : `${base}?cluster=${EXPLORER_CLUSTER}`;
}

export function explorerTx(sig: string): string {
  const base = `https://explorer.solana.com/tx/${sig}`;
  return EXPLORER_CLUSTER === "mainnet-beta" ? base : `${base}?cluster=${EXPLORER_CLUSTER}`;
}

export function getProgram(provider: AnchorProvider): Program<AnteMarket> {
  return new Program(idl as AnteMarket, provider);
}

// Read-only program for listing markets (no wallet needed).
export function getReadonlyProgram(connection: Connection): Program<AnteMarket> {
  const provider = new AnchorProvider(connection, {} as never, { commitment: "confirmed" });
  return new Program(idl as AnteMarket, provider);
}

export function betPda(market: PublicKey, bettor: PublicKey, outcomeByte: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer(), Buffer.from([outcomeByte])],
    PROGRAM_ID,
  )[0];
}

export { BN };
