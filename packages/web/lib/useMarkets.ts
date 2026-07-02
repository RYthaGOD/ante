"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getReadonlyProgram, MARKET_AUTHORITY } from "./anchor";
import { isDisplayableMarket } from "./teams";

// Retry transient RPC failures (public devnet rate-limits getProgramAccounts).
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

// Discovers every market the oracle has created on-chain — so markets the rotation
// cron seeds from the live feed appear automatically, with no redeploy. Filtered
// server-side by authority (memcmp) to keep the result small, then to the
// displayable wc26-<home>-<away>:<kind> ids (drops throwaway/e2e markets).
export function useMarkets() {
  const { connection } = useConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const program = getReadonlyProgram(connection);
      const filters = MARKET_AUTHORITY
        ? [{ memcmp: { offset: 8, bytes: MARKET_AUTHORITY.toBase58() } }]
        : [];
      const all = await retry(() => program.account.market.all(filters));
      const known = all
        .filter((m) => isDisplayableMarket(m.account.marketId))
        .map((m) => ({ publicKey: m.publicKey, account: m.account }));
      // Open (still taking bets) first, then settled; within each, soonest cutoff first.
      known.sort((a, b) => {
        const ao = "open" in a.account.status ? 0 : 1;
        const bo = "open" in b.account.status ? 0 : 1;
        return ao - bo || a.account.settleAfter.toNumber() - b.account.settleAfter.toNumber();
      });
      setMarkets(known);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    reload();
  }, [reload]);

  const now = Math.floor(Date.now() / 1000);
  // "Open" = still taking bets (status Open AND cutoff in the future).
  const open = markets.filter(
    (m) => "open" in m.account.status && m.account.settleAfter.toNumber() > now,
  ).length;
  const settled = markets.filter((m) => "resolved" in m.account.status).length;
  const pooled = markets.reduce(
    (s, m) => s + (m.account.poolYes.toNumber() + m.account.poolNo.toNumber()) / LAMPORTS_PER_SOL,
    0,
  );

  return { markets, loading, reload, open, settled, pooled };
}
