import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CryptoAsset, EquityAsset, MoneyAngle, ResearchInput, ResearchJob, ResearchResult, ResearchSource, SelectionContext } from "@how-money/shared";
import { createResearchJob, pollResearchJob } from "../researchClient";
import { loadResearchSession, saveResearchSession, updateResearchSession } from "../researchStorage";

type LoadState =
  | { status: "loading"; title: string; subtitle: string }
  | { status: "polling"; context: SelectionContext; job?: ResearchJob }
  | { status: "ready"; context: SelectionContext; result: ResearchResult }
  | { status: "missing" }
  | { status: "error"; context?: SelectionContext; message: string };

export function ResearchPage() {
  const requestId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("requestId");
  }, []);

  const [state, setState] = useState<LoadState>({
    status: "loading",
    title: "Preparing research",
    subtitle: "Loading selected text from the extension."
  });

  useEffect(() => {
    if (!requestId) {
      setState({ status: "missing" });
      return;
    }

    const controller = new AbortController();

    void loadAndPoll(requestId, controller.signal, setState).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to load research context."
      });
    });

    return () => controller.abort();
  }, [requestId]);

  if (state.status === "loading") {
    return <Shell title={state.title} subtitle={state.subtitle} />;
  }

  if (state.status === "missing") {
    return (
      <Shell
        title="No selection found"
        subtitle="Go back to a webpage, highlight text, and launch research from the extension button."
      />
    );
  }

  if (state.status === "error" && !state.context) {
    return <Shell title="Research unavailable" subtitle={state.message} />;
  }

  if (state.status === "polling") {
    return (
      <ResearchLayout context={state.context}>
        <section className="workspace" aria-label="Research workspace">
          <div className="workspaceHeader">
            <div>
              <p className="eyebrow">Agents Running</p>
              <h2>{state.job ? formatStage(state.job.stage) : "Starting research"}</h2>
            </div>
            <span>{state.job ? `Updated ${formatDate(state.job.updatedAt)}` : "Queued"}</span>
          </div>
          <LoadingGrid />
        </section>
      </ResearchLayout>
    );
  }

  if (state.status === "error") {
    const context = state.context;

    if (!context) {
      return <Shell title="Research unavailable" subtitle={state.message} />;
    }

    return (
      <ResearchLayout context={context}>
        <section className="workspace" aria-label="Research workspace">
          <div className="workspaceHeader">
            <div>
              <p className="eyebrow">Research Unavailable</p>
              <h2>Could not complete the brief</h2>
            </div>
          </div>
          <article className="researchSection isWide">
            <h3>What happened</h3>
            <p>{state.message}</p>
          </article>
        </section>
      </ResearchLayout>
    );
  }

  return (
    <ResearchLayout context={state.context}>
      <ResearchWorkspace result={state.result} />
    </ResearchLayout>
  );
}

async function loadAndPoll(
  requestId: string,
  signal: AbortSignal,
  setState: (state: LoadState) => void
) {
  const session = await loadResearchSession(requestId);

  if (!session) {
    setState({ status: "missing" });
    return;
  }

  const { context } = session;
  const existingJob = session.job;
  let jobId = session.jobId ?? existingJob?.jobId;

  if (existingJob?.status === "complete" && existingJob.result) {
    setState({ status: "ready", context, result: existingJob.result });
    return;
  }

  if (existingJob?.status === "failed") {
    setState({
      status: "error",
      context,
      message: existingJob.error ?? "Research failed."
    });
    return;
  }

  setState({ status: "polling", context, job: existingJob });

  if (!jobId) {
    const created = await createResearchJob(toResearchInput(context), signal);
    jobId = created.jobId;
    await saveResearchSession(requestId, {
      context,
      jobId
    });
  }

  const job = await pollResearchJob(jobId, {
    signal,
    onUpdate: (updatedJob) => {
      void updateResearchSession(requestId, { job: updatedJob });
      setState({ status: "polling", context, job: updatedJob });
    }
  });

  await updateResearchSession(requestId, { job });

  if (job.status === "failed") {
    setState({
      status: "error",
      context,
      message: job.error ?? "Research failed."
    });
    return;
  }

  if (!job.result) {
    setState({
      status: "error",
      context,
      message: "Research finished without a result."
    });
    return;
  }

  setState({ status: "ready", context, result: job.result });
}

function ResearchLayout({ context, children }: { context: SelectionContext; children: ReactNode }) {
  return (
    <main className="researchPage">
      <aside className="sourcePanel" aria-label="Selected source">
        <p className="eyebrow">Source</p>
        <h1>{context.page.title || "Untitled page"}</h1>
        <a href={context.page.url} target="_blank" rel="noreferrer">
          {context.page.url}
        </a>
        {context.image ? <img src={context.image.dataUrl} alt={context.image.altText ?? "Selected image"} /> : null}
        <blockquote>{context.selectedText}</blockquote>
      </aside>
      {children}
    </main>
  );
}

function ResearchWorkspace({ result }: { result: ResearchResult }) {
  return (
    <section className="workspace" aria-label="Research workspace">
      <div className="workspaceHeader">
        <div>
          <p className="eyebrow">{result.isActionable ? "Verified Research Output" : "No Verified Angle"}</p>
          <h2>{result.topic.name}</h2>
          <p>{result.topic.summary}</p>
        </div>
        <span>{formatDate(result.generatedAt)}</span>
      </div>

      <div className="metricGrid" aria-label="Research metrics">
        <Metric label="Investability" value={titleCase(result.topic.investability)} />
        <Metric label="Confidence" value={`${result.topic.confidence}/100`} />
        <Metric label="Trend" value={`${result.thesis.trendScore}/100`} />
        <Metric label="Risk" value={titleCase(result.thesis.riskLevel)} />
        <Metric label="Horizon" value={result.thesis.timeHorizon} />
        <Metric label="Sources" value={String(result.sources.length)} />
      </div>

      {!result.isActionable ? (
        <article className="researchSection isWide isNotice">
          <h3>No verified way in</h3>
          <p>{result.topic.investabilityReason}</p>
        </article>
      ) : null}

      <div className="sectionGrid">
        <article className="researchSection">
          <h3>Bull case</h3>
          <p>{result.thesis.bullCase}</p>
        </article>
        <article className="researchSection">
          <h3>Bear case</h3>
          <p>{result.thesis.bearCase}</p>
        </article>
        <article className="researchSection">
          <h3>Risk breakdown</h3>
          <ul>
            <li>Technology: {titleCase(result.thesis.riskBreakdown.technology)}</li>
            <li>Market timing: {titleCase(result.thesis.riskBreakdown.marketTiming)}</li>
            <li>Regulatory: {titleCase(result.thesis.riskBreakdown.regulatory)}</li>
          </ul>
        </article>
      </div>

      <AssetSection equities={result.assets.equities} crypto={result.assets.crypto} />
      <OpportunitySection opportunities={result.opportunities} />
      <ListSection title="How to get in" items={result.howToGetIn} empty="No action steps were generated." />
      <ListSection title="Agent insights" items={result.agentInsights} empty="No agent insights were available." />
      <ListSection title="Related themes" items={result.relatedThemes} empty="No related themes were identified." compact />
      <SourceSection sources={result.sources} />

      <footer className="caveats">
        {result.caveats.map((caveat) => (
          <span key={caveat}>{caveat}</span>
        ))}
      </footer>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AssetSection({ equities, crypto }: { equities: EquityAsset[]; crypto: CryptoAsset[] }) {
  const hasAssets = equities.length > 0 || crypto.length > 0;

  return (
    <section className="dataSection">
      <div className="sectionTitle">
        <p className="eyebrow">Verified Assets</p>
        <h3>Public market and crypto exposure</h3>
      </div>
      {hasAssets ? (
        <div className="assetGrid">
          {equities.map((asset) => <EquityCard asset={asset} key={`equity:${asset.ticker}`} />)}
          {crypto.map((asset) => <CryptoCard asset={asset} key={`crypto:${asset.coinGeckoId}`} />)}
        </div>
      ) : (
        <EmptyCard text="No verified public equity or crypto asset was found." />
      )}
    </section>
  );
}

function EquityCard({ asset }: { asset: EquityAsset }) {
  return (
    <article className="assetCard">
      <div>
        <span>{asset.exchange ?? "Equity"}</span>
        <strong>{asset.ticker}</strong>
      </div>
      <h4>{asset.name}</h4>
      <p>{asset.rationale}</p>
      <dl>
        <div><dt>Relevance</dt><dd>{titleCase(asset.relevance)}</dd></div>
        <div><dt>Score</dt><dd>{asset.relevanceScore}/100</dd></div>
        <div><dt>Price</dt><dd>{formatCurrency(asset.priceUsd) ?? "n/a"}</dd></div>
        <div><dt>Day</dt><dd>{formatPercent(asset.dayChangePercent) ?? "n/a"}</dd></div>
      </dl>
    </article>
  );
}

function CryptoCard({ asset }: { asset: CryptoAsset }) {
  return (
    <article className="assetCard">
      <div>
        <span>Crypto</span>
        <strong>{asset.symbol}</strong>
      </div>
      <h4>{asset.name}</h4>
      <p>{asset.rationale}</p>
      <dl>
        <div><dt>CoinGecko</dt><dd>{asset.coinGeckoId}</dd></div>
        <div><dt>Score</dt><dd>{asset.relevanceScore}/100</dd></div>
        <div><dt>Price</dt><dd>{formatCurrency(asset.priceUsd) ?? "n/a"}</dd></div>
        <div><dt>Market cap</dt><dd>{formatCompactCurrency(asset.marketCapUsd) ?? "n/a"}</dd></div>
      </dl>
    </article>
  );
}

function OpportunitySection({ opportunities }: { opportunities: MoneyAngle[] }) {
  return (
    <section className="dataSection">
      <div className="sectionTitle">
        <p className="eyebrow">Money Angles</p>
        <h3>Ways this could be accessed</h3>
      </div>
      {opportunities.length > 0 ? (
        <div className="opportunityList">
          {opportunities.map((opportunity) => (
            <article className="opportunity" key={`${opportunity.type}:${opportunity.title}`}>
              <div>
                <span>{titleCase(opportunity.type)}</span>
                <strong>{titleCase(opportunity.confidence)} confidence</strong>
              </div>
              <h4>{opportunity.title}</h4>
              <p>{opportunity.rationale}</p>
              <p>{opportunity.howToAccess}</p>
              {opportunity.sourceUrls.length > 0 ? (
                <div className="sourceLinks">
                  {opportunity.sourceUrls.map((url) => (
                    <a href={url} target="_blank" rel="noreferrer" key={url}>{hostname(url)}</a>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyCard text="No opportunity list was generated for this highlight." />
      )}
    </section>
  );
}

function ListSection({
  title,
  items,
  empty,
  compact = false
}: {
  title: string;
  items: string[];
  empty: string;
  compact?: boolean;
}) {
  return (
    <section className="dataSection">
      <div className="sectionTitle">
        <p className="eyebrow">Research</p>
        <h3>{title}</h3>
      </div>
      {items.length > 0 ? (
        <ul className={compact ? "tagList" : "detailList"}>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <EmptyCard text={empty} />
      )}
    </section>
  );
}

function SourceSection({ sources }: { sources: ResearchSource[] }) {
  return (
    <section className="dataSection">
      <div className="sectionTitle">
        <p className="eyebrow">Evidence</p>
        <h3>Sources</h3>
      </div>
      {sources.length > 0 ? (
        <div className="sourceList">
          {sources.map((source) => (
            <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
              <strong>{source.title}</strong>
              <span>{source.provider}{source.publishedAt ? ` / ${source.publishedAt}` : ""}</span>
              {source.excerpt ? <p>{source.excerpt}</p> : null}
            </a>
          ))}
        </div>
      ) : (
        <EmptyCard text="No external source links were available." />
      )}
    </section>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <article className="researchSection isWide">
      <p>{text}</p>
    </article>
  );
}

function LoadingGrid() {
  return (
    <div className="sectionGrid">
      {["Extracting topic", "Resolving assets", "Running agents"].map((title) => (
        <article className="researchSection isLoading" key={title}>
          <h3>{title}</h3>
          <span />
          <span />
          <span />
        </article>
      ))}
    </div>
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

function toResearchInput(context: SelectionContext): ResearchInput {
  return {
    selectedText: context.selectedText,
    image: context.image,
    page: context.page
  };
}

function formatStage(stage: ResearchJob["stage"]) {
  return titleCase(stage.replace(/-/g, " "));
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatCurrency(value: number | undefined) {
  if (typeof value !== "number") {
    return undefined;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

function formatCompactCurrency(value: number | undefined) {
  if (typeof value !== "number") {
    return undefined;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatPercent(value: number | undefined) {
  if (typeof value !== "number") {
    return undefined;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
