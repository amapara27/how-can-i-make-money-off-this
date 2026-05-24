import assert from "node:assert/strict";
import { test } from "node:test";
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
