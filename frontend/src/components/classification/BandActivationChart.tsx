import { useEffect, useMemo, useRef, useState } from "react";
import { changeset } from "vega";
import type { View } from "vega";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import { MODEL_BAND_LABELS } from "../../constants/eegModel";
import type { ModelInfoResponse, TimeseriesSource } from "../../types";
import { resizeVegaView, useVegaLayoutResize } from "../../utils/vegaLayout";
import { ComponentStatusIndicator, MathFormula } from "../ui";
import { useModelClassEvidence } from "./useModelClassEvidence";

interface BandActivationChartProps {
  datasetId: string;
  subjectId: string;
  source: TimeseriesSource;
  modelInfo: ModelInfoResponse | null;
  windowIndex: number | null;
}

interface BandActivationDatum {
  order: number;
  band: string;
  label: string;
  activation: number;
  activationText: string;
}

const ACTIVATION_DATA_NAME = "bandActivationValues";

export function BandActivationChart({
  datasetId,
  subjectId,
  source,
  modelInfo,
  windowIndex,
}: BandActivationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const [plotHeight, setPlotHeight] = useState(132);
  useVegaLayoutResize(viewRef);

  const { evidence, isLoading, error } = useModelClassEvidence({
    datasetId,
    subjectId,
    source,
    modelInfo,
    windowIndex,
  });
  const values = useMemo(
    () =>
      evidence?.bands.map((band, order) => ({
        order,
        band: band.band,
        label: MODEL_BAND_LABELS[band.band] ?? band.band,
        activation: band.feature_value,
        activationText: formatActivation(band.feature_value),
      })) ?? [],
    [evidence],
  );
  const valuesRef = useRef<typeof values>([]);
  const status = getActivationStatus({ error, evidence, isLoading });

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(88, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
      resizeVegaView(viewRef.current);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!values.length || error || plotHeight <= 0) {
      viewRef.current = null;
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { name: ACTIVATION_DATA_NAME, values },
      layer: [
        {
          mark: {
            type: "rule",
            color: "#cbd5e1",
            strokeDash: [4, 3],
          },
          encoding: {
            y: {
              datum: 0,
              type: "quantitative",
              axis: createActivationAxis(),
              scale: { nice: true, zero: true },
            },
          },
        },
        {
          mark: {
            type: "line",
            interpolate: "monotone",
            point: {
              filled: true,
              fill: "#0e7490",
              stroke: "#064e56",
              size: 58,
              strokeWidth: 1.8,
            },
            color: "#0e7490",
            strokeWidth: 2.2,
          },
          encoding: {
            x: createBandAxisEncoding(),
            y: {
              field: "activation",
              type: "quantitative",
              axis: createActivationAxis(),
              scale: { nice: true, zero: true },
            },
            tooltip: [
              { field: "band", type: "nominal", title: "Band" },
              { field: "activation", type: "quantitative", title: "Activation Z_f", format: ".4f" },
              { field: "activationText", type: "nominal", title: "Displayed" },
            ],
          },
        },
      ],
      config: {
        view: { stroke: null },
      },
    };

    let finalized = false;
    const resultPromise = embed(container, spec, {
      actions: false,
      renderer: "svg",
    });

    resultPromise.catch(() => undefined);
    resultPromise
      .then((result) => {
        if (!finalized) {
          viewRef.current = result.view;
          resizeVegaView(result.view);
        }
      })
      .catch(() => undefined);

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      viewRef.current = null;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [error, plotHeight, values.length]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !values.length) {
      return;
    }

    view
      .change(
        ACTIVATION_DATA_NAME,
        changeset()
          .remove(() => true)
          .insert(valuesRef.current),
      )
      .runAsync()
      .catch(() => undefined);
  }, [values]);

  return (
    <div className="classification-band-activation-chart">
      <div className="classification-band-activation-chart-header">
        <div>
          <h4>Band activations</h4>
          <p>
            {evidence
              ? `Window ${evidence.window_index + 1}: ${evidence.start_time.toFixed(1)}s-${evidence.end_time.toFixed(1)}s`
              : windowIndex === null
                ? "Select a prediction window"
                : `Window ${windowIndex + 1}`}
          </p>
        </div>
        <span className="classification-band-activation-chart-stage">
          Encoder output <MathFormula tex={"Z_f"} /> before dense weights
          <ComponentStatusIndicator status={status.status} label={status.label} />
        </span>
      </div>

      <div className="classification-band-activation-chart-shell">
        <div className="classification-band-activation-chart-plot" ref={containerRef} />
        {!values.length || error ? (
          <div
            className={`classification-band-activation-chart-overlay${
              error ? " classification-band-activation-chart-overlay--error" : ""
            }`}
          >
            {error ?? (isLoading ? "Loading band activations..." : "Click a 4s prediction window to inspect activations.")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function createBandAxisEncoding() {
  return {
    field: "label",
    type: "ordinal",
    sort: { field: "order", order: "ascending" },
    axis: {
      title: null,
      labelAngle: -90,
      labelColor: "#5d6b78",
      labelFontSize: 10,
      tickColor: "#d7e0e8",
      domainColor: "#d7e0e8",
    },
  };
}

function createActivationAxis() {
  return {
    title: "Activation",
    titleColor: "#5d6b78",
    titleFontSize: 10,
    labelColor: "#5d6b78",
    labelFontSize: 10,
    format: ".2f",
    tickCount: 5,
    gridColor: "#e8eef3",
    domain: false,
  };
}

function formatActivation(value: number): string {
  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(2);
  }

  return value.toFixed(3);
}

function getActivationStatus({
  error,
  evidence,
  isLoading,
}: {
  error: string | null;
  evidence: unknown;
  isLoading: boolean;
}): { status: "idle" | "loading" | "loaded" | "error"; label: string } {
  if (error) {
    return { status: "error", label: error };
  }

  if (isLoading) {
    return { status: "loading", label: "Loading band activations" };
  }

  if (evidence) {
    return { status: "loaded", label: "Band activations loaded" };
  }

  return { status: "idle", label: "Band activations idle" };
}

export type { BandActivationChartProps };
