import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { ResearchJob } from "@how-money/shared";
import { createJobStore } from "./jobs.js";
import { runResearchJob, validateResolvedAssets } from "./orchestrator.js";
import { withTimeout } from "./providers/fetch.js";
import { consumeTavilyBudget } from "./providers/tavily.js";
import type { ResolvedEntities } from "./schemas.js";
import { validateResearchInput } from "./validation.js";

test("validates text research requests", () => {
  const result = validateResearchInput({
    selectedText: "Bitcoin ETF inflows hit a record",
    page: {
      url: "https://example.com/story",
      title: "Example Story"
    }
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.selectedText, "Bitcoin ETF inflows hit a record");
  }
});

test("rejects requests without text or image", () => {
  const result = validateResearchInput({
    selectedText: " ",
    page: {
      url: "https://example.com/story",
      title: "Example Story"
    }
  });

  assert.equal(result.ok, false);
});

test("runs a mock local research job to completion", async () => {
  const jobs = createJobStore();
  const job = jobs.create({
    selectedText: "Bitcoin ETF inflows hit a record",
    page: {
      url: "https://example.com/bitcoin",
      title: "Bitcoin ETF news"
    }
  });

  await runResearchJob(job.jobId, {
    selectedText: "Bitcoin ETF inflows hit a record",
    page: {
      url: "https://example.com/bitcoin",
      title: "Bitcoin ETF news"
    }
  }, jobs, { HCIMOT_MOCK_PROVIDERS: "true" });

  const completed = jobs.get(job.jobId);
  assert.equal(completed?.status, "complete");
  assert.equal(completed?.result?.assets.crypto[0]?.coinGeckoId, "bitcoin");
  assert.equal(completed?.result?.isActionable, true);
});

test("returns a safe low-investability result when no angle is verified", async () => {
  const jobs = createJobStore();
  const job = jobs.create({
    selectedText: "a funny private group chat screenshot",
    page: {
      url: "https://example.com/meme",
      title: "Meme"
    }
  });

  await runResearchJob(job.jobId, {
    selectedText: "a funny private group chat screenshot",
    page: {
      url: "https://example.com/meme",
      title: "Meme"
    }
  }, jobs, { HCIMOT_MOCK_PROVIDERS: "true" });

  const completed = jobs.get(job.jobId);
  assert.equal(completed?.status, "complete");
  assert.equal(completed?.result?.isActionable, false);
  assert.equal(completed?.result?.assets.equities.length, 0);
  assert.equal(completed?.result?.assets.crypto.length, 0);
  assert.match(completed?.result?.topic.investabilityReason ?? "", /No verified/);
});

test("enforces Tavily query budget", () => {
  const budget = { remaining: 1 };

  assert.equal(consumeTavilyBudget(budget), true);
  assert.equal(budget.remaining, 0);
  assert.equal(consumeTavilyBudget(budget), false);
});

test("omits unverified tickers and tokens", async () => {
  const resolved: ResolvedEntities = {
    topic: "AI chips",
    topicSummary: "AI chips are semiconductors used for model workloads.",
    equityTickers: [
      {
        ticker: "NVDA",
        exchange: "NASDAQ",
        name: "NVIDIA Corporation",
        relevance: "direct",
        relevanceScore: 90,
        rationale: "Direct AI accelerator exposure."
      },
      {
        ticker: "NOPE",
        exchange: "NASDAQ",
        name: "Not Real Corp",
        relevance: "direct",
        relevanceScore: 90,
        rationale: "Should be dropped."
      }
    ],
    cryptoTokens: [
      {
        symbol: "BTC",
        coinGeckoId: "bitcoin",
        name: "Bitcoin",
        relevanceScore: 90,
        rationale: "Should remain."
      },
      {
        symbol: "FAKE",
        coinGeckoId: "not-a-real-token",
        name: "Fake Token",
        relevanceScore: 90,
        rationale: "Should be dropped."
      }
    ],
    categories: ["semiconductors"],
    investability: "high",
    investabilityReason: "Contains direct assets."
  };

  const verified = await validateResolvedAssets(resolved, { HCIMOT_MOCK_PROVIDERS: "true" });
  assert.deepEqual(verified.equityTickers.map((asset) => asset.ticker), ["NVDA"]);
  assert.deepEqual(verified.cryptoTokens.map((asset) => asset.coinGeckoId), ["bitcoin"]);
});

test("times out slow provider calls", async () => {
  await assert.rejects(
    withTimeout(new Promise((resolve) => setTimeout(resolve, 25)), 1),
    /Timed out/
  );
});

test("research API creates and polls a job", async () => {
  configureMockApiEnv();
  const { server } = await import("../index.js");
  const baseUrl = await listen(server);

  try {
    const created = await fetch(`${baseUrl}/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        selectedText: "Bitcoin ETF inflows hit a record",
        page: {
          url: "https://example.com/bitcoin",
          title: "Bitcoin ETF news"
        }
      })
    });

    assert.equal(created.status, 202);
    const payload = await created.json() as { jobId: string; status: string };
    assert.equal(payload.status, "queued");
    assert.ok(payload.jobId);

    const completed = await pollJob(baseUrl, payload.jobId);
    assert.equal(completed.status, "complete");
    assert.equal(completed.result?.assets.crypto[0]?.coinGeckoId, "bitcoin");
  } finally {
    await close(server);
  }
});

test("research API returns a 400 for malformed JSON", async () => {
  configureMockApiEnv();
  const { server } = await import("../index.js");
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{not json"
    });
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Request body must be valid JSON.");
  } finally {
    await close(server);
  }
});

async function pollJob(baseUrl: string, jobId: string): Promise<ResearchJob> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/research/${encodeURIComponent(jobId)}`);
    const job = await response.json() as ResearchJob;

    if (job.status === "complete" || job.status === "failed") {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for research job.");
}

function configureMockApiEnv() {
  process.env.NODE_ENV = "test";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.TAVILY_API_KEY = "";
  process.env.POLYGON_API_KEY = "";
  process.env.COINGECKO_API_KEY = "";
  process.env.ETHERSCAN_API_KEY = "";
  process.env.HCIMOT_MOCK_PROVIDERS = "true";
  process.env.HCIMOT_ENABLE_SEC_SEARCH = "false";
}

function listen(server: Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
