import React, { useRef, useState, useEffect } from "react";
import { FileService } from "../../../services/FileService";
import type { DatasetInfo } from "../../../types";
import { useAppStore } from "../../../stores/useAppStore";
import { toast } from "../../../stores/useToastStore";
import "../../../css/components/Controls/FileUploadButton.css";

const rootClass = "cif-file-upload";
const styles = {
  fileUploadContainer: "fileUploadContainer",
  fileName: "fileName",
  loadingIndicator: "loadingIndicator",
  fileUploadButton: "fileUploadButton",
  uploadOptionsDropdown: "uploadOptionsDropdown",
  uploadOption: "uploadOption",
  savedDatasetsList: "savedDatasetsList",
  savedDatasetsTitle: "savedDatasetsTitle",
  datasetOptionContainer: "datasetOptionContainer",
  datasetOption: "datasetOption",
  datasetDeleteButton: "datasetDeleteButton",
  noDatasets: "noDatasets",
  confirmDeleteContainer: "confirmDeleteContainer",
  confirmDeleteDialog: "confirmDeleteDialog",
  confirmDeleteMessage: "confirmDeleteMessage",
  confirmDeleteButtons: "confirmDeleteButtons",
  confirmDeleteButton: "confirmDeleteButton",
  confirmDeleteButtonDelete: "confirmDeleteButtonDelete",
  confirmDeleteButtonCancel: "confirmDeleteButtonCancel",
} as const;

export function FileUploadButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = useAppStore(state => state.handleFileUpload);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [savedDatasets, setSavedDatasets] = useState<DatasetInfo[]>([]);
  const [showConfirmDelete, setShowConfirmDelete] = useState<DatasetInfo | null>(null);

  const loadSavedDatasets = async () => {
    try {
      const serverDatasets = await FileService.getAllDatasets();
      const mappedDatasets = serverDatasets.map((dataset) => ({
        name: dataset.filename,
        hash: dataset.id,
      }));
      setSavedDatasets(mappedDatasets);
    } catch (error) {
      setSavedDatasets([]);
    }
  };

  useEffect(() => {
    loadSavedDatasets();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        setFileName(file.name);
        setShowOptions(false);

        if (file.size > 10 * 1024 * 1024) {
          throw new Error("File is too large. Maximum file size is 10MB.");
        }

        if (!file.name.toLowerCase().endsWith(".csv")) {
          throw new Error("Only CSV files are supported.");
        }

        const { data, headers, fileId } = await FileService.parseCSVFile(file);
        handleFileUpload(file.name, data, headers, fileId);
        toast.success(`Successfully loaded ${file.name} with ${data.length} rows`);
        await loadSavedDatasets();
      } catch (error) {
        setFileName(null);
        toast.error(error instanceof Error ? error.message : "Failed to upload file. Please check file format.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSelectDataset = async (dataset: DatasetInfo) => {
    if (!dataset.hash) {
      toast.error("Dataset has no ID. Cannot load.");
      return;
    }

    try {
      setLoading(true);
      setFileName(dataset.name);
      setShowOptions(false);

      const { data, headers } = await FileService.getDatasetById(dataset.hash);
      handleFileUpload(dataset.name, data, headers, dataset.hash);
      toast.success(`Successfully loaded ${dataset.name} with ${data.length} rows`);
    } catch (error) {
      setFileName(null);
      toast.error(error instanceof Error ? error.message : "Failed to load dataset. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDataset = async (dataset: DatasetInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDelete(dataset);
  };

  const confirmDelete = async () => {
    if (!showConfirmDelete || !showConfirmDelete.hash) {
      return;
    }

    try {
      setLoading(true);

      const result = await FileService.deleteDataset(showConfirmDelete.hash);

      if (result.success) {
        await loadSavedDatasets();
        toast.success("Dataset deleted successfully");
      } else {
        toast.error(`Failed to delete dataset: ${result.message}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete dataset");
    } finally {
      setLoading(false);
      setShowConfirmDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowConfirmDelete(null);
  };

  const toggleOptions = async () => {
    if (!showOptions) {
      await loadSavedDatasets();
    }
    setShowOptions(!showOptions);
  };


  return (
    <div className={`${rootClass} ${styles.fileUploadContainer}`}>
      {fileName && <span className={styles.fileName}>{fileName}</span>}
      {loading && <span className={styles.loadingIndicator}>Loading...</span>}

      {showConfirmDelete && (
        <div className={styles.confirmDeleteContainer}>
          <div className={styles.confirmDeleteDialog}>
            <p className={styles.confirmDeleteMessage}>
              Are you sure you want to delete dataset "{showConfirmDelete.name}"?
            </p>
            <div className={styles.confirmDeleteButtons}>
              <button
                className={`${styles.confirmDeleteButton} ${styles.confirmDeleteButtonDelete}`}
                onClick={confirmDelete}
              >
                Delete
              </button>
              <button
                className={`${styles.confirmDeleteButton} ${styles.confirmDeleteButtonCancel}`}
                onClick={cancelDelete}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: "none" }} />

      <button className={styles.fileUploadButton} onClick={toggleOptions} aria-label="Upload file" disabled={loading} />

      {showOptions && !showConfirmDelete && (
        <div className={styles.uploadOptionsDropdown}>
          <button className={styles.uploadOption} onClick={() => fileInputRef.current?.click()}>
            Upload new file
          </button>

          <div className={styles.savedDatasetsList}>
            <h4 className={styles.savedDatasetsTitle}>Saved Datasets</h4>
            {savedDatasets.length === 0 ? (
              <p className={styles.noDatasets}>No saved datasets</p>
            ) : (
              savedDatasets.map((dataset, index) => (
                <div key={index} className={styles.datasetOptionContainer}>
                  <button className={styles.datasetOption} onClick={() => handleSelectDataset(dataset)}>
                    {dataset.name}
                  </button>
                  <button
                    className={styles.datasetDeleteButton}
                    onClick={(e) => handleDeleteDataset(dataset, e)}
                    aria-label={`Delete dataset ${dataset.name}`}
                    title={`Delete dataset ${dataset.name}`}
                  >
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
