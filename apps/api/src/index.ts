import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ResearchRequest } from "@how-money/shared";
import { getConfig, type AppConfig } from "./config.js";
import { ResearchConfigurationError, runResearchAgent } from "./research/agent.js";

const config = getConfig();

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response, config);
  } catch (error) {
    if (error instanceof ResearchConfigurationError) {
      writeJson(response, 503, { error: error.message });
      return;
    }

    writeJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

server.listen(config.port, () => {
  console.log(`Research API listening on http://localhost:${config.port}`);
});

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  appConfig: AppConfig
) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      status: "ok",
      service: "@how-money/api",
      model: appConfig.anthropicModel,
      tavilyConfigured: Boolean(appConfig.tavilyApiKey),
      anthropicConfigured: Boolean(appConfig.anthropicApiKey),
      mockResearchEnabled: appConfig.allowMockResearch
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/research") {
    const body = await readJson<Partial<ResearchRequest>>(request, 1_000_000);
    const validationError = validateResearchRequest(body);

    if (validationError) {
      writeJson(response, 400, { error: validationError });
      return;
    }

    const research = await runResearchAgent(body as ResearchRequest, appConfig);
    writeJson(response, 200, research);
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

async function readJson<T>(request: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return rawBody ? JSON.parse(rawBody) as T : {} as T;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
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
