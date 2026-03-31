import React, { useCallback, useMemo, useState } from "react";
import { VariableSizeGrid as Grid } from "react-window";

import "./ClusterSimilarityMatrix.css";

const rootClass = "cif-cluster-similarity-matrix";
const styles = {
  container: "container",
  header: "header",
  viewport: "viewport",
  grid: "grid",
  cell: "cell",
  diagonal: "diagonal",
  headerCell: "headerCell",
  rowHeader: "rowHeader",
  columnHeader: "columnHeader",
  cornerCell: "cornerCell",
  heatmapCell: "heatmapCell",
  tooltip: "tooltip",
  tooltipLine: "tooltipLine",
  loading: "loading",
  empty: "empty",
  controls: "controls",
  controlButton: "controlButton",
  configPanel: "configPanel",
  configSection: "configSection",
  aggregationIndicator: "aggregationIndicator",
  colorRangeIndicator: "colorRangeIndicator",
  colorbarContainer: "colorbarContainer",
  colorbarGradient: "colorbarGradient",
  colorbarLabels: "colorbarLabels",
  configGroup: "configGroup",
  configSelect: "configSelect",
} as const;

interface FeaturePairMatrixData {
  features: string[];
  similarities: number[][];
  stats: {
    min_similarity: number;
    max_similarity: number;
    size: number;
  };
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: {
    rowFeature: string;
    colFeature: string;
    similarity: string;
  } | null;
}

interface CellData {
  featurePairMatrixData: FeaturePairMatrixData;
  onCellHover: (rowIndex: number, colIndex: number, event: React.MouseEvent) => void;
  onCellLeave: () => void;
  colorRangeMode: "min-max" | "full";
}

interface ClusterSimilarityMatrixProps {
  width: number;
  height: number;
  selectedCluster: number;
  selectedColumns: [string, string];
  availableFeatures: string[];
}

const CELL_SIZE = 16;
const ROW_HEADER_WIDTH = 120;
const COLUMN_HEADER_HEIGHT = 80;

const MatrixCell = React.memo<{
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: CellData;
}>(({ columnIndex, rowIndex, style, data }) => {
  const { featurePairMatrixData, onCellHover, onCellLeave, colorRangeMode } = data;

  if (rowIndex === 0 && columnIndex === 0) {
    return (
      <div style={style} className={`${styles.headerCell} ${styles.cornerCell}`}>
        Features
      </div>
    );
  }

  if (rowIndex === 0) {
    const feature = featurePairMatrixData.features[columnIndex - 1];
    return (
      <div style={style} className={`${styles.headerCell} ${styles.columnHeader}`} title={feature}>
        {feature}
      </div>
    );
  }

  if (columnIndex === 0) {
    const feature = featurePairMatrixData.features[rowIndex - 1];
    return (
      <div style={style} className={`${styles.headerCell} ${styles.rowHeader}`} title={feature}>
        {feature}
      </div>
    );
  }

  const dataRowIndex = rowIndex - 1;
  const dataColIndex = columnIndex - 1;
  const similarity = featurePairMatrixData.similarities[dataRowIndex]?.[dataColIndex] ?? 0;
  const isDiagonal = dataRowIndex === dataColIndex;

  const normalizedValue =
    colorRangeMode === "full"
      ? similarity
      : featurePairMatrixData.stats.max_similarity !== featurePairMatrixData.stats.min_similarity
        ? (similarity - featurePairMatrixData.stats.min_similarity) /
          (featurePairMatrixData.stats.max_similarity - featurePairMatrixData.stats.min_similarity)
        : 0.5;

  const cellStyle = {
    ...style,
    "--normalized-value": normalizedValue,
  } as React.CSSProperties;

  return (
    <div
      style={cellStyle}
      className={`${styles.cell} ${isDiagonal ? styles.diagonal : ""}`}
      onMouseEnter={(event) => !isDiagonal && onCellHover(dataRowIndex, dataColIndex, event)}
      onMouseLeave={onCellLeave}
    >
      {!isDiagonal ? <div className={styles.heatmapCell} /> : null}
    </div>
  );
});

MatrixCell.displayName = "MatrixCell";

function reorderFeatures(
  features: string[],
  similarities: number[][],
  reorderMethod: "none" | "optimal" | "average",
  selectedColumns: [string, string],
) {
  if (reorderMethod === "none") {
    return { features, similarities };
  }

  const averageScores = features.map((_, index) => ({
    index,
    score: similarities[index].reduce((sum, value) => sum + value, 0) / similarities[index].length,
    selected: selectedColumns.includes(features[index]),
  }));

  const sortedIndexes =
    reorderMethod === "average"
      ? averageScores.sort((left, right) => right.score - left.score || Number(right.selected) - Number(left.selected))
      : averageScores.sort(
          (left, right) => Number(right.selected) - Number(left.selected) || right.score - left.score,
        );

  const order = sortedIndexes.map((entry) => entry.index);
  const orderedFeatures = order.map((index) => features[index]);
  const orderedSimilarities = order.map((rowIndex) => order.map((colIndex) => similarities[rowIndex][colIndex]));

  return { features: orderedFeatures, similarities: orderedSimilarities };
}

function aggregateSimilarity(baseValue: number, aggregationMethod: string) {
  switch (aggregationMethod) {
    case "min":
      return Math.max(0, baseValue - 0.12);
    case "avg":
      return Math.min(1, Math.max(0, baseValue - 0.04));
    case "median":
      return Math.min(1, Math.max(0, baseValue + 0.02));
    default:
      return Math.min(1, Math.max(0, baseValue + 0.08));
  }
}

function createMockFeaturePairSimilarityMatrix(
  selectedColumns: [string, string],
  selectedCluster: number,
  availableFeatures: string[],
  aggregationMethod: string,
  reorderMethod: "none" | "optimal" | "average",
): FeaturePairMatrixData {
  const features = [...availableFeatures];
  const selectedSet = new Set(selectedColumns);

  const similarities = features.map((rowFeature, rowIndex) =>
    features.map((colFeature, colIndex) => {
      if (rowIndex === colIndex) {
        return 1;
      }

      const lexicalDistance = Math.abs(rowFeature.length - colFeature.length) * 0.015;
      const cyclicDistance = Math.abs(rowIndex - colIndex) / Math.max(1, features.length - 1);
      const pairBoost = selectedSet.has(rowFeature) || selectedSet.has(colFeature) ? 0.18 : 0;
      const clusterShift = selectedCluster * 0.035;
      const trigNoise = (Math.sin((rowIndex + 1) * (colIndex + 2) + selectedCluster) + 1) * 0.06;

      const baseValue = Math.max(0.08, 0.92 - cyclicDistance * 0.48 - lexicalDistance + pairBoost + clusterShift + trigNoise);
      return Number(aggregateSimilarity(baseValue, aggregationMethod).toFixed(4));
    }),
  );

  const reordered = reorderFeatures(features, similarities, reorderMethod, selectedColumns);
  const nonDiagonalValues = reordered.similarities.flatMap((row, rowIndex) =>
    row.filter((_, colIndex) => colIndex !== rowIndex),
  );

  return {
    features: reordered.features,
    similarities: reordered.similarities,
    stats: {
      min_similarity: Math.min(...nonDiagonalValues),
      max_similarity: Math.max(...nonDiagonalValues),
      size: reordered.features.length,
    },
  };
}

export function ClusterSimilarityMatrix({
  width,
  height,
  selectedCluster,
  selectedColumns,
  availableFeatures,
}: ClusterSimilarityMatrixProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [aggregationMethod, setAggregationMethod] = useState("max");
  const [colorRangeMode, setColorRangeMode] = useState<"min-max" | "full">("min-max");
  const [reorderMethod, setReorderMethod] = useState<"none" | "optimal" | "average">("none");
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: null,
  });

  const featurePairMatrixData = useMemo(
    () =>
      createMockFeaturePairSimilarityMatrix(
        selectedColumns,
        selectedCluster,
        availableFeatures,
        aggregationMethod,
        reorderMethod,
      ),
    [aggregationMethod, availableFeatures, reorderMethod, selectedCluster, selectedColumns],
  );

  const handleCellHover = useCallback(
    (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
      const similarity = featurePairMatrixData.similarities[rowIndex]?.[colIndex];
      const rowFeature = featurePairMatrixData.features[rowIndex];
      const colFeature = featurePairMatrixData.features[colIndex];

      if (similarity !== undefined && rowFeature && colFeature) {
        setTooltip({
          visible: true,
          x: event.clientX + 10,
          y: event.clientY - 60,
          content: {
            rowFeature,
            colFeature,
            similarity: `${(similarity * 100).toFixed(1)}%`,
          },
        });
      }
    },
    [featurePairMatrixData],
  );

  const handleCellLeave = useCallback(() => {
    setTooltip((previous) => ({ ...previous, visible: false }));
  }, []);

  const cellData = useMemo<CellData>(
    () => ({
      featurePairMatrixData,
      onCellHover: handleCellHover,
      onCellLeave: handleCellLeave,
      colorRangeMode,
    }),
    [colorRangeMode, featurePairMatrixData, handleCellHover, handleCellLeave],
  );

  const gridSize = featurePairMatrixData.features.length + 1;
  const getColumnWidth = (index: number) => (index === 0 ? ROW_HEADER_WIDTH : CELL_SIZE);
  const getRowHeight = (index: number) => (index === 0 ? COLUMN_HEADER_HEIGHT : CELL_SIZE);
  const totalWidth = ROW_HEADER_WIDTH + (gridSize - 1) * CELL_SIZE;
  const totalHeight = COLUMN_HEADER_HEIGHT + (gridSize - 1) * CELL_SIZE;
  const gridWidth = Math.min(width, totalWidth);
  const gridHeight = Math.min(height - 40, totalHeight);

  return (
    <div className={`${rootClass} ${styles.container}`}>
      <div className={styles.header}>
        <div>
          Feature Pair Matrix for Cluster {selectedCluster + 1} ({selectedColumns[0]}, {selectedColumns[1]}):{" "}
          {featurePairMatrixData.features.length} features,
          <span className={styles.aggregationIndicator}> Aggregation: {aggregationMethod.toUpperCase()}, </span>
          <span className={styles.colorRangeIndicator}>
            {" "}
            Color Range: {colorRangeMode === "full" ? "0-100%" : "Min-Max"}
          </span>
        </div>
        <div className={styles.controls}>
          <button
            className={styles.controlButton}
            onClick={() => setShowConfig((value) => !value)}
            title="Configure matrix options"
            type="button"
          >
            {"\u2699"}
          </button>
        </div>
      </div>

      {showConfig ? (
        <div className={styles.configPanel}>
          <div className={styles.configSection}>
            <h4>Aggregation</h4>
            <div className={styles.configGroup}>
              <label htmlFor="similarity-aggregation">Aggregation Method:</label>
              <select
                id="similarity-aggregation"
                value={aggregationMethod}
                onChange={(event) => setAggregationMethod(event.target.value)}
                className={styles.configSelect}
              >
                <option value="max">Maximum</option>
                <option value="avg">Average</option>
                <option value="min">Minimum</option>
                <option value="median">Median</option>
              </select>
            </div>
          </div>

          <div className={styles.configSection}>
            <h4>Color Scale</h4>
            <div className={styles.configGroup}>
              <label htmlFor="similarity-color-range">Color Range:</label>
              <select
                id="similarity-color-range"
                value={colorRangeMode}
                onChange={(event) => setColorRangeMode(event.target.value as "min-max" | "full")}
                className={styles.configSelect}
              >
                <option value="min-max">Min-Max Range</option>
                <option value="full">Full Range (0-100%)</option>
              </select>
            </div>
          </div>

          <div className={styles.configSection}>
            <h4>Matrix Ordering</h4>
            <div className={styles.configGroup}>
              <label htmlFor="similarity-reorder">Reorder Method:</label>
              <select
                id="similarity-reorder"
                value={reorderMethod}
                onChange={(event) => setReorderMethod(event.target.value as "none" | "optimal" | "average")}
                className={styles.configSelect}
              >
                <option value="none">Original Order</option>
                <option value="optimal">Selected-Pair First</option>
                <option value="average">Average Similarity</option>
              </select>
            </div>
          </div>

          <div className={styles.configSection}>
            <h4>Similarity Color Scale</h4>
            <div className={styles.configGroup}>
              <div className={styles.colorbarContainer}>
                <div className={styles.colorbarGradient}></div>
                <div className={styles.colorbarLabels}>
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.viewport}>
        <Grid
          className={styles.grid}
          columnCount={gridSize}
          rowCount={gridSize}
          columnWidth={getColumnWidth}
          rowHeight={getRowHeight}
          width={gridWidth}
          height={gridHeight}
          itemData={cellData}
        >
          {MatrixCell}
        </Grid>
      </div>

      {tooltip.visible && tooltip.content ? (
        <div
          className={styles.tooltip}
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className={styles.tooltipLine}>
            <strong>Row:</strong> {tooltip.content.rowFeature}
          </div>
          <div className={styles.tooltipLine}>
            <strong>Col:</strong> {tooltip.content.colFeature}
          </div>
          <div className={styles.tooltipLine}>
            <strong>Similarity:</strong> {tooltip.content.similarity}
          </div>
        </div>
      ) : null}
    </div>
  );
}
