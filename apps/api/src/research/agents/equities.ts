import type { ResearchSource } from "@how-money/shared";
import type { ResolvedEntities } from "../schemas.js";
import type { EquityAgentOutput, ResearchEnv } from "../types.js";
import { enrichEquities } from "../providers/polygon.js";

export async function runEquitiesAgent(
  resolved: ResolvedEntities,
  env: ResearchEnv
): Promise<EquityAgentOutput> {
  const assets = await enrichEquities(resolved.equityTickers.map((asset) => ({ ...asset })), env);

  return {
    assets,
    insights: assets.map((asset) => {
      const price = typeof asset.priceUsd === "number" ? ` Last price sample: $${asset.priceUsd}.` : "";
      return `${asset.ticker} is a ${asset.relevance} public-market exposure with relevance score ${asset.relevanceScore}.${price}`;
    }),
    sources: assets.map<ResearchSource>((asset) => ({
      title: `${asset.ticker} market data`,
      url: `https://www.polygon.io/tickers/${asset.ticker}`,
      provider: "polygon",
      excerpt: asset.rationale
    }))
  };
}
