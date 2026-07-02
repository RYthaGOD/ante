import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import anchor from '@coral-xyz/anchor';

// Demo-only helper: seeds realistic parimutuel pools on the OPEN markets so the
// grid looks alive (settled markets can no longer take bets, by design).
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
  ['wc26-bra-jpn:home_win', 'yes', 0.15], ['wc26-bra-jpn:home_win', 'no', 0.10],
  ['wc26-ger-par:over_2_5', 'yes', 0.12], ['wc26-ger-par:over_2_5', 'no', 0.08],
  ['wc26-ned-mar:home_win', 'yes', 0.10], ['wc26-ned-mar:home_win', 'no', 0.12],
  ['wc26-fra-swe:over_2_5', 'yes', 0.14], ['wc26-fra-swe:over_2_5', 'no', 0.07],
  ['wc26-eng-cod:home_win', 'yes', 0.20], ['wc26-eng-cod:home_win', 'no', 0.05],
  ['wc26-esp-aut:over_2_5', 'yes', 0.16], ['wc26-esp-aut:over_2_5', 'no', 0.06],
  ['wc26-por-cro:home_win', 'yes', 0.11], ['wc26-por-cro:home_win', 'no', 0.11],
  ['wc26-arg-cpv:over_2_5', 'yes', 0.18], ['wc26-arg-cpv:over_2_5', 'no', 0.05],
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
