// ANTE live settler. Each run it discovers every market on-chain and settles any
// whose match is final, reading the real TxODDS (TxLINE) feed — no mock, no
// random. Runs on a Railway cron. The guest JWT is short-lived so it's refreshed
// every run; only the long-lived API token needs to be configured.
//
// Env:
//   ANCHOR_PROVIDER_URL  RPC (default devnet)
//   SETTLER_SECRET       oracle/authority secret-key JSON array (Railway)
//   TXODDS_API_TOKEN     long-lived TxODDS API token (required)
//   TXODDS_BASE_URL      default https://txline.txodds.com
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import anchor from "@coral-xyz/anchor";

const { web3, AnchorProvider, Program, Wallet } = anchor;
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const idl = JSON.parse(readFileSync(here("./idl.json"), "utf8"));
const map = JSON.parse(readFileSync(here("./txodds-map.json"), "utf8")); // old slug-id markets
const RPC = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const BASE = process.env.TXODDS_BASE_URL || "https://txline.txodds.com";
const API = process.env.TXODDS_API_TOKEN;

function loadWallet() {
  if (process.env.SETTLER_SECRET)
    return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SETTLER_SECRET)));
  const p = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}
const kp = loadWallet();
const AUTH = kp.publicKey;
const conn = new web3.Connection(RPC, "confirmed");
const program = new Program(idl, new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" }));

const sha = (s) => Array.from(createHash("sha256").update(s).digest());
const nowSec = () => Math.floor(Date.now() / 1000);
const isScore = (k) => "homeWin" in k || "over25" in k;

async function retry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
}

// Numeric TxODDS FixtureId for a market: new markets store it directly in
// fixture_id; original markets store a slug resolved via the static map.
function numericFixtureId(fixtureId) {
  if (/^\d+$/.test(fixtureId)) return fixtureId;
  return map.fixtures?.[fixtureId]?.fixtureId || null;
}

// --- live TxODDS scores (SSE) --------------------------------------------
const FINAL = "game_finalised";
const parseSse = (t) =>
  t.split(/\r?\n/).filter((l) => l.startsWith("data:"))
    .map((l) => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
    .filter(Boolean);
function finalGoals(ev, fi) {
  for (let i = fi; i >= 0; i--) {
    const s = ev[i].Score;
    if (s && (s.Participant1 || s.Participant2))
      return { p1: s.Participant1?.Total?.Goals ?? 0, p2: s.Participant2?.Total?.Goals ?? 0 };
  }
  return null;
}
async function freshJwt() {
  const r = await fetch(`${BASE}/auth/guest/start`, { method: "POST" });
  const t = await r.text();
  try { return JSON.parse(t).token; } catch { return t.trim(); }
}
async function getResult(jwt, numeric) {
  const r = await fetch(`${BASE}/api/scores/historical/${numeric}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": API },
  });
  if (!r.ok) return null;
  const ev = parseSse(await r.text());
  if (!ev.length) return null;
  let fi = -1;
  for (let i = ev.length - 1; i >= 0; i--) if (ev[i].Action === FINAL) { fi = i; break; }
  if (fi < 0) return null; // not final yet
  return finalGoals(ev, fi);
}

(async () => {
  if (!API) throw new Error("TXODDS_API_TOKEN not set");
  const all = await retry(() =>
    program.account.market.all([{ memcmp: { offset: 8, bytes: AUTH.toBase58() } }]),
  );
  const jwt = await freshJwt();
  let settled = 0, pending = 0, skipped = 0;
  for (const { publicKey, account } of all) {
    const id = account.marketId;
    if (!isScore(account.kind) || !("open" in account.status) || account.settleAfter.toNumber() > nowSec()) {
      skipped++; continue;
    }
    const numeric = numericFixtureId(account.fixtureId);
    if (!numeric) { skipped++; continue; }
    let g;
    try { g = await getResult(jwt, numeric); }
    catch (e) { console.log("feed err", id, String(e.message).slice(0, 80)); continue; }
    if (!g) { pending++; continue; } // match not final yet
    try {
      await program.methods
        .postResult(g.p1, g.p2, sha(`${id}:${g.p1}:${g.p2}`))
        .accountsPartial({ market: publicKey, oracle: AUTH })
        .rpc();
      console.log(`settled ${id} ${g.p1}-${g.p2}`);
      settled++;
    } catch (e) { console.log("settle err", id, String(e.message).slice(0, 90)); }
  }
  console.log(`settler done · settled=${settled} pending=${pending} skipped=${skipped}`);
})().catch((e) => { console.error("SETTLER ERROR", e?.message || e); process.exit(1); });
