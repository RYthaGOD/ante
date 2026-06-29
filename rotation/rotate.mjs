// ANTE market rotation engine. Keeps a small set of rotating markets live: each
// run it settles any rotation market whose window has passed ("expires" it) and
// seeds a replacement from the pool — so a new market only appears when one
// expires. Designed to run on a schedule (Railway cron).
//
// Env:
//   ANCHOR_PROVIDER_URL  RPC (default devnet)
//   ROTATE_SECRET        market authority/oracle secret-key JSON array (Railway)
//                        — must be the same authority the web derives PDAs with.
//   ROT_TARGET           how many rotation markets to keep open (default 3)
//   ROT_WINDOW_HOURS     lifespan of each rotation market (default 6)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import anchor from "@coral-xyz/anchor";

const { web3, AnchorProvider, Program, BN, Wallet } = anchor;
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const idl = JSON.parse(readFileSync(here("./idl.json"), "utf8"));
const pool = JSON.parse(readFileSync(here("./pool.json"), "utf8"));
const PROGRAM_ID = new web3.PublicKey(idl.address);
const RPC = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const TARGET = Number(process.env.ROT_TARGET || 3);
const WINDOW_H = Number(process.env.ROT_WINDOW_HOURS || 6);

function loadWallet() {
  if (process.env.ROTATE_SECRET)
    return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.ROTATE_SECRET)));
  const p = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}
const kp = loadWallet();
const AUTH = kp.publicKey;
const conn = new web3.Connection(RPC, "confirmed");
const program = new Program(idl, new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" }));

const marketPda = (id) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from("market"), AUTH.toBuffer(), Buffer.from(id)], PROGRAM_ID)[0];
const kindArg = (k) => (k === "home_win" ? { homeWin: {} } : k === "over_2_5" ? { over25: {} } : { custom: {} });
const sha = (s) => Array.from(createHash("sha256").update(s).digest());
const nowSec = () => Math.floor(Date.now() / 1000);
const rnd = (n) => Math.floor(Math.random() * n);

async function settle(m) {
  const mkt = marketPda(m.id);
  if (m.kind === "custom") {
    const outcome = Math.random() < 0.5 ? "YES" : "NO";
    await program.methods
      .postCustomResult(outcome === "YES" ? { yes: {} } : { no: {} }, sha(`${m.id}:${outcome}`))
      .accountsPartial({ market: mkt, oracle: AUTH })
      .rpc();
    return `expired+settled ${m.id} -> ${outcome}`;
  }
  const home = rnd(4), away = rnd(4);
  await program.methods
    .postResult(home, away, sha(`${m.id}:${home}:${away}`))
    .accountsPartial({ market: mkt, oracle: AUTH })
    .rpc();
  return `expired+settled ${m.id} ${home}-${away}`;
}

async function seed(m) {
  await program.methods
    .initializeMarket(m.id, m.fixtureId || "", kindArg(m.kind), new BN(nowSec() + WINDOW_H * 3600))
    .accountsPartial({ market: marketPda(m.id), authority: AUTH, systemProgram: web3.SystemProgram.programId })
    .rpc();
  return `seeded replacement ${m.id} (window ${WINDOW_H}h)`;
}

(async () => {
  const accts = await program.account.market.fetchMultiple(pool.map((m) => marketPda(m.id)));
  let open = 0;
  const expired = [];
  const unseeded = [];
  pool.forEach((m, i) => {
    const a = accts[i];
    if (!a) return unseeded.push(m);
    if ("resolved" in a.status) return; // already settled this cycle
    if (a.settleAfter.toNumber() <= nowSec()) expired.push(m);
    else open++;
  });

  for (const m of expired) {
    try { console.log(await settle(m)); } catch (e) { console.log("settle err", m.id, String(e.message).slice(0, 90)); }
  }
  // Replace expired markets (open dropped below target) from the dormant pool.
  for (const m of unseeded) {
    if (open >= TARGET) break;
    try { console.log(await seed(m)); open++; } catch (e) { console.log("seed err", m.id, String(e.message).slice(0, 90)); }
  }
  console.log(`rotation done · open=${open}/${TARGET} · expired=${expired.length} · unseeded-left=${unseeded.length - Math.max(0, TARGET - (open - expired.length))}`);
})().catch((e) => { console.error("ROTATE ERROR", e?.message || e); process.exit(1); });
