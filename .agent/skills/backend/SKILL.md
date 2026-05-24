---
name: backend-skill
description: Use this skill for ALL backend work on "How Can I Make Money Off This"
  — the LLM agent research pipeline, orchestrator, entity resolution, Claude API
  prompts, Tavily web search integration, Cloudflare Workers API, job queue, Redis
  caching, credit system, or any agent that produces ResearchResult output. Triggers
  on any mention of agents, orchestrator, entity resolution, research pipeline,
  Hono, Cloudflare Workers, API endpoints, job polling, cache strategy, prompt
  engineering for research, Tavily search, Polygon.io, CoinGecko, Etherscan, or
  synthesizer. Use even for small tasks like "tweak the entity resolution prompt"
  or "add a new field to the API response."
---

# hcimot backend skill

Two concerns live here. Read both before starting any task.

- **LLM / agentic research pipeline** — orchestrator, entity resolution, parallel
  agents, Tavily search, data providers, synthesizer
- **API layer** — Hono on Cloudflare Workers, job queue, Redis cache, credit
  enforcement, polling endpoints

For types and contracts shared with the extension, see:
→ `packages/shared/types.ts` (source of truth, read-only in this worktree)

For detailed prompt templates:
→ `references/prompts.md`

For data provider integration details:
→ `references/providers.md`

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (edge, no Node.js APIs) |
| API framework | Hono |
| Queue | Cloudflare Queues |
| Cache | Upstash Redis |
| Database | Neon Postgres (via `@neondatabase/serverless`) |
| LLM | Claude claude-sonnet-4-6 via Anthropic API |
| Web search | Tavily MCP / Tavily API |
| Auth | Clerk JWT verification |
| Equities | Polygon.io REST API |
| Crypto | CoinGecko API v3 |
| On-chain | Etherscan API |
| Billing | Stripe (webhooks only in Workers) |

Cloudflare Workers has no filesystem and no long-running processes.
Everything is request-scoped or queue-scoped. Use `waitUntil` for
fire-and-forget work that must outlive the response.

---

## Repository layout (backend scope)

```
packages/
├── shared/                  ← READ ONLY. Types live here.
│   └── types.ts
├── api/                     ← Hono Workers app
│   ├── src/
│   │   ├── index.ts         ← route definitions
│   │   ├── middleware/
│   │   │   ├── auth.ts      ← Clerk JWT verification
│   │   │   └── credits.ts   ← credit check + deduction
│   │   ├── routes/
│   │   │   ├── research.ts  ← POST /research, GET /research/:jobId
│   │   │   └── credits.ts   ← GET /credits
│   │   ├── queue/
│   │   │   └── consumer.ts  ← Cloudflare Queue consumer
│   │   └── cache.ts         ← Redis helpers
│   └── wrangler.toml
└── agents/                  ← Research pipeline
    ├── src/
    │   ├── orchestrator.ts  ← entry point for a job
    │   ├── resolve.ts       ← entity resolution (Claude + Tavily)
    │   ├── synthesize.ts    ← final ResearchResult builder
    │   └── agents/
    │       ├── equities.ts
    │       ├── crypto.ts
    │       ├── news.ts
    │       ├── filings.ts
    │       └── onchain.ts
    └── prompts/             ← prompt strings (import, don't inline)
        ├── resolve.ts
        ├── synthesize.ts
        └── insights.ts
```

---

## API layer

### Routes

#### POST /research
Starts a research job. This is the only write endpoint the extension calls.


Error responses:
- `402` + `{ error: 'credits_exhausted', resetsAt }` — out of credits
- `401` — invalid or missing JWT
- `429` — rate limited (max 10 req/min per user)
- `500` — queue failure (never lose the job silently — log and alert)

#### GET /research/:jobId
Polled by the dashboard every 1.5s until status is `complete` or `failed`.

#### GET /credits
Returns `CreditBalance` for the authenticated user. Called by popup on open.

### Auth middleware

### Credits middleware


### Cache strategy

Cache key is derived from the **resolved topic**, not the raw URL. This means
100 users hitting the same viral post = 1 agent run.


TTL rules:
- Market data (prices, on-chain): 4 hours
- Structural research (bull/bear, entity resolution): 24 hours
- Use the shorter TTL when both are present in a result

Cache hits skip credit deduction. Check cache before the credits middleware
deducts — a cache hit should never cost the user a credit.

**Correct order:** auth → cache check → credits → enqueue

---

## LLM / agentic pipeline

### Job lifecycle

```
Queue message received
       ↓
  orchestrator.ts
  1. extractTopicName()    ← fast, cheap, ~100 tokens
  2. resolveEntities()     ← entity resolution (Claude + Tavily)
  3. runAgents()           ← parallel, fan-out
  4. synthesize()          ← build ResearchResult
  5. cacheResult()
  6. updateJobRecord(status: 'complete', result)
```

Each step updates the job record so the dashboard can show partial progress.
Never let a single agent failure kill the whole job — catch per-agent errors
and continue with partial data.

### Entity resolution

This is the most important prompt in the product. It must:
- Extract the core investable topic from noisy page content
- Map it to real tickers, token addresses, and categories
- Handle ambiguous cases (both equity AND crypto angles)
- Return nothing rather than hallucinate

See `references/prompts.md` → Entity Resolution for the full system prompt.

### Tavily usage rules

When to use Tavily vs direct APIs:

| Data needed | Use |
|---|---|
| Recent news, sentiment | Tavily |
| Investment thesis context | Tavily |
| SEC filings (when EDGAR API is slow) | Tavily |
| Stock prices | Polygon.io direct |
| ETF holdings | Polygon.io direct |
| Crypto prices, market cap | CoinGecko direct |
| On-chain wallet/token data | Etherscan direct |
| DEX volume | Dune Analytics direct |

Never use Tavily for price data. Results are not structured enough to be reliable.

Tavily query budget per job: max 6 queries across all agents combined.
Cache Tavily results in Redis for 1 hour to avoid duplicate searches on the
same topic within the same cache window.

### Agent structure — implement all five the same way

Each agent:
- Takes its slice of `ResolvedEntities`
- Hits its data provider(s) directly
- Returns typed output or throws (caught by `allSettled`)
- Has a 10s timeout — wrap provider calls in `Promise.race` with a timeout

### Synthesizer

The synthesizer takes all agent outputs and builds the final `ResearchResult`.
This is a Claude call — it writes the bull/bear case, agent insights, and
how-to-get-in steps.

The synthesizer prompt instructs Claude to return JSON matching `ResearchResult`
exactly. Always validate with Zod before storing — never trust raw LLM output.

See `references/prompts.md` → Synthesizer for the full prompt.

### Prompt discipline

- All prompts live in `packages/agents/prompts/` as exported strings
- Never inline prompts in logic files
- Every prompt that returns structured data must say "return JSON only,
  no preamble, no markdown fences"
- Every JSON-returning prompt has a Zod schema that validates the output
- If validation fails: log the raw output, return a safe fallback, never crash

---

## Error handling rules

These are non-negotiable across all backend code:

1. **Agent failure = partial result, not job failure.** The job reaches
   `complete` even if two agents returned null. Missing fields show as
   empty arrays, not error states.

2. **LLM hallucinated ticker = omit it.** After entity resolution, validate
   every ticker against Polygon.io before including it in the result.
   Invalid ticker → log it, drop it, continue.

3. **Tavily returned nothing = widen the query once, then proceed without.**
   Don't retry indefinitely. One retry with a broader query, then continue
   with whatever context you have.

4. **Queue consumer crash = job stays in queue for retry.** Cloudflare Queues
   retries automatically. Make agent runs idempotent — re-running the same
   jobId should be safe.

5. **Never return a 500 to the extension without logging.** Every unhandled
   error gets logged with jobId, userId, and the raw error before responding.

---

## Environment variables

```toml
# wrangler.toml
[vars]
ANTHROPIC_API_KEY = ""      # set in Workers secrets
TAVILY_API_KEY    = ""
POLYGON_API_KEY   = ""
COINGECKO_API_KEY = ""
ETHERSCAN_API_KEY = ""
CLERK_SECRET_KEY  = ""
UPSTASH_REDIS_URL = ""
UPSTASH_REDIS_TOKEN = ""
DATABASE_URL      = ""      # Neon connection string
STRIPE_WEBHOOK_SECRET = ""

[[queues.producers]]
binding = "RESEARCH_QUEUE"
queue   = "hcimot-research"

[[queues.consumers]]
queue = "hcimot-research"
max_batch_size = 1          # one job at a time per consumer instance
max_retries    = 3
```

---

## Reference files

`references/prompts.md` — Full prompt templates for:
- Topic extraction
- Entity resolution (with Tavily context)
- Per-agent insight prompts
- Synthesizer (full ResearchResult JSON)

Read this before writing or modifying any Claude prompt.

`references/providers.md` — Integration details for:
- Polygon.io (quotes, ETF screener, rate limits)
- CoinGecko (price, market cap, trending coins endpoint)
- Etherscan (token holder count, wallet activity)
- Tavily (query patterns that work well for finance)

Read this before writing any provider integration.

---

## Hard rules

- Cloudflare Workers only — no Node.js APIs, no filesystem, no long-running processes
- All Claude calls use `claude-sonnet-4-6` — never hardcode a different model
- All LLM JSON output validated with Zod before use
- Prompts live in `prompts/` — never inline in logic
- Cache check happens before credit deduction — cache hits are free
- `Promise.allSettled` for all parallel agent calls — never `Promise.all`
- Every provider call has a 10s timeout
- Max 6 Tavily queries per job
- Never fabricate a ticker — validate against Polygon before including
- Shared types are read-only — do not modify `packages/shared/types.ts`