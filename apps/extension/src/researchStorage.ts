import type { ResearchJob, SelectionContext } from "@how-money/shared";

export type ResearchSession = {
  context: SelectionContext;
  jobId?: string;
  job?: ResearchJob;
};

export function storageKey(requestId: string) {
  return `research:${requestId}`;
}

export async function loadResearchSession(requestId: string): Promise<ResearchSession | undefined> {
  const key = storageKey(requestId);
  const result = await chrome.storage.session.get(key);
  const value = result[key] as ResearchSession | SelectionContext | undefined;

  if (!value) {
    return undefined;
  }

  if ("context" in value) {
    return value;
  }

  return {
    context: value
  };
}

export async function saveResearchSession(requestId: string, session: ResearchSession) {
  await chrome.storage.session.set({
    [storageKey(requestId)]: session
  });
}

export async function updateResearchSession(requestId: string, patch: Partial<Omit<ResearchSession, "context">>) {
  const current = await loadResearchSession(requestId);

  if (!current) {
    return;
  }

  await saveResearchSession(requestId, {
    ...current,
    ...patch
  });
}
