export type PageContext = {
  url: string;
  title: string;
};

export type SelectionContext = {
  id: string;
  selectedText: string;
  page: PageContext;
  capturedAt: string;
};

export type ResearchRequest = {
  selectedText: string;
  page: PageContext;
};

export type ResearchSource = {
  id: number;
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
};

export type ResearchSection = {
  title: string;
  summary: string;
  bullets: string[];
  citations: number[];
};

export type ResearchResponse = {
  query: string;
  generatedAt: string;
  mode: "live" | "mock";
  model?: string;
  sections: ResearchSection[];
  sources: ResearchSource[];
  caveats: string[];
};
