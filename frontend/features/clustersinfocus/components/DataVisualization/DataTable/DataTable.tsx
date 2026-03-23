import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Histogram from "../Histogram";
import ColumnMenu from "./DataTableColumnHoverMenu";
import type { ShapleyValueItem, DataRow } from "../../../types";
import "../../../css/components/DataVisualization/DataTable.css";

const rootClass = "cif-data-table";
const styles = {
  tablePanelContent: "tablePanelContent",
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

interface DataTableProps {
  data: DataRow[];
  columns: string[];
  hiddenColumns: string[];
  onColumnHide: (column: string) => void;
  onColumnSelect: (selectedColumns: string[]) => void;
  isExpanded: boolean;
  viewMode: "numerical" | "heatmap";
  menuOptions?: {
    canSort?: boolean;
    canHide?: boolean;
  };
  shapleyValues?: ShapleyValueItem[] | null;
}

type ColumnType = "number" | "string" | "mixed";

const TABLE_HEADER_HEIGHT = 40;
const NUMERICAL_ROW_HEIGHT = 24;
const HEATMAP_ROW_HEIGHT = 5;
const VIRTUAL_OVERSCAN = 20;

const DataTable: React.FC<DataTableProps> = ({
  data,
  columns,
  hiddenColumns,
  onColumnHide,
  onColumnSelect,
  isExpanded,
  viewMode,
  menuOptions = {
    canSort: true,
    canHide: true,
  },
  shapleyValues,
}) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [activeHistogram, setActiveHistogram] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ id: string; desc: boolean } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const visibleColumns = useMemo(() => columns.filter((col) => !hiddenColumns.includes(col)), [columns, hiddenColumns]);

  useEffect(() => {
    setActiveHistogram(null);
  }, [data]);

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

  const handleHistogramClick = (columnName: string) => {
    setActiveHistogram(activeHistogram === columnName ? null : columnName);
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
                return (
                  <tr
                    key={`row-${absoluteIndex}`}
                    className={`${rowParityClass} ${viewMode === "heatmap" ? styles.heatmapRow : ""}`}
                    style={{ height: `${rowHeight}px` }}
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
                          className={`${styles.tinyHistogramButton} ${columnMetadata[col]?.isStrictNumeric ? styles.tinyHistogramClickable : ""}`}
                          onClick={() => columnMetadata[col]?.isStrictNumeric && handleHistogramClick(col)}
                          disabled={!columnMetadata[col]?.isStrictNumeric}
                          title={columnMetadata[col]?.isStrictNumeric ? "Click to view detailed histogram" : "Not a numerical column"}
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
          {activeHistogram && (
            <div className={styles.histogramContainer}>
              <div className={styles.histogramHeader}>
                <h3>{activeHistogram} Distribution</h3>
                <button className={styles.closeButton} onClick={() => setActiveHistogram(null)} aria-label="Close histogram">
                  {"\u00D7"}
                </button>
              </div>
              <Histogram data={columnMetadata[activeHistogram]?.numericValues ?? []} variant="big" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataTable;
