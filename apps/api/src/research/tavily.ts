import { tavily, type TavilyClient } from "@tavily/core";
import type { ResearchSource } from "@how-money/shared";
import type { ResearchPlan } from "./anthropic.js";

type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
  score: number;
  publishedDate?: string;
};

export type CollectedResearch = {
  sources: ResearchSource[];
  sourceBriefs: string[];
};

type TavilyResearchCollectorOptions = {
  apiKey: string;
  maxSearchResults: number;
  maxExtractUrls: number;
};

export class TavilyResearchCollector {
  private readonly client: TavilyClient;
  private readonly maxSearchResults: number;
  private readonly maxExtractUrls: number;

  constructor({ apiKey, maxSearchResults, maxExtractUrls }: TavilyResearchCollectorOptions) {
    this.client = tavily({ apiKey });
    this.maxSearchResults = maxSearchResults;
    this.maxExtractUrls = maxExtractUrls;
  }

  async collect(plan: ResearchPlan): Promise<CollectedResearch> {
    const searchResults = await this.search(plan.queries);
    const topResults = dedupeByUrl(searchResults)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxSearchResults);

    const urlsToExtract = topResults.slice(0, this.maxExtractUrls).map((result) => result.url);
    const extractedByUrl = await this.extract(urlsToExtract);

    const sources = topResults.map<ResearchSource>((result, index) => ({
      id: index + 1,
      title: result.title || result.url,
      url: result.url,
      snippet: truncate(result.content || result.rawContent || "", 600),
      publishedDate: result.publishedDate
    }));

    const sourceBriefs = sources.map((source) => {
      const result = topResults.find((item) => item.url === source.url);
      const extracted = extractedByUrl.get(source.url);
      const content = extracted || result?.rawContent || result?.content || source.snippet || "";

      return [
        `[${source.id}] ${source.title}`,
        `URL: ${source.url}`,
        source.publishedDate ? `Published: ${source.publishedDate}` : null,
        `Content: ${truncate(content, 3200)}`
      ].filter(Boolean).join("\n");
    });

    return { sources, sourceBriefs };
  }

  private async search(queries: string[]) {
    const responses = await Promise.all(
      queries.map((query) =>
        this.client.search(query, {
          searchDepth: "advanced",
          maxResults: Math.max(2, Math.ceil(this.maxSearchResults / 2)),
          includeAnswer: "basic",
          includeRawContent: "markdown",
          topic: "general"
        })
      )
    );

    return responses.flatMap((response) => response.results);
  }

  private async extract(urls: string[]) {
    if (urls.length === 0) {
      return new Map<string, string>();
    }

    const response = await this.client.extract(urls, {
      extractDepth: "advanced",
      format: "markdown"
    });

    return new Map(
      response.results.map((result) => [
        result.url,
        result.rawContent
      ])
    );
  }
}

function dedupeByUrl(results: TavilySearchResult[]) {
  const seen = new Set<string>();
  const unique: TavilySearchResult[] = [];

  for (const result of results) {
    const normalizedUrl = normalizeUrl(result.url);

    if (seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    unique.push(result);
  }

  return unique;
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function truncate(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
}
