import type { CryptoAsset, EquityAsset, MoneyAngle, ResearchInput, ResearchResult, ResearchSource } from "@how-money/shared";
import { callClaudeJson } from "./anthropic.js";
import { runCryptoAgent } from "./agents/crypto.js";
import { runEquitiesAgent } from "./agents/equities.js";
import { runFilingsAgent } from "./agents/filings.js";
import { runNewsAgent } from "./agents/news.js";
import { runOnchainAgent } from "./agents/onchain.js";
import type { JobStore } from "./jobs.js";
import {
  buildExtractTopicPrompt,
  buildResolvePrompt,
  buildSynthesizePrompt,
  EXTRACT_TOPIC_SYSTEM,
  RESOLVE_SYSTEM,
  SYNTHESIZE_SYSTEM
} from "./prompts.js";
import { validateCoinGeckoId } from "./providers/coingecko.js";
import { withTimeout } from "./providers/fetch.js";
import { mockProvidersEnabled } from "./providers/mock.js";
import { validateTicker } from "./providers/polygon.js";
import { tavilySearch } from "./providers/tavily.js";
import {
  extractTopicSchema,
  type ResolvedCrypto,
  resolvedEntitiesSchema,
  type ResolvedEntities,
  type ResolvedEquity,
  synthesizeResponseSchema,
  type SynthesizeResponse
} from "./schemas.js";
import type { AgentOutputs, ResearchEnv, TavilyBudget, TavilyResult } from "./types.js";

const resultCache = new Map<string, { expiresAt: number; result: ResearchResult }>();

export async function runResearchJob(
  jobId: string,
  input: ResearchInput,
  jobs: JobStore,
  env: ResearchEnv
) {
  jobs.updateStage(jobId, "extracting-topic");
  const topic = await extractTopic(input, env);
  const cached = resultCache.get(cacheKey(topic));

  if (cached && cached.expiresAt > Date.now()) {
    jobs.complete(jobId, cached.result);
    return;
  }

  const tavilyBudget: TavilyBudget = { remaining: 6 };

  jobs.updateStage(jobId, "resolving-entities");
  const searchResults = await searchForResolution(topic, env, tavilyBudget);
  const resolved = await resolveEntities(topic, input, searchResults, env);
  const verified = await validateResolvedAssets(resolved, env);

  jobs.updateStage(jobId, "running-agents");
  const agentOutputs = await runAgents(verified, env, tavilyBudget);

  jobs.updateStage(jobId, "synthesizing");
  const result = await synthesizeResult(input, topic, verified, agentOutputs, env);
  resultCache.set(cacheKey(topic), {
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    result
  });
  jobs.complete(jobId, result);
}

async function extractTopic(input: ResearchInput, env: ResearchEnv) {
  const response = await callClaudeJson(env, {
    system: EXTRACT_TOPIC_SYSTEM,
    prompt: buildExtractTopicPrompt(input),
    schema: extractTopicSchema,
    maxTokens: 200,
    image: input.image
  });

  if (response?.topic) {
    return response.topic;
  }

  return localExtractTopic(input);
}

async function searchForResolution(topic: string, env: ResearchEnv, budget: TavilyBudget): Promise<TavilyResult[]> {
  const queries = [
    `how to invest in ${topic} stocks ETFs 2026`,
    `${topic} publicly traded companies`,
    `${topic} cryptocurrency tokens`
  ];
  const results: TavilyResult[] = [];

  for (const query of queries) {
    results.push(...await tavilySearch(query, env, budget, { widenIfEmpty: true }));
  }

  return dedupeByUrl(results);
}

async function resolveEntities(
  topic: string,
  input: ResearchInput,
  searchResults: TavilyResult[],
  env: ResearchEnv
): Promise<ResolvedEntities> {
  const response = await callClaudeJson(env, {
    system: RESOLVE_SYSTEM,
    prompt: buildResolvePrompt(topic, searchResults),
    schema: resolvedEntitiesSchema,
    maxTokens: 1000,
    image: input.image
  });

  if (response) {
    return response;
  }

  return localResolveEntities(topic, searchResults);
}

export async function validateResolvedAssets(
  resolved: ResolvedEntities,
  env: ResearchEnv
): Promise<ResolvedEntities> {
  const equityResults = await Promise.allSettled(
    resolved.equityTickers.map(async (asset) => {
      const valid = await validateTicker(asset.ticker, env);
      return valid ? asset : null;
    })
  );
  const cryptoResults = await Promise.allSettled(
    resolved.cryptoTokens.map(async (asset) => {
      const valid = await validateCoinGeckoId(asset.coinGeckoId, env);
      return valid ? asset : null;
    })
  );
  const equityTickers = fulfilledValues(equityResults);
  const cryptoTokens = fulfilledValues(cryptoResults);
  const hasAssets = equityTickers.length > 0 || cryptoTokens.length > 0;

  return {
    ...resolved,
    equityTickers,
    cryptoTokens,
    investability: hasAssets ? resolved.investability : "low",
    investabilityReason: hasAssets
      ? resolved.investabilityReason
      : "No public equity ticker or crypto asset could be verified with the configured providers."
  };
}

async function runAgents(
  resolved: ResolvedEntities,
  env: ResearchEnv,
  tavilyBudget: TavilyBudget
): Promise<AgentOutputs> {
  const results = await Promise.allSettled([
    withTimeout(runEquitiesAgent(resolved, env)),
    withTimeout(runCryptoAgent(resolved, env)),
    withTimeout(runNewsAgent(resolved.topic, env, tavilyBudget)),
    withTimeout(runFilingsAgent(resolved.topic, env, tavilyBudget)),
    withTimeout(runOnchainAgent(resolved, env))
  ]);

  return {
    equities: getSettledValue(results[0], "equities"),
    crypto: getSettledValue(results[1], "crypto"),
    news: getSettledValue(results[2], "news"),
    filings: getSettledValue(results[3], "filings"),
    onchain: getSettledValue(results[4], "onchain")
  };
}

async function synthesizeResult(
  input: ResearchInput,
  topic: string,
  resolved: ResolvedEntities,
  agents: AgentOutputs,
  env: ResearchEnv
): Promise<ResearchResult> {
  const response = await callClaudeJson(env, {
    system: SYNTHESIZE_SYSTEM,
    prompt: buildSynthesizePrompt(topic, resolved, agents),
    schema: synthesizeResponseSchema,
    maxTokens: 2000,
    image: input.image
  });
  const synthesis = response ?? deterministicSynthesis(resolved, agents);
  const equities = agents.equities?.assets ?? [];
  const crypto = agents.crypto?.assets ?? [];
  const hasAssets = equities.length > 0 || crypto.length > 0;
  const investability = hasAssets ? resolved.investability : "unsupported";
  const sources = dedupeSources(flattenSources(agents));
  const caveats = buildCaveats(env, hasAssets, sources.length);

  return {
    query: input.selectedText ?? input.image?.altText ?? input.page.title,
    generatedAt: new Date().toISOString(),
    topic: {
      name: resolved.topic,
      summary: resolved.topicSummary,
      confidence: hasAssets ? 75 : 35,
      investability,
      investabilityReason: hasAssets
        ? resolved.investabilityReason || "Verified assets were found for this topic."
        : "No verified public-market or crypto asset was found for the highlighted item."
    },
    isActionable: hasAssets && investability !== "low",
    assets: {
      equities,
      crypto
    },
    thesis: {
      trendScore: hasAssets ? synthesis.trendScore : 0,
      bullCase: hasAssets ? synthesis.bullCase : "No bull case was generated because the backend could not verify a real investable asset for this highlight.",
      bearCase: hasAssets ? synthesis.bearCase : "The main risk is acting on an unverified or non-investable concept just because it appeared in highlighted content.",
      riskLevel: hasAssets ? synthesis.riskLevel : "high",
      riskBreakdown: hasAssets
        ? synthesis.riskBreakdown
        : { technology: "high", marketTiming: "high", regulatory: "high" },
      timeHorizon: hasAssets ? synthesis.timeHorizon : "not actionable"
    },
    howToGetIn: hasAssets ? synthesis.howToGetIn : [],
    opportunities: hasAssets ? buildOpportunities(equities, crypto, sources) : [],
    agentInsights: hasAssets ? synthesis.agentInsights : [
      "The research pipeline found no provider-verified ticker, token, or source-backed way to act on this highlight."
    ],
    relatedThemes: synthesis.relatedThemes,
    sources,
    caveats
  };
}

function deterministicSynthesis(resolved: ResolvedEntities, agents: AgentOutputs): SynthesizeResponse {
  const insights = [
    ...(agents.equities?.insights ?? []),
    ...(agents.crypto?.insights ?? []),
    ...(agents.news?.insights ?? []),
    ...(agents.filings?.insights ?? []),
    ...(agents.onchain?.insights ?? [])
  ].slice(0, 8);
  const hasAssets = (agents.equities?.assets.length ?? 0) + (agents.crypto?.assets.length ?? 0) > 0;

  return {
    trendScore: hasAssets ? 62 : 0,
    bullCase: hasAssets
      ? `${resolved.topic} has at least one provider-verified asset, so the thesis can be researched through public-market or crypto exposure. The strongest case depends on the highlighted trend translating into measurable revenue, adoption, or liquidity.`
      : "No provider-verified asset was found.",
    bearCase: hasAssets
      ? "The exposure may be indirect, already priced in, or too broad to capture the specific highlighted event. Provider data should be checked again before treating the idea as actionable."
      : "The highlight may describe a private company, novelty, meme, or non-commercial item without a reliable tradable angle.",
    riskLevel: resolved.investability === "high" ? "medium" : "high",
    riskBreakdown: {
      technology: "medium",
      marketTiming: "high",
      regulatory: "medium"
    },
    timeHorizon: hasAssets ? "speculative" : "not actionable",
    howToGetIn: hasAssets
      ? [
        "Review the verified assets and source links before taking any action.",
        "Compare direct exposure against diversified alternatives.",
        "Track upcoming catalysts, filings, and provider data changes."
      ]
      : [],
    agentInsights: insights.length > 0 ? insights : ["No provider-backed insights were available."],
    relatedThemes: resolved.categories
  };
}

function buildOpportunities(equities: EquityAsset[], crypto: CryptoAsset[], sources: ResearchSource[]): MoneyAngle[] {
  const sourceUrls = sources.map((source) => source.url).filter((url) => !url.startsWith("mock://")).slice(0, 3);

  return [
    ...equities.map<MoneyAngle>((asset) => ({
      type: "equity",
      title: `${asset.ticker} public equity exposure`,
      rationale: asset.rationale,
      confidence: asset.relevanceScore >= 80 ? "high" : asset.relevanceScore >= 60 ? "medium" : "low",
      howToAccess: `Research ${asset.ticker} through a brokerage or market data provider before deciding whether it fits the thesis.`,
      sourceUrls
    })),
    ...crypto.map<MoneyAngle>((asset) => ({
      type: "crypto",
      title: `${asset.symbol} crypto exposure`,
      rationale: asset.rationale,
      confidence: asset.relevanceScore >= 80 ? "high" : asset.relevanceScore >= 60 ? "medium" : "low",
      howToAccess: `Research ${asset.name} using CoinGecko id "${asset.coinGeckoId}" and verify exchange availability.`,
      sourceUrls
    }))
  ];
}

function buildCaveats(env: ResearchEnv, hasAssets: boolean, sourceCount: number) {
  const caveats = ["Not financial advice."];

  if (mockProvidersEnabled(env) && (!env.POLYGON_API_KEY || !env.COINGECKO_API_KEY || !env.TAVILY_API_KEY)) {
    caveats.push("Local mock provider mode is active for missing API keys; use real provider keys before relying on market data.");
  }

  if (!hasAssets) {
    caveats.push("No real way to take advantage of this highlight was verified by the configured providers.");
  }

  if (sourceCount === 0) {
    caveats.push("No external source links were available for this result.");
  }

  return caveats;
}

function localExtractTopic(input: ResearchInput) {
  const text = `${input.selectedText ?? ""} ${input.image?.altText ?? ""} ${input.page.title}`.trim();
  const normalized = text.toLowerCase();

  if (normalized.includes("bitcoin")) return "bitcoin";
  if (normalized.includes("ethereum")) return "ethereum";
  if (normalized.includes("ozempic") || normalized.includes("glp-1") || normalized.includes("weight loss")) return "GLP-1 weight loss drugs";
  if (normalized.includes("ai chip") || normalized.includes("gpu") || normalized.includes("accelerator")) return "AI chips";
  if (normalized.includes("solid-state battery") || normalized.includes("solid state battery")) return "solid-state batteries";

  return text.split(/\s+/).slice(0, 5).join(" ") || "unsupported";
}

function localResolveEntities(topic: string, searchResults: TavilyResult[]): ResolvedEntities {
  const normalized = `${topic} ${searchResults.map((result) => result.content).join(" ")}`.toLowerCase();

  if (normalized.includes("bitcoin")) {
    return {
      topic: "bitcoin",
      topicSummary: "Bitcoin is a decentralized crypto asset with direct token and ETF-linked market exposure.",
      equityTickers: [],
      cryptoTokens: [{
        symbol: "BTC",
        coinGeckoId: "bitcoin",
        name: "Bitcoin",
        relevanceScore: 95,
        rationale: "Bitcoin is the direct crypto asset behind bitcoin investment products."
      }],
      categories: ["crypto", "digital assets"],
      investability: "high",
      investabilityReason: "Bitcoin has direct, liquid market exposure."
    };
  }

  if (normalized.includes("ethereum")) {
    return {
      topic: "ethereum",
      topicSummary: "Ethereum is a smart contract network with direct token exposure and on-chain activity signals.",
      equityTickers: [],
      cryptoTokens: [{
        symbol: "ETH",
        coinGeckoId: "ethereum",
        name: "Ethereum",
        relevanceScore: 90,
        rationale: "Ethereum is the direct token exposure for the Ethereum network."
      }],
      categories: ["crypto", "smart contracts"],
      investability: "high",
      investabilityReason: "Ethereum has direct, liquid token exposure."
    };
  }

  if (normalized.includes("glp") || normalized.includes("ozempic") || normalized.includes("weight loss")) {
    return {
      topic: "GLP-1 weight loss drugs",
      topicSummary: "GLP-1 medicines are obesity and diabetes drugs with public-company exposure through drugmakers.",
      equityTickers: [
        {
          ticker: "LLY",
          exchange: "NYSE",
          name: "Eli Lilly and Company",
          relevance: "direct",
          relevanceScore: 88,
          rationale: "Eli Lilly sells GLP-1 medicines with direct revenue exposure."
        },
        {
          ticker: "NVO",
          exchange: "NYSE",
          name: "Novo Nordisk A/S",
          relevance: "direct",
          relevanceScore: 88,
          rationale: "Novo Nordisk sells GLP-1 medicines with direct revenue exposure."
        }
      ],
      cryptoTokens: [],
      categories: ["healthcare", "pharmaceuticals"],
      investability: "high",
      investabilityReason: "Several public companies have direct exposure to GLP-1 drug demand."
    };
  }

  if (normalized.includes("ai chip") || normalized.includes("gpu") || normalized.includes("accelerator")) {
    return {
      topic: "AI chips",
      topicSummary: "AI chips are semiconductors used to train and serve machine-learning workloads.",
      equityTickers: [{
        ticker: "NVDA",
        exchange: "NASDAQ",
        name: "NVIDIA Corporation",
        relevance: "direct",
        relevanceScore: 86,
        rationale: "NVIDIA is a public company with direct AI accelerator exposure."
      }],
      cryptoTokens: [],
      categories: ["semiconductors", "AI infrastructure"],
      investability: "medium",
      investabilityReason: "The theme has public equity exposure but valuations and cyclicality may be material risks."
    };
  }

  return {
    topic,
    topicSummary: "The highlighted item could not be mapped to verified public-market or crypto exposure.",
    equityTickers: [],
    cryptoTokens: [],
    categories: [],
    investability: "low",
    investabilityReason: "No reliable ticker, token, or provider-backed investment route was found."
  };
}

function getSettledValue<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === "fulfilled") {
    return result.value;
  }

  console.warn(`Research agent failed: ${label}`, result.reason);
  return null;
}

function fulfilledValues<T>(results: PromiseSettledResult<T | null>[]) {
  return results
    .filter((result): result is PromiseFulfilledResult<T | null> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((value): value is T => value !== null);
}

function flattenSources(agents: AgentOutputs) {
  return [
    ...(agents.equities?.sources ?? []),
    ...(agents.crypto?.sources ?? []),
    ...(agents.news?.sources ?? []),
    ...(agents.filings?.sources ?? []),
    ...(agents.onchain?.sources ?? [])
  ];
}

function dedupeSources(sources: ResearchSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }
    seen.add(source.url);
    return true;
  });
}

function dedupeByUrl(results: TavilyResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.url)) {
      return false;
    }
    seen.add(result.url);
    return true;
  });
}

function cacheKey(topic: string) {
  return topic.toLowerCase().replace(/\s+/g, "-");
}
