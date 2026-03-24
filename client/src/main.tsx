import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { prefetchAllTeamLogos } from "./utils/teamLogos";

prefetchAllTeamLogos();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <App />
      </div>
    </BrowserRouter>
  </StrictMode>
);
