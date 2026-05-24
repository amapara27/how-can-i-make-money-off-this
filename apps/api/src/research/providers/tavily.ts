import type { ResearchEnv, TavilyBudget, TavilyResult } from "../types.js";
import { fetchJsonWithTimeout } from "./fetch.js";
import { mockProvidersEnabled, mockTavilyResults } from "./mock.js";

const tavilyCache = new Map<string, { expiresAt: number; results: TavilyResult[] }>();

type TavilyResponse = {
  results?: TavilyResult[];
};

export function consumeTavilyBudget(budget: TavilyBudget) {
  if (budget.remaining <= 0) {
    return false;
  }

  budget.remaining -= 1;
  return true;
}

export async function tavilySearch(
  query: string,
  env: ResearchEnv,
  budget: TavilyBudget,
  options: { searchDepth?: "basic" | "advanced"; widenIfEmpty?: boolean } = {}
): Promise<TavilyResult[]> {
  const searchDepth = options.searchDepth ?? "basic";

  if (!consumeTavilyBudget(budget)) {
    return [];
  }

  const cached = tavilyCache.get(cacheKey(query, searchDepth));
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  if (!env.TAVILY_API_KEY) {
    return cacheResults(query, searchDepth, mockProvidersEnabled(env) ? mockTavilyResults(query) : []);
  }

  const results = await rawTavilySearch(query, env.TAVILY_API_KEY, searchDepth);

  if (results.length === 0 && options.widenIfEmpty && consumeTavilyBudget(budget)) {
    const widened = await rawTavilySearch(widenQuery(query), env.TAVILY_API_KEY, searchDepth);
    return cacheResults(query, searchDepth, widened);
  }

  return cacheResults(query, searchDepth, results);
}

async function rawTavilySearch(query: string, apiKey: string, searchDepth: "basic" | "advanced") {
  const response = await fetchJsonWithTimeout<TavilyResponse>("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      include_answer: false,
      max_results: 5
    })
  });

  return (response.results ?? []).filter((result) => result.score >= 0.5);
}

function widenQuery(query: string) {
  return `${query} public companies ETFs cryptocurrency investment`;
}

function cacheResults(query: string, searchDepth: "basic" | "advanced", results: TavilyResult[]) {
  tavilyCache.set(cacheKey(query, searchDepth), {
    expiresAt: Date.now() + 60 * 60 * 1000,
    results
  });
  return results;
}

function cacheKey(query: string, searchDepth: string) {
  return `${searchDepth}:${query.toLowerCase().replace(/\s+/g, "-")}`;
}
