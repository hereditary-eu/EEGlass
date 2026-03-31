import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Histogram from "../histogram/Histogram";
import ColumnMenu from "./DataTableColumnHoverMenu";
import type { ShapleyValueItem, DataRow } from "../../types";
import "./DataTable.css";

const rootClass = "cif-data-table";
const styles = {
  tablePanelContent: "tablePanelContent",
  panelHeader: "panelHeader",
  headerOptions: "headerOptions",
  hiddenColumnsTags: "hiddenColumnsTags",
  columnTag: "columnTag",
  viewModeSwitch: "viewModeSwitch",
  viewModeButton: "viewModeButton",
  viewModeButtonActive: "viewModeButtonActive",
  toggleViewButton: "toggleViewButton",
  compressButton: "compressButton",
  expandButton: "expandButton",
  tableContainer: "tableContainer",
  table: "table",
  headerCell: "headerCell",
  headerCellSelected: "headerCellSelected",
  dataCell: "dataCell",
  selectedCell: "selectedCell",
  bodyRowOdd: "bodyRowOdd",
  bodyRowEven: "bodyRowEven",
  columnHeader: "columnHeader",
  sortedAsc: "sortedAsc",
  sortedDesc: "sortedDesc",
  compressedViewContainer: "compressedViewContainer",
  compressedTableContainer: "compressedTableContainer",
  compressedTable: "compressedTable",
  columnName: "columnName",
  selectedCompressedColumn: "selectedCompressedColumn",
  histogramContainer: "histogramContainer",
  histogramHeader: "histogramHeader",
  closeButton: "closeButton",
  importanceCell: "importanceCell",
  importanceContainer: "importanceContainer",
  importanceRank: "importanceRank",
  importanceBarContainer: "importanceBarContainer",
  importanceBar: "importanceBar",
  tinyHistogramCell: "tinyHistogramCell",
  tinyHistogramButton: "tinyHistogramButton",
  tinyHistogramClickable: "tinyHistogramClickable",
  nonNumericalIndicator: "nonNumericalIndicator",
  heatmapRow: "heatmapRow",
  hoveredCellContent: "hoveredCellContent",
  heatmapCell: "heatmapCell",
  virtualSpacerRow: "virtualSpacerRow",
  virtualSpacerCell: "virtualSpacerCell",
} as const;

export interface DataTableProps {
  title?: string;
  data: DataRow[];
  columns: string[];
  hiddenColumns: string[];
  onColumnHide: (column: string) => void;
  onHiddenColumnRestore?: (column: string) => void;
  onColumnSelect: (selectedColumns: string[]) => void;
  isExpanded: boolean;
  isPanelActive?: boolean;
  viewMode: "numerical" | "heatmap";
  onViewModeChange?: (viewMode: "numerical" | "heatmap") => void;
  onToggleExpanded?: () => void;
  showPanelHeader?: boolean;
  menuOptions?: {
    canSort?: boolean;
    canHide?: boolean;
  };
  shapleyValues?: ShapleyValueItem[] | null;
}

export interface DataTableMockProps {
  title?: string;
}

type ColumnType = "number" | "string" | "mixed";

const TABLE_HEADER_HEIGHT = 40;
const NUMERICAL_ROW_HEIGHT = 24;
const HEATMAP_ROW_HEIGHT = 5;
const VIRTUAL_OVERSCAN = 20;

const DataTable: React.FC<DataTableProps> = ({
  title = "Data",
  data,
  columns,
  hiddenColumns,
  onColumnHide,
  onHiddenColumnRestore,
  onColumnSelect,
  isExpanded,
  isPanelActive = true,
  viewMode,
  onViewModeChange,
  onToggleExpanded,
  showPanelHeader = true,
  menuOptions = {
    canSort: true,
    canHide: true,
  },
  shapleyValues,
}) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ id: string; desc: boolean } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [hoveredHeatmapRowIndex, setHoveredHeatmapRowIndex] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const visibleColumns = useMemo(() => columns.filter((col) => !hiddenColumns.includes(col)), [columns, hiddenColumns]);

  const handleSort = (columnId: string) => {
    setSortConfig((prev) => ({
      id: columnId,
      desc: prev?.id === columnId ? !prev.desc : false,
    }));
  };

  const handleHideColumn = useCallback((columnId: string) => {
    onColumnHide(columnId);
  }, [onColumnHide]);

  const columnMetadata = useMemo(() => {
    const metadata: Record<
      string,
      {
        type: ColumnType;
        numericValues: number[];
        isStrictNumeric: boolean;
        min?: number;
        max?: number;
        range?: number;
      }
    > = {};

    columns.forEach((columnId) => {
      let hasNumbers = false;
      let hasStrings = false;
      const numericValues: number[] = [];
      let minValue = Number.POSITIVE_INFINITY;
      let maxValue = Number.NEGATIVE_INFINITY;

      for (const row of data) {
        const value = row[columnId];

        if (typeof value === "number") {
          hasNumbers = true;
          if (!Number.isNaN(value)) {
            numericValues.push(value);
            minValue = Math.min(minValue, value);
            maxValue = Math.max(maxValue, value);
          }
        } else if (typeof value === "string") {
          hasStrings = true;
        }
      }

      const firstValue = data[0]?.[columnId];
      const isStrictNumeric =
        typeof firstValue === "number" &&
        data.every((row) => typeof row[columnId] === "number" || row[columnId] === null);

      metadata[columnId] = {
        type: hasNumbers && !hasStrings ? "number" : hasStrings && !hasNumbers ? "string" : "mixed",
        numericValues,
        isStrictNumeric,
        min: numericValues.length > 0 ? minValue : undefined,
        max: numericValues.length > 0 ? maxValue : undefined,
        range: numericValues.length > 0 ? maxValue - minValue : undefined,
      };
    });

    return metadata;
  }, [columns, data]);

  const sortData = useCallback((a: DataRow, b: DataRow, columnId: string): number => {
    const columnType = columnMetadata[columnId]?.type ?? "mixed";
    const aValue = a[columnId];
    const bValue = b[columnId];

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;

    switch (columnType) {
      case "number":
        return Number(aValue) - Number(bValue);
      case "string":
        return String(aValue).localeCompare(String(bValue));
      case "mixed": {
        const aNum = Number(aValue);
        const bNum = Number(bValue);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }
        return String(aValue).localeCompare(String(bValue));
      }
      default:
        return 0;
    }
  }, [columnMetadata]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const sortOrder = sortConfig.desc ? -1 : 1;
      return sortData(a, b, sortConfig.id) * sortOrder;
    });
  }, [data, sortConfig, sortData]);

  useEffect(() => {
    const container = tableContainerRef.current;

    if (!container) {
      return;
    }

    const updateMeasurements = () => {
      setContainerHeight(container.clientHeight);
      setScrollTop(container.scrollTop);
    };

    updateMeasurements();
    container.addEventListener("scroll", updateMeasurements, { passive: true });

    const resizeObserver = new ResizeObserver(updateMeasurements);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", updateMeasurements);
      resizeObserver.disconnect();
    };
  }, [isExpanded]);

  const toggleColumnSelection = (colId: string) => {
    const newSelected = selectedColumns.includes(colId)
      ? selectedColumns.filter((col) => col !== colId)
      : selectedColumns.length >= 2
        ? [...selectedColumns.slice(1), colId]
        : [...selectedColumns, colId];

    setSelectedColumns(newSelected);
    onColumnSelect(newSelected);
  };

  const getCellStyle = (value: number, columnId: string) => {
    if (viewMode !== "heatmap" || typeof value !== "number") return {};

    const column = columnMetadata[columnId];
    if (!column || column.min === undefined || column.range === undefined) return {};

    const normalizedValue = column.range !== 0 ? (value - column.min) / column.range : 0.5;

    return {
      "--normalized-value": normalizedValue,
    } as React.CSSProperties;
  };

  const rowHeight = viewMode === "heatmap" ? HEATMAP_ROW_HEIGHT : NUMERICAL_ROW_HEIGHT;
  const virtualScrollTop = Math.max(0, scrollTop - TABLE_HEADER_HEIGHT);
  const viewportHeight = Math.max(containerHeight - TABLE_HEADER_HEIGHT, rowHeight);
  const visibleStartIndex = Math.max(0, Math.floor(virtualScrollTop / rowHeight) - VIRTUAL_OVERSCAN);
  const visibleRowCount = Math.ceil(viewportHeight / rowHeight) + VIRTUAL_OVERSCAN * 2;
  const visibleEndIndex = Math.min(sortedData.length, visibleStartIndex + visibleRowCount);
  const visibleRows = useMemo(
    () => sortedData.slice(visibleStartIndex, visibleEndIndex),
    [sortedData, visibleEndIndex, visibleStartIndex],
  );
  const topSpacerHeight = visibleStartIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (sortedData.length - visibleEndIndex) * rowHeight);

  const featureImportanceMap = useMemo(() => {
    if (!shapleyValues || shapleyValues.length === 0) return null;

    const sorted = [...shapleyValues].sort((a, b) => b["SHAP Value"] - a["SHAP Value"]);
    const maxValue = sorted[0]?.["SHAP Value"] ?? 0;

    return new Map(
      sorted.map((item, index) => [
        item.feature,
        {
          ...item,
          rank: index + 1,
          normalizedValue: maxValue === 0 ? 0 : item["SHAP Value"] / maxValue,
        },
      ]),
    );
  }, [shapleyValues]);

  const getFeatureImportance = (featureName: string) => {
    return featureImportanceMap?.get(featureName) ?? null;
  };

  return (
    <div className={`${rootClass} ${styles.tablePanelContent}`}>
      {showPanelHeader && (
        <h2 className={styles.panelHeader}>
          <div>{title}</div>
          <div className={styles.headerOptions}>
            {isPanelActive && hiddenColumns.length > 0 && onHiddenColumnRestore && (
              <div className={styles.hiddenColumnsTags}>
                {hiddenColumns.map((col) => (
                  <button
                    key={col}
                    className={styles.columnTag}
                    onClick={(e) => {
                      e.stopPropagation();
                      onHiddenColumnRestore(col);
                    }}
                    title="Click to restore column"
                  >
                    {col}: hidden
                  </button>
                ))}
              </div>
            )}
            {isExpanded && onViewModeChange && (
              <div className={styles.viewModeSwitch}>
                <button
                  className={`${styles.viewModeButton} ${viewMode === "numerical" ? styles.viewModeButtonActive : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewModeChange("numerical");
                  }}
                  title="Show numerical values"
                >
                  123
                </button>
                <button
                  className={`${styles.viewModeButton} ${viewMode === "heatmap" ? styles.viewModeButtonActive : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewModeChange("heatmap");
                  }}
                  title="Show heatmap"
                >
                  {"\u25A6"}
                </button>
              </div>
            )}
            {onToggleExpanded && (
              <button
                className={`${styles.toggleViewButton} ${isExpanded ? styles.compressButton : styles.expandButton}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpanded();
                }}
                aria-label={isExpanded ? "Compress table" : "Expand table"}
                title={isExpanded ? "Compress table" : "Expand table"}
              />
            )}
          </div>
        </h2>
      )}
      {isExpanded ? (
        <div ref={tableContainerRef} className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                {visibleColumns.map((columnId) => (
                  <th
                    key={columnId}
                    onClick={() => toggleColumnSelection(columnId)}
                    className={`${styles.headerCell} ${selectedColumns.includes(columnId) ? styles.headerCellSelected : ""}`}
                  >
                    <div
                      className={`${styles.columnHeader} ${
                        sortConfig?.id === columnId ? (sortConfig.desc ? styles.sortedDesc : styles.sortedAsc) : ""
                      }`}
                    >
                      <span>{columnId}</span>
                      {(menuOptions.canSort || menuOptions.canHide) && (
                        <ColumnMenu
                          column={columnId}
                          onSort={menuOptions.canSort ? handleSort : undefined}
                          onHide={menuOptions.canHide ? handleHideColumn : undefined}
                          sortConfig={sortConfig}
                          menuOptions={menuOptions}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topSpacerHeight > 0 && (
                <tr className={styles.virtualSpacerRow} aria-hidden="true">
                  <td
                    className={styles.virtualSpacerCell}
                    colSpan={visibleColumns.length}
                    style={{ height: `${topSpacerHeight}px` }}
                  />
                </tr>
              )}
              {visibleRows.map((row, index) => {
                const absoluteIndex = visibleStartIndex + index;
                const rowParityClass = absoluteIndex % 2 === 0 ? styles.bodyRowOdd : styles.bodyRowEven;
                const isHoveredHeatmapRow = viewMode === "heatmap" && hoveredHeatmapRowIndex === absoluteIndex;
                return (
                  <tr
                    key={`row-${absoluteIndex}`}
                    className={`${rowParityClass} ${viewMode === "heatmap" ? styles.heatmapRow : ""} ${
                      isHoveredHeatmapRow ? styles.heatmapRowHovered : ""
                    }`}
                    style={{ height: `${isHoveredHeatmapRow ? NUMERICAL_ROW_HEIGHT : rowHeight}px` }}
                    onMouseEnter={() => viewMode === "heatmap" && setHoveredHeatmapRowIndex(absoluteIndex)}
                    onMouseLeave={() => viewMode === "heatmap" && setHoveredHeatmapRowIndex(null)}
                  >
                    {visibleColumns.map((columnId) => {
                      const cellValue = row[columnId];
                      const displayValue = cellValue == null ? "" : String(cellValue);
                      const heatmapStyle =
                        typeof cellValue === "number" ? getCellStyle(cellValue, columnId) : undefined;

                      return (
                        <td
                          key={`${columnId}-${absoluteIndex}`}
                          className={`${styles.dataCell} ${selectedColumns.includes(columnId) ? styles.selectedCell : ""} ${
                            viewMode === "heatmap" ? styles.heatmapCell : ""
                          }`}
                          style={heatmapStyle}
                        >
                          {viewMode === "numerical" ? (
                            displayValue
                          ) : (
                            <div className={styles.hoveredCellContent}>{displayValue}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {bottomSpacerHeight > 0 && (
                <tr className={styles.virtualSpacerRow} aria-hidden="true">
                  <td
                    className={styles.virtualSpacerCell}
                    colSpan={visibleColumns.length}
                    style={{ height: `${bottomSpacerHeight}px` }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.compressedViewContainer}>
          <div className={styles.compressedTableContainer}>
            <table className={styles.compressedTable}>
              <thead>
                <tr>
                  <th>Feature</th>
                  {shapleyValues && shapleyValues.length > 0 && <th>Importance</th>}
                  <th>Distribution</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, index) => {
                  const importance = getFeatureImportance(col);
                  const rowParityClass = index % 2 === 0 ? styles.bodyRowOdd : styles.bodyRowEven;

                  return (
                    <tr key={col} className={rowParityClass}>
                      <td
                        className={`${styles.columnName} ${selectedColumns.includes(col) ? styles.selectedCompressedColumn : ""}`}
                        onClick={() => toggleColumnSelection(col)}
                      >
                        {col}
                        {hiddenColumns.includes(col) && (
                          <span title="Hidden in expanded view">
                            (hidden)
                          </span>
                        )}
                      </td>
                      {shapleyValues && shapleyValues.length > 0 && (
                        <td className={styles.importanceCell}>
                          {importance ? (
                            <div className={styles.importanceContainer}>
                              <div className={styles.importanceRank}>#{importance.rank}</div>
                              <div className={styles.importanceBarContainer}>
                                <div
                                  className={styles.importanceBar}
                                  style={{ width: `${importance.normalizedValue * 100}%` }}
                                  title={`SHAP Value: ${importance["SHAP Value"].toFixed(4)}`}
                                ></div>
                              </div>
                            </div>
                          ) : (
                            <span>{"\u2014"}</span>
                          )}
                        </td>
                      )}
                      <td className={styles.tinyHistogramCell}>
                        <button
                          className={styles.tinyHistogramButton}
                          disabled={!columnMetadata[col]?.isStrictNumeric}
                          title={columnMetadata[col]?.isStrictNumeric ? "Distribution preview" : "Not a numerical column"}
                        >
                          {columnMetadata[col]?.isStrictNumeric ? (
                            <Histogram data={columnMetadata[col].numericValues} variant="tiny" width={100} height={30} />
                          ) : (
                            <span className={styles.nonNumericalIndicator}>{"\u2014"}</span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const mockColumns = [
  "Subject",
  "Age",
  "MMSE",
  "Hippocampus",
  "TemporalPower",
  "Diagnosis",
];

const baseMockData: DataRow[] = [
  {
    Subject: "P-001",
    Age: 67,
    MMSE: 28,
    Hippocampus: 6.1,
    TemporalPower: 0.81,
    Diagnosis: "Control",
  },
  {
    Subject: "P-002",
    Age: 72,
    MMSE: 24,
    Hippocampus: 5.2,
    TemporalPower: 0.63,
    Diagnosis: "MCI",
  },
  {
    Subject: "P-003",
    Age: 75,
    MMSE: 19,
    Hippocampus: 4.6,
    TemporalPower: 0.48,
    Diagnosis: "AD",
  },
  {
    Subject: "P-004",
    Age: 69,
    MMSE: 26,
    Hippocampus: 5.8,
    TemporalPower: 0.72,
    Diagnosis: "Control",
  },
  {
    Subject: "P-005",
    Age: 78,
    MMSE: 21,
    Hippocampus: 4.9,
    TemporalPower: 0.57,
    Diagnosis: "MCI",
  },
  {
    Subject: "P-006",
    Age: 81,
    MMSE: 17,
    Hippocampus: 4.1,
    TemporalPower: 0.42,
    Diagnosis: "AD",
  },
  {
    Subject: "P-007",
    Age: 70,
    MMSE: 27,
    Hippocampus: 5.9,
    TemporalPower: 0.77,
    Diagnosis: "Control",
  },
  {
    Subject: "P-008",
    Age: 74,
    MMSE: 22,
    Hippocampus: 5.0,
    TemporalPower: 0.55,
    Diagnosis: "MCI",
  },
];

const mockData: DataRow[] = Array.from({ length: 3 }, (_, batchIndex) =>
  baseMockData.map((row, rowIndex) => ({
    ...row,
    Subject: `P-${String(batchIndex * baseMockData.length + rowIndex + 1).padStart(3, "0")}`,
    Age: typeof row.Age === "number" ? row.Age + batchIndex : row.Age,
    MMSE: typeof row.MMSE === "number" ? Math.max(12, row.MMSE - batchIndex) : row.MMSE,
    Hippocampus: typeof row.Hippocampus === "number" ? Number((row.Hippocampus - batchIndex * 0.15).toFixed(1)) : row.Hippocampus,
    TemporalPower:
      typeof row.TemporalPower === "number"
        ? Number((Math.max(0.25, row.TemporalPower - batchIndex * 0.05)).toFixed(2))
        : row.TemporalPower,
  })),
).flat();

const mockShapleyValues: ShapleyValueItem[] = [
  { feature: "MMSE", "SHAP Value": 0.92 },
  { feature: "Hippocampus", "SHAP Value": 0.84 },
  { feature: "TemporalPower", "SHAP Value": 0.68 },
  { feature: "Age", "SHAP Value": 0.41 },
];

export const DataTableMock: React.FC<DataTableMockProps> = ({ title = "Data" }) => {
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<"numerical" | "heatmap">("numerical");

  return (
    <DataTable
      title={title}
      data={mockData}
      columns={mockColumns}
      hiddenColumns={hiddenColumns}
      onColumnHide={(column) => setHiddenColumns((prev) => [...prev, column])}
      onHiddenColumnRestore={(column) => setHiddenColumns((prev) => prev.filter((item) => item !== column))}
      onColumnSelect={() => {}}
      isExpanded={isExpanded}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      onToggleExpanded={() => setIsExpanded((prev) => !prev)}
      shapleyValues={mockShapleyValues}
    />
  );
};

export default DataTable;
