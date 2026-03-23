import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Feature from "./Feature.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Feature />
  </StrictMode>,
);
