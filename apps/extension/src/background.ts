import {
  CREATE_RESEARCH_REQUEST,
  OPEN_RESEARCH_REPORT,
  type CreateResearchRequestMessage,
  type ExtensionMessage,
  type ExtensionResponseMessage
} from "./messages";
import { saveResearchSession } from "./researchStorage";

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: ExtensionResponseMessage) => void
  ) => {
    if (message.type === CREATE_RESEARCH_REQUEST) {
      void openResearchPageFromRequest(message, sendResponse);
      return true;
    }

    if (message.type === OPEN_RESEARCH_REPORT) {
      void openResearchPage(message.requestId, sendResponse);
      return true;
    }

    return false;
  }
);

async function openResearchPageFromRequest(
  message: CreateResearchRequestMessage,
  sendResponse: (response: ExtensionResponseMessage) => void
) {
  const requestId = crypto.randomUUID();
  const context = {
    id: requestId,
    selectedText: message.payload.selectedText,
    image: message.payload.image,
    page: message.payload.page,
    capturedAt: new Date().toISOString()
  };

  await saveResearchSession(requestId, { context });
  await openReportTab(requestId);
  sendResponse({ requestId });
}

async function openResearchPage(
  requestId: string,
  sendResponse: (response: ExtensionResponseMessage) => void
) {
  try {
    await openReportTab(requestId);
    sendResponse({ ok: true });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to open research report."
    });
  }
}

async function openReportTab(requestId: string) {
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`research.html?requestId=${encodeURIComponent(requestId)}`)
  });
}
