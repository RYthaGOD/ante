import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import anchor from '@coral-xyz/anchor';

// Demo-only helper: seeds realistic parimutuel pools so the market grid looks
// alive on camera, and stages opposing liquidity on the hero market
// (saudi-giant-killing) so the recorded YES bet settles into a ~2x claim.
//   Run: ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//        ANCHOR_WALLET=~/.config/solana/id.json node packages/oracle/src/seed-pools.ts
const { web3, AnchorProvider, Program, BN, Wallet } = anchor;

const RPC = process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
const idlUrl = new URL('../../../target/idl/ante_market.json', import.meta.url);
const idl = JSON.parse(readFileSync(fileURLToPath(idlUrl), 'utf8'));
const PROGRAM_ID = new web3.PublicKey(idl.address);
const connection = new web3.Connection(RPC, 'confirmed');

const loadKp = (p: string) =>
  web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, 'utf8'))));

const main = loadKp(process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`);
const AUTH = main.publicKey;

// Persistent throwaway "crowd" bettor.
const crowdPath = fileURLToPath(new URL('../../../video/.crowd-keypair.json', import.meta.url));
const crowd: any = existsSync(crowdPath)
  ? loadKp(crowdPath)
  : (() => { const k = web3.Keypair.generate(); writeFileSync(crowdPath, JSON.stringify(Array.from(k.secretKey))); return k; })();

const marketPda = (id: string) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from('market'), AUTH.toBuffer(), Buffer.from(id)], PROGRAM_ID)[0];
const betPda = (m: any, bettor: any, ob: number) =>
  web3.PublicKey.findProgramAddressSync([Buffer.from('bet'), m.toBuffer(), bettor.toBuffer(), Buffer.from([ob])], PROGRAM_ID)[0];

const SEED: [string, 'yes' | 'no', number][] = [
  ['wc26-usa-mex:home_win', 'yes', 0.15], ['wc26-usa-mex:home_win', 'no', 0.09],
  ['wc26-usa-mex:over_2_5', 'yes', 0.08], ['wc26-usa-mex:over_2_5', 'no', 0.13],
  ['wc26:mbappe-golden-boot', 'yes', 0.18], ['wc26:mbappe-golden-boot', 'no', 0.06],
  ['wc26:conmebol-lifts-it', 'yes', 0.10], ['wc26:conmebol-lifts-it', 'no', 0.10],
  ['wc26:debutant-knockout', 'yes', 0.05], ['wc26:debutant-knockout', 'no', 0.15],
  ['wc26:saudi-giant-killing', 'no', 0.40], ['wc26:saudi-giant-killing', 'yes', 0.20],
];

(async () => {
  const need = 2.4e9;
  const bal = await connection.getBalance(crowd.publicKey);
  if (bal < need) {
    const tx = new web3.Transaction().add(
      web3.SystemProgram.transfer({ fromPubkey: main.publicKey, toPubkey: crowd.publicKey, lamports: need - bal }),
    );
    await web3.sendAndConfirmTransaction(connection, tx, [main]);
    console.log(`funded crowd ${crowd.publicKey.toBase58()} -> ${(need / 1e9).toFixed(2)} SOL`);
  }
  const provider = new AnchorProvider(connection, new Wallet(crowd), { commitment: 'confirmed' });
  const program = new Program(idl, provider);

  for (const [id, side, amt] of SEED) {
    const ob = side === 'yes' ? 1 : 2;
    const m = marketPda(id);
    try {
      await program.methods
        .placeBet(side === 'yes' ? { yes: {} } : { no: {} }, new BN(Math.floor(amt * 1e9)))
        .accountsPartial({ market: m, bet: betPda(m, crowd.publicKey, ob), bettor: crowd.publicKey, systemProgram: web3.SystemProgram.programId })
        .rpc();
      console.log(`bet ${side.toUpperCase().padEnd(3)} ${amt}  ${id}`);
    } catch (e: any) {
      console.log(`skip ${id} ${side} (${String(e.message ?? e).split('\n')[0]})`);
    }
  }

  console.log('\n--- pools ---');
  for (const id of [...new Set(SEED.map((s) => s[0]))]) {
    const a: any = await program.account.market.fetch(marketPda(id));
    console.log(`${id.padEnd(28)} yes=${(a.poolYes.toNumber() / 1e9).toFixed(2)} no=${(a.poolNo.toNumber() / 1e9).toFixed(2)}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
