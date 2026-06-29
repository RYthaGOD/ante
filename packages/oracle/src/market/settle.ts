import type { MarketMeta, MatchResult, Outcome, Resolution } from '../txodds/types.ts';
import { scoreDigestHex, customDigestHex } from '../txodds/digest.ts';

// Settlement rules — the off-chain twin of the on-chain program. The feeder uses
// these to decide the outcome + digest it posts; the program re-derives/checks it.

export function settleScore(meta: MarketMeta, result: MatchResult): Resolution {
  let yes: boolean;
  switch (meta.kind) {
    case 'home_win':
      yes = result.homeGoals > result.awayGoals;
      break;
    case 'over_2_5':
      yes = result.homeGoals + result.awayGoals > 2.5;
      break;
    default:
      throw new Error(`settleScore called on non-score market ${meta.id}`);
  }
  const winningOutcome: Outcome = yes ? 'YES' : 'NO';
  return {
    marketId: meta.id,
    winningOutcome,
    resultDigest: scoreDigestHex(meta.id, result.homeGoals, result.awayGoals),
    resolvedAt: new Date().toISOString(),
  };
}

export function settleCustom(meta: MarketMeta, outcome: Outcome): Resolution {
  return {
    marketId: meta.id,
    winningOutcome: outcome,
    resultDigest: customDigestHex(meta.id, outcome),
    resolvedAt: new Date().toISOString(),
  };
}
