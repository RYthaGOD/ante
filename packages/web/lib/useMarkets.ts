"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getReadonlyProgram, marketPda, MARKET_AUTHORITY } from "./anchor";
import { MARKETS } from "./markets";

// Retry transient RPC failures (public devnet rate-limits getMultipleAccounts).
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

export function useMarkets() {
  const { connection } = useConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const program = getReadonlyProgram(connection);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let known: any[];
      if (MARKET_AUTHORITY) {
        const pdas = MARKETS.map((m) => marketPda(MARKET_AUTHORITY, m.id));
        const accts = await retry(() => program.account.market.fetchMultiple(pdas));
        known = accts
          .map((account, i) => (account ? { publicKey: pdas[i], account } : null))
          .filter((x) => x !== null);
      } else {
        const all = await program.account.market.all();
        known = all.filter((m) => MARKETS.some((c) => c.id === m.account.marketId));
      }
      known.sort(
        (a, b) => ("open" in a.account.status ? 0 : 1) - ("open" in b.account.status ? 0 : 1),
      );
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

  const open = markets.filter((m) => "open" in m.account.status).length;
  const pooled = markets.reduce(
    (s, m) => s + (m.account.poolYes.toNumber() + m.account.poolNo.toNumber()) / LAMPORTS_PER_SOL,
    0,
  );

  return { markets, loading, reload, open, settled: markets.length - open, pooled };
}
