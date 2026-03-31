import {
  ClusteredScatterplotViewerMock,
  CorrelationHeatmapMock,
  PcaBiplotPanelMock,
  ScatterHistogramMock,
  SimilarityMatrixViewerMock,
} from "./components";
import { DataTableMock } from "./components/data-table";
import "./styles/index.css";

export function App() {
  return (
    <main className="app-shell">
      <div className="app-layout">
        <header className="app-header">
          <p className="app-eyebrow">All In On EEG</p>
          <h1 className="app-title">Retained Components</h1>
          <p className="app-subtitle">
            These are standalone mock-backed components migrated into the new frontend. They are intentionally separate
            and do not share state with each other.
          </p>
        </header>

        <section className="app-section">
          <h2 className="app-section-title">Correlation Heatmap</h2>
          <CorrelationHeatmapMock />
        </section>

        <section className="app-section">
          <h2 className="app-section-title">Scatterplot / Histogram</h2>
          <ScatterHistogramMock />
        </section>

        <section className="app-section">
          <h2 className="app-section-title">PCA Biplot</h2>
          <PcaBiplotPanelMock />
        </section>

        <section className="app-section">
          <h2 className="app-section-title">Clustered Scatterplot</h2>
          <ClusteredScatterplotViewerMock />
        </section>

        <section className="app-section">
          <h2 className="app-section-title">Similarity Matrix</h2>
          <SimilarityMatrixViewerMock />
        </section>

        <section className="app-section">
          <h2 className="app-section-title">Data Table</h2>
          <DataTableMock title="Data" />
        </section>
      </div>

    </main>
  );
}

export default App;
