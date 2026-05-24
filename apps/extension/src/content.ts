import type { CreateResearchJobResponse, ResearchInput, ResearchJob, ResearchResult, SelectionContext } from "@how-money/shared";
import type { ExtensionResponseMessage } from "./messages";

const ROOT_ID = "hcimot-extension-root";
const MIN_SELECTION_LENGTH = 2;
const TRIGGER_TEXT = "How Can You Make Money Off This?";
const OPEN_RESEARCH_REPORT = "OPEN_RESEARCH_REPORT";
const DEFAULT_API_BASE_URL = "http://localhost:8787";
const API_BASE_URL = (import.meta.env.VITE_RESEARCH_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");

type CaptureKind = "text" | "image";

type Capture = {
  kind: CaptureKind;
  title: string;
  excerpt: string;
  imageUrl?: string;
  pageUrl: string;
  pageTitle: string;
};

type PanelState =
  | { status: "loading"; requestId: string; stage: ResearchJob["stage"] }
  | { status: "ready"; requestId: string; result: ResearchResult }
  | { status: "error"; requestId?: string; message: string };

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let triggerButton: HTMLButtonElement | null = null;
let panel: HTMLElement | null = null;
let activeCapture: Capture | null = null;
let researchController: AbortController | null = null;

document.addEventListener("pointerup", (event) => {
  if (isExtensionEvent(event)) {
    return;
  }

  window.setTimeout(() => updateTriggerFromPage(event), 0);
});

document.addEventListener("keyup", (event) => {
  if (event.key.startsWith("Arrow") || event.key === "Shift") {
    window.setTimeout(() => updateTriggerFromSelection(), 0);
  }
});

document.addEventListener("scroll", hideTrigger, true);

function updateTriggerFromPage(event: PointerEvent) {
  const textSelection = getTextSelectionCapture();

  if (textSelection) {
    showTrigger(textSelection.capture, textSelection.rect);
    return;
  }

  const target = event.target instanceof Element ? event.target : null;
  const imageCapture = target ? getImageCapture(target) : null;

  if (imageCapture) {
    showTrigger(imageCapture.capture, imageCapture.rect);
    return;
  }

  hideTrigger();
}

function updateTriggerFromSelection() {
  const textSelection = getTextSelectionCapture();

  if (textSelection) {
    showTrigger(textSelection.capture, textSelection.rect);
    return;
  }

  hideTrigger();
}

function getTextSelectionCapture() {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";

  if (!selection || selectedText.length < MIN_SELECTION_LENGTH || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return {
    rect,
    capture: {
      kind: "text" as const,
      title: summarizeText(selectedText),
      excerpt: selectedText,
      pageUrl: window.location.href,
      pageTitle: document.title
    }
  };
}

function getImageCapture(target: Element) {
  const image = findImageElement(target);

  if (!image) {
    return null;
  }

  const rect = image.element.getBoundingClientRect();

  if (rect.width < 24 || rect.height < 24) {
    return null;
  }

  const title = image.alt || image.ariaLabel || document.title || "Selected image";

  return {
    rect,
    capture: {
      kind: "image" as const,
      title: summarizeText(title),
      excerpt: title,
      imageUrl: image.url,
      pageUrl: window.location.href,
      pageTitle: document.title
    }
  };
}

function findImageElement(target: Element) {
  const directImage = target.closest("img");

  if (directImage instanceof HTMLImageElement) {
    return {
      element: directImage,
      url: directImage.currentSrc || directImage.src,
      alt: directImage.alt,
      ariaLabel: directImage.getAttribute("aria-label") ?? ""
    };
  }

  const picture = target.closest("picture");
  const pictureImage = picture?.querySelector("img");

  if (pictureImage instanceof HTMLImageElement) {
    return {
      element: pictureImage,
      url: pictureImage.currentSrc || pictureImage.src,
      alt: pictureImage.alt,
      ariaLabel: pictureImage.getAttribute("aria-label") ?? ""
    };
  }

  let element: Element | null = target;
  let depth = 0;

  while (element && depth < 5) {
    const backgroundUrl = getBackgroundImageUrl(element);
    const ariaLabel = element.getAttribute("aria-label") ?? "";
    const role = element.getAttribute("role") ?? "";

    if (backgroundUrl && (role === "img" || ariaLabel.toLowerCase().includes("image"))) {
      return {
        element,
        url: backgroundUrl,
        alt: "",
        ariaLabel
      };
    }

    element = element.parentElement;
    depth += 1;
  }

  return null;
}

function getBackgroundImageUrl(element: Element) {
  const backgroundImage = window.getComputedStyle(element).backgroundImage;
  const match = /^url\((['"]?)(.+?)\1\)$/.exec(backgroundImage);
  return match?.[2] ?? "";
}

function showTrigger(capture: Capture, rect: DOMRect) {
  activeCapture = capture;

  const button = getTriggerButton();
  const position = getTriggerPosition(rect);

  button.style.left = `${position.left}px`;
  button.style.top = `${position.top}px`;
  button.hidden = false;
}

function hideTrigger() {
  if (triggerButton) {
    triggerButton.hidden = true;
  }
}

function getTriggerPosition(rect: DOMRect) {
  const margin = 10;
  const estimatedWidth = 286;
  const top = rect.top > 58 ? rect.top - 48 : rect.bottom + 10;
  const left = Math.min(
    Math.max(margin, rect.left),
    Math.max(margin, window.innerWidth - estimatedWidth - margin)
  );

  return {
    top: Math.max(margin, Math.min(top, window.innerHeight - 52)),
    left
  };
}

function getTriggerButton() {
  ensureRoot();

  if (triggerButton) {
    return triggerButton;
  }

  triggerButton = document.createElement("button");
  triggerButton.className = "hcimot-trigger";
  triggerButton.type = "button";
  triggerButton.textContent = TRIGGER_TEXT;
  triggerButton.hidden = true;

  triggerButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  triggerButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    activateExtension();
  });

  shadow?.appendChild(triggerButton);
  return triggerButton;
}

function activateExtension() {
  if (!activeCapture) {
    hideTrigger();
    return;
  }

  void startResearch(activeCapture);
}

async function startResearch(capture: Capture) {
  researchController?.abort();
  researchController = new AbortController();
  hideTrigger();
  const requestId = crypto.randomUUID();
  const context = await buildSelectionContext(capture, requestId);

  await saveResearchSession(requestId, { context });
  renderPanel(capture, { status: "loading", requestId, stage: "queued" });

  try {
    const created = await createResearchJob(toResearchInput(context), researchController.signal);
    await updateResearchSession(requestId, { jobId: created.jobId });

    const job = await pollResearchJob(created.jobId, {
      signal: researchController.signal,
      onUpdate: (updatedJob) => {
        void updateResearchSession(requestId, { job: updatedJob });

        if (updatedJob.status === "failed") {
          renderPanel(capture, {
            status: "error",
            requestId,
            message: updatedJob.error ?? "Research failed."
          });
          return;
        }

        if (updatedJob.result) {
          renderPanel(capture, {
            status: "ready",
            requestId,
            result: updatedJob.result
          });
          return;
        }

        renderPanel(capture, {
          status: "loading",
          requestId,
          stage: updatedJob.stage
        });
      }
    });

    await updateResearchSession(requestId, { job });

    if (job.status === "failed") {
      renderPanel(capture, {
        status: "error",
        requestId,
        message: job.error ?? "Research failed."
      });
      return;
    }

    if (job.result) {
      renderPanel(capture, {
        status: "ready",
        requestId,
        result: job.result
      });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    renderPanel(capture, {
      status: "error",
      requestId,
      message: error instanceof Error ? error.message : "Unable to reach the research API."
    });
  }
}

async function buildSelectionContext(capture: Capture, requestId: string): Promise<SelectionContext> {
  const image = capture.kind === "image" && capture.imageUrl
    ? await imageUrlToHighlight(capture.imageUrl, capture.excerpt)
    : undefined;

  return {
    id: requestId,
    selectedText: capture.excerpt,
    image,
    page: {
      url: capture.pageUrl,
      title: capture.pageTitle
    },
    capturedAt: new Date().toISOString()
  };
}

function toResearchInput(context: SelectionContext): ResearchInput {
  return {
    selectedText: context.selectedText,
    image: context.image,
    page: context.page
  };
}

async function createResearchJob(input: ResearchInput, signal?: AbortSignal): Promise<CreateResearchJobResponse> {
  return fetchJson<CreateResearchJobResponse>("/research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  });
}

async function pollResearchJob(
  jobId: string,
  options: {
    signal?: AbortSignal;
    onUpdate?: (job: ResearchJob) => void;
  } = {}
) {
  while (true) {
    const job = await fetchJson<ResearchJob>(`/research/${encodeURIComponent(jobId)}`, {
      signal: options.signal
    });
    options.onUpdate?.(job);

    if (job.status === "complete" || job.status === "failed") {
      return job;
    }

    await delay(1200, options.signal);
  }
}

async function fetchJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) as T | { error?: string } : {};

  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data && data.error
      ? data.error
      : `Research API returned ${response.status}.`;
    throw new Error(message);
  }

  return data as T;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Polling was cancelled.", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Polling was cancelled.", "AbortError"));
    }, { once: true });
  });
}

async function saveResearchSession(requestId: string, session: { context: SelectionContext; jobId?: string; job?: ResearchJob }) {
  await chrome.storage.session.set({
    [storageKey(requestId)]: session
  });
}

async function updateResearchSession(requestId: string, patch: { jobId?: string; job?: ResearchJob }) {
  const key = storageKey(requestId);
  const result = await chrome.storage.session.get(key);
  const current = result[key] as { context: SelectionContext; jobId?: string; job?: ResearchJob } | undefined;

  if (!current) {
    return;
  }

  await chrome.storage.session.set({
    [key]: {
      ...current,
      ...patch
    }
  });
}

function storageKey(requestId: string) {
  return `research:${requestId}`;
}

async function imageUrlToHighlight(imageUrl: string, altText: string) {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return undefined;
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      return undefined;
    }

    return {
      dataUrl: await blobToDataUrl(blob),
      mimeType: blob.type,
      altText
    };
  } catch {
    return undefined;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read selected image.")));
    reader.readAsDataURL(blob);
  });
}

function renderPanel(capture: Capture, state: PanelState) {
  ensureRoot();

  if (!panel) {
    panel = document.createElement("aside");
    panel.className = "hcimot-panel";
    panel.setAttribute("aria-label", "How Can I Make Money Off This research");
    shadow?.appendChild(panel);
  }

  panel.replaceChildren(
    buildPanelHeader(capture, state),
    buildCapturePreview(capture),
    buildMetrics(state),
    buildMoneyAngles(capture, state),
    buildFooter(state)
  );
  panel.hidden = false;
}

function buildPanelHeader(capture: Capture, state: PanelState) {
  const header = document.createElement("header");
  header.className = "hcimot-panelHeader";

  const copy = document.createElement("div");
  const source = document.createElement("p");
  source.className = "hcimot-source";
  source.textContent = `${getHostname(capture.pageUrl)} / ${capture.kind}`;

  const title = document.createElement("h2");
  title.textContent = capture.title;

  const running = document.createElement("span");
  running.className = "hcimot-running";
  running.append(document.createElement("span"), document.createTextNode(getPanelStatusText(state)));

  copy.append(source, title, running);

  const close = document.createElement("button");
  close.className = "hcimot-close";
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close research panel");
  close.addEventListener("click", () => {
    researchController?.abort();
    panel?.setAttribute("hidden", "");
  });

  header.append(copy, close);
  return header;
}

function getPanelStatusText(state: PanelState) {
  if (state.status === "ready") {
    return "research ready";
  }

  if (state.status === "error") {
    return "research unavailable";
  }

  return formatStage(state.stage);
}

function buildCapturePreview(capture: Capture) {
  const preview = document.createElement("section");
  preview.className = "hcimot-preview";

  if (capture.kind === "image" && capture.imageUrl) {
    const image = document.createElement("img");
    image.src = capture.imageUrl;
    image.alt = capture.excerpt;
    preview.appendChild(image);
  }

  const quote = document.createElement("p");
  quote.textContent = capture.excerpt;
  preview.appendChild(quote);

  return preview;
}

function buildMetrics(state: PanelState) {
  const metrics = document.createElement("section");
  metrics.className = "hcimot-metrics";
  metrics.setAttribute("aria-label", "Research metrics");

  const metricData = state.status === "ready"
    ? [
        ["Trend", `${state.result.thesis.trendScore}/100`],
        ["Investability", titleCase(state.result.topic.investability)],
        ["Horizon", state.result.thesis.timeHorizon],
        ["Sources", String(state.result.sources.length)]
      ]
    : state.status === "error"
      ? [
          ["Trend", "unavailable"],
          ["Investability", "unavailable"],
          ["Horizon", "unavailable"],
          ["Sources", "unavailable"]
        ]
      : [
          ["Trend", "scanning"],
          ["Investability", "pricing"],
          ["Horizon", "mapping"],
          ["Sources", formatStage(state.stage)]
        ];

  for (const [label, value] of metricData) {
    const metric = document.createElement("div");
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = value;
    metric.append(labelElement, valueElement);
    metrics.appendChild(metric);
  }

  return metrics;
}

function buildMoneyAngles(capture: Capture, state: PanelState) {
  const section = document.createElement("section");
  section.className = "hcimot-angles";

  if (state.status === "loading") {
    for (const label of ["Direct exposure", "Market routes", "Business angle"]) {
      const row = document.createElement("article");
      row.className = "hcimot-angle hcimot-angleLoading";
      const title = document.createElement("h3");
      title.textContent = label;
      row.append(title, buildSkeleton(), buildSkeleton());
      section.appendChild(row);
    }

    return section;
  }

  if (state.status === "error") {
    const row = document.createElement("article");
    row.className = "hcimot-angle";

    const title = document.createElement("h3");
    title.textContent = "Research unavailable";

    const text = document.createElement("p");
    text.textContent = state.message;

    row.append(title, text);
    section.appendChild(row);
    section.appendChild(buildOpenReportButton(state.requestId));
    return section;
  }

  const data = getInlineAngles(state.result, capture);

  if (!state.result.isActionable && data.length === 0) {
    const row = document.createElement("article");
    row.className = "hcimot-angle";

    const title = document.createElement("h3");
    title.textContent = "No verified angle";

    const text = document.createElement("p");
    text.textContent = state.result.topic.investabilityReason;

    row.append(title, text);
    section.appendChild(row);
  }

  for (const item of data) {
    const row = document.createElement("article");
    row.className = "hcimot-angle";

    const top = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title;
    const value = document.createElement("strong");
    value.textContent = item.value;
    top.append(title, value);

    const text = document.createElement("p");
    text.textContent = item.text;

    row.append(top, text);
    section.appendChild(row);
  }

  section.appendChild(buildRiskMeter(state.result.thesis.riskLevel, state.result.thesis.bearCase));
  section.appendChild(buildOpenReportButton(state.requestId));
  return section;
}

function getInlineAngles(result: ResearchResult, capture: Capture) {
  const opportunities = result.opportunities.slice(0, 3).map((opportunity) => ({
    title: opportunity.title,
    value: `${titleCase(opportunity.confidence)} ${opportunity.type}`,
    text: opportunity.rationale
  }));

  if (opportunities.length > 0) {
    return opportunities;
  }

  const assetAngles = [
    ...result.assets.equities.slice(0, 2).map((asset) => ({
      title: `${asset.ticker} ${asset.name}`,
      value: formatPercent(asset.dayChangePercent) ?? `${asset.relevanceScore}/100`,
      text: asset.rationale
    })),
    ...result.assets.crypto.slice(0, 2).map((asset) => ({
      title: `${asset.symbol} ${asset.name}`,
      value: formatCurrency(asset.priceUsd) ?? `${asset.relevanceScore}/100`,
      text: asset.rationale
    }))
  ];

  if (assetAngles.length > 0) {
    return assetAngles.slice(0, 3);
  }

  const topic = capture.kind === "image" ? "this image" : `"${capture.title}"`;

  return result.howToGetIn.slice(0, 3).map((step, index) => ({
    title: index === 0 ? "How to get in" : "Next step",
    value: result.isActionable ? titleCase(result.topic.investability) : "Low",
    text: step || `Research ${topic} further before acting.`
  }));
}

function buildOpenReportButton(requestId?: string) {
  const button = document.createElement("button");
  button.className = "hcimot-reportButton";
  button.type = "button";
  button.textContent = "Open full report";
  button.disabled = !requestId;
  button.addEventListener("click", () => {
    if (!requestId) {
      return;
    }

    void chrome.runtime.sendMessage(
      { type: OPEN_RESEARCH_REPORT, requestId },
      (response?: ExtensionResponseMessage) => {
        if (response && "ok" in response && !response.ok) {
          renderPanel(activeCapture ?? {
            kind: "text",
            title: "Research report",
            excerpt: response.error,
            pageUrl: window.location.href,
            pageTitle: document.title
          }, {
            status: "error",
            requestId,
            message: response.error
          });
        }
      }
    );
  });
  return button;
}

function buildSkeleton() {
  const skeleton = document.createElement("span");
  skeleton.className = "hcimot-skeleton";
  return skeleton;
}

function buildRiskMeter(riskLevel: ResearchResult["thesis"]["riskLevel"], bearCase: string) {
  const risk = document.createElement("article");
  risk.className = "hcimot-risk";

  const label = document.createElement("span");
  label.textContent = `${titleCase(riskLevel)} risk`;

  const blocks = document.createElement("div");
  const filledBlocks = riskLevel === "low" ? 1 : riskLevel === "medium" ? 3 : 5;
  blocks.setAttribute("aria-label", `Risk is ${filledBlocks} out of 5`);

  for (let index = 0; index < 5; index += 1) {
    const block = document.createElement("i");
    if (index < filledBlocks) {
      block.className = "is-filled";
    }
    blocks.appendChild(block);
  }

  const copy = document.createElement("p");
  copy.textContent = bearCase;

  risk.append(label, blocks, copy);
  return risk;
}

function buildFooter(state: PanelState) {
  const footer = document.createElement("footer");
  footer.className = "hcimot-footer";
  footer.textContent = state.status === "ready"
    ? state.result.caveats.join(" ")
    : "Research, not advice. Backend agents are checking sources and market data.";
  return footer;
}

function ensureRoot() {
  if (shadow) {
    return;
  }

  host = document.createElement("div");
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);

  shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      color-scheme: dark;
    }

    .hcimot-trigger,
    .hcimot-panel,
    .hcimot-panel * {
      box-sizing: border-box;
      letter-spacing: 0;
    }

    .hcimot-trigger {
      position: fixed;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      max-width: min(286px, calc(100vw - 20px));
      padding: 0 12px;
      border: 1px solid #2f3a2a;
      border-radius: 8px;
      background: #d6ff62;
      color: #10140d;
      font: 500 13px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      white-space: nowrap;
      cursor: pointer;
    }

    .hcimot-trigger::before {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #10140d;
      content: "";
    }

    .hcimot-trigger[hidden],
    .hcimot-panel[hidden] {
      display: none;
    }

    .hcimot-panel {
      position: fixed;
      z-index: 2147483647;
      top: 16px;
      right: 16px;
      display: grid;
      gap: 12px;
      width: min(390px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      padding: 14px;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      background: #0d0d0d;
      color: #eeeeee;
      font: 400 13px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .hcimot-panelHeader {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
    }

    .hcimot-source {
      width: fit-content;
      max-width: 100%;
      margin: 0 0 8px;
      overflow: hidden;
      padding: 4px 7px;
      border: 1px solid #303030;
      border-radius: 999px;
      color: #a7a7a7;
      font: 400 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hcimot-panel h2 {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: #f4f4f4;
      font: 500 22px/1.1 Inter, ui-sans-serif, system-ui, sans-serif;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .hcimot-running {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      margin-top: 8px;
      color: #8c8c8c;
      font-size: 12px;
    }

    .hcimot-running span {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #d6ff62;
      animation: hcimot-pulse 1.8s ease-in-out infinite;
    }

    .hcimot-close {
      min-width: 48px;
      min-height: 30px;
      border: 1px solid #303030;
      border-radius: 6px;
      background: #171717;
      color: #d7d7d7;
      font: 500 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
    }

    .hcimot-preview {
      display: grid;
      gap: 10px;
      padding: 10px;
      border: 1px solid #242424;
      border-radius: 8px;
      background: #141414;
    }

    .hcimot-preview img {
      display: block;
      width: 100%;
      max-height: 150px;
      object-fit: cover;
      border-radius: 6px;
    }

    .hcimot-preview p {
      display: -webkit-box;
      margin: 0;
      overflow: hidden;
      color: #cfcfcf;
      font-size: 12px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
    }

    .hcimot-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }

    .hcimot-metrics div {
      min-width: 0;
      padding: 9px 8px;
      border: 1px solid #242424;
      border-radius: 8px;
      background: #121212;
    }

    .hcimot-metrics span {
      display: block;
      margin-bottom: 4px;
      overflow: hidden;
      color: #858585;
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hcimot-metrics strong,
    .hcimot-angle strong {
      display: block;
      overflow: hidden;
      color: #f1f1f1;
      font: 500 13px/1.2 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hcimot-angles {
      display: grid;
      gap: 8px;
    }

    .hcimot-angle {
      display: grid;
      gap: 8px;
      padding: 11px;
      border-radius: 8px;
      background: #151515;
    }

    .hcimot-angle:hover {
      background: #191d15;
    }

    .hcimot-angle div {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }

    .hcimot-angle h3 {
      margin: 0;
      color: #eeeeee;
      font: 500 13px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
    }

    .hcimot-angle p {
      margin: 0;
      color: #a7a7a7;
      font-size: 12px;
    }

    .hcimot-angleLoading {
      min-height: 82px;
    }

    .hcimot-skeleton {
      display: block;
      height: 10px;
      width: 100%;
      overflow: hidden;
      border-radius: 999px;
      background: #242424;
      position: relative;
    }

    .hcimot-skeleton::after {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(214, 255, 98, 0.14), transparent);
      animation: hcimot-scan 1.4s ease-in-out infinite;
      content: "";
    }

    .hcimot-risk {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 12px;
      align-items: center;
      padding: 11px;
      border: 1px solid #302313;
      border-radius: 8px;
      background: #17130e;
    }

    .hcimot-risk span {
      color: #ba7517;
      font: 500 12px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      text-transform: uppercase;
    }

    .hcimot-risk div {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
    }

    .hcimot-risk i {
      height: 12px;
      border-radius: 2px;
      background: #302313;
    }

    .hcimot-risk i.is-filled {
      background: #ba7517;
    }

    .hcimot-risk p {
      grid-column: 1 / -1;
      margin: 0;
      color: #b8a58d;
      font-size: 12px;
    }

    .hcimot-reportButton {
      min-height: 36px;
      border: 1px solid #d6ff62;
      border-radius: 8px;
      background: #d6ff62;
      color: #10140d;
      font: 600 13px/1 Inter, ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
    }

    .hcimot-reportButton:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .hcimot-footer {
      color: #777777;
      font-size: 11px;
    }

    @keyframes hcimot-pulse {
      0%,
      100% {
        opacity: 1;
      }

      50% {
        opacity: 0.3;
      }
    }

    @keyframes hcimot-scan {
      from {
        transform: translateX(-100%);
      }

      to {
        transform: translateX(100%);
      }
    }

    @media (max-width: 520px) {
      .hcimot-panel {
        inset: auto 8px 8px;
        width: auto;
        max-height: min(82vh, 640px);
      }

      .hcimot-metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hcimot-running span,
      .hcimot-skeleton::after {
        animation: none;
      }
    }
  `;

  shadow.appendChild(style);
}

function isExtensionEvent(event: Event) {
  return event.composedPath().some((node) => node === host);
}

function summarizeText(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 78 ? `${compact.slice(0, 75)}...` : compact;
}

function formatStage(stage: ResearchJob["stage"]) {
  return stage.replace(/-/g, " ");
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrency(value: number | undefined) {
  if (typeof value !== "number") {
    return undefined;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

function formatPercent(value: number | undefined) {
  if (typeof value !== "number") {
    return undefined;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "current page";
  }
}
