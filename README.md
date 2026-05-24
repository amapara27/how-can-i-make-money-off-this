# how-can-i-make-money-off-this

Have you ever seen something cool and wondered how you could invest in or bet on something like it?

## Apps

- `apps/extension`: Chrome Manifest V3 extension built with React, Vite, and TypeScript.
- `apps/api`: Node API scaffold for LLM and scraping orchestration.
- `packages/shared`: shared request and response types.

## Extension Workflow

1. Highlight text on any webpage.
2. Click the inline "Research money angles" activation button.
3. The extension submits the selected text and page metadata to the local research API.
4. The inline panel polls the backend job and renders live agent output.
5. Open the bundled `research.html` report for the full research workspace.

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
- `GET /research/:jobId`

`POST /research` creates an async research job. The extension polls `GET /research/:jobId` for LLM synthesis, agent insights, provider results, sources, caveats, and verified asset data.
