import { useEffect, useMemo, useState } from "react";
import type { CryptoAsset, EquityAsset, MoneyAngle, ResearchJob, ResearchResult } from "@how-money/shared";
import { OPEN_RESEARCH_REPORT } from "../messages";
import type { ExtensionResponseMessage } from "../messages";
import type { ResearchSession } from "../researchStorage";

const RESEARCH_PREFIX = "research:";

type PopupState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; requestId: string; session: ResearchSession }
  | { status: "error"; message: string };

type RouteBrief = {
  label: string;
  title: string;
  value: string;
  rationale: string;
  action: string;
};

export function Popup() {
  const [state, setState] = useState<PopupState>({ status: "loading" });
  const [openError, setOpenError] = useState<string>();

  useEffect(() => {
    let isMounted = true;

    void listRecentResearchSessions()
      .then((sessions) => {
        if (!isMounted) {
          return;
        }

        const latest = sessions[0];
        setState(latest ? { status: "ready", ...latest } : { status: "empty" });
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load recent research."
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const content = useMemo(() => {
    if (state.status === "ready") {
      return <ResearchBrief requestId={state.requestId} session={state.session} onOpenError={setOpenError} />;
    }

    if (state.status === "loading") {
      return <LoadingBrief />;
    }

    if (state.status === "error") {
      return <MessageBrief tone="error" title="Research unavailable" message={state.message} />;
    }

    return (
      <MessageBrief
        tone="empty"
        title="Ready to find the money angle"
        message="Highlight text or an image, then use the inline research button."
      />
    );
  }, [state]);

  return (
    <main className="grid w-96 gap-3 bg-[#080909] p-3 text-[#f4f7f1]">
      {content}
      {openError ? (
        <p className="rounded-lg border border-red-400/25 bg-red-950/40 px-3 py-2 text-xs leading-5 text-red-100">
          {openError}
        </p>
      ) : null}
    </main>
  );
}

function ResearchBrief({
  requestId,
  session,
  onOpenError
}: {
  requestId: string;
  session: ResearchSession;
  onOpenError: (message: string | undefined) => void;
}) {
  const job = session.job;
  const result = job?.result;

  if (job?.status === "failed") {
    return (
      <MessageBrief
        tone="error"
        title="Could not complete the brief"
        message={job.error ?? "Research failed before a report could be generated."}
        requestId={requestId}
        onOpenError={onOpenError}
      />
    );
  }

  if (!result) {
    return (
      <PendingBrief
        requestId={requestId}
        title={session.context.page.title || "Selected page"}
        stage={job?.stage ?? "queued"}
        onOpenError={onOpenError}
      />
    );
  }

  const route = getPrimaryRoute(result);
  const score = clampScore(result.topic.confidence);
  const scoreStyle = { "--score-angle": `${score * 3.6}deg` } as React.CSSProperties;

  return (
    <section className="grid gap-3 rounded-lg border border-[#24262a] bg-[#101112] p-4 shadow-2xl shadow-black/50">
      <header className="grid gap-3 rounded-lg border border-[#252a21] bg-[#171a15] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-mono text-[11px] font-semibold uppercase leading-none text-[#cdd6bd]">
              Latest Research
            </p>
            <h1 className="line-clamp-2 text-[25px] font-bold leading-[1.05] text-[#f2f4ee]">
              {result.topic.name}
            </h1>
          </div>
          <span className="shrink-0 rounded-md border border-[#c8ff00]/35 bg-[#c8ff00]/10 px-2 py-1 font-mono text-[11px] font-semibold uppercase text-[#c8ff00]">
            {route.label}
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-[#cdd6bd]">{result.topic.summary}</p>
      </header>

      <section className="grid grid-cols-[1fr_112px] gap-3 rounded-lg border border-[#27292c] bg-[#141518] p-4">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[12px] font-semibold uppercase text-[#cdd6bd]">Opportunity Route</p>
          <h2 className="line-clamp-2 text-xl font-bold leading-tight text-[#c8ff00]">{route.title}</h2>
          <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[#d6dbc9]">{route.rationale}</p>
        </div>
        <div className="grid place-items-center gap-2">
          <div
            className="score-ring grid size-24 place-items-center rounded-full shadow-[0_0_28px_rgba(200,255,0,0.18)]"
            style={scoreStyle}
            aria-label={`Opportunity score ${score} out of 100`}
          >
            <strong className="font-mono text-3xl font-semibold text-[#c8ff00]">{score}</strong>
          </div>
          <span className="font-mono text-[10px] font-semibold uppercase text-[#cdd6bd]">Opp Score</span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Trend" value={`${result.thesis.trendScore}/100`} accent />
        <Metric label="Investability" value={titleCase(result.topic.investability)} />
        <Metric label="Horizon" value={result.thesis.timeHorizon} />
        <Metric label="Sources" value={String(result.sources.length)} />
      </div>

      <section className="grid gap-2 rounded-lg border border-[#24262a] bg-[#151619] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[12px] font-semibold uppercase text-[#cdd6bd]">Next Move</p>
          <span className="font-mono text-[12px] font-semibold text-[#69eaff]">{route.value}</span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-5 text-[#eef2e6]">{route.action}</p>
      </section>

      <button
        className="min-h-12 rounded-lg border border-[#c8ff00] bg-[#c8ff00] px-4 text-base font-semibold text-[#10140d] shadow-[0_0_24px_rgba(200,255,0,0.24)] transition hover:bg-[#d8ff32] focus:outline-none focus:ring-2 focus:ring-[#69eaff]"
        type="button"
        onClick={() => openReport(requestId, onOpenError)}
      >
        Open Full Report
      </button>

      <footer className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase text-[#73796e]">
        <span>{formatDate(result.generatedAt)}</span>
        <span>Research, not advice</span>
      </footer>
    </section>
  );
}

function PendingBrief({
  requestId,
  title,
  stage,
  onOpenError
}: {
  requestId: string;
  title: string;
  stage: ResearchJob["stage"];
  onOpenError: (message: string | undefined) => void;
}) {
  return (
    <section className="grid gap-3 rounded-lg border border-[#24262a] bg-[#101112] p-4 shadow-2xl shadow-black/50">
      <header className="rounded-lg border border-[#252a21] bg-[#171a15] p-4">
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase text-[#cdd6bd]">Agents Running</p>
        <h1 className="line-clamp-2 text-2xl font-bold leading-tight text-[#f2f4ee]">{title}</h1>
        <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#c8ff00]/25 bg-[#c8ff00]/10 px-2 py-1 text-xs font-semibold text-[#c8ff00]">
          <span className="size-2 rounded-full bg-[#c8ff00]" />
          {formatStage(stage)}
        </div>
      </header>
      <div className="grid gap-2">
        {["Resolving exposure", "Checking market data", "Synthesizing route"].map((label) => (
          <div className="rounded-lg border border-[#24262a] bg-[#151619] p-3" key={label}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[12px] font-semibold uppercase text-[#cdd6bd]">{label}</span>
              <span className="h-2 w-2 rounded-full bg-[#69eaff]" />
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-[#292d2d] before:block before:h-full before:w-1/2 before:animate-pulse before:rounded-full before:bg-[#c8ff00]/40" />
          </div>
        ))}
      </div>
      <button
        className="min-h-11 rounded-lg border border-[#c8ff00]/70 bg-[#c8ff00] px-4 text-sm font-semibold text-[#10140d] transition hover:bg-[#d8ff32] focus:outline-none focus:ring-2 focus:ring-[#69eaff]"
        type="button"
        onClick={() => openReport(requestId, onOpenError)}
      >
        Open Full Report
      </button>
    </section>
  );
}

function LoadingBrief() {
  return (
    <section className="grid gap-3 rounded-lg border border-[#24262a] bg-[#101112] p-4">
      <div className="h-24 animate-pulse rounded-lg bg-[#171a15]" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-16 animate-pulse rounded-lg bg-[#151619]" />
        <div className="h-16 animate-pulse rounded-lg bg-[#151619]" />
      </div>
    </section>
  );
}

function MessageBrief({
  tone,
  title,
  message,
  requestId,
  onOpenError
}: {
  tone: "empty" | "error";
  title: string;
  message: string;
  requestId?: string;
  onOpenError?: (message: string | undefined) => void;
}) {
  const isError = tone === "error";

  return (
    <section className="grid gap-3 rounded-lg border border-[#24262a] bg-[#101112] p-4 shadow-2xl shadow-black/50">
      <header className="rounded-lg border border-[#252a21] bg-[#171a15] p-4">
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase text-[#cdd6bd]">
          How Can I Make Money Off This
        </p>
        <h1 className="text-2xl font-bold leading-tight text-[#f2f4ee]">{title}</h1>
      </header>
      <section className={`rounded-lg border p-4 ${isError ? "border-red-400/25 bg-red-950/25" : "border-[#24262a] bg-[#151619]"}`}>
        <p className="text-sm leading-5 text-[#d6dbc9]">{message}</p>
      </section>
      {requestId && onOpenError ? (
        <button
          className="min-h-11 rounded-lg border border-[#c8ff00]/70 bg-[#c8ff00] px-4 text-sm font-semibold text-[#10140d] transition hover:bg-[#d8ff32] focus:outline-none focus:ring-2 focus:ring-[#69eaff]"
          type="button"
          onClick={() => openReport(requestId, onOpenError)}
        >
          Open Full Report
        </button>
      ) : null}
    </section>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#24262a] bg-[#151619] p-3">
      <span className="mb-2 block truncate font-mono text-[11px] font-semibold uppercase text-[#cdd6bd]">{label}</span>
      <strong className={`block truncate text-xl font-bold leading-none ${accent ? "text-[#c8ff00]" : "text-[#f4f7f1]"}`}>
        {value}
      </strong>
    </div>
  );
}

async function listRecentResearchSessions() {
  if (typeof chrome === "undefined" || !chrome.storage?.session) {
    return [];
  }

  const values = await chrome.storage.session.get(null);

  return Object.entries(values)
    .flatMap(([key, value]) => {
      if (!key.startsWith(RESEARCH_PREFIX) || !isResearchSession(value)) {
        return [];
      }

      return [{
        requestId: key.slice(RESEARCH_PREFIX.length),
        session: value
      }];
    })
    .sort((a, b) => Date.parse(b.session.context.capturedAt) - Date.parse(a.session.context.capturedAt));
}

function isResearchSession(value: unknown): value is ResearchSession {
  return Boolean(
    value &&
      typeof value === "object" &&
      "context" in value &&
      value.context &&
      typeof value.context === "object" &&
      "capturedAt" in value.context
  );
}

function getPrimaryRoute(result: ResearchResult): RouteBrief {
  const opportunity = result.opportunities[0];

  if (opportunity) {
    return fromOpportunity(opportunity);
  }

  const equity = bestByScore(result.assets.equities);

  if (equity) {
    return {
      label: "Equity",
      title: `${equity.ticker} ${equity.name}`,
      value: `${equity.relevanceScore}/100 relevance`,
      rationale: equity.rationale,
      action: `Research ${equity.ticker} as ${titleCase(equity.relevance)} exposure before sizing a position.`
    };
  }

  const crypto = bestByScore(result.assets.crypto);

  if (crypto) {
    return {
      label: "Crypto",
      title: `${crypto.symbol} ${crypto.name}`,
      value: `${crypto.relevanceScore}/100 relevance`,
      rationale: crypto.rationale,
      action: `Verify liquidity, token mechanics, and custody before using ${crypto.symbol} as the route.`
    };
  }

  const step = result.howToGetIn[0];

  if (step) {
    return {
      label: "Route",
      title: "Research-first entry",
      value: titleCase(result.topic.investability),
      rationale: result.topic.investabilityReason || result.thesis.bullCase,
      action: step
    };
  }

  return {
    label: result.isActionable ? "Watchlist" : "No Angle",
    title: result.isActionable ? "Keep on watchlist" : "No verified route",
    value: titleCase(result.topic.investability),
    rationale: result.topic.investabilityReason || result.thesis.bearCase,
    action: result.isActionable
      ? "Use the full report to compare sources and risks before acting."
      : "No clean investing route was verified from the available research."
  };
}

function fromOpportunity(opportunity: MoneyAngle): RouteBrief {
  return {
    label: titleCase(opportunity.type),
    title: opportunity.title,
    value: `${titleCase(opportunity.confidence)} confidence`,
    rationale: opportunity.rationale,
    action: opportunity.howToAccess
  };
}

function bestByScore<T extends EquityAsset | CryptoAsset>(assets: T[]) {
  return [...assets].sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
}

function openReport(requestId: string, onOpenError: (message: string | undefined) => void) {
  onOpenError(undefined);

  void chrome.runtime.sendMessage(
    { type: OPEN_RESEARCH_REPORT, requestId },
    (response?: ExtensionResponseMessage) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        onOpenError(runtimeError.message);
        return;
      }

      if (response && "ok" in response && !response.ok) {
        onOpenError(response.error);
      }
    }
  );
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStage(stage: ResearchJob["stage"]) {
  return titleCase(stage.replace(/-/g, " "));
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
