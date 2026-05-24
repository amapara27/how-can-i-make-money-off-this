import type { CryptoAsset } from "@how-money/shared";
import type { ResearchEnv } from "../types.js";
import { fetchJsonWithTimeout } from "./fetch.js";
import { getMockCrypto, mockProvidersEnabled } from "./mock.js";

type CoinGeckoPrice = Record<string, {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
}>;

export async function validateCoinGeckoId(id: string, env: ResearchEnv): Promise<boolean> {
  const normalized = id.toLowerCase();

  if (!env.COINGECKO_API_KEY) {
    return mockProvidersEnabled(env) && Boolean(getMockCrypto(normalized));
  }

  const data = await fetchJsonWithTimeout<CoinGeckoPrice>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(normalized)}&vs_currencies=usd`,
    { headers: { "x-cg-demo-api-key": env.COINGECKO_API_KEY } }
  );
  return Object.keys(data).length > 0;
}

export async function enrichCrypto(assets: CryptoAsset[], env: ResearchEnv): Promise<CryptoAsset[]> {
  if (assets.length === 0) {
    return [];
  }

  if (!env.COINGECKO_API_KEY) {
    return assets.map((asset) => ({
      ...asset,
      ...getMockCrypto(asset.coinGeckoId)
    }));
  }

  const ids = assets.map((asset) => asset.coinGeckoId).join(",");
  const data = await fetchJsonWithTimeout<CoinGeckoPrice>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
    { headers: { "x-cg-demo-api-key": env.COINGECKO_API_KEY } }
  );

  return assets.map((asset) => {
    const price = data[asset.coinGeckoId];
    return {
      ...asset,
      priceUsd: price?.usd,
      marketCapUsd: price?.usd_market_cap,
      dayChangePercent: price?.usd_24h_change
    };
  });
}
