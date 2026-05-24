import type { SelectionContext } from "@how-money/shared";

export const CREATE_RESEARCH_REQUEST = "CREATE_RESEARCH_REQUEST";
export const OPEN_RESEARCH_REPORT = "OPEN_RESEARCH_REPORT";

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

export type ExtensionResponseMessage =
  | CreateResearchResponseMessage
  | { ok: true }
  | { ok: false; error: string };

export type ExtensionMessage = CreateResearchRequestMessage | OpenResearchReportMessage;
