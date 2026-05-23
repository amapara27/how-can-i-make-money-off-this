import { config as loadEnv } from "dotenv";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

loadEnv({
  path: new URL("../.env", import.meta.url)
});

export type AppConfig = {
  port: number;
  anthropicApiKey?: string;
  anthropicModel: string;
  tavilyApiKey?: string;
  maxSearchResults: number;
  maxExtractUrls: number;
  allowMockResearch: boolean;
};

export function getConfig(): AppConfig {
  return {
    port: readIntegerEnv("PORT", 8787),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    tavilyApiKey: process.env.TAVILY_API_KEY,
    maxSearchResults: readIntegerEnv("RESEARCH_MAX_SEARCH_RESULTS", 6),
    maxExtractUrls: readIntegerEnv("RESEARCH_MAX_EXTRACT_URLS", 5),
    allowMockResearch: process.env.RESEARCH_ALLOW_MOCK === "true"
  };
}

function readIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) ? value : fallback;
}
