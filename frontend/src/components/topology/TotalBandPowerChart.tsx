import { useEffect, useMemo, useRef, useState } from "react";
import embed from "vega-embed";
import type { VisualizationSpec } from "vega-embed";

import type { ModelBandPowerResponse } from "../../types";

interface TotalBandPowerChartProps {
  bandPower: ModelBandPowerResponse | null;
  isLoading: boolean;
  error: string | null;
}

const BAND_LABELS: Record<string, string> = {
  delta: "delta",
  theta: "theta",
  alpha: "alpha",
  beta1: "beta1",
  beta2: "beta2",
  beta3: "beta3",
  gamma: "gamma",
};

export function TotalBandPowerChart({ bandPower, isLoading, error }: TotalBandPowerChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [plotHeight, setPlotHeight] = useState(240);

  const channels = bandPower?.channels ?? [];
  const availableChannels = useMemo(() => channels.map((channel) => channel.channel), [channels]);

  useEffect(() => {
    if (!availableChannels.length) {
      setSelectedChannel(null);
      return;
    }

    setSelectedChannel((current) => (current && availableChannels.includes(current) ? current : availableChannels[0]));
  }, [availableChannels]);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.channel === selectedChannel) ?? channels[0] ?? null,
    [channels, selectedChannel],
  );

  const values = useMemo(
    () =>
      (activeChannel?.bands ?? []).map((band, index) => ({
        order: index,
        band: band.band,
        label: BAND_LABELS[band.band] ?? band.band,
        relativePower: band.relative_power,
        percent: band.relative_power * 100,
        range: `${band.start_hz.toFixed(1)}-${band.end_hz.toFixed(1)} Hz`,
      })),
    [activeChannel],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.max(180, Math.floor(entry.contentRect.height));
      setPlotHeight((current) => (current !== nextHeight ? nextHeight : current));
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
    if (!values.length || isLoading || error || plotHeight <= 0) {
      return;
    }

    const spec: VisualizationSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      width: "container",
      height: plotHeight,
      autosize: {
        type: "fit",
        contains: "padding",
        resize: true,
      },
      background: "transparent",
      data: { values },
      mark: {
        type: "line",
        interpolate: "monotone",
        point: {
          filled: true,
          fill: "#0e7490",
          stroke: "#064e56",
          size: 74,
          strokeWidth: 2,
        },
        color: "#0e7490",
        strokeWidth: 2.5,
      },
      encoding: {
        x: {
          field: "label",
          type: "ordinal",
          sort: { field: "order", order: "ascending" },
          axis: {
            title: null,
            labelColor: "#5d6b78",
            labelFontSize: 12,
            tickColor: "#d7e0e8",
            domainColor: "#d7e0e8",
          },
        },
        y: {
          field: "relativePower",
          type: "quantitative",
          axis: {
            title: "Relative power",
            titleColor: "#5d6b78",
            titleFontSize: 11,
            labelColor: "#5d6b78",
            labelFontSize: 11,
            format: ".0%",
            tickCount: 5,
            gridColor: "#e8eef3",
            domain: false,
          },
          scale: { domain: [0, 1], nice: false, zero: true },
        },
        tooltip: [
          { field: "band", type: "nominal", title: "Band" },
          { field: "range", type: "nominal", title: "Range" },
          { field: "percent", type: "quantitative", title: "Relative power (%)", format: ".2f" },
        ],
      },
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

    return () => {
      if (finalized) {
        return;
      }

      finalized = true;
      resultPromise.then((result) => result.finalize()).catch(() => undefined);
    };
  }, [error, isLoading, plotHeight, values]);

  return (
    <div className="topology-bandpower">
      <div className="topology-bandpower-header">
        <div>
          <h4 className="topology-bandpower-title">Total band power</h4>
          <p className="topology-bandpower-subtitle">
            {activeChannel ? `Channel ${activeChannel.channel}` : "Select a subject to view channel band power"}
          </p>
        </div>
        {bandPower ? (
          <span className="topology-bandpower-meta">{bandPower.sampling_frequency.toFixed(0)} Hz</span>
        ) : null}
      </div>

      <div className="topology-bandpower-body">
        <div className="topology-bandpower-channel-list" aria-label="Channel selector">
          {availableChannels.map((channel) => (
            <button
              key={channel}
              type="button"
              className={`topology-bandpower-channel${activeChannel?.channel === channel ? " topology-bandpower-channel--active" : ""}`}
              onClick={() => setSelectedChannel(channel)}
            >
              {channel}
            </button>
          ))}
        </div>

        <div className="topology-bandpower-plot-shell">
          <div className="topology-bandpower-plot" ref={containerRef} />
        </div>
      </div>

      {isLoading ? <div className="topology-bandpower-overlay">Loading band power...</div> : null}
      {error ? <div className="topology-bandpower-overlay topology-bandpower-overlay--error">{error}</div> : null}
      {!isLoading && !error && !channels.length ? (
        <div className="topology-bandpower-overlay">Band power appears once a signal is available.</div>
      ) : null}
    </div>
  );
}

export type { TotalBandPowerChartProps };
