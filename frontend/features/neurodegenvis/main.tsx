// import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Feature from "./Feature.tsx";
// import Test from "./testScripts/testApp.tsx";

createRoot(document.getElementById("root")!).render(
  // <StrictMode>
  <Feature />,
  // {/* <Test /> */}
  // </StrictMode>
);
