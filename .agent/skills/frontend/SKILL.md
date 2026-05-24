---
name: frontend-skill
description: Use this skill for ANY UI work on "How Can I Make Money Off This" — the
  Chrome extension popup, the full-page dashboard tab, the landing page, onboarding
  screens, paywall states, or the Chrome Web Store listing. Triggers on any request
  involving extension UI, dashboard layout, landing page copy, popup design, credit
  counter display, asset rows, research output rendering, or visual treatment of
  financial data. Use it even if the user says "just make it look good" or "quick UI
  tweak" — all visual work on this product should follow this skill.
---

# hcimot frontend skill

## Product character

The name is the joke. The research is serious. The contrast between the two IS
the brand. Never corporate. Never get-rich-quick. Dry, a little funny, and
genuinely useful.

Think: Bloomberg if it had a personality and shipped as a Chrome extension.

---

## Visual thesis

Terminal-meets-finance. Dark by default. Monospace for all tickers, prices,
and numeric signals. Clean information density. Feels considered, not designed.

---

## Working model

Before building any surface, answer three things:

1. What did the user just do? (clicked extension / hit paywall / landed on homepage)
2. What do they need to know in the first 3 seconds?
3. What is the ONE action?

Each surface has one job. One dominant visual idea. One primary action.

---

## This is a Chrome extension — one deployment target

There is no separate web app. All UI lives inside the extension package:

```
packages/extension/
├── popup/          ← 360×500px click target. One job: fire the research.
├── dashboard/      ← Full-page tab (chrome-extension://[id]/dashboard.html)
├── onboarding/     ← Post-install screens (3 max)
└── landing/        ← Marketing page (optional, can be hosted separately)
```

The dashboard opens as a new tab via `chrome.tabs.create`. It is not a web app.
It does not deploy to Vercel. It ships in the extension zip.

---

## Extension popup (360×500px)

One job: confirm what was detected and queue the research.

Layout (top to bottom, no scrolling):
- Detected topic name (large, confident — this is the "wow" moment)
- Source pill (reddit.com/r/technology, twitter.com, etc.)
- Primary CTA button: "Research this →"
- Credit counter: "2 of 3 free uses this week" — always visible, never hidden
- Loading state: topic name + pulsing dot + "Researching…"
- Done state: "Open dashboard →" button

Rules:
- Everything above the fold. No scrolling ever.
- Credit counter uses muted text, not a warning color, until the user is at 0
- At 0 credits: replace CTA with upgrade prompt inline (no separate screen)
- Extension icon in toolbar shows a pulse dot while a job is running

---

## Dashboard tab (full page)

This is a data surface. Utility copy only. No marketing. No hero section.

### Information hierarchy

```
[Source pill]  [Topic title — largest text on page]        [Agents: ● running]

[Trend Score] [Investability] [Time Horizon] [Sources Scanned]   ← metrics strip

[Direct stocks — left col]    [ETFs + relevance bars — right col]

[Risk meter]  [Agent insights]  [How to get in]                  ← 3-col row

[Bull case]   [Bear case]                                        ← side by side

[Related themes — pill buttons that fire new research]
```

### Rules

- Tickers and prices are the loudest text after the topic title
- Use monospace font for ALL tickers, prices, percentages, and numeric signals
- ETF relevance uses a horizontal bar, not a number alone
- Risk uses a 5-block meter (filled blocks = severity), not a label alone
- Positive deltas: green. Negative: red. One brand accent for CTAs. That's it.
- No cards unless the card IS the interaction (asset row, insight row)
- No section headings that could appear in an ad
- "Research, not advice" disclaimer: always present, never the loudest thing
- Agents-running state: pulse dot (1.8s ease-in-out, opacity 1→0.3→1). No spinner.

### Crypto surfaces

When the topic resolves to crypto assets, add below the ETF column:
- Token price + 24h change (same visual weight as stock price)
- On-chain strip: holder count trend, DEX volume, wallet activity indicator
- Risk meter defaults to amber/red — be honest about crypto volatility
- Label: "Token" not "Stock". Never conflate the two.

### Loading states

Research takes time. The dashboard must feel alive during the wait:
- Topic title and source pill appear immediately (from extension state)
- Metrics strip shows skeleton bars
- Each section reveals as its agent completes (staggered, not all-at-once)
- Never show an empty dashboard. Never show a full-page spinner.

---

## Paywall / upgrade state

Triggered when credits hit 0.

Rules:
- Show the topic they just tried to research — make the FOMO tangible
- Headline: "$9/month — unlimited research"
- One button. No feature matrix. No tier comparison.
- Supporting line: "Cancel anytime." — plain English, no asterisks
- Slides up as a bottom sheet, not a modal. Dismissible.
- Never block the dashboard if it already loaded. Paywall is for new jobs only.

---

## Landing page (if needed)

Default sequence:
1. Hero: name + one-line promise + CTA + dashboard preview screenshot
2. Demo: show a real output for a recognizable trend
3. How it works: 3 steps (see it, click it, invest in it)
4. Pricing: 3 free / week. One sentence. No feature matrix.
5. Final CTA: "Add to Chrome — it's free"

Hero rules:
- "How Can I Make Money Off This" IS the headline. Never shorten it in the hero.
- Subhead is one sentence. No body copy.
- CTA is "Add to Chrome — it's free"
- The dashboard preview is the dominant visual — a real screenshot, not mockup art
- Dark background. The dashboard preview is the only color source.
- No floating stat strips, logo clouds, pill soup, or hero cards
- Full-bleed background. Inner text column constrained. No shared max-width on the hero.

Copy rules:
- Never write "powerful", "seamless", "unlock", or "supercharge"
- The name is the joke — don't explain it
- If deleting 30% of the copy improves the page, keep deleting

---

## Onboarding (post-install, 3 screens max)

Screen 1: "You just installed the best finance tool with the worst name."
Screen 2: Show the 3-step flow with a short animation or screenshot
Screen 3: "Try it on something you saw today" — open browser, no CTA to a specific page

No feature tours. No tooltips. No progress bars beyond the 3-dot indicator.

---

## Motion

- Popup → dashboard: topic title carries over as a shared element if possible
- Dashboard sections: fade-up reveal as each agent completes (80ms stagger between sections)
- Pulse dot: 1.8s ease-in-out infinite, opacity 1 → 0.3 → 1
- Paywall sheet: slides up from bottom (300ms ease-out)
- Asset row hover: subtle background tint, no border flash
- Landing hero: product name fades in, then dashboard preview loads panel by panel
  (mirrors the real loading experience — this IS the product demo)
- All animations: respect prefers-reduced-motion

---

## Typography

- Two typefaces max: one sans (UI, copy), one mono (all financial data)
- Monospace mandatory for: tickers, prices, percentages, on-chain numbers,
  credit counts, job IDs, trend scores
- No font size below 11px
- Heading weights: 500 only. Never 600 or 700 — too heavy.

---

## Color system

- Background: dark by default (#0d0d0d or equivalent)
- Text: primary white-ish, secondary muted gray
- Positive delta: green (#3B6D11 range)
- Negative delta: red (#993C1D range)
- Brand accent (CTAs only): one color, used sparingly
- Crypto risk overlay: amber (#BA7517 range)
- No gradients behind routine UI
- No decorative shadows

---

## Hard rules

- Dark mode is the default. Light mode is optional.
- Monospace for ALL financial data. No exceptions.
- No hero section on the dashboard tab.
- No separate web app. Everything in the extension.
- "How Can I Make Money Off This" is never shortened in hero or primary contexts.
- No more than one accent color.
- No gradient backgrounds on routine surfaces.
- No feature matrix on the paywall.
- The popup never scrolls.

---

## Litmus checks

- Can someone scan the dashboard (headlines + numbers only) and understand the
  research without reading a sentence?
- Is the popup usable in under 5 seconds?
- Does the landing page make someone laugh and then immediately want to install?
- Would a serious investor trust the data density?
- Would a Reddit user screenshot and share the dashboard output?
- Is the brand name unmissable in the first viewport of the landing page?
- Does the monospace treatment make financial data feel authoritative?