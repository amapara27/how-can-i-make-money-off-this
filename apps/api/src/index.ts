import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CreateResearchJobResponse, ResearchInput } from "@how-money/shared";
import { loadAppsEnv } from "./env.js";
import { createJobStore } from "./research/jobs.js";
import { runResearchJob } from "./research/orchestrator.js";
import { validateResearchInput } from "./research/validation.js";

loadAppsEnv();

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);
const jobs = createJobStore();

export const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    console.error("Unhandled API error", error);
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`Research API listening on http://localhost:${PORT}`);
  });
}

export async function routeRequest(request: IncomingMessage, response: ServerResponse) {
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
    let body: Partial<ResearchInput>;

    try {
      body = await readJson<Partial<ResearchInput>>(request);
    } catch (error) {
      if (error instanceof SyntaxError) {
        writeJson(response, 400, { error: "Request body must be valid JSON." });
        return;
      }

      throw error;
    }

    const validation = validateResearchInput(body);

    if (!validation.ok) {
      writeJson(response, 400, { error: validation.error });
      return;
    }

    const job = jobs.create(validation.input);
    queueMicrotask(() => {
      void runResearchJob(job.jobId, validation.input, jobs, process.env).catch((error: unknown) => {
        console.error("Research job failed", { jobId: job.jobId, error });
        jobs.fail(job.jobId, error instanceof Error ? error.message : "Research failed.");
      });
    });

    const payload: CreateResearchJobResponse = {
      jobId: job.jobId,
      status: job.status
    };
    writeJson(response, 202, payload);
    return;
  }

  const researchMatch = /^\/research\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && researchMatch) {
    const job = jobs.get(decodeURIComponent(researchMatch[1]));

    if (!job) {
      writeJson(response, 404, { error: "Research job not found." });
      return;
    }

    writeJson(response, 200, job);
    return;
  }

  writeJson(response, 404, {
    error: "Route not found"
  });
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
