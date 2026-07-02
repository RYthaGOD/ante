// ANTE market keeper. Each run it tops the board back up to ROT_TARGET open
// markets by pulling upcoming World Cup fixtures from the live TxODDS feed and
// seeding a market for any that isn't on-chain yet. Settlement is handled by the
// settler service. Runs on a Railway cron.
//
// Env:
//   ANCHOR_PROVIDER_URL  RPC (default devnet)
//   ROTATE_SECRET        market authority secret-key JSON array (Railway) — must
//                        be the authority the web derives PDAs with.
//   TXODDS_API_TOKEN     long-lived TxODDS API token (guest JWT auto-refreshed)
//   TXODDS_BASE_URL      default https://txline.txodds.com
//   ROT_TARGET           how many markets to keep open (default 10)
//   TXODDS_COMPETITION   competition id to pull fixtures from (default 72 = WC)
//   FEED_PUBKEY          base58 feed signing pubkey new markets must verify
//                        against (public key only — the secret lives with the
//                        settler); omit to seed unbound markets
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import anchor from "@coral-xyz/anchor";

const { web3, AnchorProvider, Program, BN, Wallet } = anchor;
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const idl = JSON.parse(readFileSync(here("./idl.json"), "utf8"));
const teams = JSON.parse(readFileSync(here("./teams.json"), "utf8")).teams;
const RPC = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const BASE = process.env.TXODDS_BASE_URL || "https://txline.txodds.com";
const API = process.env.TXODDS_API_TOKEN;
const TARGET = Number(process.env.ROT_TARGET || 10);
const COMP = process.env.TXODDS_COMPETITION || "72";

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

// Feed signing pubkey for new markets: env, or derived from the repo-root
// keypair on local runs. Default = markets settle without a feed signature.
function feedPubkey() {
  if (process.env.FEED_PUBKEY) return new web3.PublicKey(process.env.FEED_PUBKEY);
  try {
    const raw = readFileSync(here("../.feed-signer-keypair.json"), "utf8");
    return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))).publicKey;
  } catch { return web3.PublicKey.default; }
}
const FEED_PK = feedPubkey();

const marketPda = (id) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from("market"), AUTH.toBuffer(), Buffer.from(id)], program.programId)[0];
const kindArg = (k) => (k === "home_win" ? { homeWin: {} } : { over25: {} });
const nowSec = () => Math.floor(Date.now() / 1000);

// feed team name (or alias) -> 3-letter slug code
const NAME2CODE = {};
for (const t of teams) { NAME2CODE[t.name.toLowerCase()] = t.code; for (const a of t.aliases) NAME2CODE[a] = t.code; }
const code = (name) => NAME2CODE[String(name || "").toLowerCase()] || null;

async function retry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
}
async function freshJwt() {
  const r = await fetch(`${BASE}/auth/guest/start`, { method: "POST" });
  const t = await r.text();
  try { return JSON.parse(t).token; } catch { return t.trim(); }
}

async function seed(c) {
  await program.methods
    .initializeMarket(c.marketId, String(c.fixtureId), kindArg(c.kind), new BN(c.settleAfter), 0, FEED_PK)
    .accountsPartial({ market: marketPda(c.marketId), authority: AUTH, systemProgram: web3.SystemProgram.programId })
    .rpc();
  return `seeded ${c.marketId} (closes ${new Date(c.settleAfter * 1000).toISOString().slice(0, 16)})`;
}

(async () => {
  if (!API) throw new Error("TXODDS_API_TOKEN not set");

  // 1. what's already on-chain (by fixture slug) + how many are open —
  // decoded per-account so legacy layouts can't abort the run
  const raw = await retry(() =>
    conn.getProgramAccounts(program.programId, {
      commitment: "confirmed",
      filters: [{ memcmp: { offset: 8, bytes: AUTH.toBase58() } }],
    }),
  );
  const all = [];
  for (const { pubkey, account } of raw) {
    try { all.push({ publicKey: pubkey, account: program.coder.accounts.decode("market", account.data) }); }
    catch { /* skip */ }
  }
  const existingSlugs = new Set(all.map((m) => m.account.marketId.split(":")[0]));
  let open = all.filter((m) => "open" in m.account.status && m.account.settleAfter.toNumber() > nowSec()).length;

  // 2. upcoming fixtures from the live feed
  const jwt = await freshJwt();
  const url = new URL(`${BASE}/api/fixtures/snapshot`);
  url.searchParams.set("competitionId", COMP);
  const rows = await (await fetch(url, { headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": API } })).json();
  const now = nowSec();
  const candidates = [];
  for (const r of (rows || [])) {
    const start = Math.floor((r.StartTime ?? 0) / 1000);
    if (start < now + 3600) continue; // must leave a betting window (>1h out)
    const hc = code(r.Participant1), ac = code(r.Participant2);
    if (!hc || !ac) continue; // unknown team -> skip (can't render)
    const slug = `wc26-${hc}-${ac}`;
    if (existingSlugs.has(slug)) continue; // already have a market for this fixture
    const kind = r.FixtureId % 2 === 0 ? "home_win" : "over_2_5";
    candidates.push({ marketId: `${slug}:${kind}`, fixtureId: r.FixtureId, kind, settleAfter: start, slug });
  }
  candidates.sort((a, b) => a.settleAfter - b.settleAfter);

  // 3. seed the soonest fixtures until we're back to TARGET open
  let seeded = 0;
  for (const c of candidates) {
    if (open >= TARGET) break;
    try { console.log(await seed(c)); existingSlugs.add(c.slug); open++; seeded++; }
    catch (e) { console.log("seed err", c.marketId, String(e.message).slice(0, 90)); }
  }
  console.log(`keeper done · open=${open}/${TARGET} · seeded=${seeded} · candidates-left=${candidates.length - seeded}`);
})().catch((e) => { console.error("ROTATE ERROR", e?.message || e); process.exit(1); });
