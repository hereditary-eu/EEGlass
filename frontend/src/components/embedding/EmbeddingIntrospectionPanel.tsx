import { useEffect, useMemo, useState } from "react";

import { DataTable } from "../data-table";
import type { DataRow, ModelFeatureImportanceResponse, ShapleyValueItem } from "../../types";
import { CorrelationHeatmap } from "../correlation-heatmap";
import { EmbeddingPairwiseScatterplot } from "./EmbeddingPairwiseScatterplot";
import "./EmbeddingIntrospectionPanel.css";

export interface EmbeddingIntrospectionRow {
  id: string;
  rawEmbedding?: number[] | null;
  predictedClass?: string | null;
  metadata?: Record<string, string | number | null | undefined>;
}

export interface EmbeddingFeatureImportanceRequest {
  requestKey: string;
  load: () => Promise<ModelFeatureImportanceResponse>;
}

interface EmbeddingIntrospectionPanelProps {
  rows: EmbeddingIntrospectionRow[];
  sourceDimension?: number;
  featureNames?: string[];
  itemLabel: string;
  tableTitle?: string;
  tableSubtitle?: string;
  featureImportanceRequest?: EmbeddingFeatureImportanceRequest;
  showCorrelationHeatmap?: boolean;
}

type TableViewMode = "numerical" | "heatmap";
const PREDICTED_CLASS_COLUMN = "Predicted class";
const UNKNOWN_PREDICTED_CLASS = "Unknown";
const featureImportanceResponseCache = new Map<string, ModelFeatureImportanceResponse>();
const featureImportancePromiseCache = new Map<string, Promise<ModelFeatureImportanceResponse>>();

export function EmbeddingIntrospectionPanel({
  rows,
  sourceDimension,
  featureNames,
  itemLabel,
  tableTitle = "Band activations",
  tableSubtitle = "Select two activation columns to update the pairwise view.",
  featureImportanceRequest,
  showCorrelationHeatmap = true,
}: EmbeddingIntrospectionPanelProps) {
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [selectedFeatureColumns, setSelectedFeatureColumns] = useState<string[] | null>(null);
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<TableViewMode>("numerical");
  const [featureImportanceResponse, setFeatureImportanceResponse] = useState<ModelFeatureImportanceResponse | null>(
    null,
  );
  const [isLoadingFeatureImportance, setIsLoadingFeatureImportance] = useState(false);
  const [featureImportanceError, setFeatureImportanceError] = useState<string | null>(null);

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
  const shapleyValues = useMemo<ShapleyValueItem[] | null>(() => {
    if (featureImportanceResponse?.status !== "ok" || !featureImportanceResponse.feature_importances.length) {
      return null;
    }

    return featureImportanceResponse.feature_importances.map((item) => ({
      feature: item.feature,
      "SHAP Value": item.importance,
    }));
  }, [featureImportanceResponse]);
  const resolvedTableSubtitle = useMemo(() => {
    if (isLoadingFeatureImportance) {
      return `${tableSubtitle} Calculating SHAP feature importance...`;
    }
    if (featureImportanceError) {
      return `${tableSubtitle} Feature importance unavailable: ${featureImportanceError}`;
    }
    if (featureImportanceResponse?.status === "insufficient_data") {
      return `${tableSubtitle} Feature importance needs more labeled rows.`;
    }
    if (featureImportanceResponse?.status === "insufficient_classes") {
      return `${tableSubtitle} Feature importance needs at least two target classes.`;
    }
    return tableSubtitle;
  }, [featureImportanceError, featureImportanceResponse?.status, isLoadingFeatureImportance, tableSubtitle]);

  const defaultPair = useMemo(() => featureColumns.slice(0, 2), [featureColumns]);
  const activeFeatureColumns = selectedFeatureColumns ?? (defaultPair.length === 2 ? defaultPair : []);
  const activeXColumn = activeFeatureColumns[0];
  const activeYColumn = activeFeatureColumns[1];
  const activeFeaturePair: [string, string] | null =
    activeFeatureColumns.length === 2 && activeXColumn && activeYColumn ? [activeXColumn, activeYColumn] : null;
  const tableColumns = useMemo(
    () => [itemLabel, ...metadataColumns, PREDICTED_CLASS_COLUMN, ...featureColumns],
    [featureColumns, itemLabel, metadataColumns],
  );
  const correlationRows = useMemo(
    () =>
      rows.map((row, rowIndex) => {
        const datum: Record<string, string | number | boolean> = {
          id: row.id,
          record_id: rowIndex,
        };

        featureColumns.forEach((column, index) => {
          const value = row.rawEmbedding?.[index];
          datum[column] = typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
        });

        return datum;
      }),
    [featureColumns, rows],
  );
  useEffect(() => {
    if (!featureImportanceRequest) {
      setFeatureImportanceResponse(null);
      setIsLoadingFeatureImportance(false);
      setFeatureImportanceError(null);
      return;
    }

    const cachedResponse = featureImportanceResponseCache.get(featureImportanceRequest.requestKey);
    if (cachedResponse) {
      setFeatureImportanceResponse(cachedResponse);
      setIsLoadingFeatureImportance(false);
      setFeatureImportanceError(null);
      return;
    }

    let isCurrent = true;
    setIsLoadingFeatureImportance(true);
    setFeatureImportanceError(null);

    let promise = featureImportancePromiseCache.get(featureImportanceRequest.requestKey);
    if (!promise) {
      promise = featureImportanceRequest.load();
      featureImportancePromiseCache.set(featureImportanceRequest.requestKey, promise);
    }

    promise
      .then((response) => {
        featureImportanceResponseCache.set(featureImportanceRequest.requestKey, response);
        if (isCurrent) {
          setFeatureImportanceResponse(response);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setFeatureImportanceResponse(null);
          setFeatureImportanceError(error instanceof Error ? error.message : "request failed");
        }
      })
      .finally(() => {
        featureImportancePromiseCache.delete(featureImportanceRequest.requestKey);
        if (isCurrent) {
          setIsLoadingFeatureImportance(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [featureImportanceRequest]);

  const scatterData = useMemo(() => {
    if (!activeFeaturePair) {
      return [];
    }

    const [xColumn, yColumn] = activeFeaturePair;
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
  }, [activeFeaturePair, featureColumns, rows]);

  const handleColumnSelect = (columns: string[]) => {
    const featureSelection = columns.filter((column) => featureColumns.includes(column)).slice(-2);
    setSelectedFeatureColumns(featureSelection);
  };

  const handleFeaturePairSelect = (featurePair: [string, string]) => {
    setSelectedFeatureColumns(featurePair);
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
      <div
        className={
          showCorrelationHeatmap ? "embedding-introspection-left-stack" : "embedding-introspection-left-stack--single"
        }
      >
        <section className="embedding-introspection-table-section" aria-label="Raw embedding features">
          <DataTable
            title={tableTitle}
            subtitle={resolvedTableSubtitle}
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
            shapleyValues={shapleyValues}
            numericDisplayPrecision={4}
            numericDisplayColumns={featureColumns}
          />
        </section>
        {showCorrelationHeatmap && activeFeaturePair ? (
          <section className="embedding-introspection-correlation-section" aria-label="Feature correlation heatmap">
            <CorrelationHeatmap
              patientsData={correlationRows}
              covariateFeatures={featureColumns}
              selectedFeaturePair={activeFeaturePair}
              onSelectedFeaturePairChange={handleFeaturePairSelect}
            />
          </section>
        ) : null}
      </div>
      <section className="embedding-introspection-cluster-section" aria-label="Pairwise feature clustering">
        <div className="embedding-introspection-section-header">
          <div>
            <h3>Pairwise feature view</h3>
            <p>
              {activeFeaturePair
                ? `${activeFeaturePair[0]} against ${activeFeaturePair[1]}`
                : "Select two feature columns in the table."}
            </p>
          </div>
          <span>{scatterData.length} points</span>
        </div>
        {activeFeaturePair && scatterData.length ? (
          <EmbeddingPairwiseScatterplot
            points={scatterData}
            xLabel={activeFeaturePair[0]}
            yLabel={activeFeaturePair[1]}
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
