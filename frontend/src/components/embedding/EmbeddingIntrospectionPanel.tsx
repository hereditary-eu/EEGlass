import { useMemo, useState } from "react";

import { DataTable } from "../data-table";
import type { DataRow } from "../../types";
import { EmbeddingPairwiseScatterplot } from "./EmbeddingPairwiseScatterplot";
import "./EmbeddingIntrospectionPanel.css";

export interface EmbeddingIntrospectionRow {
  id: string;
  rawEmbedding?: number[] | null;
  predictedClass?: string | null;
  metadata?: Record<string, string | number | null | undefined>;
}

interface EmbeddingIntrospectionPanelProps {
  rows: EmbeddingIntrospectionRow[];
  sourceDimension?: number;
  featureNames?: string[];
  itemLabel: string;
  tableTitle?: string;
  tableSubtitle?: string;
}

type TableViewMode = "numerical" | "heatmap";
const PREDICTED_CLASS_COLUMN = "Predicted class";
const UNKNOWN_PREDICTED_CLASS = "Unknown";

export function EmbeddingIntrospectionPanel({
  rows,
  sourceDimension,
  featureNames,
  itemLabel,
  tableTitle = "Band activations",
  tableSubtitle = "Select two activation columns to update the pairwise view.",
}: EmbeddingIntrospectionPanelProps) {
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [selectedFeatureColumns, setSelectedFeatureColumns] = useState<string[] | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<TableViewMode>("numerical");

  const featureColumns = useMemo(() => {
    const inferredDimension = rows.reduce(
      (maxDimension, row) => Math.max(maxDimension, row.rawEmbedding?.length ?? 0),
      sourceDimension ?? 0,
    );

    return Array.from({ length: inferredDimension }, (_, index) => getFeatureColumnName(featureNames, index));
  }, [featureNames, rows, sourceDimension]);

  const metadataColumns = useMemo(() => {
    const columns = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.metadata ?? {}).forEach((column) => columns.add(column));
    });
    return Array.from(columns);
  }, [rows]);

  const tableRows = useMemo<DataRow[]>(
    () =>
      rows.map((row) => {
        const tableRow: DataRow = {
          [itemLabel]: row.id,
          [PREDICTED_CLASS_COLUMN]: row.predictedClass ?? null,
        };

        metadataColumns.forEach((column) => {
          tableRow[column] = row.metadata?.[column] ?? null;
        });

        featureColumns.forEach((column, index) => {
          tableRow[column] = row.rawEmbedding?.[index] ?? null;
        });

        return tableRow;
      }),
    [featureColumns, itemLabel, metadataColumns, rows],
  );

  const defaultPair = useMemo(() => featureColumns.slice(0, 2), [featureColumns]);
  const activeFeatureColumns = selectedFeatureColumns ?? (defaultPair.length === 2 ? defaultPair : []);
  const tableColumns = useMemo(
    () => [itemLabel, ...metadataColumns, PREDICTED_CLASS_COLUMN, ...featureColumns],
    [featureColumns, itemLabel, metadataColumns],
  );

  const scatterData = useMemo(() => {
    if (activeFeatureColumns.length !== 2) {
      return [];
    }

    const [xColumn, yColumn] = activeFeatureColumns;
    const xIndex = featureColumns.indexOf(xColumn);
    const yIndex = featureColumns.indexOf(yColumn);
    if (xIndex < 0 || yIndex < 0) {
      return [];
    }

    return rows.flatMap((row) => {
      const xValue = row.rawEmbedding?.[xIndex];
      const yValue = row.rawEmbedding?.[yIndex];
      if (typeof xValue !== "number" || typeof yValue !== "number") {
        return [];
      }

      return [
        {
          id: row.id,
          x: xValue,
          y: yValue,
          predictedClass: row.predictedClass ?? UNKNOWN_PREDICTED_CLASS,
        },
      ];
    });
  }, [activeFeatureColumns, featureColumns, rows]);

  const handleColumnSelect = (columns: string[]) => {
    const featureSelection = columns.filter((column) => featureColumns.includes(column)).slice(-2);
    setSelectedFeatureColumns(featureSelection);
  };

  const restoreHiddenColumn = (column: string) => {
    setHiddenColumns((current) => current.filter((item) => item !== column));
  };

  const hideColumn = (column: string) => {
    setHiddenColumns((current) => (current.includes(column) ? current : [...current, column]));
  };

  if (!featureColumns.length || !tableRows.length) {
    return (
      <div className="embedding-introspection-empty">
        Raw embedding values are unavailable for this embedding response.
      </div>
    );
  }

  return (
    <div className="embedding-introspection-panel">
      <section className="embedding-introspection-table-section" aria-label="Raw embedding features">
        <DataTable
          title={tableTitle}
          subtitle={tableSubtitle}
          data={tableRows}
          columns={tableColumns}
          hiddenColumns={hiddenColumns}
          selectedColumns={activeFeatureColumns}
          onColumnHide={hideColumn}
          onHiddenColumnRestore={restoreHiddenColumn}
          onColumnSelect={handleColumnSelect}
          isExpanded={isTableExpanded}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onToggleExpanded={() => setIsTableExpanded((current) => !current)}
          menuOptions={{ canSort: true, canHide: true }}
        />
      </section>
      <section className="embedding-introspection-cluster-section" aria-label="Pairwise feature clustering">
        <div className="embedding-introspection-section-header">
          <div>
            <h3>Pairwise feature view</h3>
            <p>
              {activeFeatureColumns.length === 2
                ? `${activeFeatureColumns[0]} against ${activeFeatureColumns[1]}`
                : "Select two feature columns in the table."}
            </p>
          </div>
          <span>{scatterData.length} points</span>
        </div>
        {activeFeatureColumns.length === 2 && scatterData.length ? (
          <EmbeddingPairwiseScatterplot
            points={scatterData}
            xLabel={activeFeatureColumns[0]}
            yLabel={activeFeatureColumns[1]}
          />
        ) : (
          <div className="embedding-introspection-empty">Select two feature columns to plot a pairwise view.</div>
        )}
      </section>
    </div>
  );
}

function getFeatureColumnName(featureNames: string[] | undefined, index: number): string {
  return featureNames?.[index] || `Feature ${index + 1}`;
}
