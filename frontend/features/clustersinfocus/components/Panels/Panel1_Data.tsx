import React from "react";
import DataTable from "../DataVisualization/DataTable/DataTable";
import { useAppStore } from "../../stores/useAppStore";
import "../../css/components/Panels/Panel1_Data.css";
import "../../css/components/Panels/PanelShell.css";

const rootClass = "cif-panel-data";
const panelShellRootClass = "cif-panel-shell";
const styles = {
  panelLeft: "panelLeft",
  headerOptions: "headerOptions",
  hiddenColumnsTags: "hiddenColumnsTags",
  columnTag: "columnTag",
  viewModeSwitch: "viewModeSwitch",
  viewModeButton: "viewModeButton",
  viewModeButtonActive: "viewModeButtonActive",
  toggleViewButton: "toggleViewButton",
  compressButton: "compressButton",
  expandButton: "expandButton",
} as const;
const tableMenuOptions = {
  canSort: true,
  canHide: true,
} as const;
const panelStyles = {
  panel: "panel",
  expanded: "expanded",
  collapsed: "collapsed",
  dimmed: "dimmed",
  panelHeader: "panelHeader",
} as const;

const Panel1Data: React.FC = () => {
  const data = useAppStore(state => state.data);
  const shapleyValues = useAppStore(state => state.shapleyValues);
  const expandedPanel = useAppStore(state => state.expandedPanel);
  const hiddenColumns = useAppStore(state => state.hiddenColumns);
  const isDataTableExpanded = useAppStore(state => state.isDataTableExpanded);
  const dataViewMode = useAppStore(state => state.dataViewMode);
  const setExpandedPanel = useAppStore(state => state.setExpandedPanel);
  const addHiddenColumn = useAppStore(state => state.addHiddenColumn);
  const removeHiddenColumn = useAppStore(state => state.removeHiddenColumn);
  const setDataViewMode = useAppStore(state => state.setDataViewMode);
  const setIsDataTableExpanded = useAppStore(state => state.setIsDataTableExpanded);
  const setSelectedColumns = useAppStore(state => state.setSelectedColumns);
  const isExpanded = expandedPanel === "left";
  const isCollapsed = expandedPanel !== null && !isExpanded;

  const handlePanelClick = (panelId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (expandedPanel !== panelId) {
      setExpandedPanel(panelId);
    }
  };

  return (
    <div
      className={`${panelShellRootClass} ${rootClass} ${panelStyles.panel} ${styles.panelLeft} ${isExpanded ? panelStyles.expanded : ""} ${isCollapsed ? panelStyles.collapsed : ""} ${isCollapsed ? panelStyles.dimmed : ""}`}
      onClick={(e) => handlePanelClick("left", e)}
    >
      <h2 className={panelStyles.panelHeader}>
        <div>Data</div>
        <div className={styles.headerOptions}>
          {expandedPanel === "left" && hiddenColumns.length > 0 && (
            <div className={styles.hiddenColumnsTags}>
              {hiddenColumns.map((col) => (
                <button
                  key={col}
                  className={styles.columnTag}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeHiddenColumn(col);
                  }}
                  title="Click to restore column"
                >
                  {col}: hidden
                </button>
              ))}
            </div>
          )}
          {isDataTableExpanded && (
            <div className={styles.viewModeSwitch}>
              <button
                className={`${styles.viewModeButton} ${dataViewMode === "numerical" ? styles.viewModeButtonActive : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDataViewMode("numerical");
                }}
                title="Show numerical values"
              >
                123
              </button>
              <button
                className={`${styles.viewModeButton} ${dataViewMode === "heatmap" ? styles.viewModeButtonActive : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDataViewMode("heatmap");
                }}
                title="Show heatmap"
              >
                {"\u25A6"}
              </button>
            </div>
          )}
          <button
            className={`${styles.toggleViewButton} ${isDataTableExpanded ? styles.compressButton : styles.expandButton}`}
            onClick={() => setIsDataTableExpanded(!isDataTableExpanded)}
            aria-label={isDataTableExpanded ? "Compress table" : "Expand table"}
            title={isDataTableExpanded ? "Compress table" : "Expand table"}
          />
        </div>
      </h2>

      <DataTable
        data={data.csvData}
        columns={data.columns}
        hiddenColumns={hiddenColumns}
        onColumnHide={addHiddenColumn}
        onColumnSelect={setSelectedColumns}
        isExpanded={isDataTableExpanded}
        viewMode={dataViewMode}
        menuOptions={tableMenuOptions}
        shapleyValues={shapleyValues}
      />
    </div>
  );
};

export default Panel1Data;
