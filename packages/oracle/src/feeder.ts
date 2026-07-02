import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import anchor from '@coral-xyz/anchor';
import { getTxOddsAdapter } from './txodds/factory.ts';
import { loadMarkets, loadCustomOutcomes, isResolvable } from './market/registry.ts';
import { settleScore, settleCustom } from './market/settle.ts';
import { hexToBytes } from './txodds/digest.ts';
import type { MarketKind, Outcome } from './txodds/types.ts';

// ANTE oracle feeder. Two jobs against the on-chain program:
//   init   — create every catalogue market on-chain (so the frontend has data)
//   settle — for every resolvable, still-open market, post the TxODDS-verified
//            result (score markets) or feeder-asserted outcome (custom markets)
//   list   — print on-chain market state
//
// Run:  ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
//       ANCHOR_WALLET=~/.config/solana/id.json node src/feeder.ts <init|settle|list>

const { web3, AnchorProvider, Program, BN, Wallet } = anchor;
const idlUrl = new URL('../../../target/idl/ante_market.json', import.meta.url);

function kindArg(kind: MarketKind) {
  switch (kind) {
    case 'home_win': return { homeWin: {} };
    case 'over_2_5': return { over25: {} };
    case 'custom': return { custom: {} };
  }
}
const outcomeArg = (o: Outcome) => (o === 'YES' ? { yes: {} } : { no: {} });
const unixOf = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function loadProgram() {
  const walletPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  const kp = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, 'utf8'))));
  const connection = new web3.Connection(process.env.ANCHOR_PROVIDER_URL || 'http://127.0.0.1:8899', 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: 'confirmed' });
  const idl = JSON.parse(readFileSync(fileURLToPath(idlUrl), 'utf8'));
  const program = new Program(idl, provider);
  return { program, provider, authority: kp.publicKey };
}

function marketPda(programId: any, authority: any, marketId: string) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from('market'), authority.toBuffer(), Buffer.from(marketId)],
    programId,
  )[0];
}

async function init() {
  const { program, authority } = loadProgram();
  for (const m of loadMarkets()) {
    const pda = marketPda(program.programId, authority, m.id);
    try {
      await program.methods
        .initializeMarket(m.id, m.fixtureId ?? '', kindArg(m.kind), new BN(unixOf(m.resolutionDate)))
        .accountsPartial({ market: pda, authority, systemProgram: web3.SystemProgram.programId })
        .rpc();
      console.log(`created  ${m.id}  (${m.title})`);
    } catch (e: any) {
      console.log(`skip     ${m.id}  (${String(e.message ?? e).split('\n')[0]})`);
    }
  }
}

async function settle() {
  const { program, authority } = loadProgram();
  const { adapter: txodds, live } = getTxOddsAdapter();
  console.log(`feed     ${live ? 'LIVE TxODDS (TxLINE)' : 'mock TxODDS (no API creds)'}`);
  const customOutcomes = loadCustomOutcomes();

  for (const m of loadMarkets()) {
    if (!isResolvable(m)) { console.log(`open     ${m.id}  (resolves ${m.resolutionDate})`); continue; }
    const pda = marketPda(program.programId, authority, m.id);
    let acct: any;
    try { acct = await program.account.market.fetch(pda); }
    catch { console.log(`missing  ${m.id}  (run "init" first)`); continue; }
    if ('resolved' in acct.status) { console.log(`done     ${m.id}  already settled`); continue; }

    try {
      if (m.kind === 'custom') {
        const outcome = customOutcomes[m.id];
        if (!outcome) { console.log(`pending  ${m.id}  (no verified outcome yet)`); continue; }
        const res = settleCustom(m, outcome);
        await program.methods
          .postCustomResult(outcomeArg(outcome), hexToBytes(res.resultDigest))
          .accountsPartial({ market: pda, oracle: authority })
          .rpc();
        console.log(`settled  ${m.id}  -> ${outcome}  (digest ${res.resultDigest.slice(0, 12)}...)`);
      } else if (m.fixtureId) {
        const result = await txodds.getResult(m.fixtureId);
        if (!result) { console.log(`pending  ${m.id}  (no verified score yet)`); continue; }
        const res = settleScore(m, result);
        await program.methods
          .postResult(result.homeGoals, result.awayGoals, hexToBytes(res.resultDigest))
          .accountsPartial({ market: pda, oracle: authority })
          .rpc();
        console.log(`settled  ${m.id}  ${result.homeGoals}-${result.awayGoals} -> ${res.winningOutcome}  (digest ${res.resultDigest.slice(0, 12)}...)`);
      }
    } catch (e: any) {
      console.log(`error    ${m.id}  (${String(e.message ?? e).split('\n')[0]})`);
    }
  }
}

async function list() {
  const { program, authority } = loadProgram();
  for (const m of loadMarkets()) {
    const pda = marketPda(program.programId, authority, m.id);
    try {
      const a: any = await program.account.market.fetch(pda);
      const status = 'resolved' in a.status ? `RESOLVED ${Object.keys(a.winningOutcome)[0].toUpperCase()}` : 'OPEN';
      console.log(`${m.id.padEnd(30)} ${status.padEnd(14)} yes=${a.poolYes} no=${a.poolNo}`);
    } catch {
      console.log(`${m.id.padEnd(30)} (not created)`);
    }
  }
}

const cmd = process.argv[2] ?? 'list';
const run = cmd === 'init' ? init : cmd === 'settle' ? settle : list;
run().catch((err) => { console.error(err); process.exit(1); });
