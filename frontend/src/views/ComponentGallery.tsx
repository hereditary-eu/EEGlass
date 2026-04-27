import {
  ClusteredScatterplotViewerMock,
  CorrelationHeatmapMock,
  PcaBiplotPanelMock,
  ScatterHistogramMock,
  SimilarityMatrixViewerMock,
} from "../components";
import { DataTableMock } from "../components/data-table";

export function ComponentGallery() {
  return (
    <>
      <p className="app-subtitle">
        These are standalone mock-backed components migrated into the new frontend. They are intentionally separate and
        do not share state with each other.
      </p>

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
    </>
  );
}
