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

export type ResearchSection = {
  title: string;
  summary: string;
  bullets: string[];
};

export type ResearchResponse = {
  query: string;
  generatedAt: string;
  sections: ResearchSection[];
  caveats: string[];
};
