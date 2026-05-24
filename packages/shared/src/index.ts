export type PageContext = {
  url: string;
  title: string;
};

export type HighlightImage = {
  dataUrl: string;
  mimeType: string;
  altText?: string;
};

export type SelectionContext = {
  id: string;
  selectedText: string;
  image?: HighlightImage;
  page: PageContext;
  capturedAt: string;
};

export type ResearchInput = {
  selectedText?: string;
  image?: HighlightImage;
  page: PageContext;
};

export type ResearchRequest = ResearchInput;

export type ResearchJobStatus = "queued" | "running" | "complete" | "failed";

export type ResearchStage =
  | "queued"
  | "extracting-topic"
  | "resolving-entities"
  | "running-agents"
  | "synthesizing"
  | "complete"
  | "failed";

export type Investability = "unsupported" | "low" | "medium" | "high";

export type ResearchSource = {
  title: string;
  url: string;
  provider: "tavily" | "polygon" | "coingecko" | "etherscan" | "sec" | "anthropic" | "mock";
  publishedAt?: string;
  excerpt?: string;
};

export type EquityAsset = {
  ticker: string;
  exchange?: string;
  name: string;
  relevance: "direct" | "indirect" | "upstream" | "etf";
  relevanceScore: number;
  rationale: string;
  priceUsd?: number;
  dayChangePercent?: number;
};

export type CryptoAsset = {
  symbol: string;
  coinGeckoId: string;
  name: string;
  relevanceScore: number;
  rationale: string;
  priceUsd?: number;
  marketCapUsd?: number;
  dayChangePercent?: number;
  contractAddress?: string;
};

export type RiskBreakdown = {
  technology: "low" | "medium" | "high";
  marketTiming: "low" | "medium" | "high";
  regulatory: "low" | "medium" | "high";
};

export type MoneyAngle = {
  type: "equity" | "crypto" | "prediction" | "business";
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  howToAccess: string;
  sourceUrls: string[];
};

export type ResearchResult = {
  query: string;
  generatedAt: string;
  topic: {
    name: string;
    summary: string;
    confidence: number;
    investability: Investability;
    investabilityReason: string;
  };
  isActionable: boolean;
  assets: {
    equities: EquityAsset[];
    crypto: CryptoAsset[];
  };
  thesis: {
    trendScore: number;
    bullCase: string;
    bearCase: string;
    riskLevel: "low" | "medium" | "high";
    riskBreakdown: RiskBreakdown;
    timeHorizon: string;
  };
  howToGetIn: string[];
  opportunities: MoneyAngle[];
  agentInsights: string[];
  relatedThemes: string[];
  sources: ResearchSource[];
  caveats: string[];
};

export type ResearchJob = {
  jobId: string;
  status: ResearchJobStatus;
  stage: ResearchStage;
  createdAt: string;
  updatedAt: string;
  result?: ResearchResult;
  error?: string;
};

export type CreateResearchJobResponse = {
  jobId: string;
  status: ResearchJobStatus;
};

export type ResearchSection = {
  title: string;
  summary: string;
  bullets: string[];
};

export type ResearchResponse = {
  query: string;
  generatedAt: string;
  sections: ResearchSection[];
  caveats: string[];
};
