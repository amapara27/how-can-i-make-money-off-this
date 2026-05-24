import type { FilingsAgentOutput, ResearchEnv, TavilyBudget } from "../types.js";
import { searchSecFilings } from "../providers/sec.js";
import { tavilySearch } from "../providers/tavily.js";

export async function runFilingsAgent(
  topic: string,
  env: ResearchEnv,
  budget: TavilyBudget
): Promise<FilingsAgentOutput> {
  if (env.HCIMOT_ENABLE_SEC_SEARCH === "true") {
    try {
      const direct = await searchSecFilings(topic);

      if (direct.insights.length > 0) {
        return direct;
      }
    } catch (error) {
      console.warn("SEC filing search failed, falling back to Tavily", { topic, error });
    }
  }

  const results = await tavilySearch(`${topic} SEC filing 10-K`, env, budget, { searchDepth: "advanced" });

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
