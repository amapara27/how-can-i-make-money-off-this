import type { CreateResearchResponseMessage } from "./messages";

const BUTTON_ID = "how-money-selection-button";
const CREATE_RESEARCH_REQUEST = "CREATE_RESEARCH_REQUEST";
const MIN_SELECTION_LENGTH = 2;

let activationButton: HTMLButtonElement | null = null;
let lastSelectedText = "";

document.addEventListener("mouseup", () => {
  window.setTimeout(updateActivationButton, 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key.startsWith("Arrow") || event.key === "Shift") {
    window.setTimeout(updateActivationButton, 0);
  }
});

document.addEventListener("scroll", hideActivationButton, true);

function updateActivationButton() {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";

  if (!selection || selectedText.length < MIN_SELECTION_LENGTH || selection.rangeCount === 0) {
    hideActivationButton();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    hideActivationButton();
    return;
  }

  lastSelectedText = selectedText;
  showActivationButton(rect);
}

function showActivationButton(rect: DOMRect) {
  const button = getActivationButton();
  const top = Math.max(8, rect.top + window.scrollY - 44);
  const left = Math.max(8, rect.left + window.scrollX);

  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
  button.hidden = false;
}

function hideActivationButton() {
  if (activationButton) {
    activationButton.hidden = true;
  }
}

function getActivationButton() {
  if (activationButton) {
    return activationButton;
  }

  activationButton = document.createElement("button");
  activationButton.id = BUTTON_ID;
  activationButton.type = "button";
  activationButton.textContent = "Research money angles";
  Object.assign(activationButton.style, {
    position: "absolute",
    zIndex: "2147483647",
    padding: "8px 10px",
    border: "1px solid #0f766e",
    borderRadius: "8px",
    background: "#0f766e",
    color: "#ffffff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.22)",
    cursor: "pointer",
    font: "500 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  });

  activationButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  activationButton.addEventListener("click", () => {
    void createResearchRequest();
  });

  document.documentElement.appendChild(activationButton);
  return activationButton;
}

async function createResearchRequest() {
  const selectedText = lastSelectedText.trim();

  if (selectedText.length < MIN_SELECTION_LENGTH) {
    hideActivationButton();
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: CREATE_RESEARCH_REQUEST,
    payload: {
      selectedText,
      page: {
        url: window.location.href,
        title: document.title
      }
    }
  }) as CreateResearchResponseMessage;

  if (response.requestId) {
    hideActivationButton();
  }
}
