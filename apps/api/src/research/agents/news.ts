import type { NewsAgentOutput, ResearchEnv, TavilyBudget } from "../types.js";
import { tavilySearch } from "../providers/tavily.js";

export async function runNewsAgent(
  topic: string,
  env: ResearchEnv,
  budget: TavilyBudget
): Promise<NewsAgentOutput> {
  const results = await tavilySearch(`${topic} investment news this week`, env, budget);

  return {
    insights: results.slice(0, 3).map((result) => `${result.title}: ${result.content}`),
    sources: results.map((result) => ({
      title: result.title,
      url: result.url,
      provider: "tavily",
      publishedAt: result.published_date,
      excerpt: result.content
    }))
  };
}
