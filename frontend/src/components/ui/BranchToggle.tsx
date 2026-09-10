import type { FeatureBranch } from "../../types";

export function BranchToggle({
  value,
  onChange,
  label,
  bpLabel = "BP",
}: {
  value: FeatureBranch;
  onChange: (branch: FeatureBranch) => void;
  label: string;
  bpLabel?: string;
}) {
  return (
    <div className="feature-branch-toggle" role="group" aria-label={label}>
      {(["bp", "scc"] as const).map((branch) => (
        <button
          key={branch}
          type="button"
          data-branch={branch}
          aria-pressed={value === branch}
          onClick={() => onChange(branch)}
        >
          {branch === "bp" ? bpLabel : "SCC"}
        </button>
      ))}
    </div>
  );
}
