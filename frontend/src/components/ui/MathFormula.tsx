import { useMemo } from "react";
import katex from "katex";

interface MathFormulaProps {
  tex: string;
  className?: string;
}

export function MathFormula({ tex, className }: MathFormulaProps) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
        strict: "ignore",
      }),
    [tex],
  );

  return (
    <span
      className={["math-formula", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
