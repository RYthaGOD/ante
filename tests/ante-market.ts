import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { assert } from "chai";
import { AnteMarket } from "../target/types/ante_market";

// End-to-end settlement, on-chain twin of packages/oracle/src/demo.ts:
// create market -> bets both sides -> oracle posts verified result -> winner claims.
describe("ante-market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AnteMarket as Program<AnteMarket>;
  const authority = provider.wallet as anchor.Wallet;

  const YES = 1; // Outcome::Yes discriminant (used in the bet PDA seed)
  const NO = 2; // Outcome::No
  const VOID_GRACE = 72 * 3600; // program's VOID_GRACE_SECS
  const CLOSE_GRACE = 14 * 24 * 3600; // program's CLOSE_GRACE_SECS

  const scoreDigest = (mid: string, h: number, a: number): number[] =>
    Array.from(createHash("sha256").update(`${mid}:${h}:${a}`).digest());
  const customDigest = (mid: string, label: "YES" | "NO"): number[] =>
    Array.from(createHash("sha256").update(`${mid}:${label}`).digest());
  // The feed-signature payload the program checks via ed25519 introspection.
  const feedMsg = (fixtureId: string, h: number, a: number) =>
    Buffer.from(`${fixtureId}:final:${h}:${a}`);

  const marketPda = (marketId: string) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("market"), authority.publicKey.toBuffer(), Buffer.from(marketId)],
      program.programId
    )[0];
  const betPda = (market: PublicKey, bettor: PublicKey, outcome: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), market.toBuffer(), bettor.toBuffer(), Buffer.from([outcome])],
      program.programId
    )[0];

  const nowSec = () => Math.floor(Date.now() / 1000);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // initialize_market with the MVP defaults (no fee, no feed key required).
  const initMarket = (
    marketId: string,
    fixtureId: string,
    kind: object,
    settleAfter: number,
    feeBps = 0,
    feedPubkey: PublicKey = PublicKey.default
  ) =>
    program.methods
      .initializeMarket(marketId, fixtureId, kind as never, new BN(settleAfter), feeBps, feedPubkey)
      .accountsPartial({
        market: marketPda(marketId),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

  const bet = (marketId: string, bettor: Keypair, outcome: number, sol: number) =>
    program.methods
      .placeBet(outcome === YES ? { yes: {} } : { no: {} }, new BN(sol * LAMPORTS_PER_SOL))
      .accountsPartial({
        market: marketPda(marketId),
        bet: betPda(marketPda(marketId), bettor.publicKey, outcome),
        bettor: bettor.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bettor])
      .rpc();

  const claim = (marketId: string, bettor: Keypair, outcome: number) =>
    program.methods
      .claim()
      .accountsPartial({
        market: marketPda(marketId),
        bet: betPda(marketPda(marketId), bettor.publicKey, outcome),
        bettor: bettor.publicKey,
      })
      .signers([bettor])
      .rpc();

  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const feedSigner = Keypair.generate();

  before(async () => {
    for (const kp of [alice, bob]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 20 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("settles a SCORE market computed on-chain and pays the winner", async () => {
    const marketId = "wc2026-m01:home_win";
    const market = marketPda(marketId);
    // Cutoff a few seconds out so bets land first; settlement opens once it passes.
    await initMarket(marketId, "wc2026-m01", { homeWin: {} }, nowSec() + 3);

    await bet(marketId, alice, YES, 1);
    await bet(marketId, bob, NO, 1);

    await sleep(6000); // pass the betting cutoff so settlement is allowed
    // Brazil 2-0 -> HomeWin YES; program computes the winner from the score.
    await program.methods
      .postResult(2, 0, scoreDigest(marketId, 2, 0))
      .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .rpc();
    const m = await program.account.market.fetch(market);
    assert.deepEqual(m.winningOutcome, { yes: {} });

    const before = await provider.connection.getBalance(alice.publicKey);
    await claim(marketId, alice, YES);
    const after = await provider.connection.getBalance(alice.publicKey);
    assert.isAbove(after - before, 1.9 * LAMPORTS_PER_SOL); // ~2 SOL pool to sole YES winner
    // The bet account closed with the claim, so its rent came back too.
    assert.isNull(await program.account.bet.fetchNullable(betPda(market, alice.publicKey, YES)));
  });

  it("requires the FEED's ed25519 signature when the market names a feed key", async () => {
    const marketId = "wc2026-m07:home_win";
    const fixtureId = "wc2026-m07";
    const market = marketPda(marketId);
    await initMarket(marketId, fixtureId, { homeWin: {} }, nowSec() + 3, 0, feedSigner.publicKey);
    await bet(marketId, alice, YES, 1);
    await sleep(6000);

    // 1) no ed25519 instruction at all -> rejected
    try {
      await program.methods
        .postResult(3, 1, scoreDigest(marketId, 3, 1))
        .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
        .rpc();
      assert.fail("expected MissingFeedSignature");
    } catch (e: any) {
      assert.include(e.toString(), "MissingFeedSignature");
    }

    // 2) signed by the wrong key -> rejected
    const impostor = Keypair.generate();
    try {
      await program.methods
        .postResult(3, 1, scoreDigest(marketId, 3, 1))
        .preInstructions([
          Ed25519Program.createInstructionWithPrivateKey({
            privateKey: impostor.secretKey,
            message: feedMsg(fixtureId, 3, 1),
            instructionIndex: 0xffff,
          }),
        ])
        .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
        .rpc();
      assert.fail("expected WrongFeedSigner");
    } catch (e: any) {
      assert.include(e.toString(), "WrongFeedSigner");
    }

    // 3) feed signs a DIFFERENT score than the one posted -> rejected
    try {
      await program.methods
        .postResult(3, 1, scoreDigest(marketId, 3, 1))
        .preInstructions([
          Ed25519Program.createInstructionWithPrivateKey({
            privateKey: feedSigner.secretKey,
            message: feedMsg(fixtureId, 0, 0),
            instructionIndex: 0xffff,
          }),
        ])
        .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
        .rpc();
      assert.fail("expected WrongFeedMessage");
    } catch (e: any) {
      assert.include(e.toString(), "WrongFeedMessage");
    }

    // 4) feed-signed result -> settles, and the event says feed_verified
    await program.methods
      .postResult(3, 1, scoreDigest(marketId, 3, 1))
      .preInstructions([
        Ed25519Program.createInstructionWithPrivateKey({
          privateKey: feedSigner.secretKey,
          message: feedMsg(fixtureId, 3, 1),
          instructionIndex: 0xffff,
        }),
      ])
      .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .rpc();
    const m = await program.account.market.fetch(market);
    assert.deepEqual(m.status, { resolved: {} });
    assert.deepEqual(m.winningOutcome, { yes: {} });
  });

  it("settles a CUSTOM feeder-resolved market (Upshot-style narrative bet)", async () => {
    const marketId = "wc2026:croatia-golden-boot";
    const market = marketPda(marketId);
    await initMarket(marketId, "", { custom: {} }, nowSec() + 3);

    await bet(marketId, alice, YES, 1);

    await sleep(6000); // pass the betting cutoff so settlement is allowed
    // Feeder asserts YES directly; digest binds the posted outcome on-chain.
    await program.methods
      .postCustomResult({ yes: {} }, customDigest(marketId, "YES"))
      .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .rpc();
    const m = await program.account.market.fetch(market);
    assert.deepEqual(m.winningOutcome, { yes: {} });
    assert.deepEqual(m.kind, { custom: {} });

    const before = await provider.connection.getBalance(alice.publicKey);
    await claim(marketId, alice, YES);
    const after = await provider.connection.getBalance(alice.publicKey);
    assert.isAbove(after - before, 0.9 * LAMPORTS_PER_SOL);
  });

  it("takes fee_bps out of winning claims", async () => {
    const marketId = "wc2026-m08:home_win";
    const market = marketPda(marketId);
    await initMarket(marketId, "wc2026-m08", { homeWin: {} }, nowSec() + 3, 500); // 5%
    await bet(marketId, alice, YES, 1);
    await bet(marketId, bob, NO, 1);
    await sleep(6000);
    await program.methods
      .postResult(1, 0, scoreDigest(marketId, 1, 0))
      .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .rpc();

    const before = await provider.connection.getBalance(alice.publicKey);
    await claim(marketId, alice, YES);
    const after = await provider.connection.getBalance(alice.publicKey);
    const paid = after - before;
    // gross 2 SOL, 5% fee -> 1.9 SOL (+ bet account rent back)
    assert.isAbove(paid, 1.89 * LAMPORTS_PER_SOL);
    assert.isBelow(paid, 1.92 * LAMPORTS_PER_SOL);
  });

  it("voids an abandoned market and refunds every stake exactly", async () => {
    const marketId = "wc2026-m09:home_win";
    const market = marketPda(marketId);
    await initMarket(marketId, "wc2026-m09", { homeWin: {} }, nowSec() + 60);
    await bet(marketId, alice, YES, 1);
    await bet(marketId, bob, NO, 2);

    // Too early to void while the grace window hasn't passed.
    try {
      await program.methods.voidMarket().accountsPartial({ market, authority: authority.publicKey }).rpc();
      assert.fail("expected TooEarly");
    } catch (e: any) {
      assert.include(e.toString(), "TooEarly");
    }

    // Simulate the fixture being long abandoned, then void.
    await program.methods
      .setSettleAfter(new BN(nowSec() - VOID_GRACE - 60))
      .accountsPartial({ market, authority: authority.publicKey })
      .rpc();
    await program.methods.voidMarket().accountsPartial({ market, authority: authority.publicKey }).rpc();

    // Both sides get their exact stake back (plus bet-account rent).
    for (const [kp, outcome, stake] of [
      [alice, YES, 1],
      [bob, NO, 2],
    ] as const) {
      const before = await provider.connection.getBalance(kp.publicKey);
      await claim(marketId, kp, outcome);
      const after = await provider.connection.getBalance(kp.publicKey);
      assert.isAbove(after - before, stake * LAMPORTS_PER_SOL - 1);
      assert.isBelow(after - before, (stake + 0.01) * LAMPORTS_PER_SOL);
    }
  });

  it("rotates the oracle: old key rejected, new key settles", async () => {
    const marketId = "wc2026-m10:home_win";
    const market = marketPda(marketId);
    await initMarket(marketId, "wc2026-m10", { homeWin: {} }, nowSec() + 1);
    const newOracle = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(newOracle.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    await program.methods
      .setOracle(newOracle.publicKey)
      .accountsPartial({ market, authority: authority.publicKey })
      .rpc();
    await sleep(3000); // pass the settle window

    try {
      await program.methods
        .postResult(1, 0, scoreDigest(marketId, 1, 0))
        .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
        .rpc();
      assert.fail("expected NotOracle");
    } catch (e: any) {
      assert.include(e.toString(), "NotOracle");
    }
    await program.methods
      .postResult(1, 0, scoreDigest(marketId, 1, 0))
      .accountsPartial({ market, oracle: newOracle.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .signers([newOracle])
      .rpc();
    const m = await program.account.market.fetch(market);
    assert.deepEqual(m.status, { resolved: {} });
  });

  it("rejects a digest that does not match the posted score", async () => {
    const marketId = "wc2026-m02:home_win";
    const market = marketPda(marketId);
    await initMarket(marketId, "wc2026-m02", { homeWin: {} }, 0);
    try {
      await program.methods
        .postResult(1, 1, scoreDigest(marketId, 9, 9)) // wrong digest for a 1-1
        .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
        .rpc();
      assert.fail("expected DigestMismatch");
    } catch (e: any) {
      assert.include(e.toString(), "DigestMismatch");
    }
  });

  it("rejects the wrong settlement instruction for a market kind", async () => {
    const marketId = "wc2026:spain-golden-ball";
    const market = marketPda(marketId);
    await initMarket(marketId, "", { custom: {} }, 0);
    try {
      await program.methods
        .postResult(1, 0, scoreDigest(marketId, 1, 0)) // score path on a custom market
        .accountsPartial({ market, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
        .rpc();
      assert.fail("expected WrongKind");
    } catch (e: any) {
      assert.include(e.toString(), "WrongKind");
    }
  });

  it("rejects bets once the cutoff has passed", async () => {
    const marketId = "wc2026-m04:home_win";
    await initMarket(marketId, "wc2026-m04", { homeWin: {} }, nowSec() - 10); // cutoff already passed
    try {
      await bet(marketId, alice, YES, 1);
      assert.fail("expected BettingClosed");
    } catch (e: any) {
      assert.include(e.toString(), "BettingClosed");
    }
  });

  it("close_market refuses an open funded market, sweeps after the claim window", async () => {
    // A funded OPEN market can never be closed (no draining stakes).
    const funded = "wc2026-m05:home_win";
    const fm = marketPda(funded);
    await initMarket(funded, "wc2026-m05", { homeWin: {} }, nowSec() + 60);
    await bet(funded, alice, YES, 1);
    try {
      await program.methods.closeMarket().accountsPartial({ market: fm, authority: authority.publicKey }).rpc();
      assert.fail("expected MarketHasFunds");
    } catch (e: any) {
      assert.include(e.toString(), "MarketHasFunds");
    }

    // Once resolved and the claim window has passed, dust + rent sweep back.
    await program.methods
      .setSettleAfter(new BN(nowSec() - CLOSE_GRACE - 60))
      .accountsPartial({ market: fm, authority: authority.publicKey })
      .rpc();
    await program.methods
      .postResult(2, 1, scoreDigest(funded, 2, 1))
      .accountsPartial({ market: fm, oracle: authority.publicKey, instructions: SYSVAR_INSTRUCTIONS_PUBKEY })
      .rpc();
    await claim(funded, alice, YES);
    await program.methods.closeMarket().accountsPartial({ market: fm, authority: authority.publicKey }).rpc();
    assert.isNull(await program.account.market.fetchNullable(fm));

    // An empty market can be reclaimed at any time.
    const empty = "wc2026-m06:home_win";
    const em = marketPda(empty);
    await initMarket(empty, "wc2026-m06", { homeWin: {} }, nowSec() + 60);
    await program.methods.closeMarket().accountsPartial({ market: em, authority: authority.publicKey }).rpc();
    assert.isNull(await program.account.market.fetchNullable(em));
  });
});
