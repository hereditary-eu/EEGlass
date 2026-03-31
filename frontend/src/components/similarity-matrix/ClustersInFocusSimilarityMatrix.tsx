import { useEffect, useMemo, useRef, useState } from "react";

import "./ClusterSimilarityMatrix.css";
import { ClusterSimilarityMatrix } from "./ClusterSimilarityMatrix";
import type { ClusterSimilarityResponse } from "../../types";

const MOCK_FEATURES = [
  "age",
  "education",
  "mmse",
  "moca",
  "fluency",
  "memory",
  "motor_score",
  "attention",
  "reaction_time",
  "language",
  "sleep_index",
  "visuospatial",
];

function createMockSimilarities(
  selectedColumns: [string, string],
  selectedCluster: number,
  availableFeatures: string[],
): ClusterSimilarityResponse[] {
  return availableFeatures
    .flatMap((feature1, rowIndex) =>
      availableFeatures.slice(rowIndex + 1).map((feature2, offset) => {
        const colIndex = rowIndex + offset + 1;
        const selectedBoost =
          selectedColumns.includes(feature1) || selectedColumns.includes(feature2) ? 0.18 : 0;
        const lexicalFactor = Math.abs(feature1.length - feature2.length) * 0.02;
        const distanceFactor = Math.abs(rowIndex - colIndex) / Math.max(1, availableFeatures.length - 1);
        const clusterShift = selectedCluster * 0.03;
        const wave = (Math.cos((rowIndex + 1) * (colIndex + 2)) + 1) * 0.07;
        const similarity = Math.max(
          0.08,
          Math.min(0.98, 0.86 - lexicalFactor - distanceFactor * 0.42 + selectedBoost + clusterShift + wave),
        );

        return {
          feature1,
          feature2,
          cluster_id: selectedCluster,
          similarity: Number(similarity.toFixed(4)),
        };
      }),
    )
    .sort((left, right) => right.similarity - left.similarity);
}

interface SimilarityMatrixViewerProps {
  availableFeatures: string[];
  selectedCluster: number;
  selectedColumns: [string, string];
}

export function SimilarityMatrixViewer({
  availableFeatures,
  selectedCluster,
  selectedColumns,
}: SimilarityMatrixViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 760, height: 520 });
  const [viewMode, setViewMode] = useState<"similarity" | "matrix">("matrix");
  const [filterHighSimilarity, setFilterHighSimilarity] = useState(false);

  const similarities = useMemo(
    () => createMockSimilarities(selectedColumns, selectedCluster, availableFeatures),
    [availableFeatures, selectedCluster, selectedColumns],
  );

  const filteredSimilarities = useMemo(
    () => (filterHighSimilarity ? similarities.filter((item) => item.similarity > 0.5) : similarities),
    [filterHighSimilarity, similarities],
  );

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) {
        return;
      }

      const bounds = containerRef.current.getBoundingClientRect();
      setDimensions({
        width: Math.max(320, Math.floor(bounds.width)),
        height: Math.max(360, Math.floor(bounds.height)),
      });
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="cif-similarity-card">
      <div className="cif-similarity-header">
        <p className="cif-similarity-meta">
          Mocked backend response for cluster <strong>{selectedCluster + 1}</strong> and feature pair{" "}
          <strong>
            {selectedColumns[0]} / {selectedColumns[1]}
          </strong>
          .
        </p>
        <div className="cif-similarity-view-mode">
          <button
            type="button"
            className={`cif-similarity-view-button ${viewMode === "similarity" ? "is-active" : ""}`}
            onClick={() => setViewMode("similarity")}
          >
            List
          </button>
          <button
            type="button"
            className={`cif-similarity-view-button ${viewMode === "matrix" ? "is-active" : ""}`}
            onClick={() => setViewMode("matrix")}
          >
            Matrix
          </button>
        </div>
      </div>

      {viewMode === "similarity" ? (
        <div className="cif-similarity-list">
          <div className="cif-similarity-list-toolbar">
            <div className="cif-similarity-cluster-info">
              Cluster {selectedCluster + 1} of feature pair:{" "}
              <i>
                {selectedColumns[0]} and {selectedColumns[1]}
              </i>
            </div>
            <label className="cif-similarity-filter">
              <input
                type="checkbox"
                checked={filterHighSimilarity}
                onChange={(event) => setFilterHighSimilarity(event.target.checked)}
              />
              Show only high similarity (&gt; 50%)
            </label>
          </div>

          <div className="cif-similarity-table-container">
            <table className="cif-similarity-table">
              <thead>
                <tr>
                  <th>Feature 1</th>
                  <th>Feature 2</th>
                  <th>Cluster</th>
                  <th>Jaccard Similarity</th>
                </tr>
              </thead>
              <tbody>
                {filteredSimilarities.length > 0 ? (
                  filteredSimilarities.map((similarity, index) => (
                    <tr key={`${similarity.feature1}-${similarity.feature2}`} className={index % 2 === 0 ? "is-odd" : "is-even"}>
                      <td>{similarity.feature1}</td>
                      <td>{similarity.feature2}</td>
                      <td>{similarity.cluster_id + 1}</td>
                      <td>{(similarity.similarity * 100).toFixed(1)}%</td>
                    </tr>
                  ))
                ) : (
                  <tr className="is-odd">
                    <td colSpan={4} className="cif-similarity-empty-cell">
                      No clusters match the current filter criteria
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="cif-similarity-stats">
            Showing {filteredSimilarities.length} of {similarities.length} similar clusters
          </div>
        </div>
      ) : (
        <div ref={containerRef} style={{ minHeight: 540 }}>
          <ClusterSimilarityMatrix
            width={dimensions.width}
            height={dimensions.height}
            selectedCluster={selectedCluster}
            selectedColumns={selectedColumns}
            availableFeatures={availableFeatures}
          />
        </div>
      )}
    </div>
  );
}

export function SimilarityMatrixViewerMock() {
  return <SimilarityMatrixViewer availableFeatures={MOCK_FEATURES} selectedCluster={1} selectedColumns={["mmse", "moca"]} />;
}
