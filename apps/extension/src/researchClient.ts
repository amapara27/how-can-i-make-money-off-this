import type { CreateResearchJobResponse, ResearchInput, ResearchJob } from "@how-money/shared";

const DEFAULT_API_BASE_URL = "http://localhost:8787";
const API_BASE_URL = (import.meta.env.VITE_RESEARCH_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export async function createResearchJob(input: ResearchInput, signal?: AbortSignal): Promise<CreateResearchJobResponse> {
  return fetchJson<CreateResearchJobResponse>("/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  });
}

export async function getResearchJob(jobId: string, signal?: AbortSignal): Promise<ResearchJob> {
  return fetchJson<ResearchJob>(`/research/${encodeURIComponent(jobId)}`, { signal });
}

export async function pollResearchJob(
  jobId: string,
  options: {
    signal?: AbortSignal;
    intervalMs?: number;
    onUpdate?: (job: ResearchJob) => void;
  } = {}
): Promise<ResearchJob> {
  const intervalMs = options.intervalMs ?? 1200;

  while (true) {
    const job = await getResearchJob(jobId, options.signal);
    options.onUpdate?.(job);

    if (job.status === "complete" || job.status === "failed") {
      return job;
    }

    await delay(intervalMs, options.signal);
  }
}

async function fetchJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) as T | { error?: string } : {};

  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data && data.error
      ? data.error
      : `Research API returned ${response.status}.`;
    throw new Error(message);
  }

  return data as T;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Polling was cancelled.", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Polling was cancelled.", "AbortError"));
    }, { once: true });
  });
}
