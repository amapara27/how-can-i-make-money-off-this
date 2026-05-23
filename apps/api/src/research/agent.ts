import type { ResearchRequest, ResearchResponse } from "@how-money/shared";
import type { AppConfig } from "../config.js";
import { ClaudeResearchClient } from "./anthropic.js";
import { buildMockResearch } from "./mock.js";
import { TavilyResearchCollector } from "./tavily.js";

export class ResearchConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchConfigurationError";
  }
}

export async function runResearchAgent(
  request: ResearchRequest,
  config: AppConfig
): Promise<ResearchResponse> {
  if (!config.anthropicApiKey || !config.tavilyApiKey) {
    if (config.allowMockResearch) {
      return buildMockResearch(request);
    }

    throw new ResearchConfigurationError(
      "ANTHROPIC_API_KEY and TAVILY_API_KEY are required. Set RESEARCH_ALLOW_MOCK=true to use mocked local responses."
    );
  }

  const claude = new ClaudeResearchClient({
    apiKey: config.anthropicApiKey,
    model: config.anthropicModel
  });
  const tavily = new TavilyResearchCollector({
    apiKey: config.tavilyApiKey,
    maxSearchResults: config.maxSearchResults,
    maxExtractUrls: config.maxExtractUrls
  });

  const plan = await claude.planResearch(request);
  const collected = await tavily.collect(plan);

  if (collected.sources.length === 0) {
    throw new Error("Tavily returned no research sources.");
  }

  return claude.synthesizeResearch(
    request,
    plan,
    collected.sources,
    collected.sourceBriefs
  );
}
