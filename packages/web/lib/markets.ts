import marketsData from "../data/markets.json";
import { metaFromId } from "./teams";

export type MarketKind = "home_win" | "over_2_5" | "custom";

export interface MarketMeta {
  id: string;
  title: string;
  blurb: string;
  kind: MarketKind;
  fixtureId?: string;
  resolutionDate?: string;
  art?: string;
}

export const MARKETS = marketsData as MarketMeta[];

// Hand-written metadata for the original markets; otherwise generate a title/art
// from the market id (wc26-<home>-<away>:<kind>) so feed-seeded markets render too.
export const metaById = (id: string): MarketMeta | undefined =>
  MARKETS.find((m) => m.id === id) ?? metaFromId(id) ?? undefined;

export const kindLabel: Record<MarketKind, string> = {
  home_win: "Match Result",
  over_2_5: "Goals",
  custom: "Tournament",
};
