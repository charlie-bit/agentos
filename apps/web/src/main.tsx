import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { sessionId } from "./lib/api";
import "./index.css";

const el = document.getElementById("root");
// The boundary needs an identity for the prefilled issue, never content.
if (el)
  createRoot(el).render(
    <StrictMode>
      <ErrorBoundary preset={document.documentElement.dataset.preset ?? "unknown"} sessionId={sessionId()}>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
