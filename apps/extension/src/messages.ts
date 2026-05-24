import type { ResearchJob, SelectionContext } from "@how-money/shared";
import type { ResearchSession } from "./researchStorage";

export const CREATE_RESEARCH_REQUEST = "CREATE_RESEARCH_REQUEST";
export const OPEN_RESEARCH_REPORT = "OPEN_RESEARCH_REPORT";
export const SAVE_RESEARCH_SESSION = "SAVE_RESEARCH_SESSION";
export const UPDATE_RESEARCH_SESSION = "UPDATE_RESEARCH_SESSION";

export type CreateResearchRequestMessage = {
  type: typeof CREATE_RESEARCH_REQUEST;
  payload: Omit<SelectionContext, "id" | "capturedAt">;
};

export type CreateResearchResponseMessage = {
  requestId: string;
};

export type OpenResearchReportMessage = {
  type: typeof OPEN_RESEARCH_REPORT;
  requestId: string;
};

export type SaveResearchSessionMessage = {
  type: typeof SAVE_RESEARCH_SESSION;
  requestId: string;
  session: ResearchSession;
};

export type UpdateResearchSessionMessage = {
  type: typeof UPDATE_RESEARCH_SESSION;
  requestId: string;
  patch: {
    jobId?: string;
    job?: ResearchJob;
  };
};

export type ExtensionResponseMessage =
  | CreateResearchResponseMessage
  | { ok: true }
  | { ok: false; error: string };

export type ExtensionMessage =
  | CreateResearchRequestMessage
  | OpenResearchReportMessage
  | SaveResearchSessionMessage
  | UpdateResearchSessionMessage;
