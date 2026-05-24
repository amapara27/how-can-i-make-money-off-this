import type { ResearchInput } from "@how-money/shared";
import type { ResolvedEntities } from "./schemas.js";
import type { AgentOutputs, TavilyResult } from "./types.js";

export const EXTRACT_TOPIC_SYSTEM = `
You extract the core investable topic from web page content.

Return a JSON object with one field:
{ "topic": "<topic name>" }

Rules:
- Topic should be 2-5 words, noun phrase
- Focus on what someone would want to invest in, not the specific news event
- If the selected image/text does not describe an investable topic, return the literal topic "unsupported"
- Return JSON only. No preamble. No markdown fences.
`;

export function buildExtractTopicPrompt(input: ResearchInput): string {
  return `URL: ${input.page.url}

Page title: ${input.page.title}

Selected text (user highlighted this): ${input.selectedText ?? "none"}

Image attached: ${input.image ? `${input.image.mimeType}${input.image.altText ? `, alt text: ${input.image.altText}` : ""}` : "none"}

Extract the investable topic.`;
}

export const RESOLVE_SYSTEM = `
You are a financial analyst mapping a trend topic to investable assets.

Given a topic and web search results about how to invest in it, return a JSON
object with this exact shape:

{
  "topic": "<canonical topic name>",
  "topicSummary": "<one sentence explaining what this is>",
  "equityTickers": [
    {
      "ticker": "<SYMBOL>",
      "exchange": "<NYSE|NASDAQ|OTC>",
      "name": "<company name>",
      "relevance": "<direct|indirect|upstream|etf>",
      "relevanceScore": <0-100>,
      "rationale": "<one sentence>"
    }
  ],
  "cryptoTokens": [
    {
      "symbol": "<SYMBOL>",
      "coinGeckoId": "<coingecko-id>",
      "name": "<token name>",
      "relevanceScore": <0-100>,
      "rationale": "<one sentence>",
      "contractAddress": "<optional ERC-20 contract address>"
    }
  ],
  "categories": ["<theme1>", "<theme2>"],
  "investability": "low|medium|high",
  "investabilityReason": "<one sentence - required if low>"
}

Rules:
- Only include tickers you are highly confident exist and are publicly traded
- If uncertain about a ticker, omit it entirely - do not guess
- If no equity plays exist, return equityTickers: []
- If no crypto plays exist, return cryptoTokens: []
- If investability is low, explain why in investabilityReason
- Return JSON only. No preamble. No markdown fences.
- Max 6 equity tickers, max 4 crypto tokens
`;

export function buildResolvePrompt(topic: string, searchResults: TavilyResult[]): string {
  const searchContext = searchResults.length > 0
    ? searchResults.map((result) => `Source: ${result.url}\n${result.content}`).join("\n\n---\n\n")
    : "No web search context was available. Return low investability unless the topic maps to highly obvious public assets.";

  return `Topic: ${topic}

Web search results about investing in this topic:
${searchContext}

Map this topic to investable assets.`;
}

export const SYNTHESIZE_SYSTEM = `
You are a financial research analyst writing a structured investment brief.

You will receive:
- A resolved topic with equity and crypto assets
- Real market data: prices, ETF holdings, recent news, SEC filings, on-chain signals

Return a JSON object with this exact shape (all fields required):

{
  "trendScore": <0-100, how viral/significant is this trend>,
  "bullCase": "<2-3 sentences. Concrete, specific. What has to go right.>",
  "bearCase": "<2-3 sentences. Concrete, specific. What kills the thesis.>",
  "riskLevel": "low|medium|high",
  "riskBreakdown": {
    "technology": "low|medium|high",
    "marketTiming": "low|medium|high",
    "regulatory": "low|medium|high"
  },
  "timeHorizon": "<e.g. '3-5 years', '6-12 months', 'speculative'>",
  "howToGetIn": [
    "<step 1 - most accessible option first>",
    "<step 2>",
    "<step 3>"
  ],
  "agentInsights": [
    "<specific data point from the research - e.g. '14 patents filed by Toyota in 90 days'>",
    "<another specific finding>",
    "<a cautionary signal if one exists>"
  ],
  "relatedThemes": ["<theme1>", "<theme2>", "<theme3>"]
}

Rules:
- Bull and bear cases must be specific to the data, not generic
- howToGetIn steps go from lowest friction to highest conviction
- agentInsights must cite specific numbers or findings from the data provided
- If data does not support a real investable angle, say that clearly and keep howToGetIn empty
- Return JSON only. No preamble. No markdown fences.
`;

export function buildSynthesizePrompt(topic: string, resolved: ResolvedEntities, agents: AgentOutputs): string {
  return `Topic: ${topic}

Resolved assets:
${JSON.stringify(resolved, null, 2)}

Market data from agents:
${JSON.stringify(agents, null, 2)}

Write the investment brief.`;
}

export const NEWS_INSIGHTS_SYSTEM = `
You are extracting investment-relevant signals from news articles.

Return a JSON array of insight strings (max 3):
["<insight 1>", "<insight 2>", "<insight 3>"]

Each insight must:
- Be one sentence
- Cite a specific fact, number, or named entity
- Be relevant to investing in this topic (not general news summary)
- Return JSON only. No preamble. No markdown fences.
`;

export const FILINGS_INSIGHTS_SYSTEM = `
You are extracting investment signals from SEC filings and patent data.

Return a JSON array of insight strings (max 3):
["<insight 1>", "<insight 2>", "<insight 3>"]

Each insight must:
- Reference a specific filing, date, or patent count
- Signal something meaningful about competitive position or risk
- Return JSON only. No preamble. No markdown fences.
`;
