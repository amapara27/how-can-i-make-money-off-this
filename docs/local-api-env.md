# Local API Environment

The local Node backend loads real provider credentials from `apps/.env`. Missing provider keys fail closed: the backend will not fabricate market data, source links, tickers, tokens, or prices.

At startup, `apps/api` uses `dotenv` to load environment variables from `apps/.env`. Existing shell environment variables take priority over values in that file.

## Environment Variables

```sh
PORT=8787

# Claude. If omitted, local deterministic extraction/resolution/synthesis is used.
ANTHROPIC_API_KEY=

# Search and market data providers. If omitted, the matching provider returns no data.
TAVILY_API_KEY=
POLYGON_API_KEY=
COINGECKO_API_KEY=
ETHERSCAN_API_KEY=

# Defaults to false so local tests do not make an unauthenticated SEC request.
HCIMOT_ENABLE_SEC_SEARCH=false
```

## Example Requests

Start the API:

```sh
pnpm --filter @how-money/api dev
```

Create a text research job:

```sh
curl -s http://localhost:8787/research \
  -H 'content-type: application/json' \
  -d '{
    "selectedText": "Bitcoin ETF inflows hit a record",
    "page": { "url": "https://example.com/bitcoin", "title": "Bitcoin ETF news" }
  }'
```

Poll the job:

```sh
curl -s http://localhost:8787/research/<jobId>
```

Try an unsupported highlight:

```sh
curl -s http://localhost:8787/research \
  -H 'content-type: application/json' \
  -d '{
    "selectedText": "a funny private group chat screenshot",
    "page": { "url": "https://example.com/meme", "title": "Meme" }
  }'
```

If real provider keys are absent, the backend should complete the job with no actionable assets instead of inventing tickers or tokens.

## Extension Note

The extension submits highlighted text immediately. Image selections pass alt text and attempt a best-effort `dataUrl` capture; cross-origin images may fall back to text-only context when the browser blocks the fetch.
