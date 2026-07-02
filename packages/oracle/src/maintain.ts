import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import anchor from '@coral-xyz/anchor';
import { loadMarkets } from './market/registry.ts';

// One-off on-chain maintenance after the program upgrade:
//   set-close   set each OPEN market's betting/settle cutoff to its kickoff
//               (the program now blocks bets once now >= settle_after).
//   close       close any market under our authority that's no longer in the
//               catalogue (sweeps the old fictional/orphaned markets).
//   all         both, in order.
//
// Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//      ANCHOR_WALLET=~/.config/solana/id.json node src/maintain.ts <set-close|close|all>

const { web3, AnchorProvider, Program, Wallet, BN } = anchor;
const idlUrl = new URL('../../../target/idl/ante_market.json', import.meta.url);
const fixturesUrl = new URL('../fixtures/fixtures.json', import.meta.url);
const unixOf = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function loadProgram() {
  const walletPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  const kp = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, 'utf8'))));
  const connection = new web3.Connection(process.env.ANCHOR_PROVIDER_URL || 'http://127.0.0.1:8899', 'confirmed');
  const idl = JSON.parse(readFileSync(fileURLToPath(idlUrl), 'utf8'));
  const program = new Program(idl, new AnchorProvider(connection, new Wallet(kp), { commitment: 'confirmed' }));
  return { program, authority: kp.publicKey };
}

function marketPda(programId: any, authority: any, marketId: string) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), authority.toBuffer(), Buffer.from(marketId)],
    programId,
  )[0];
}

// fixtureId -> kickoff unix (betting should close at kickoff).
function kickoffMap(): Record<string, number> {
  const data = JSON.parse(readFileSync(fileURLToPath(fixturesUrl), 'utf8'));
  const out: Record<string, number> = {};
  for (const f of data.fixtures) out[f.id] = unixOf(f.kickoff);
  return out;
}

async function setClose() {
  const { program, authority } = loadProgram();
  const kicks = kickoffMap();
  for (const m of loadMarkets()) {
    if (!m.fixtureId || !kicks[m.fixtureId]) continue;
    const pda = marketPda(program.programId, authority, m.id);
    let acct: any;
    try { acct = await program.account.market.fetch(pda); }
    catch { console.log(`missing  ${m.id}`); continue; }
    if (!('open' in acct.status)) { console.log(`skip     ${m.id} (resolved)`); continue; }
    try {
      await program.methods.setSettleAfter(new BN(kicks[m.fixtureId]))
        .accountsPartial({ market: pda, authority })
        .rpc();
      console.log(`closed-at-kickoff ${m.id}  (${new Date(kicks[m.fixtureId] * 1000).toISOString()})`);
    } catch (e: any) { console.log(`error    ${m.id}  (${String(e.message ?? e).split('\n')[0]})`); }
  }
}

async function closeOrphans() {
  const { program, authority } = loadProgram();
  const live = new Set(loadMarkets().map((m) => m.id));
  let all: any[] = [];
  for (let i = 0; i < 5 && all.length === 0; i++) {
    try { all = await program.account.market.all(); }
    catch (e: any) { console.log(`getProgramAccounts retry ${i + 1} (${String(e.message ?? e).split('\n')[0]})`); await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  const orphans = all.filter((m) => m.account.authority.equals(authority) && !live.has(m.account.marketId));
  console.log(`found ${all.length} markets under program, ${orphans.length} orphaned (not in catalogue)`);
  for (const o of orphans) {
    try {
      await program.methods.closeMarket()
        .accountsPartial({ market: o.publicKey, authority })
        .rpc();
      console.log(`closed   ${o.account.marketId}`);
    } catch (e: any) { console.log(`error    ${o.account.marketId}  (${String(e.message ?? e).split('\n')[0]})`); }
  }
}

const cmd = process.argv[2] ?? 'all';
const run = async () => {
  if (cmd === 'set-close' || cmd === 'all') await setClose();
  if (cmd === 'close' || cmd === 'all') await closeOrphans();
};
run().catch((err) => { console.error(err); process.exit(1); });
