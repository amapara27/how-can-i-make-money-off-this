import type { SelectionContext } from "@how-money/shared";

export const CREATE_RESEARCH_REQUEST = "CREATE_RESEARCH_REQUEST";

export type CreateResearchRequestMessage = {
  type: typeof CREATE_RESEARCH_REQUEST;
  payload: Omit<SelectionContext, "id" | "capturedAt">;
};

export type CreateResearchResponseMessage = {
  requestId: string;
};

export type ExtensionMessage = CreateResearchRequestMessage;
