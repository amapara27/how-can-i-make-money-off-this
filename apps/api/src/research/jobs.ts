import { randomUUID } from "node:crypto";
import type { ResearchInput, ResearchJob, ResearchResult, ResearchStage } from "@how-money/shared";

export type JobStore = ReturnType<typeof createJobStore>;

export function createJobStore() {
  const jobs = new Map<string, ResearchJob>();

  return {
    create(_input: ResearchInput) {
      const now = new Date().toISOString();
      const job: ResearchJob = {
        jobId: randomUUID(),
        status: "queued",
        stage: "queued",
        createdAt: now,
        updatedAt: now
      };
      jobs.set(job.jobId, job);
      return job;
    },

    get(jobId: string) {
      return jobs.get(jobId);
    },

    updateStage(jobId: string, stage: ResearchStage) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }

      job.status = stage === "complete" ? "complete" : stage === "failed" ? "failed" : "running";
      job.stage = stage;
      job.updatedAt = new Date().toISOString();
      jobs.set(jobId, job);
    },

    complete(jobId: string, result: ResearchResult) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }

      job.status = "complete";
      job.stage = "complete";
      job.result = result;
      job.updatedAt = new Date().toISOString();
      jobs.set(jobId, job);
    },

    fail(jobId: string, error: string) {
      const job = jobs.get(jobId);
      if (!job) {
        return;
      }

      job.status = "failed";
      job.stage = "failed";
      job.error = error;
      job.updatedAt = new Date().toISOString();
      jobs.set(jobId, job);
    }
  };
}
