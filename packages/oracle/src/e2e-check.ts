import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import anchor from "@coral-xyz/anchor";

// End-to-end smoke test against the DEPLOYED devnet program: spins up a throwaway
// market + a fresh "user" wallet, then exercises the full lifecycle with
// assertions — initialize -> bet -> settle -> claim -> payout. The temporary
// market id is not in the catalogue, so it never shows in the app.
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=~/.config/solana/id.json node packages/oracle/src/e2e-check.ts
const { web3, AnchorProvider, Program, BN, Wallet } = anchor;

const RPC = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const idl = JSON.parse(readFileSync(fileURLToPath(new URL("../../../target/idl/ante_market.json", import.meta.url)), "utf8"));
const PROGRAM_ID = new web3.PublicKey(idl.address);
const connection = new web3.Connection(RPC, "confirmed");

const main = web3.Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`, "utf8"))),
);
const AUTH = main.publicKey;
const SOL = web3.LAMPORTS_PER_SOL;

const marketPda = (id: string) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from("market"), AUTH.toBuffer(), Buffer.from(id)], PROGRAM_ID)[0];
const betPda = (m: any, bettor: any, ob: number) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from("bet"), m.toBuffer(), bettor.toBuffer(), Buffer.from([ob])], PROGRAM_ID)[0];
const customDigest = (id: string, outcome: string) => Array.from(createHash("sha256").update(`${id}:${outcome}`).digest());

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  ok ? pass++ : fail++;
};

(async () => {
  const id = `e2e-${Date.now()}`;
  const mkt = marketPda(id);
  const settleAfter = Math.floor(Date.now() / 1000) + 6; // cutoff: bets allowed now, settlement once it passes
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const mainProgram = new Program(idl, new AnchorProvider(connection, new Wallet(main), { commitment: "confirmed" }));

  // fresh "user"
  const user = web3.Keypair.generate();
  const userProgram = new Program(idl, new AnchorProvider(connection, new Wallet(user), { commitment: "confirmed" }));

  console.log(`\nDEVNET E2E  program=${PROGRAM_ID.toBase58()}  market=${id}\n`);

  // 1. create market
  await mainProgram.methods.initializeMarket(id, "", { custom: {} }, new BN(settleAfter), 0, web3.PublicKey.default)
    .accountsPartial({ market: mkt, authority: AUTH, systemProgram: web3.SystemProgram.programId }).rpc();
  let m: any = await mainProgram.account.market.fetch(mkt);
  check("initialize_market", "open" in m.status && m.marketId === id);

  // 2. fund user
  await web3.sendAndConfirmTransaction(connection,
    new web3.Transaction().add(web3.SystemProgram.transfer({ fromPubkey: AUTH, toPubkey: user.publicKey, lamports: 0.2 * SOL })), [main]);
  check("fund user wallet", (await connection.getBalance(user.publicKey)) >= 0.2 * SOL, user.publicKey.toBase58());

  // 3. user bets YES 0.05, house seeds NO 0.05 (losing pool)
  await userProgram.methods.placeBet({ yes: {} }, new BN(0.05 * SOL))
    .accountsPartial({ market: mkt, bet: betPda(mkt, user.publicKey, 1), bettor: user.publicKey, systemProgram: web3.SystemProgram.programId }).rpc();
  await mainProgram.methods.placeBet({ no: {} }, new BN(0.05 * SOL))
    .accountsPartial({ market: mkt, bet: betPda(mkt, AUTH, 2), bettor: AUTH, systemProgram: web3.SystemProgram.programId }).rpc();
  m = await mainProgram.account.market.fetch(mkt);
  check("place_bet (YES user + NO house)", m.poolYes.toNumber() === 0.05 * SOL && m.poolNo.toNumber() === 0.05 * SOL,
    `yes=${m.poolYes.toNumber() / SOL} no=${m.poolNo.toNumber() / SOL}`);

  // 3b. once the cutoff passes, betting must be rejected
  await sleep(8000);
  let lateBlocked = false;
  try {
    await userProgram.methods.placeBet({ yes: {} }, new BN(0.01 * SOL))
      .accountsPartial({ market: mkt, bet: betPda(mkt, user.publicKey, 1), bettor: user.publicKey, systemProgram: web3.SystemProgram.programId }).rpc();
  } catch { lateBlocked = true; }
  check("bet after cutoff rejected", lateBlocked);

  // 4. settle YES (oracle posts verified outcome + digest; program re-checks the hash)
  await mainProgram.methods.postCustomResult({ yes: {} }, customDigest(id, "YES"))
    .accountsPartial({ market: mkt, oracle: AUTH }).rpc();
  m = await mainProgram.account.market.fetch(mkt);
  check("post_custom_result -> resolved YES", "resolved" in m.status && "yes" in m.winningOutcome);

  // 5. user claims pro-rata (0.05 stake of a 0.10 pool -> ~0.10 payout).
  // The Bet account closes with the claim (rent back to the bettor), so the
  // post-claim state is: balance up, bet account gone.
  const before = await connection.getBalance(user.publicKey);
  await userProgram.methods.claim()
    .accountsPartial({ market: mkt, bet: betPda(mkt, user.publicKey, 1), bettor: user.publicKey }).rpc();
  const after = await connection.getBalance(user.publicKey);
  const bet: any = await mainProgram.account.bet.fetchNullable(betPda(mkt, user.publicKey, 1));
  check("claim pays out winner + closes bet (rent back)", after > before && bet === null,
    `+${((after - before) / SOL).toFixed(4)} SOL, bet account closed=${bet === null}`);

  // 6. guard: double-claim must fail (the bet account no longer exists)
  let doubleBlocked = false;
  try {
    await userProgram.methods.claim().accountsPartial({ market: mkt, bet: betPda(mkt, user.publicKey, 1), bettor: user.publicKey }).rpc();
  } catch { doubleBlocked = true; }
  check("double-claim rejected", doubleBlocked);

  console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("E2E ERROR:", e?.message || e); process.exit(1); });
