import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./layouts/AppLayout";
import { ComponentGallery } from "./views/ComponentGallery";
import { OverviewPanel } from "./views/OverviewPanel";
import { PatientView } from "./views/PatientView";
import "katex/dist/katex.min.css";
import "./styles/index.css";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPanel />} />
        <Route path="datasets/:datasetId/patients/:subjectId" element={<PatientView />} />
        <Route path="components" element={<ComponentGallery />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
