import type { EquityAsset } from "@how-money/shared";
import type { ResearchEnv } from "../types.js";
import { fetchJsonWithTimeout } from "./fetch.js";

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

type PolygonPreviousCloseResponse = {
  results?: Array<{
    c?: number;
    o?: number;
  }>;
};

export async function validateTicker(ticker: string, env: ResearchEnv): Promise<boolean> {
  const normalized = ticker.toUpperCase();

  if (!env.POLYGON_API_KEY) {
    return false;
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
    return [];
  }

  const tickers = assets.map((asset) => asset.ticker).join(",");
  let response: PolygonSnapshotResponse;

  try {
    response = await fetchJsonWithTimeout<PolygonSnapshotResponse>(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(tickers)}&apiKey=${env.POLYGON_API_KEY}`
    );
  } catch (error) {
    console.warn("Polygon snapshot enrichment failed; falling back to previous-day aggregate data.", {
      tickers,
      error
    });
    return enrichEquitiesWithPreviousClose(assets, env.POLYGON_API_KEY);
  }

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

async function enrichEquitiesWithPreviousClose(assets: EquityAsset[], apiKey: string): Promise<EquityAsset[]> {
  const results = await Promise.allSettled(
    assets.map(async (asset) => {
      const response = await fetchJsonWithTimeout<PolygonPreviousCloseResponse>(
        `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(asset.ticker)}/prev?adjusted=true&apiKey=${apiKey}`
      );
      const previousDay = response.results?.[0];
      const open = previousDay?.o;
      const close = previousDay?.c;

      return {
        ...asset,
        priceUsd: close,
        dayChangePercent: typeof open === "number" && typeof close === "number" && open !== 0
          ? ((close - open) / open) * 100
          : undefined
      };
    })
  );

  return results.map((result, index) => result.status === "fulfilled" ? result.value : assets[index]);
}
