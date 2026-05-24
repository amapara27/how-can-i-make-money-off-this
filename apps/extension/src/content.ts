const ROOT_ID = "hcimot-extension-root";
const MIN_SELECTION_LENGTH = 2;
const TRIGGER_TEXT = "How Can You Make Money Off This?";

type CaptureKind = "text" | "image";

type Capture = {
  kind: CaptureKind;
  title: string;
  excerpt: string;
  imageUrl?: string;
  pageUrl: string;
  pageTitle: string;
};

type PanelState = "loading" | "ready";

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let triggerButton: HTMLButtonElement | null = null;
let panel: HTMLElement | null = null;
let activeCapture: Capture | null = null;
let researchTimer: number | undefined;

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

  window.clearTimeout(researchTimer);
  hideTrigger();
  renderPanel(activeCapture, "loading");

  researchTimer = window.setTimeout(() => {
    if (activeCapture) {
      renderPanel(activeCapture, "ready");
    }
  }, 900);
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
    buildFooter()
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
  running.innerHTML = `<span></span>${state === "loading" ? "agents running" : "research ready"}`;

  copy.append(source, title, running);

  const close = document.createElement("button");
  close.className = "hcimot-close";
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close research panel");
  close.addEventListener("click", () => {
    window.clearTimeout(researchTimer);
    panel?.setAttribute("hidden", "");
  });

  header.append(copy, close);
  return header;
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

  const metricData =
    state === "loading"
      ? [
          ["Trend", "scanning"],
          ["Investability", "pricing"],
          ["Horizon", "mapping"],
          ["Sources", "queued"]
        ]
      : [
          ["Trend", "72/100"],
          ["Investability", "Medium"],
          ["Horizon", "6-18 mo"],
          ["Sources", "18"]
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

  if (state === "loading") {
    for (const label of ["Direct exposure", "ETF routes", "Business angle"]) {
      const row = document.createElement("article");
      row.className = "hcimot-angle hcimot-angleLoading";
      const title = document.createElement("h3");
      title.textContent = label;
      row.append(title, buildSkeleton(), buildSkeleton());
      section.appendChild(row);
    }

    return section;
  }

  const topic = capture.kind === "image" ? "this image" : `"${capture.title}"`;
  const data = [
    {
      title: "Direct exposure",
      value: "NVDA +1.8%",
      text: `Look for public companies selling picks and shovels into ${topic}, then separate hype from revenue exposure.`
    },
    {
      title: "ETF routes",
      value: "BOTZ 64%",
      text: "Use relevance bars for broad baskets. Convenient, but the pure-play signal gets diluted fast."
    },
    {
      title: "Business angle",
      value: "$49/mo",
      text: "Turn repeated curiosity into a paid brief, lead list, or workflow tool before building anything heroic."
    }
  ];

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

  section.appendChild(buildRiskMeter());
  return section;
}

function buildSkeleton() {
  const skeleton = document.createElement("span");
  skeleton.className = "hcimot-skeleton";
  return skeleton;
}

function buildRiskMeter() {
  const risk = document.createElement("article");
  risk.className = "hcimot-risk";

  const label = document.createElement("span");
  label.textContent = "Risk";

  const blocks = document.createElement("div");
  blocks.setAttribute("aria-label", "Risk is 3 out of 5");

  for (let index = 0; index < 5; index += 1) {
    const block = document.createElement("i");
    if (index < 3) {
      block.className = "is-filled";
    }
    blocks.appendChild(block);
  }

  const copy = document.createElement("p");
  copy.textContent = "Promising enough to research. Still allergic to vibes-only conviction.";

  risk.append(label, blocks, copy);
  return risk;
}

function buildFooter() {
  const footer = document.createElement("footer");
  footer.className = "hcimot-footer";
  footer.textContent = "Research, not advice. Prices and tickers are placeholder UI until agents are connected.";
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

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "current page";
  }
}
