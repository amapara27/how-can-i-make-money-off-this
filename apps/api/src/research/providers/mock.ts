import type { CryptoAsset, EquityAsset } from "@how-money/shared";
import type { ResearchEnv, TavilyResult } from "../types.js";

export function mockProvidersEnabled(env: ResearchEnv) {
  return env.HCIMOT_MOCK_PROVIDERS !== "false";
}

const mockEquities: Record<string, EquityAsset> = {
  NVDA: {
    ticker: "NVDA",
    exchange: "NASDAQ",
    name: "NVIDIA Corporation",
    relevance: "direct",
    relevanceScore: 86,
    rationale: "NVIDIA is a public semiconductor company with direct exposure to AI accelerator demand.",
    priceUsd: 125,
    dayChangePercent: 0
  },
  LLY: {
    ticker: "LLY",
    exchange: "NYSE",
    name: "Eli Lilly and Company",
    relevance: "direct",
    relevanceScore: 88,
    rationale: "Eli Lilly markets GLP-1 medicines with direct exposure to obesity and diabetes demand.",
    priceUsd: 790,
    dayChangePercent: 0
  },
  NVO: {
    ticker: "NVO",
    exchange: "NYSE",
    name: "Novo Nordisk A/S",
    relevance: "direct",
    relevanceScore: 88,
    rationale: "Novo Nordisk sells GLP-1 medicines with direct exposure to obesity and diabetes demand.",
    priceUsd: 87,
    dayChangePercent: 0
  },
  TM: {
    ticker: "TM",
    exchange: "NYSE",
    name: "Toyota Motor Corporation",
    relevance: "indirect",
    relevanceScore: 72,
    rationale: "Toyota has public exposure to solid-state battery commercialization through electric vehicle programs.",
    priceUsd: 180,
    dayChangePercent: 0
  }
};

const mockCrypto: Record<string, CryptoAsset> = {
  bitcoin: {
    symbol: "BTC",
    coinGeckoId: "bitcoin",
    name: "Bitcoin",
    relevanceScore: 95,
    rationale: "Bitcoin is the primary crypto asset behind spot bitcoin ETF and digital gold narratives.",
    priceUsd: 100_000,
    marketCapUsd: 1_900_000_000_000,
    dayChangePercent: 0
  },
  ethereum: {
    symbol: "ETH",
    coinGeckoId: "ethereum",
    name: "Ethereum",
    relevanceScore: 90,
    rationale: "Ethereum is a major smart contract network behind many tokenized finance and on-chain applications.",
    priceUsd: 3_500,
    marketCapUsd: 420_000_000_000,
    dayChangePercent: 0
  }
};

export function getMockEquity(ticker: string) {
  return mockEquities[ticker.toUpperCase()];
}

export function getMockCrypto(coinGeckoId: string) {
  return mockCrypto[coinGeckoId.toLowerCase()];
}

export function mockTavilyResults(query: string): TavilyResult[] {
  const normalized = query.toLowerCase();

  if (normalized.includes("bitcoin")) {
    return [
      {
        title: "Mock source: bitcoin investing context",
        url: "mock://bitcoin-investing-context",
        content: "Spot bitcoin ETFs and direct BTC exposure are established ways investors track bitcoin price movements.",
        score: 0.95
      }
    ];
  }

  if (normalized.includes("glp") || normalized.includes("ozempic") || normalized.includes("weight loss")) {
    return [
      {
        title: "Mock source: GLP-1 public market context",
        url: "mock://glp-1-public-market-context",
        content: "Novo Nordisk and Eli Lilly are public companies with direct GLP-1 obesity and diabetes drug exposure.",
        score: 0.92
      }
    ];
  }

  if (normalized.includes("ai chip") || normalized.includes("gpu") || normalized.includes("accelerator")) {
    return [
      {
        title: "Mock source: AI chip public market context",
        url: "mock://ai-chip-public-market-context",
        content: "NVIDIA is a public company with direct exposure to AI accelerator and GPU demand.",
        score: 0.9
      }
    ];
  }

  return [];
}
