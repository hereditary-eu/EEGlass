/**
 * Browser entry point for the React app.
 *
 * It is referenced from `frontend/index.html`.
 */

import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";

const elem = document.getElementById("root")!;
const app = (
  <BrowserRouter basename={process.env.BUN_PUBLIC_BASE_PATH ?? "/"}>
    <App />
  </BrowserRouter>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}
