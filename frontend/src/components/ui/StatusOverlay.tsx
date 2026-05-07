interface StatusOverlayProps {
  className?: string;
  message: string | null;
}

export function StatusOverlay({ className = "overview-error", message }: StatusOverlayProps) {
  return message ? <div className={className}>{message}</div> : null;
}
