import marketsData from "../data/markets.json";

export type MarketKind = "home_win" | "over_2_5" | "custom";

export interface MarketMeta {
  id: string;
  title: string;
  blurb: string;
  kind: MarketKind;
  fixtureId?: string;
  resolutionDate: string;
  art?: string;
}

export const MARKETS = marketsData as MarketMeta[];

export const metaById = (id: string): MarketMeta | undefined =>
  MARKETS.find((m) => m.id === id);

export const kindLabel: Record<MarketKind, string> = {
  home_win: "Match Result",
  over_2_5: "Goals",
  custom: "Tournament",
};
