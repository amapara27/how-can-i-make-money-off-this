import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./research.css";
import { ResearchPage } from "./ResearchPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResearchPage />
  </StrictMode>
);
