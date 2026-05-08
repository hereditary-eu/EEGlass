import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { formatCompactClassLabel } from "../../constants/eegModel";
import { TimeseriesService } from "../../services/TimeseriesService";
import type { ModelClassEvidenceResponse, ModelClassPresentation, TimeseriesSource } from "../../types";
import "./ClassificationEvidencePanel.css";

interface ClassificationEvidencePanelProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  windowIndex: number | null;
  modelClasses?: ModelClassPresentation[];
}

type EvidenceDisplayMode = "within-band" | "raw";

export function ClassificationEvidencePanel({
  datasetId,
  subjectId,
  source,
  windowIndex,
  modelClasses = [],
}: ClassificationEvidencePanelProps) {
  const cacheRef = useRef(new Map<string, ModelClassEvidenceResponse>());
  const [evidence, setEvidence] = useState<ModelClassEvidenceResponse | null>(null);
  const [displayMode, setDisplayMode] = useState<EvidenceDisplayMode>("within-band");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetId || !subjectId || windowIndex === null) {
      setEvidence(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cacheKey = `${datasetId}::${subjectId}::${source}::${windowIndex}`;
    const cachedEvidence = cacheRef.current.get(cacheKey);
    if (cachedEvidence) {
      setEvidence(cachedEvidence);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);

    TimeseriesService.computeClassEvidence(datasetId, subjectId, windowIndex, source)
      .then((response) => {
        cacheRef.current.set(cacheKey, response);
        if (!isCurrent) {
          return;
        }

        setEvidence(response);
      })
      .catch((loadError) => {
        if (!isCurrent) {
          return;
        }

        setEvidence(null);
        setError(getEvidenceErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [datasetId, source, subjectId, windowIndex]);

  const classLabels = useMemo(() => {
    if (!evidence?.bands.length) {
      return [];
    }

    const labels = evidence.bands[0]?.class_contributions.map((contribution) => contribution.class_label) ?? [];
    return labels;
  }, [evidence]);

  const maxAbsContribution = Math.max(evidence?.global_max_abs_contribution ?? 0, 1e-12);

  return (
    <div className="classification-evidence">
      <div className="classification-evidence-header">
        <div>
          <h3 className="classification-evidence-title">Classification evidence</h3>
          <p className="classification-evidence-subtitle">Band feature x class weight for the selected 4s window</p>
        </div>
        <div className="classification-evidence-header-side">
          <div className="classification-evidence-mode-toggle" aria-label="Evidence value mode">
            <button
              type="button"
              className={`classification-evidence-mode-button${displayMode === "within-band" ? " classification-evidence-mode-button--active" : ""}`}
              onClick={() => setDisplayMode("within-band")}
            >
              band
            </button>
            <button
              type="button"
              className={`classification-evidence-mode-button${displayMode === "raw" ? " classification-evidence-mode-button--active" : ""}`}
              onClick={() => setDisplayMode("raw")}
            >
              raw
            </button>
          </div>
          {evidence ? (
            <div className="classification-evidence-prediction">
              <strong>{evidence.predicted_label}</strong>
              <span>{Math.round(evidence.confidence * 100)}%</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="classification-evidence-body">
        {evidence ? (
          <>
            <div
              className="classification-evidence-grid"
              style={{ "--band-count": evidence.bands.length } as CSSProperties}
            >
              <div className="classification-evidence-corner" />
              {evidence.bands.map((band) => (
                <div key={band.band} className="classification-evidence-band">
                  <span>{band.band}</span>
                </div>
              ))}

              {classLabels.map((classLabel) => (
                <EvidenceClassRow
                  key={classLabel}
                  classLabel={classLabel}
                  evidence={evidence}
                  displayMode={displayMode}
                  maxAbsContribution={maxAbsContribution}
                  modelClasses={modelClasses}
                />
              ))}
            </div>

            <div className="classification-evidence-footer">
              <span>
                Window {evidence.window_index + 1}: {evidence.start_time.toFixed(1)}s-{evidence.end_time.toFixed(1)}s
              </span>
              <span>{displayMode === "within-band" ? "|contrib| - band mean" : evidence.unit_label}</span>
            </div>
          </>
        ) : null}

        {!evidence && !isLoading && !error ? (
          <div className="classification-evidence-empty">Click a 4s prediction window to inspect class evidence.</div>
        ) : null}
        {isLoading ? <div className="classification-evidence-empty">Loading class evidence...</div> : null}
        {error ? (
          <div className="classification-evidence-empty classification-evidence-empty--error">{error}</div>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceClassRow({
  classLabel,
  evidence,
  displayMode,
  maxAbsContribution,
  modelClasses,
}: {
  classLabel: string;
  evidence: ModelClassEvidenceResponse;
  displayMode: EvidenceDisplayMode;
  maxAbsContribution: number;
  modelClasses: ModelClassPresentation[];
}) {
  return (
    <>
      <div
        className={`classification-evidence-class${classLabel === evidence.predicted_label ? " classification-evidence-class--predicted" : ""}`}
        title={classLabel}
      >
        {formatClassLabel(classLabel, modelClasses)}
      </div>
      {evidence.bands.map((band) => {
        const contribution = band.class_contributions.find((item) => item.class_label === classLabel);
        const rawContributionValue = contribution?.contribution ?? 0;
        const contributionValue =
          displayMode === "within-band" ? getWithinBandContribution(rawContributionValue, band) : rawContributionValue;
        const colorScale = displayMode === "within-band" ? getMaxAbsWithinBandContribution(band) : maxAbsContribution;

        return (
          <div
            key={`${classLabel}-${band.band}`}
            className={`classification-evidence-cell${classLabel === evidence.predicted_label ? " classification-evidence-cell--predicted" : ""}`}
            style={{ background: getEvidenceColor(contributionValue, colorScale) }}
            title={`${band.band} -> ${classLabel}: ${formatContribution(contributionValue)}${
              displayMode === "within-band" ? ` within-band, raw ${rawContributionValue.toFixed(4)}` : ""
            }`}
          >
            {formatContribution(contributionValue)}
          </div>
        );
      })}
    </>
  );
}

function getWithinBandContribution(
  contributionValue: number,
  band: ModelClassEvidenceResponse["bands"][number],
): number {
  return Math.abs(contributionValue) - getMeanAbsBandContribution(band);
}

function getMaxAbsWithinBandContribution(band: ModelClassEvidenceResponse["bands"][number]): number {
  const meanAbsContribution = getMeanAbsBandContribution(band);
  return Math.max(
    ...band.class_contributions.map((contribution) =>
      Math.abs(Math.abs(contribution.contribution) - meanAbsContribution),
    ),
    1e-12,
  );
}

function getMeanAbsBandContribution(band: ModelClassEvidenceResponse["bands"][number]): number {
  if (!band.class_contributions.length) {
    return 0;
  }

  const absContributionSum = band.class_contributions.reduce(
    (sum, contribution) => sum + Math.abs(contribution.contribution),
    0,
  );
  return absContributionSum / band.class_contributions.length;
}

function getEvidenceColor(value: number, maxAbsContribution: number): string {
  const normalized = Math.max(-1, Math.min(1, value / maxAbsContribution));
  if (normalized < 0) {
    const strength = Math.abs(normalized);
    const red = Math.round(235 + (14 - 235) * strength);
    const green = Math.round(245 + (116 - 245) * strength);
    const blue = Math.round(248 + (144 - 248) * strength);
    return `rgb(${red} ${green} ${blue})`;
  }

  const red = Math.round(241 + (225 - 241) * normalized);
  const green = Math.round(245 + (29 - 245) * normalized);
  const blue = Math.round(249 + (72 - 249) * normalized);
  return `rgb(${red} ${green} ${blue})`;
}

function formatContribution(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatClassLabel(classLabel: string, modelClasses: ModelClassPresentation[]): string {
  return formatCompactClassLabel(classLabel, modelClasses);
}

function getEvidenceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Unable to load class evidence: ${error.message}`;
  }

  return "Unable to load class evidence.";
}

export type { ClassificationEvidencePanelProps };
