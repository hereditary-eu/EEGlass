import type { HTMLAttributes, ReactNode } from "react";

interface CompactGridSelectorRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className: string;
}

export function CompactGridSelectorRow({ children, className, ...props }: CompactGridSelectorRowProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
