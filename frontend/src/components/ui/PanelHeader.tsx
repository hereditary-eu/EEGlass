import type { ReactNode } from "react";

interface PanelHeaderProps {
  kicker?: string;
  title: string;
  action?: ReactNode;
}

export function PanelHeader({ kicker, title, action }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <div>
        {kicker ? <p className="overview-kicker">{kicker}</p> : null}
        <h3>{title}</h3>
      </div>
      {action}
    </div>
  );
}
