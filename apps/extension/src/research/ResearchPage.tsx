import { useEffect, useMemo, useState } from "react";
import type { ResearchResponse, SelectionContext } from "@how-money/shared";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; context: SelectionContext; research: ResearchResponse }
  | { status: "missing" }
  | { status: "error"; message: string };

export function ResearchPage() {
  const requestId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("requestId");
  }, []);

  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!requestId) {
      setState({ status: "missing" });
      return;
    }

    void loadSelectionContext(requestId)
      .then((context) => {
        if (!context) {
          setState({ status: "missing" });
          return;
        }

        setState({
          status: "ready",
          context,
          research: buildMockResearch(context)
        });
      })
      .catch((error: unknown) => {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load research context."
        });
      });
  }, [requestId]);

  if (state.status === "loading") {
    return <Shell title="Preparing research" subtitle="Loading selected text from the extension." />;
  }

  if (state.status === "missing") {
    return (
      <Shell
        title="No selection found"
        subtitle="Go back to a webpage, highlight text, and launch research from the extension button."
      />
    );
  }

  if (state.status === "error") {
    return <Shell title="Research unavailable" subtitle={state.message} />;
  }

  return (
    <main className="researchPage">
      <aside className="sourcePanel" aria-label="Selected source">
        <p className="eyebrow">Source</p>
        <h1>{state.context.page.title || "Untitled page"}</h1>
        <a href={state.context.page.url} target="_blank" rel="noreferrer">
          {state.context.page.url}
        </a>
        <blockquote>{state.context.selectedText}</blockquote>
      </aside>

      <section className="workspace" aria-label="Research workspace">
        <div className="workspaceHeader">
          <div>
            <p className="eyebrow">Mock research output</p>
            <h2>Money angles to investigate</h2>
          </div>
          <span>{new Date(state.research.generatedAt).toLocaleString()}</span>
        </div>

        <div className="sectionGrid">
          {state.research.sections.map((section) => (
            <article className="researchSection" key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.summary}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <footer className="caveats">
          {state.research.caveats.map((caveat) => (
            <span key={caveat}>{caveat}</span>
          ))}
        </footer>
      </section>
    </main>
  );
}

function Shell({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="emptyState">
      <p className="eyebrow">How Can I Make Money Off This</p>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </main>
  );
}

async function loadSelectionContext(requestId: string) {
  const key = `research:${requestId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] as SelectionContext | undefined;
}

function buildMockResearch(context: SelectionContext): ResearchResponse {
  const query = context.selectedText;

  return {
    query,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "Public market exposure",
        summary: "Companies and ETFs that may have economic exposure to this theme.",
        bullets: [
          `Search for public companies directly tied to "${query}".`,
          "Check supplier, distribution, and infrastructure layers around the category.",
          "Compare pure-play exposure against diversified incumbents."
        ],
        citations: []
      },
      {
        title: "Prediction and betting markets",
        summary: "Marketplaces where this idea may show up as a forecastable event.",
        bullets: [
          "Look for regulatory, launch, adoption, or revenue milestones.",
          "Translate vague trends into dates, thresholds, and measurable outcomes.",
          "Separate entertainment bets from markets with enough liquidity to matter."
        ],
        citations: []
      },
      {
        title: "Business opportunities",
        summary: "Ways to monetize attention, tooling gaps, or demand created by the topic.",
        bullets: [
          "Identify underserved buyer personas and painful manual workflows.",
          "Look for affiliate, lead generation, data product, and B2B service angles.",
          "Validate willingness to pay before building a full product."
        ],
        citations: []
      }
    ],
    mode: "mock",
    sources: [],
    caveats: [
      "Mocked output",
      "Not financial advice",
      "LLM and scraping orchestration will live behind the API app"
    ]
  };
}
