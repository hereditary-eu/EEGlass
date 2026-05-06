import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./layouts/AppLayout";
import { ComponentGallery } from "./views/ComponentGallery";
import { MainPanel } from "./views/MainPanel";
import { OverviewPanel } from "./views/OverviewPanel";
import "./styles/index.css";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPanel />} />
        <Route path="workspace/:datasetId/:subjectId" element={<MainPanel />} />
        <Route path="components" element={<ComponentGallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
