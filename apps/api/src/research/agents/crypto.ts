import type { ResearchSource } from "@how-money/shared";
import type { ResolvedEntities } from "../schemas.js";
import type { CryptoAgentOutput, ResearchEnv } from "../types.js";
import { enrichCrypto } from "../providers/coingecko.js";

export async function runCryptoAgent(
  resolved: ResolvedEntities,
  env: ResearchEnv
): Promise<CryptoAgentOutput> {
  const assets = await enrichCrypto(resolved.cryptoTokens.map((asset) => ({ ...asset })), env);

  return {
    assets,
    insights: assets.map((asset) => {
      const price = typeof asset.priceUsd === "number" ? ` Last price sample: $${asset.priceUsd}.` : "";
      return `${asset.symbol} maps to CoinGecko id "${asset.coinGeckoId}" with relevance score ${asset.relevanceScore}.${price}`;
    }),
    sources: assets.map<ResearchSource>((asset) => ({
      title: `${asset.name} CoinGecko data`,
      url: `https://www.coingecko.com/en/coins/${asset.coinGeckoId}`,
      provider: "coingecko",
      excerpt: asset.rationale
    }))
  };
}
