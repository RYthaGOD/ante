import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import anchor from '@coral-xyz/anchor';
import {
  TXODDS_BASE_URL,
  startGuestSession,
  activationMessage,
  signActivationMessage,
  activateToken,
} from './txodds/auth.ts';
import { writeCreds } from './txodds/creds.ts';
import { HttpTxOddsAdapter, httpConfigFromEnv } from './txodds/http.ts';

// One-time TxODDS (TxLINE) onboarding + live-feed tooling.
//
//   subscribe [send]   on-chain `subscribe` then guest+activate -> .txodds-creds.json
//                      (dry-run unless `send` is passed — it spends real SOL)
//   activate <txSig>   re-run only the guest+activate step for an existing tx
//   fixtures           print the live World Cup fixtures snapshot (to fill the map)
//   result <ourId>     test the live score lookup for one ANTE fixture id
//   guest              print a fresh guest JWT
//
// Wallet: ANCHOR_WALLET (or ~/.config/solana/id.json). Network: TXODDS_RPC_URL
// (defaults to Solana mainnet-beta — the free tier subscribes on mainnet).

const { web3 } = anchor;
const { PublicKey, Keypair, Connection, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = web3;

// TxL is a Token-2022 mint (owner TokenzQdB…, verified on mainnet), so ATAs and
// the `token_program` account must reference Token-2022, not the legacy program.
const TOKEN_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// TxODDS program + service token, per docs/programs/addresses.
const NET = {
  mainnet: {
    program: new PublicKey('9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA'),
    mint: new PublicKey('Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL'),
  },
  devnet: {
    program: new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J'),
    mint: new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG'),
  },
};

// subscribe(service_level_id: u16, weeks: u8) — Anchor discriminator + args.
const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53]);

const baseUrl = process.env.TXODDS_BASE_URL ?? TXODDS_BASE_URL;
const leaguesEnv = (process.env.TXODDS_LEAGUES ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);

function loadWallet(): InstanceType<typeof Keypair> {
  const path = process.env.ANCHOR_WALLET || `${homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

function pickNetwork(rpc: string) {
  const devnet = /devnet/i.test(rpc);
  return { ...(devnet ? NET.devnet : NET.mainnet), label: devnet ? 'devnet' : 'mainnet-beta' };
}

function ata(mint: InstanceType<typeof PublicKey>, owner: InstanceType<typeof PublicKey>) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

// Idempotent ATA creation (no-op if it already exists) so the user's TxL token
// account is present for the subscribe instruction.
function createAtaIdempotentIx(
  payer: InstanceType<typeof PublicKey>,
  account: InstanceType<typeof PublicKey>,
  owner: InstanceType<typeof PublicKey>,
  mint: InstanceType<typeof PublicKey>,
) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([1]), // CreateIdempotent
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

function subscribeIx(opts: {
  program: InstanceType<typeof PublicKey>;
  user: InstanceType<typeof PublicKey>;
  pricingMatrix: InstanceType<typeof PublicKey>;
  mint: InstanceType<typeof PublicKey>;
  userTokenAccount: InstanceType<typeof PublicKey>;
  treasuryVault: InstanceType<typeof PublicKey>;
  treasuryPda: InstanceType<typeof PublicKey>;
  serviceLevelId: number;
  weeks: number;
}) {
  const data = Buffer.alloc(SUBSCRIBE_DISCRIMINATOR.length + 2 + 1);
  SUBSCRIBE_DISCRIMINATOR.copy(data, 0);
  data.writeUInt16LE(opts.serviceLevelId, SUBSCRIBE_DISCRIMINATOR.length);
  data.writeUInt8(opts.weeks, SUBSCRIBE_DISCRIMINATOR.length + 2);
  return new TransactionInstruction({
    programId: opts.program,
    data,
    keys: [
      { pubkey: opts.user, isSigner: true, isWritable: true },
      { pubkey: opts.pricingMatrix, isSigner: false, isWritable: false },
      { pubkey: opts.mint, isSigner: false, isWritable: false },
      { pubkey: opts.userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: opts.treasuryVault, isSigner: false, isWritable: true },
      { pubkey: opts.treasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

// Guest session -> sign -> activate -> save creds. Shared by subscribe+activate.
async function activate(kp: InstanceType<typeof Keypair>, txSig: string, network: string) {
  console.log('• starting guest session ...');
  const jwt = await startGuestSession(baseUrl);
  const message = activationMessage(txSig, leaguesEnv, jwt);
  const walletSignature = signActivationMessage(message, kp.secretKey);
  console.log('• activating API token ...');
  const apiToken = await activateToken(jwt, { txSig, walletSignature, leagues: leaguesEnv }, baseUrl);
  const path = writeCreds({ jwt, apiToken, txSig, network, createdAt: new Date().toISOString() });
  console.log(`\n✓ TxODDS API token activated. Saved to ${path}\n`);
  console.log('The feeder now uses the LIVE feed automatically. Or export explicitly:');
  console.log(`  export TXODDS_JWT='${jwt}'`);
  console.log(`  export TXODDS_API_TOKEN='${apiToken}'`);
}

async function subscribe(send: boolean) {
  const rpc = process.env.TXODDS_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const net = pickNetwork(rpc);
  const kp = loadWallet();
  const serviceLevelId = Number(process.env.TXODDS_SERVICE_LEVEL ?? 1); // 1=60s delay, 12=real-time
  const weeks = Number(process.env.TXODDS_WEEKS ?? 4);

  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from('pricing_matrix')], net.program);
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from('token_treasury_v2')], net.program);
  const userTokenAccount = ata(net.mint, kp.publicKey);
  const treasuryVault = ata(net.mint, treasuryPda);

  console.log(`network          ${net.label}  (${rpc})`);
  console.log(`wallet           ${kp.publicKey.toBase58()}`);
  console.log(`program          ${net.program.toBase58()}`);
  console.log(`service level    ${serviceLevelId}  (${serviceLevelId === 12 ? 'real-time' : '60s delay'})`);
  console.log(`weeks            ${weeks}`);
  console.log(`leagues          ${leaguesEnv.length ? leaguesEnv.join(',') : '(standard bundle)'}`);
  console.log(`pricingMatrix    ${pricingMatrix.toBase58()}`);
  console.log(`tokenMint        ${net.mint.toBase58()}`);
  console.log(`userTokenAccount ${userTokenAccount.toBase58()}`);
  console.log(`treasuryVault    ${treasuryVault.toBase58()}`);
  console.log(`treasuryPda      ${treasuryPda.toBase58()}`);

  const connection = new Connection(rpc, 'confirmed');
  const tx = new Transaction()
    .add(createAtaIdempotentIx(kp.publicKey, userTokenAccount, kp.publicKey, net.mint))
    .add(subscribeIx({
      program: net.program,
      user: kp.publicKey,
      pricingMatrix,
      mint: net.mint,
      userTokenAccount,
      treasuryVault,
      treasuryPda,
      serviceLevelId,
      weeks,
    }));

  if (!send) {
    console.log('\n(dry run) re-run with `subscribe send` to submit the transaction on-chain.');
    return;
  }

  console.log('\n• sending subscribe transaction ...');
  const sig = await sendAndConfirmTransaction(connection, tx, [kp], { commitment: 'confirmed' });
  console.log(`✓ subscribed. txSig ${sig}`);
  await activate(kp, sig, net.label);
}

async function fixtures() {
  const cfg = httpConfigFromEnv();
  if (!cfg) throw new Error('no TxODDS creds — run `subscribe send` first, or set TXODDS_JWT/TXODDS_API_TOKEN');
  const url = new URL(`${cfg.baseUrl}/api/fixtures/snapshot`);
  if (cfg.competitionId != null) url.searchParams.set('competitionId', String(cfg.competitionId));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.jwt}`, 'X-Api-Token': cfg.apiToken } });
  if (!res.ok) throw new Error(`fixtures/snapshot ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as Array<Record<string, any>>;
  console.log(`${rows.length} fixtures:\n`);
  for (const r of rows) {
    const when = new Date(r.StartTime ?? 0).toISOString().slice(0, 16);
    console.log(`comp ${String(r.CompetitionId).padStart(5)}  fixture ${String(r.FixtureId).padStart(10)}  ${when}  ${r.Participant1} v ${r.Participant2}`);
  }
}

async function result(ourId: string) {
  const cfg = httpConfigFromEnv();
  if (!cfg) throw new Error('no TxODDS creds — run `subscribe send` first, or set TXODDS_JWT/TXODDS_API_TOKEN');
  const r = await new HttpTxOddsAdapter(cfg).getResult(ourId);
  console.log(r ?? `no final result yet for ${ourId} (unmapped, or match not finished)`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'subscribe': return subscribe(arg === 'send');
    case 'activate': {
      if (!arg) throw new Error('usage: activate <txSig>');
      const rpc = process.env.TXODDS_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
      return activate(loadWallet(), arg, pickNetwork(rpc).label);
    }
    case 'fixtures': return fixtures();
    case 'result': {
      if (!arg) throw new Error('usage: result <ourFixtureId>');
      return result(arg);
    }
    case 'guest': return void console.log(await startGuestSession(baseUrl));
    default:
      console.log('usage: node src/txodds.ts <subscribe [send] | activate <txSig> | fixtures | result <id> | guest>');
  }
}

main().catch((err) => { console.error(String(err?.message ?? err)); process.exit(1); });
