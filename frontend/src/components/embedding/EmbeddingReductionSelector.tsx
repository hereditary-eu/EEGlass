import type { EmbeddingReductionMethod } from "../../types";
import "./EmbeddingReductionSelector.css";

interface EmbeddingReductionSelectorProps {
  value: EmbeddingReductionMethod;
  onChange: (method: EmbeddingReductionMethod) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

const REDUCTION_OPTIONS: Array<{ value: EmbeddingReductionMethod; label: string }> = [
  { value: "pca", label: "PCA" },
  { value: "tsne", label: "t-SNE" },
  { value: "umap", label: "UMAP" },
];

export function EmbeddingReductionSelector({
  value,
  onChange,
  disabled = false,
  ariaLabel = "Embedding reduction method",
}: EmbeddingReductionSelectorProps) {
  return (
    <label className="embedding-reduction-selector">
      <span>Projection</span>
      <select
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.currentTarget.value as EmbeddingReductionMethod)}
      >
        {REDUCTION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function getEmbeddingAxisTitles(method: EmbeddingReductionMethod): [string, string] {
  if (method === "tsne") {
    return ["t-SNE 1", "t-SNE 2"];
  }
  if (method === "umap") {
    return ["UMAP 1", "UMAP 2"];
  }
  return ["PC1", "PC2"];
}

export function getEmbeddingReductionLabel(method: EmbeddingReductionMethod): string {
  return REDUCTION_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function getEmbeddingInsufficientDataMessage(method: EmbeddingReductionMethod, itemLabel: string): string {
  if (method === "tsne") {
    return `Need at least 31 ${itemLabel} for t-SNE with default settings.`;
  }
  if (method === "umap") {
    return `Need at least 4 ${itemLabel} for UMAP with default settings.`;
  }
  return `Need at least two ${itemLabel}.`;
}
