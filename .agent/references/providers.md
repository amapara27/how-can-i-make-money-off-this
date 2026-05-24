# Data provider integration

Integration details for each external API used in the agent pipeline.
Read the relevant section before writing any provider integration.

---

## Polygon.io — equities + ETFs

Base URL: `https://api.polygon.io`
Auth: `?apiKey=<POLYGON_API_KEY>` query param on all requests.
Rate limit: 5 req/min (free), unlimited (paid). Use paid for production.

### Stock quotes (equities agent)

```typescript
// Batch quote — up to 100 tickers
const res = await fetch(
  `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers` +
  `?tickers=${tickers.join(',')}&apiKey=${env.POLYGON_API_KEY}`
)
const data = await res.json()

// data.tickers[] contains:
// { ticker, day: { c, o, h, l, v }, prevDay, todaysChangePerc, lastTrade }
```

### ETF screener (equities agent)

```typescript
// Search for ETFs with exposure to a topic
// Use Tavily for discovery, then validate each ETF via Polygon
const res = await fetch(
  `https://api.polygon.io/v3/reference/tickers?ticker=${etfSymbol}` +
  `&type=ETF&apiKey=${env.POLYGON_API_KEY}`
)
```

### Ticker validation

Always validate entity-resolved tickers before including in the result:

```typescript
export async function validateTicker(ticker: string, env: Env): Promise<boolean> {
  const res = await fetch(
    `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${env.POLYGON_API_KEY}`
  )
  return res.ok && (await res.json()).status === 'OK'
}
```

Drop any ticker that fails validation. Log it with the topic for debugging.

---

## CoinGecko — crypto prices

Base URL: `https://api.coingecko.com/api/v3`
Auth: `x-cg-demo-api-key: <COINGECKO_API_KEY>` header (free demo key).
Rate limit: 30 req/min (demo), 500 (paid).

### Price + market data (crypto agent)

```typescript
// Batch price fetch by CoinGecko ID
const ids = tokens.map(t => t.coinGeckoId).join(',')
const res = await fetch(
  `https://api.coingecko.com/api/v3/simple/price` +
  `?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
  { headers: { 'x-cg-demo-api-key': env.COINGECKO_API_KEY } }
)
const data = await res.json()

// data[coinGeckoId] = { usd, usd_24h_change, usd_market_cap }
```

### Trending coins (for topic discovery fallback)

```typescript
// If entity resolution returns no crypto tokens but the topic seems crypto-adjacent:
const res = await fetch('https://api.coingecko.com/api/v3/search/trending',
  { headers: { 'x-cg-demo-api-key': env.COINGECKO_API_KEY } }
)
// data.coins[].item = { id, name, symbol, market_cap_rank }
```

### CoinGecko ID lookup

The entity resolution prompt asks Claude to return the `coinGeckoId`. Validate it:

```typescript
export async function validateCoinGeckoId(id: string, env: Env): Promise<boolean> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { headers: { 'x-cg-demo-api-key': env.COINGECKO_API_KEY } }
  )
  const data = await res.json()
  return Object.keys(data).length > 0
}
```

---

## Etherscan — on-chain signals

Base URL: `https://api.etherscan.io/api`
Auth: `&apikey=<ETHERSCAN_API_KEY>` query param.
Rate limit: 5 req/s (free).

Only used when the topic resolves to ERC-20 tokens (has a contract address).
Skip this agent entirely for equity-only topics.

### Token holder count

```typescript
const res = await fetch(
  `https://api.etherscan.io/api?module=token&action=tokenholderlist` +
  `&contractaddress=${contractAddress}&page=1&offset=1` +
  `&apikey=${env.ETHERSCAN_API_KEY}`
)
// Use totalCount to track holder growth (compare to cached previous value)
```

### Token transfer volume (activity signal)

```typescript
const res = await fetch(
  `https://api.etherscan.io/api?module=account&action=tokentx` +
  `&contractaddress=${contractAddress}&startblock=0&endblock=99999999` +
  `&sort=desc&page=1&offset=20` +
  `&apikey=${env.ETHERSCAN_API_KEY}`
)
// Count transfers in last 24h as a proxy for activity level
```

Return `OnChainSignals`:
```typescript
{
  holderCountTrend: 'up' | 'down' | 'flat',  // compare to cached 24h ago
  dexVolume24h: number,                        // from Dune if available, else 0
  walletActivityLevel: 'low' | 'medium' | 'high'  // derived from transfer count
}
```

---

## Tavily — web search

Base URL: `https://api.tavily.com/search`
Auth: `api_key` in request body.
Rate limit: depends on plan. Cache results aggressively.

### Query patterns that work well for finance

```typescript
// Entity resolution — find what to invest in
`how to invest in ${topic} stocks ETFs 2024`
`${topic} publicly traded companies`
`${topic} cryptocurrency tokens`

// News / sentiment
`${topic} investment news this week`
`${topic} market outlook`

// Filings / patents (use search_depth: 'advanced')
`${topic} SEC filing 10-K`
`${topic} patent filing 2024`
```

### Search depth

- `'basic'` — fast, cheaper, good for news and entity discovery
- `'advanced'` — slower, thorough, use for filings and patent searches only

### Result structure

```typescript
interface TavilyResult {
  title: string
  url: string
  content: string      // cleaned text excerpt, ~200-500 chars
  score: number        // relevance 0-1, filter < 0.5
  published_date?: string
}
```

Filter results with `score < 0.5` before passing to Claude — low-score results
add noise to the entity resolution prompt.

### Budget enforcement

Max 6 Tavily queries per research job. Track with a counter in the queue message:

```typescript
// In orchestrator, pass budget down to agents
const tavilyBudget = { remaining: 6 }

// Each agent that uses Tavily decrements before calling
if (tavilyBudget.remaining <= 0) return null  // skip Tavily, use direct APIs only
tavilyBudget.remaining--
await tavilySearch(query, env)
```

### Caching Tavily results

Cache in Redis for 1 hour keyed on the query string:

```typescript
const cacheKey = `tavily:${slugify(query)}`
const cached = await redis.get(cacheKey)
if (cached) return JSON.parse(cached)

const results = await tavilySearch(query, env)
await redis.setex(cacheKey, 3600, JSON.stringify(results))
return results
```

---

## SEC EDGAR — filings

Base URL: `https://efts.sec.gov/LATEST/search-index`
Auth: none required. Set `User-Agent: hcimot contact@hcimot.com` header.
Rate limit: 10 req/s.

Prefer Tavily for filings when the query is conceptual ("vertical farming SEC filings").
Use EDGAR directly when you have a specific CIK or ticker.

```typescript
// Full-text search (more useful than company lookup for trend research)
const res = await fetch(
  `https://efts.sec.gov/LATEST/search-index?q="${encodeURIComponent(topic)}"` +
  `&dateRange=custom&startdt=${ninetyDaysAgo}&enddt=${today}&forms=10-K,8-K`,
  { headers: { 'User-Agent': 'hcimot contact@hcimot.com' } }
)
```

Return the count of recent filings mentioning the topic + top 2-3 excerpts
as agent insights.

---

## Timeout wrapper

Wrap every provider call. 10 seconds max. Never let a slow API stall a job.

```typescript
export async function withTimeout<T>(
  promise: Promise<T>, ms = 10000, label = 'provider'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

// Usage
const quotes = await withTimeout(fetchQuotes(tickers, env), 10000, 'polygon')
```