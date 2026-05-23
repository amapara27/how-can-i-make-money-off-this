import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ResearchRequest, ResearchResponse } from "@how-money/shared";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

server.listen(PORT, () => {
  console.log(`Research API listening on http://localhost:${PORT}`);
});

async function routeRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      status: "ok",
      service: "@how-money/api"
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/research") {
    const body = await readJson<Partial<ResearchRequest>>(request);
    const validationError = validateResearchRequest(body);

    if (validationError) {
      writeJson(response, 400, { error: validationError });
      return;
    }

    writeJson(response, 200, buildMockResearch(body as ResearchRequest));
    return;
  }

  writeJson(response, 404, {
    error: "Route not found"
  });
}

function validateResearchRequest(body: Partial<ResearchRequest>) {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }

  if (typeof body.selectedText !== "string" || body.selectedText.trim().length < 2) {
    return "selectedText must be at least two characters.";
  }

  if (!body.page || typeof body.page.url !== "string" || typeof body.page.title !== "string") {
    return "page.url and page.title are required.";
  }

  return null;
}

function buildMockResearch(request: ResearchRequest): ResearchResponse {
  const query = request.selectedText.trim();

  return {
    query,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "Public market exposure",
        summary: "Potential public equities, funds, and suppliers connected to the selected topic.",
        bullets: [
          `Find listed companies with revenue exposure to "${query}".`,
          "Check adjacent suppliers, infrastructure providers, and distribution channels.",
          "Compare direct exposure against broader thematic ETFs."
        ]
      },
      {
        title: "Prediction market framing",
        summary: "Ways to translate the idea into measurable events or adoption milestones.",
        bullets: [
          "Define a dated outcome with a source of truth.",
          "Look for launch, regulation, revenue, partnership, or market-share catalysts.",
          "Check liquidity and market rules before treating prices as useful signals."
        ]
      },
      {
        title: "Operator opportunities",
        summary: "Business models that could monetize demand, attention, data, or workflow gaps.",
        bullets: [
          "Map the buyer, budget owner, and repeated pain around the topic.",
          "Consider affiliate, data, workflow automation, and expert-service offers.",
          "Validate demand with customer conversations before building."
        ]
      }
    ],
    caveats: [
      "Mocked output",
      "Not financial advice",
      `Source: ${request.page.title || request.page.url}`
    ]
  };
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) as T : {} as T;
}

function writeJson(response: ServerResponse, statusCode: number, data: unknown) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(JSON.stringify(data, null, 2));
}
