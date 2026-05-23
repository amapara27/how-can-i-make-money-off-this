import type { ResearchRequest, ResearchResponse } from "@how-money/shared";

export function buildMockResearch(request: ResearchRequest): ResearchResponse {
  const query = request.selectedText.trim();

  return {
    query,
    generatedAt: new Date().toISOString(),
    mode: "mock",
    sections: [
      {
        title: "Public market exposure",
        summary: "Potential public equities, funds, and suppliers connected to the selected topic.",
        bullets: [
          `Find listed companies with revenue exposure to "${query}".`,
          "Check adjacent suppliers, infrastructure providers, and distribution channels.",
          "Compare direct exposure against broader thematic ETFs."
        ],
        citations: []
      },
      {
        title: "Prediction market framing",
        summary: "Ways to translate the idea into measurable events or adoption milestones.",
        bullets: [
          "Define a dated outcome with a source of truth.",
          "Look for launch, regulation, revenue, partnership, or market-share catalysts.",
          "Check liquidity and market rules before treating prices as useful signals."
        ],
        citations: []
      },
      {
        title: "Operator opportunities",
        summary: "Business models that could monetize demand, attention, data, or workflow gaps.",
        bullets: [
          "Map the buyer, budget owner, and repeated pain around the topic.",
          "Consider affiliate, data, workflow automation, and expert-service offers.",
          "Validate demand with customer conversations before building."
        ],
        citations: []
      }
    ],
    sources: [],
    caveats: [
      "Mocked output",
      "Not financial advice",
      `Source: ${request.page.title || request.page.url}`
    ]
  };
}
