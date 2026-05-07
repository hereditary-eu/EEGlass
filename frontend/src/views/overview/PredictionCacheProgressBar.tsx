import type { ModelPredictionCacheProgress } from "../../types";

interface PredictionCacheProgressBarProps {
  progress: ModelPredictionCacheProgress;
}

export function PredictionCacheProgressBar({ progress }: PredictionCacheProgressBarProps) {
  const total = progress.total || 0;
  const done = progress.done;
  const percent = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  const label = progress.current_subject_id ?? progress.message ?? "prediction-cache";

  return (
    <div className="overview-model-progress-row">
      <span className="overview-model-progress-label">{label}</span>
      <div
        className="overview-model-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Prediction cache progress"
      >
        <div className="overview-model-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="overview-model-progress-count">
        {done}/{total || "?"}
      </span>
    </div>
  );
}
