/**
 * Browser entry point for the React app.
 *
 * It is referenced from `frontend/index.html`.
 */

import { createRoot } from "react-dom/client";
import { App } from "./App";

const elem = document.getElementById("root")!;
const app = <App />;

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}
