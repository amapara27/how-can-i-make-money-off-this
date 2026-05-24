import type { ResearchSource } from "@how-money/shared";
import { fetchJsonWithTimeout } from "./fetch.js";

type SecSearchResponse = {
  hits?: {
    hits?: Array<{
      _source?: {
        display_names?: string[];
        file_date?: string;
        form?: string;
        root_form?: string;
      };
      _id?: string;
    }>;
  };
};

export async function searchSecFilings(topic: string): Promise<{ insights: string[]; sources: ResearchSource[] }> {
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);

  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${topic}"`)}&dateRange=custom&startdt=${formatDate(ninetyDaysAgo)}&enddt=${formatDate(today)}&forms=10-K,8-K`;
  const data = await fetchJsonWithTimeout<SecSearchResponse>(url, {
    headers: {
      "User-Agent": "hcimot contact@hcimot.com"
    }
  });
  const hits = data.hits?.hits ?? [];

  if (hits.length === 0) {
    return { insights: [], sources: [] };
  }

  const topCompanies = hits
    .slice(0, 3)
    .map((hit) => hit._source?.display_names?.[0])
    .filter((name): name is string => Boolean(name));

  return {
    insights: [
      `SEC full-text search found ${hits.length} recent 10-K or 8-K filing mentions for "${topic}".`,
      topCompanies.length > 0 ? `Top filing matches include ${topCompanies.join(", ")}.` : ""
    ].filter(Boolean),
    sources: [{
      title: `SEC filing search for ${topic}`,
      url,
      provider: "sec",
      excerpt: `${hits.length} recent filing matches.`
    }]
  };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
