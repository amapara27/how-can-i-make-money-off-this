import { z } from "zod";

const confidenceSchema = z.number().min(0).max(100);
const riskSchema = z.enum(["low", "medium", "high"]);

export const extractTopicSchema = z.object({
  topic: z.string().min(2).max(120)
});

export const resolvedEquitySchema = z.object({
  ticker: z.string().min(1).max(10).transform((ticker) => ticker.toUpperCase()),
  exchange: z.string().optional(),
  name: z.string().min(1),
  relevance: z.enum(["direct", "indirect", "upstream", "etf"]),
  relevanceScore: confidenceSchema,
  rationale: z.string().min(1)
});

export const resolvedCryptoSchema = z.object({
  symbol: z.string().min(1).max(20).transform((symbol) => symbol.toUpperCase()),
  coinGeckoId: z.string().min(1),
  name: z.string().min(1),
  relevanceScore: confidenceSchema,
  rationale: z.string().min(1),
  contractAddress: z.string().optional()
});

export const resolvedEntitiesSchema = z.object({
  topic: z.string().min(2),
  topicSummary: z.string().min(1),
  equityTickers: z.array(resolvedEquitySchema).max(6),
  cryptoTokens: z.array(resolvedCryptoSchema).max(4),
  categories: z.array(z.string().min(1)).max(8),
  investability: z.enum(["low", "medium", "high"]),
  investabilityReason: z.string()
});

export const synthesizeResponseSchema = z.object({
  trendScore: confidenceSchema,
  bullCase: z.string().min(1),
  bearCase: z.string().min(1),
  riskLevel: riskSchema,
  riskBreakdown: z.object({
    technology: riskSchema,
    marketTiming: riskSchema,
    regulatory: riskSchema
  }),
  timeHorizon: z.string().min(1),
  howToGetIn: z.array(z.string().min(1)).max(6),
  agentInsights: z.array(z.string().min(1)).max(8),
  relatedThemes: z.array(z.string().min(1)).max(8)
});

export type ExtractTopicResponse = z.infer<typeof extractTopicSchema>;
export type ResolvedEntities = z.infer<typeof resolvedEntitiesSchema>;
export type ResolvedEquity = z.infer<typeof resolvedEquitySchema>;
export type ResolvedCrypto = z.infer<typeof resolvedCryptoSchema>;
export type SynthesizeResponse = z.infer<typeof synthesizeResponseSchema>;
