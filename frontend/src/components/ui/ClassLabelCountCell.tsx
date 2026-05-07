interface ClassLabelCountCellProps {
  className: string;
  value: string;
  title?: string;
}

export function ClassLabelCountCell({ className, value, title }: ClassLabelCountCellProps) {
  return (
    <span className={className} title={title}>
      {value}
    </span>
  );
}
