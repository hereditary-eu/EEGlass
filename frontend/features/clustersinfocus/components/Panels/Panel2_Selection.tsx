import React, { useState, useEffect } from "react";
import ScatterplotClustered from "../DataVisualization/ScatterplotClustered";
import { ClusteringService } from "../../services/ClusteringService";
import { useAppStore } from "../../stores/useAppStore";
import { hasNonNumericValues } from "../../utils/validation";
import "../../css/components/Panels/Panel2_Selection.css";
import "../../css/components/Panels/PanelShell.css";

const rootClass = "cif-panel-selection";
const panelShellRootClass = "cif-panel-shell";
const styles = {
  panelMiddle: "panelMiddle",
  visualizeClustersContainer: "visualizeClustersContainer",
  scatterplotContainer: "scatterplotContainer",
} as const;
const panelStyles = {
  panel: "panel",
  expanded: "expanded",
  collapsed: "collapsed",
  dimmed: "dimmed",
  panelHeader: "panelHeader",
} as const;

const Panel2Selection: React.FC = () => {
  const data = useAppStore(state => state.data);
  const selectedColumns = useAppStore(state => state.selectedColumns);
  const setExpandedPanel = useAppStore(state => state.setExpandedPanel);
  const expandedPanel = useAppStore(state => state.expandedPanel);
  const isExpanded = expandedPanel === "middle";
  const isCollapsed = expandedPanel !== null && !isExpanded;

  const handlePanelClick = (panelId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (expandedPanel !== panelId) {
      setExpandedPanel(panelId);
    }
  };

  const [clusterData, setClusterData] = useState<number[] | null>(null);
  const [scatterData, setScatterData] = useState<number[][]>([]);
  const [numClusters, setNumClusters] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchClusters = async () => {
      if (selectedColumns.length !== 2 || !data.fileId) {
        setClusterData(null);
        setScatterData([]);
        return;
      }

      setIsLoading(true);

      try {
        const [feature1, feature2] = selectedColumns;

        if (hasNonNumericValues(data.csvData, [feature1, feature2])) {
          setClusterData(null);
          setScatterData([]);
          setIsLoading(false);
          return;
        }

        const clusterGroups = await ClusteringService.getClustersByFeatures(feature1, feature2, data.fileId!, data.csvData);

        if (clusterGroups) {
          const clusterArray = new Array(data.csvData.length).fill(-1);
          const uniqueClusterIds = Object.keys(clusterGroups).map(Number);

          Object.entries(clusterGroups).forEach(([clusterId, indices]) => {
            indices.forEach((index: number) => {
              clusterArray[index] = Number(clusterId);
            });
          });

          setClusterData(clusterArray);
          setNumClusters(uniqueClusterIds.length);

          const newScatterData = data.csvData.map((row, index) => [
            Number(row[feature1]),
            Number(row[feature2]),
            clusterArray[index],
          ]);

          setScatterData(newScatterData);
        } else {
          setClusterData(null);
          setScatterData([]);
        }
      } catch {
        setClusterData(null);
        setScatterData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClusters();
  }, [data.csvData, data.fileId, selectedColumns]);

  const renderContent = () => {
    if (selectedColumns.length < 2) {
      return <p>Select exactly two numerical columns to view clustering results</p>;
    }

    if (hasNonNumericValues(data.csvData, selectedColumns)) {
      return <p>Please select numerical columns only</p>;
    }

    if (isLoading) {
      return <p>Loading cluster data...</p>;
    }

    if (!clusterData) {
      return (
        <div className={styles.visualizeClustersContainer}>
          <p>
            No clustering data available for <i>{selectedColumns.join(" and ")}</i>.
          </p>
          <p>Please compute clusters first using the button in the header.</p>
        </div>
      );
    }

    return (
      <div className={styles.visualizeClustersContainer}>
        <div>
          <p>
            Showing clusters for <i>{selectedColumns.join(" and ")}</i>
          </p>
        </div>
        <div className={styles.scatterplotContainer}>
          <ScatterplotClustered
            data={scatterData}
            xLabel={selectedColumns[0]}
            yLabel={selectedColumns[1]}
            k={numClusters}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`${panelShellRootClass} ${rootClass} ${panelStyles.panel} ${styles.panelMiddle} ${isExpanded ? panelStyles.expanded : ""} ${isCollapsed ? panelStyles.collapsed : ""} ${isCollapsed ? panelStyles.dimmed : ""}`}
      onClick={(e) => handlePanelClick("middle", e)}
    >
      <h2 className={panelStyles.panelHeader}>
        <div>Selection</div>
      </h2>
      {renderContent()}
    </div>
  );
};

export default Panel2Selection;
