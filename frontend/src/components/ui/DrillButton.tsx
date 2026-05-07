import type { MouseEvent } from "react";

interface DrillButtonProps {
  className?: string;
  label: string;
  onClick: () => void;
}

export function DrillButton({ className = "overview-drill-button", label, onClick }: DrillButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick();
  };

  return (
    <button type="button" className={className} aria-label={label} onClick={handleClick}>
      <span aria-hidden="true" />
    </button>
  );
}
