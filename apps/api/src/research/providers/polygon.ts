import type { EquityAsset } from "@how-money/shared";
import type { ResearchEnv } from "../types.js";
import { fetchJsonWithTimeout } from "./fetch.js";
import { getMockEquity, mockProvidersEnabled } from "./mock.js";

type PolygonTickerResponse = {
  status?: string;
  results?: {
    ticker?: string;
    name?: string;
    primary_exchange?: string;
  };
};

type PolygonSnapshotResponse = {
  tickers?: Array<{
    ticker: string;
    day?: { c?: number };
    todaysChangePerc?: number;
  }>;
};

export async function validateTicker(ticker: string, env: ResearchEnv): Promise<boolean> {
  const normalized = ticker.toUpperCase();

  if (!env.POLYGON_API_KEY) {
    return mockProvidersEnabled(env) && Boolean(getMockEquity(normalized));
  }

  const response = await fetchJsonWithTimeout<PolygonTickerResponse>(
    `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(normalized)}?apiKey=${env.POLYGON_API_KEY}`
  );
  return response.status === "OK" && Boolean(response.results?.ticker);
}

export async function enrichEquities(assets: EquityAsset[], env: ResearchEnv): Promise<EquityAsset[]> {
  if (assets.length === 0) {
    return [];
  }

  if (!env.POLYGON_API_KEY) {
    return assets.map((asset) => ({
      ...asset,
      ...getMockEquity(asset.ticker)
    }));
  }

  const tickers = assets.map((asset) => asset.ticker).join(",");
  const response = await fetchJsonWithTimeout<PolygonSnapshotResponse>(
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(tickers)}&apiKey=${env.POLYGON_API_KEY}`
  );
  const snapshots = new Map((response.tickers ?? []).map((snapshot) => [snapshot.ticker, snapshot]));

  return assets.map((asset) => {
    const snapshot = snapshots.get(asset.ticker);
    return {
      ...asset,
      priceUsd: snapshot?.day?.c,
      dayChangePercent: snapshot?.todaysChangePerc
    };
  });
}
