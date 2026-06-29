use anchor_lang::prelude::*;

declare_id!("G1tgXodmDq9X3MTtdHLNpjDWscUqsjiW29fcpUHvJoHu");

// ANTE — verifiable settlement for World Cup prediction markets.
//
// Each market is a binary YES/NO question, identified by a human-readable
// `market_id`. Two settlement paths, both gated to the market's oracle (the
// TxODDS feeder), only after the settle window, and both recording an on-chain
// `result_digest` so anyone can recompute settlement from the public result:
//
//   * Score markets (HomeWin / Over25): the feeder posts the verified score and
//     the program itself computes the winner — the strongest guarantee.
//   * Custom markets: the feeder posts the YES/NO outcome directly (Golden Boot,
//     player props, progression...) — expressive like Upshot's cards, settled
//     trustlessly via the same digest + authorized-feeder mechanism.
//
// Bettors stake SOL into a parimutuel pool; winners claim pro-rata. The settle
// logic is the on-chain twin of packages/oracle (settle.ts / digest.ts).

const MAX_MARKET_ID_LEN: usize = 48;
const MAX_FIXTURE_LEN: usize = 32;

#[program]
pub mod ante_market {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id: String,
        fixture_id: String,
        kind: MarketKind,
        settle_after: i64,
    ) -> Result<()> {
        require!(market_id.len() <= MAX_MARKET_ID_LEN, AnteError::MarketIdTooLong);
        require!(fixture_id.len() <= MAX_FIXTURE_LEN, AnteError::FixtureIdTooLong);
        let m = &mut ctx.accounts.market;
        m.authority = ctx.accounts.authority.key();
        m.oracle = ctx.accounts.authority.key(); // MVP: the creator is the feeder
        m.market_id = market_id;
        m.fixture_id = fixture_id;
        m.kind = kind;
        m.status = MarketStatus::Open;
        m.settle_after = settle_after;
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
    // score and checks the digest matches sha256("market_id:home:away").
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

        let yes_wins = match market.kind {
            MarketKind::HomeWin => home_goals > away_goals,
            MarketKind::Over25 => (home_goals as u16 + away_goals as u16) >= 3,
            MarketKind::Custom => unreachable!(),
        };
        finalize(market, market_key, if yes_wins { Outcome::Yes } else { Outcome::No }, result_digest);
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
        finalize(market, market_key, winning_outcome, result_digest);
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.market.status == MarketStatus::Resolved,
            AnteError::NotResolved
        );
        require!(
            ctx.accounts.bet.market == ctx.accounts.market.key(),
            AnteError::WrongMarket
        );
        require!(
            ctx.accounts.bet.bettor == ctx.accounts.bettor.key(),
            AnteError::NotYourBet
        );
        require!(!ctx.accounts.bet.claimed, AnteError::AlreadyClaimed);
        require!(
            ctx.accounts.bet.outcome == ctx.accounts.market.winning_outcome,
            AnteError::NotAWinner
        );

        let market = &ctx.accounts.market;
        let total = market.pool_yes.checked_add(market.pool_no).ok_or(AnteError::Overflow)?;
        let win_pool = match market.winning_outcome {
            Outcome::Yes => market.pool_yes,
            Outcome::No => market.pool_no,
            Outcome::Unresolved => return err!(AnteError::NotResolved),
        };
        require!(win_pool > 0, AnteError::NoWinners);

        // Pro-rata share of the whole pool: amount / winning_pool * total.
        let payout = (ctx.accounts.bet.amount as u128)
            .checked_mul(total as u128)
            .ok_or(AnteError::Overflow)?
            .checked_div(win_pool as u128)
            .ok_or(AnteError::Overflow)? as u64;

        // Pay directly out of the market PDA (program-owned) to the bettor.
        let market_ai = ctx.accounts.market.to_account_info();
        let bettor_ai = ctx.accounts.bettor.to_account_info();
        **market_ai.try_borrow_mut_lamports()? -= payout;
        **bettor_ai.try_borrow_mut_lamports()? += payout;

        ctx.accounts.bet.claimed = true;
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

fn finalize(market: &mut Market, market_key: Pubkey, outcome: Outcome, digest: [u8; 32]) {
    market.winning_outcome = outcome;
    market.result_digest = digest;
    market.status = MarketStatus::Resolved;
    emit!(MarketResolved {
        market: market_key,
        market_id: market.market_id.clone(),
        winning_outcome: outcome,
        result_digest: digest,
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
    #[max_len(48)]
    pub market_id: String,
    #[max_len(32)]
    pub fixture_id: String,
    pub kind: MarketKind,
    pub status: MarketStatus,
    pub settle_after: i64,
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
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
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
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("outcome must be Yes or No")]
    BadOutcome,
    #[msg("market is not open")]
    MarketClosed,
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
