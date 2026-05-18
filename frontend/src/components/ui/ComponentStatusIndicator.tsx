import "./ComponentStatusIndicator.css";

export type ComponentStatus = "idle" | "loading" | "loaded" | "error";

interface ComponentStatusIndicatorProps {
  status: ComponentStatus;
  label?: string;
}

const STATUS_LABELS: Record<ComponentStatus, string> = {
  idle: "Idle",
  loading: "Loading",
  loaded: "Loaded",
  error: "Error",
};

export function ComponentStatusIndicator({ status, label }: ComponentStatusIndicatorProps) {
  const statusLabel = label ?? STATUS_LABELS[status];

  return (
    <span
      className={`component-status-indicator component-status-indicator--${status}`}
      aria-label={statusLabel}
      title={statusLabel}
      role="status"
    />
  );
}
