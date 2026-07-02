use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use solana_sdk_ids::ed25519_program;

declare_id!("G1tgXodmDq9X3MTtdHLNpjDWscUqsjiW29fcpUHvJoHu");

// ANTE — verifiable settlement for World Cup prediction markets.
//
// Each market is a binary YES/NO question, identified by a human-readable
// `market_id`. Two settlement paths, both gated to the market's oracle (the
// TxODDS feeder), only after the settle window, and both recording an on-chain
// `result_digest` so anyone can recompute settlement from the public result:
//
//   * Score markets (HomeWin / Over25): the feeder posts the verified score and
//     the program itself computes the winner. When the market carries a
//     `feed_pubkey`, the transaction must also prove — via the ed25519 program
//     and instruction introspection — that the feed signed this exact result,
//     so even the oracle cannot post a score the feed never produced.
//   * Custom markets: the feeder posts the YES/NO outcome directly (Golden Boot,
//     player props, progression...) — expressive like Upshot's cards, settled
//     trustlessly via the same digest + authorized-feeder mechanism.
//
// Bettors stake SOL into a parimutuel pool; winners claim pro-rata (minus the
// market's `fee_bps`, 0 in the MVP). A match that never produces a result can
// be voided after a grace period, unlocking exact-stake refunds. The settle
// logic is the on-chain twin of packages/oracle (settle.ts / digest.ts).

const MAX_MARKET_ID_LEN: usize = 48;
const MAX_FIXTURE_LEN: usize = 32;
const MAX_FEE_BPS: u16 = 1_000; // 10% cap so a market can never be confiscatory
const BPS_DENOM: u128 = 10_000;
// A market that hasn't settled this long after its cutoff can be voided so
// bettors reclaim their stakes (abandoned/postponed fixture).
const VOID_GRACE_SECS: i64 = 72 * 3600;
// After settlement, winners get this long to claim before the authority may
// sweep dust + rent from the market account.
const CLOSE_GRACE_SECS: i64 = 14 * 24 * 3600;

#[program]
pub mod ante_market {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id: String,
        fixture_id: String,
        kind: MarketKind,
        settle_after: i64,
        fee_bps: u16,
        feed_pubkey: Pubkey,
    ) -> Result<()> {
        require!(market_id.len() <= MAX_MARKET_ID_LEN, AnteError::MarketIdTooLong);
        require!(fixture_id.len() <= MAX_FIXTURE_LEN, AnteError::FixtureIdTooLong);
        require!(fee_bps <= MAX_FEE_BPS, AnteError::FeeTooHigh);
        let m = &mut ctx.accounts.market;
        m.authority = ctx.accounts.authority.key();
        m.oracle = ctx.accounts.authority.key(); // rotate with set_oracle
        m.feed_pubkey = feed_pubkey; // Pubkey::default() = no feed signature required
        m.market_id = market_id;
        m.fixture_id = fixture_id;
        m.kind = kind;
        m.status = MarketStatus::Open;
        m.settle_after = settle_after;
        m.fee_bps = fee_bps;
        m.pool_yes = 0;
        m.pool_no = 0;
        m.winning_outcome = Outcome::Unresolved;
        m.result_digest = [0u8; 32];
        m.bump = ctx.bumps.market;
        Ok(())
    }

    pub fn place_bet(ctx: Context<PlaceBet>, outcome: Outcome, amount: u64) -> Result<()> {
        require!(amount > 0, AnteError::ZeroAmount);
        require!(matches!(outcome, Outcome::Yes | Outcome::No), AnteError::BadOutcome);
        require!(ctx.accounts.market.status == MarketStatus::Open, AnteError::MarketClosed);
        // Betting closes at the market's settle_after (set to kickoff): no wagering
        // once the match is under way.
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.market.settle_after,
            AnteError::BettingClosed
        );

        // Move the stake from the bettor into the market PDA, which is the vault.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.bettor.to_account_info(),
                    to: ctx.accounts.market.to_account_info(),
                },
            ),
            amount,
        )?;

        let bet = &mut ctx.accounts.bet;
        bet.market = ctx.accounts.market.key();
        bet.bettor = ctx.accounts.bettor.key();
        bet.outcome = outcome;
        bet.amount = bet.amount.checked_add(amount).ok_or(AnteError::Overflow)?;
        bet.claimed = false;
        bet.bump = ctx.bumps.bet;

        let market = &mut ctx.accounts.market;
        match outcome {
            Outcome::Yes => {
                market.pool_yes = market.pool_yes.checked_add(amount).ok_or(AnteError::Overflow)?
            }
            Outcome::No => {
                market.pool_no = market.pool_no.checked_add(amount).ok_or(AnteError::Overflow)?
            }
            Outcome::Unresolved => return err!(AnteError::BadOutcome),
        }
        Ok(())
    }

    // Settle a score market: the program computes the winner from the verified
    // score and checks the digest matches sha256("market_id:home:away"). When
    // the market names a feed_pubkey, the transaction must additionally carry
    // an ed25519 verification of the feed's signature over this exact result —
    // making the proof anchor to the feed, not to whoever posts it.
    pub fn post_result(
        ctx: Context<PostResult>,
        home_goals: u8,
        away_goals: u8,
        result_digest: [u8; 32],
    ) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        let market = &mut ctx.accounts.market;
        guard_settlement(market, &ctx.accounts.oracle)?;
        require!(
            matches!(market.kind, MarketKind::HomeWin | MarketKind::Over25),
            AnteError::WrongKind
        );
        require!(
            score_digest(&market.market_id, home_goals, away_goals) == result_digest,
            AnteError::DigestMismatch
        );

        let feed_verified = market.feed_pubkey != Pubkey::default();
        if feed_verified {
            // Twin of the settler's feed-signature payload: fixture, finality, score.
            let msg = format!("{}:final:{}:{}", market.fixture_id, home_goals, away_goals);
            require_feed_signature(
                &ctx.accounts.instructions.to_account_info(),
                &market.feed_pubkey,
                msg.as_bytes(),
            )?;
        }

        let yes_wins = match market.kind {
            MarketKind::HomeWin => home_goals > away_goals,
            MarketKind::Over25 => (home_goals as u16 + away_goals as u16) >= 3,
            MarketKind::Custom => unreachable!(),
        };
        finalize(
            market,
            market_key,
            if yes_wins { Outcome::Yes } else { Outcome::No },
            result_digest,
            Some((home_goals, away_goals)),
            feed_verified,
        );
        Ok(())
    }

    // Settle a custom market: the feeder posts the YES/NO outcome directly, with
    // a digest of sha256("market_id:YES|NO") committed on-chain for audit.
    pub fn post_custom_result(
        ctx: Context<PostResult>,
        winning_outcome: Outcome,
        result_digest: [u8; 32],
    ) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        let market = &mut ctx.accounts.market;
        guard_settlement(market, &ctx.accounts.oracle)?;
        require!(market.kind == MarketKind::Custom, AnteError::WrongKind);
        require!(
            matches!(winning_outcome, Outcome::Yes | Outcome::No),
            AnteError::BadOutcome
        );
        require!(
            custom_digest(&market.market_id, winning_outcome) == result_digest,
            AnteError::DigestMismatch
        );
        finalize(market, market_key, winning_outcome, result_digest, None, false);
        Ok(())
    }

    // Resolved market: winners claim their pro-rata share of the whole pool
    // (minus fee_bps). Voided market: every bettor reclaims their exact stake.
    // Either way the Bet account closes and its rent returns to the bettor.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.bet.market == ctx.accounts.market.key(),
            AnteError::WrongMarket
        );
        require!(
            ctx.accounts.bet.bettor == ctx.accounts.bettor.key(),
            AnteError::NotYourBet
        );
        require!(!ctx.accounts.bet.claimed, AnteError::AlreadyClaimed);

        let market = &ctx.accounts.market;
        let payout = match market.status {
            MarketStatus::Open => return err!(AnteError::NotResolved),
            // Abandoned fixture: stake goes back, exactly.
            MarketStatus::Voided => ctx.accounts.bet.amount,
            MarketStatus::Resolved => {
                require!(
                    ctx.accounts.bet.outcome == market.winning_outcome,
                    AnteError::NotAWinner
                );
                let total = market.pool_yes.checked_add(market.pool_no).ok_or(AnteError::Overflow)?;
                let win_pool = match market.winning_outcome {
                    Outcome::Yes => market.pool_yes,
                    Outcome::No => market.pool_no,
                    Outcome::Unresolved => return err!(AnteError::NotResolved),
                };
                require!(win_pool > 0, AnteError::NoWinners);
                // Pro-rata share of the whole pool: amount / winning_pool * total.
                let gross = (ctx.accounts.bet.amount as u128)
                    .checked_mul(total as u128)
                    .ok_or(AnteError::Overflow)?
                    .checked_div(win_pool as u128)
                    .ok_or(AnteError::Overflow)?;
                let fee = gross
                    .checked_mul(market.fee_bps as u128)
                    .ok_or(AnteError::Overflow)?
                    / BPS_DENOM;
                (gross - fee) as u64
            }
        };

        // Pay directly out of the market PDA (program-owned) to the bettor.
        let market_ai = ctx.accounts.market.to_account_info();
        let bettor_ai = ctx.accounts.bettor.to_account_info();
        **market_ai.try_borrow_mut_lamports()? -= payout;
        **bettor_ai.try_borrow_mut_lamports()? += payout;

        ctx.accounts.bet.claimed = true;
        Ok(())
    }

    // Admin: move an open market's betting/settle cutoff (e.g. to its kickoff).
    pub fn set_settle_after(ctx: Context<UpdateMarket>, new_settle_after: i64) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Open,
            AnteError::AlreadyResolved
        );
        ctx.accounts.market.settle_after = new_settle_after;
        Ok(())
    }

    // Admin: rotate the settlement key. One compromised feeder no longer owns
    // every market forever, and it lets a low-privilege cron key settle while
    // the treasury key stays offline.
    pub fn set_oracle(ctx: Context<UpdateMarket>, new_oracle: Pubkey) -> Result<()> {
        ctx.accounts.market.oracle = new_oracle;
        Ok(())
    }

    // Admin: rotate the feed signing key a score market verifies against (e.g.
    // pointing an existing market at TxODDS's own signer requires no redeploy).
    pub fn set_feed(ctx: Context<UpdateMarket>, new_feed: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Open,
            AnteError::AlreadyResolved
        );
        ctx.accounts.market.feed_pubkey = new_feed;
        Ok(())
    }

    // Admin: void an abandoned/postponed market — only well after its settle
    // window, and never one that already resolved. Every bettor then reclaims
    // their exact stake through claim.
    pub fn void_market(ctx: Context<UpdateMarket>) -> Result<()> {
        let market_key = ctx.accounts.market.key();
        let market = &mut ctx.accounts.market;
        require!(market.status == MarketStatus::Open, AnteError::AlreadyResolved);
        require!(
            Clock::get()?.unix_timestamp
                >= market.settle_after.saturating_add(VOID_GRACE_SECS),
            AnteError::TooEarly
        );
        market.status = MarketStatus::Voided;
        emit!(MarketVoided {
            market: market_key,
            market_id: market.market_id.clone(),
        });
        Ok(())
    }

    // Admin: reclaim a market account. Allowed when it never took a bet, or
    // after the post-settlement claim window — payout truncation leaves lamport
    // dust in the PDA, and this sweeps dust + rent back to the authority.
    // An Open market that holds stakes can never be closed.
    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        let m = &ctx.accounts.market;
        let unfunded = m.pool_yes == 0 && m.pool_no == 0;
        let claim_window_over = m.status != MarketStatus::Open
            && Clock::get()?.unix_timestamp
                >= m.settle_after.saturating_add(CLOSE_GRACE_SECS);
        require!(unfunded || claim_window_over, AnteError::MarketHasFunds);
        Ok(())
    }
}

// Shared settlement guard: only the market's oracle, only once, only after the
// settle window.
fn guard_settlement(market: &Market, oracle: &Signer) -> Result<()> {
    require!(market.status == MarketStatus::Open, AnteError::AlreadyResolved);
    require_keys_eq!(oracle.key(), market.oracle, AnteError::NotOracle);
    require!(
        Clock::get()?.unix_timestamp >= market.settle_after,
        AnteError::TooEarly
    );
    Ok(())
}

// Proof the feed produced this result: the instruction immediately before this
// one must be an ed25519-program verification of feed_pubkey's signature over
// `expected_msg`. The ed25519 program has already validated the signature by
// the time we execute — we check that what it validated is the signer and
// message this market trusts. Offsets marked u16::MAX mean "this instruction",
// which is how web3.js Ed25519Program builds them.
fn require_feed_signature(
    instructions: &AccountInfo,
    feed_pubkey: &Pubkey,
    expected_msg: &[u8],
) -> Result<()> {
    let current = load_current_index_checked(instructions)? as usize;
    require!(current > 0, AnteError::MissingFeedSignature);
    let ix = load_instruction_at_checked(current - 1, instructions)?;
    require_keys_eq!(ix.program_id, ed25519_program::ID, AnteError::MissingFeedSignature);

    let d = &ix.data;
    // layout: [num_sigs, padding, 7 x u16 LE offsets, ...payload]
    require!(d.len() >= 16 && d[0] == 1, AnteError::MalformedFeedSignature);
    let off = |i: usize| u16::from_le_bytes([d[i], d[i + 1]]) as usize;
    let (pk_off, pk_ix) = (off(6), off(8));
    let (msg_off, msg_len, msg_ix) = (off(10), off(12), off(14));
    require!(
        pk_ix == u16::MAX as usize && msg_ix == u16::MAX as usize,
        AnteError::MalformedFeedSignature
    );
    require!(
        d.len() >= pk_off.saturating_add(32) && d.len() >= msg_off.saturating_add(msg_len),
        AnteError::MalformedFeedSignature
    );
    require!(
        d[pk_off..pk_off + 32] == feed_pubkey.to_bytes(),
        AnteError::WrongFeedSigner
    );
    require!(&d[msg_off..msg_off + msg_len] == expected_msg, AnteError::WrongFeedMessage);
    Ok(())
}

fn finalize(
    market: &mut Market,
    market_key: Pubkey,
    outcome: Outcome,
    digest: [u8; 32],
    score: Option<(u8, u8)>,
    feed_verified: bool,
) {
    market.winning_outcome = outcome;
    market.result_digest = digest;
    market.status = MarketStatus::Resolved;
    // Raw score in the event so the digest preimage is reproducible from event
    // logs alone, without the settle instruction's data.
    emit!(MarketResolved {
        market: market_key,
        market_id: market.market_id.clone(),
        winning_outcome: outcome,
        result_digest: digest,
        home_goals: score.map(|s| s.0),
        away_goals: score.map(|s| s.1),
        feed_verified,
    });
}

// Digests — must match digest.ts on the TS side (SHA-256).
fn score_digest(market_id: &str, home: u8, away: u8) -> [u8; 32] {
    solana_sha256_hasher::hash(format!("{}:{}:{}", market_id, home, away).as_bytes()).to_bytes()
}

fn custom_digest(market_id: &str, outcome: Outcome) -> [u8; 32] {
    let label = match outcome {
        Outcome::Yes => "YES",
        Outcome::No => "NO",
        Outcome::Unresolved => "UNRESOLVED",
    };
    solana_sha256_hasher::hash(format!("{}:{}", market_id, label).as_bytes()).to_bytes()
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketKind {
    HomeWin,
    Over25,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,
    Resolved,
    Voided,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Unresolved,
    Yes,
    No,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    // Feed signing key this market's score settlement must verify against;
    // Pubkey::default() disables the requirement (custom/local markets).
    pub feed_pubkey: Pubkey,
    #[max_len(48)]
    pub market_id: String,
    #[max_len(32)]
    pub fixture_id: String,
    pub kind: MarketKind,
    pub status: MarketStatus,
    pub settle_after: i64,
    pub fee_bps: u16,
    pub pool_yes: u64,
    pub pool_no: u64,
    pub winning_outcome: Outcome,
    pub result_digest: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub outcome: Outcome,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[event]
pub struct MarketResolved {
    pub market: Pubkey,
    pub market_id: String,
    pub winning_outcome: Outcome,
    pub result_digest: [u8; 32],
    pub home_goals: Option<u8>,
    pub away_goals: Option<u8>,
    pub feed_verified: bool,
}

#[event]
pub struct MarketVoided {
    pub market: Pubkey,
    pub market_id: String,
}

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", authority.key().as_ref(), market_id.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: Outcome)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", market.key().as_ref(), bettor.key().as_ref(), &[outcome as u8]],
        bump
    )]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub bettor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PostResult<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    pub oracle: Signer<'info>,
    /// CHECK: the instructions sysvar, address-constrained; read only through
    /// the sysvar loader for ed25519 introspection.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateMarket<'info> {
    #[account(mut, has_one = authority)]
    pub market: Account<'info, Market>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(mut, close = authority, has_one = authority)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, close = bettor)]
    pub bet: Account<'info, Bet>,
    #[account(mut)]
    pub bettor: Signer<'info>,
}

#[error_code]
pub enum AnteError {
    #[msg("market id too long")]
    MarketIdTooLong,
    #[msg("fixture id too long")]
    FixtureIdTooLong,
    #[msg("fee exceeds the maximum")]
    FeeTooHigh,
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("outcome must be Yes or No")]
    BadOutcome,
    #[msg("market is not open")]
    MarketClosed,
    #[msg("betting is closed for this market")]
    BettingClosed,
    #[msg("cannot close a market that still holds staked funds")]
    MarketHasFunds,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("market already resolved")]
    AlreadyResolved,
    #[msg("signer is not the market oracle")]
    NotOracle,
    #[msg("too early to settle")]
    TooEarly,
    #[msg("wrong settlement instruction for this market kind")]
    WrongKind,
    #[msg("result digest does not match posted result")]
    DigestMismatch,
    #[msg("missing ed25519 feed signature instruction")]
    MissingFeedSignature,
    #[msg("malformed ed25519 feed signature instruction")]
    MalformedFeedSignature,
    #[msg("feed signature is not from this market's feed key")]
    WrongFeedSigner,
    #[msg("feed signature covers a different result")]
    WrongFeedMessage,
    #[msg("market not resolved yet")]
    NotResolved,
    #[msg("bet already claimed")]
    AlreadyClaimed,
    #[msg("bet is not on the winning outcome")]
    NotAWinner,
    #[msg("no winning stake in pool")]
    NoWinners,
    #[msg("bet does not belong to this market")]
    WrongMarket,
    #[msg("bet does not belong to this signer")]
    NotYourBet,
}
