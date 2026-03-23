import React from "react";
import "../../css/components/Layout/Header.css";
import { FileUploadButton } from "../Controls/FileUploadButton/FileUploadButton";
import { ComputeClustersButton } from "../Controls/ComputeClustersButton";
import { ComputeShapleyValuesButton } from "../Controls/ComputeShapValuesButton";
import { useAppStore } from "../../stores/useAppStore";
import { useColumnValidation } from "../../hooks/useColumnValidation";

const rootClass = "cif-header";
const styles = {
  header: "header",
  title: "title",
  controls: "controls",
  separator: "separator",
} as const;

const Header: React.FC = () => {
  const data = useAppStore(state => state.data);
  const { hasMinimumColumns } = useColumnValidation(data.csvData);

  return (
    <header className={`${rootClass} ${styles.header}`}>
      <div className={styles.title}>Detail-On-Demand Analysis Dashboard</div>
      <div className={styles.controls}>
        {data.csvData.length > 0 && hasMinimumColumns && (
          <>
            <ComputeClustersButton />
            <div className={styles.separator}>|</div>
            <ComputeShapleyValuesButton />
          </>
        )}
        <FileUploadButton />
      </div>
    </header>
  );
};

export default Header;
