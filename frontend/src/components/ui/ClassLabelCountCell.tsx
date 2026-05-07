import type { CSSProperties } from "react";

interface ClassLabelCountCellProps {
  className: string;
  value: string;
  title?: string;
  style?: CSSProperties;
}

export function ClassLabelCountCell({ className, value, title, style }: ClassLabelCountCellProps) {
  return (
    <span className={className} title={title} style={style}>
      {value}
    </span>
  );
}
