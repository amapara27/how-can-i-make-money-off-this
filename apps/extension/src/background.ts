import type { SelectionContext } from "@how-money/shared";
import {
  CREATE_RESEARCH_REQUEST,
  type CreateResearchRequestMessage,
  type CreateResearchResponseMessage,
  type ExtensionMessage
} from "./messages";

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender,
    sendResponse: (response: CreateResearchResponseMessage) => void
  ) => {
    if (message.type !== CREATE_RESEARCH_REQUEST) {
      return false;
    }

    void openResearchPage(message, sendResponse);
    return true;
  }
);

async function openResearchPage(
  message: CreateResearchRequestMessage,
  sendResponse: (response: CreateResearchResponseMessage) => void
) {
  const requestId = crypto.randomUUID();
  const context: SelectionContext = {
    id: requestId,
    selectedText: message.payload.selectedText,
    page: message.payload.page,
    capturedAt: new Date().toISOString()
  };

  await chrome.storage.session.set({
    [storageKey(requestId)]: context
  });

  await chrome.tabs.create({
    url: chrome.runtime.getURL(`research.html?requestId=${encodeURIComponent(requestId)}`)
  });

  sendResponse({ requestId });
}

function storageKey(requestId: string) {
  return `research:${requestId}`;
}
