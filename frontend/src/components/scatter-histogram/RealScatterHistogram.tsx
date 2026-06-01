import React, { useEffect, useState } from "react";
import { ScatterHistogram } from "./NeuroScatterHistogram";
import { ModelService } from "../../services/ModelService";
import type { ModelPatientEmbeddingsResponse } from "../../types/ui";
import type { TimeseriesSource } from "../../types/ui";

interface RealScatterHistogramProps {
  datasetId?: string;
  modelName?: string;
  source?: TimeseriesSource;
}

export function RealScatterHistogram({
  datasetId = "ds004504",
  modelName,
  source = "derivatives",
}: RealScatterHistogramProps) {
  const [embeddings, setEmbeddings] = useState<ModelPatientEmbeddingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);

    ModelService.getPatientEmbeddings(datasetId, source, modelName)
      .then((resp) => {
        if (!mounted) return;
        setEmbeddings(resp);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(String(err));
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [datasetId, modelName, source]);

  if (isLoading) return <div>Loading patient embeddings…</div>;
  if (error) return <div>Error loading embeddings: {error}</div>;

  const patientsData =
    embeddings?.points.map((p) => ({
      id: p.subject_id,
      x: p.x,
      y: p.y,
      label: p.predicted_label ?? p.true_label ?? p.subject_id,
      meta: {
        true_label: p.true_label,
        predicted_label: p.predicted_label,
        mean_confidence: p.mean_confidence,
        total_windows: p.total_windows,
      },
    })) ?? [];

  return <ScatterHistogram patientsData={patientsData} />;
}

export default RealScatterHistogram;
