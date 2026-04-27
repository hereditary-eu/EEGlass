import { useMemo } from "react";

import "./ScatterplotClustered.css";
import { useControllableState } from "../../utils/useControllableState";
import ScatterplotClustered from "./ScatterplotClustered";

function createMockClusteredScatterData() {
  const clusterCenters = [
    { x: -2.4, y: 1.3 },
    { x: 0.6, y: -1.5 },
    { x: 2.2, y: 2.4 },
  ];

  return clusterCenters.flatMap((center, clusterId) =>
    Array.from({ length: 22 }, (_, index) => {
      const radial = index / 22;
      const x = center.x + Math.cos(index * 0.7) * (0.45 + radial * 0.35) + clusterId * 0.08;
      const y = center.y + Math.sin(index * 0.55) * (0.5 + radial * 0.25) - clusterId * 0.05;
      return [Number(x.toFixed(4)), Number(y.toFixed(4)), clusterId];
    }),
  );
}

export interface ClusteredScatterplotViewerProps {
  data: number[][];
  xLabel: string;
  yLabel: string;
  k: number;
  height?: number;
  selectedCluster?: number | null;
  defaultSelectedCluster?: number | null;
  onSelectedClusterChange?: (cluster: number | null) => void;
}

export function ClusteredScatterplotViewer({
  data,
  xLabel,
  yLabel,
  k,
  height = 420,
  selectedCluster,
  defaultSelectedCluster = null,
  onSelectedClusterChange,
}: ClusteredScatterplotViewerProps) {
  const [resolvedSelectedCluster, setSelectedCluster] = useControllableState({
    value: selectedCluster,
    defaultValue: defaultSelectedCluster,
    onChange: onSelectedClusterChange,
  });

  return (
    <div className="cif-scatterplot-card">
      <p className="cif-scatterplot-meta">
        Selected cluster: <strong>{resolvedSelectedCluster !== null ? resolvedSelectedCluster + 1 : "none"}</strong>
      </p>
      <ScatterplotClustered
        data={data}
        xLabel={xLabel}
        yLabel={yLabel}
        k={k}
        height={height}
        onClusterSelect={setSelectedCluster}
      />
    </div>
  );
}

export function ClusteredScatterplotViewerMock() {
  const data = useMemo(() => createMockClusteredScatterData(), []);
  return <ClusteredScatterplotViewer data={data} xLabel="Feature 1" yLabel="Feature 2" k={3} />;
}
