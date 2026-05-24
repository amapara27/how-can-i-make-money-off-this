import type { CryptoAsset, EquityAsset, ResearchSource } from "@how-money/shared";

export type ResearchEnv = Record<string, string | undefined>;

export type TavilyBudget = {
  remaining: number;
};

export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
};

export type EquityAgentOutput = {
  assets: EquityAsset[];
  insights: string[];
  sources: ResearchSource[];
};

export type CryptoAgentOutput = {
  assets: CryptoAsset[];
  insights: string[];
  sources: ResearchSource[];
};

export type NewsAgentOutput = {
  insights: string[];
  sources: ResearchSource[];
};

export type FilingsAgentOutput = {
  insights: string[];
  sources: ResearchSource[];
};

export type OnchainAgentOutput = {
  insights: string[];
  sources: ResearchSource[];
};

export type AgentOutputs = {
  equities: EquityAgentOutput | null;
  crypto: CryptoAgentOutput | null;
  news: NewsAgentOutput | null;
  filings: FilingsAgentOutput | null;
  onchain: OnchainAgentOutput | null;
};
