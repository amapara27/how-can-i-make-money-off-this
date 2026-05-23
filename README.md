# how-can-i-make-money-off-this

Have you ever seen something cool and wondered how you could invest in or bet on something like it?

## Apps

- `apps/extension`: Chrome Manifest V3 extension built with React, Vite, and TypeScript.
- `apps/api`: Node API scaffold for LLM and scraping orchestration.
- `packages/shared`: shared request and response types.

## Extension Workflow

1. Highlight text on any webpage.
2. Click the inline "Research money angles" activation button.
3. The extension stores the selected text and page metadata in `chrome.storage.session`.
4. A new bundled `research.html` extension page opens with a mocked research workspace.

## Getting Started

```sh
pnpm install
pnpm build
```

To develop the extension:

```sh
pnpm --filter @how-money/extension dev
```

To build and load it in Chrome:

```sh
pnpm --filter @how-money/extension build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`.

To run the API:

```sh
pnpm --filter @how-money/api dev
```

The API exposes:

- `GET /health`
- `POST /research`

`POST /research` runs a small research agent:

1. Claude plans web search queries from the highlighted text.
2. Tavily searches and extracts source content from the web.
3. Claude synthesizes a structured response with citations.

Create `apps/api/.env` from `apps/api/.env.example` and set:

- `ANTHROPIC_API_KEY`
- `TAVILY_API_KEY`
- `ANTHROPIC_MODEL`, defaulting to `claude-sonnet-4-6`

For local development without credentials, set `RESEARCH_ALLOW_MOCK=true`.
