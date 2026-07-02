import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
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

  const scoreDigest = (mid: string, h: number, a: number): number[] =>
    Array.from(createHash("sha256").update(`${mid}:${h}:${a}`).digest());
  const customDigest = (mid: string, label: "YES" | "NO"): number[] =>
    Array.from(createHash("sha256").update(`${mid}:${label}`).digest());

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

  const alice = Keypair.generate();
  const bob = Keypair.generate();

  before(async () => {
    for (const kp of [alice, bob]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("settles a SCORE market computed on-chain and pays the winner", async () => {
    const marketId = "wc2026-m01:home_win";
    const market = marketPda(marketId);
    // Cutoff a few seconds out so bets land first; settlement opens once it passes.
    await program.methods
      .initializeMarket(marketId, "wc2026-m01", { homeWin: {} }, new BN(nowSec() + 3))
      .accountsPartial({ market, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await program.methods
      .placeBet({ yes: {} }, new BN(LAMPORTS_PER_SOL))
      .accountsPartial({ market, bet: betPda(market, alice.publicKey, YES), bettor: alice.publicKey, systemProgram: SystemProgram.programId })
      .signers([alice]).rpc();
    await program.methods
      .placeBet({ no: {} }, new BN(LAMPORTS_PER_SOL))
      .accountsPartial({ market, bet: betPda(market, bob.publicKey, NO), bettor: bob.publicKey, systemProgram: SystemProgram.programId })
      .signers([bob]).rpc();

    await sleep(6000); // pass the betting cutoff so settlement is allowed
    // Brazil 2-0 -> HomeWin YES; program computes the winner from the score.
    await program.methods
      .postResult(2, 0, scoreDigest(marketId, 2, 0))
      .accountsPartial({ market, oracle: authority.publicKey })
      .rpc();
    const m = await program.account.market.fetch(market);
    assert.deepEqual(m.winningOutcome, { yes: {} });

    const before = await provider.connection.getBalance(alice.publicKey);
    await program.methods
      .claim()
      .accountsPartial({ market, bet: betPda(market, alice.publicKey, YES), bettor: alice.publicKey })
      .signers([alice]).rpc();
    const after = await provider.connection.getBalance(alice.publicKey);
    assert.isAbove(after - before, 1.9 * LAMPORTS_PER_SOL); // ~2 SOL pool to sole YES winner
  });

  it("settles a CUSTOM feeder-resolved market (Upshot-style narrative bet)", async () => {
    const marketId = "wc2026:croatia-golden-boot";
    const market = marketPda(marketId);
    await program.methods
      .initializeMarket(marketId, "", { custom: {} }, new BN(nowSec() + 3))
      .accountsPartial({ market, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    await program.methods
      .placeBet({ yes: {} }, new BN(LAMPORTS_PER_SOL))
      .accountsPartial({ market, bet: betPda(market, alice.publicKey, YES), bettor: alice.publicKey, systemProgram: SystemProgram.programId })
      .signers([alice]).rpc();

    await sleep(6000); // pass the betting cutoff so settlement is allowed
    // Feeder asserts YES directly; digest binds the posted outcome on-chain.
    await program.methods
      .postCustomResult({ yes: {} }, customDigest(marketId, "YES"))
      .accountsPartial({ market, oracle: authority.publicKey })
      .rpc();
    const m = await program.account.market.fetch(market);
    assert.deepEqual(m.winningOutcome, { yes: {} });
    assert.deepEqual(m.kind, { custom: {} });

    const before = await provider.connection.getBalance(alice.publicKey);
    await program.methods
      .claim()
      .accountsPartial({ market, bet: betPda(market, alice.publicKey, YES), bettor: alice.publicKey })
      .signers([alice]).rpc();
    const after = await provider.connection.getBalance(alice.publicKey);
    assert.isAbove(after - before, 0.9 * LAMPORTS_PER_SOL);
  });

  it("rejects a digest that does not match the posted score", async () => {
    const marketId = "wc2026-m02:home_win";
    const market = marketPda(marketId);
    await program.methods
      .initializeMarket(marketId, "wc2026-m02", { homeWin: {} }, new BN(0))
      .accountsPartial({ market, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    try {
      await program.methods
        .postResult(1, 1, scoreDigest(marketId, 9, 9)) // wrong digest for a 1-1
        .accountsPartial({ market, oracle: authority.publicKey })
        .rpc();
      assert.fail("expected DigestMismatch");
    } catch (e: any) {
      assert.include(e.toString(), "DigestMismatch");
    }
  });

  it("rejects the wrong settlement instruction for a market kind", async () => {
    const marketId = "wc2026:spain-golden-ball";
    const market = marketPda(marketId);
    await program.methods
      .initializeMarket(marketId, "", { custom: {} }, new BN(0))
      .accountsPartial({ market, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    try {
      await program.methods
        .postResult(1, 0, scoreDigest(marketId, 1, 0)) // score path on a custom market
        .accountsPartial({ market, oracle: authority.publicKey })
        .rpc();
      assert.fail("expected WrongKind");
    } catch (e: any) {
      assert.include(e.toString(), "WrongKind");
    }
  });

  it("rejects bets once the cutoff has passed", async () => {
    const marketId = "wc2026-m04:home_win";
    const market = marketPda(marketId);
    await program.methods
      .initializeMarket(marketId, "wc2026-m04", { homeWin: {} }, new BN(nowSec() - 10)) // cutoff already passed
      .accountsPartial({ market, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    try {
      await program.methods
        .placeBet({ yes: {} }, new BN(LAMPORTS_PER_SOL))
        .accountsPartial({ market, bet: betPda(market, alice.publicKey, YES), bettor: alice.publicKey, systemProgram: SystemProgram.programId })
        .signers([alice]).rpc();
      assert.fail("expected BettingClosed");
    } catch (e: any) {
      assert.include(e.toString(), "BettingClosed");
    }
  });

  it("close_market refuses a funded market but reclaims an empty one", async () => {
    // A market that holds staked funds cannot be closed (no draining stakes).
    const funded = "wc2026-m05:home_win";
    const fm = marketPda(funded);
    await program.methods
      .initializeMarket(funded, "wc2026-m05", { homeWin: {} }, new BN(nowSec() + 60))
      .accountsPartial({ market: fm, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    await program.methods
      .placeBet({ yes: {} }, new BN(LAMPORTS_PER_SOL))
      .accountsPartial({ market: fm, bet: betPda(fm, alice.publicKey, YES), bettor: alice.publicKey, systemProgram: SystemProgram.programId })
      .signers([alice]).rpc();
    try {
      await program.methods.closeMarket().accountsPartial({ market: fm, authority: authority.publicKey }).rpc();
      assert.fail("expected MarketHasFunds");
    } catch (e: any) {
      assert.include(e.toString(), "MarketHasFunds");
    }

    // An empty market can be reclaimed.
    const empty = "wc2026-m06:home_win";
    const em = marketPda(empty);
    await program.methods
      .initializeMarket(empty, "wc2026-m06", { homeWin: {} }, new BN(nowSec() + 60))
      .accountsPartial({ market: em, authority: authority.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    await program.methods.closeMarket().accountsPartial({ market: em, authority: authority.publicKey }).rpc();
    assert.isNull(await program.account.market.fetchNullable(em));
  });
});
