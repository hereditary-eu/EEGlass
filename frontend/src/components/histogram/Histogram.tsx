import React, { memo, useId, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts/es6";
import "./Histogram.css";

interface HistogramProps {
  data: number[];
  variant?: "tiny" | "big";
  width?: number;
  height?: number;
  initialBins?: number;
  showControls?: boolean;
  showAxes?: boolean;
  showTooltip?: boolean;
  showGrid?: boolean;
  barColor?: string;
  animated?: boolean;
  title?: string;
}

const rootClass = "cif-histogram";
const styles = {
  wrapper: "wrapper",
  title: "title",
  controls: "controls",
  binSelect: "binSelect",
  customTooltip: "customTooltip",
  tooltipLine: "tooltipLine",
} as const;

const Histogram: React.FC<HistogramProps> = ({
  data,
  variant = "big",
  width = variant === "tiny" ? 100 : undefined,
  height = variant === "tiny" ? 30 : 300,
  initialBins = 10,
  showControls = variant === "big",
  showAxes = variant === "big",
  showTooltip = variant === "big",
  showGrid = variant === "big",
  barColor = "#8884d8",
  animated = false,
  title,
}) => {
  const [bins, setBins] = useState(initialBins);
  const chartId = useId();
  const binOptions = [2, 5, 10, 15, 20, 25, 30];

  if (!data || data.length === 0) {
    return null;
  }

  const histogramData = useMemo(() => {
    const numericData = data.filter((value): value is number => Number.isFinite(value));

    if (numericData.length === 0) {
      return [];
    }

    const min = Math.min(...numericData);
    const max = Math.max(...numericData);
    const binWidth = max === min ? 1 : (max - min) / bins;

    const computedHistogramData = Array.from({ length: bins }, (_, index) => {
      const lowerBound = min + index * binWidth;
      const upperBound = min + (index + 1) * binWidth;

      let binLabel: string;
      if (max < 0.1) {
        binLabel = lowerBound.toExponential(1);
      } else if (max > 1000) {
        binLabel = `${Math.round(lowerBound)}`;
      } else {
        const decimals = max < 1 ? 3 : max < 10 ? 2 : max < 100 ? 1 : 0;
        binLabel = lowerBound.toFixed(decimals);
      }

      return {
        bin: binLabel,
        fullLabel: `${lowerBound.toFixed(3)} - ${upperBound.toFixed(3)}`,
        count: 0,
      };
    });

    numericData.forEach((value) => {
      const normalizedIndex = Math.floor((value - min) / binWidth);
      const binIndex = Math.min(Math.max(normalizedIndex, 0), bins - 1);

      if (computedHistogramData[binIndex]) {
        computedHistogramData[binIndex].count += 1;
      }
    });

    return computedHistogramData;
  }, [bins, data]);

  if (histogramData.length === 0) {
    return null;
  }

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: { bin: string; fullLabel: string; count: number }; value: number }>;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p className={styles.tooltipLine}>{`Range: ${payload[0]?.payload.fullLabel}`}</p>
          <p className={styles.tooltipLine}>{`Count: ${payload[0]?.value ?? 0}`}</p>
        </div>
      );
    }

    return null;
  };

  const chartMargin =
    variant === "big" ? { top: 20, right: 30, bottom: 20, left: 20 } : { top: 0, right: 0, bottom: 0, left: 0 };

  const chart = (
    <BarChart width={width} height={height} data={histogramData} margin={chartMargin}>
      {showGrid && <CartesianGrid strokeDasharray="3 3" />}
      {showAxes && (
        <XAxis dataKey="bin" angle={-45} textAnchor="end" height={60} interval={0} tick={{ fontSize: 10 }} />
      )}
      {showAxes && <YAxis />}
      {showTooltip && <Tooltip content={<CustomTooltip />} />}
      <Bar dataKey="count" fill={barColor} isAnimationActive={animated} id={`histogram-${variant}-${chartId}`} />
    </BarChart>
  );

  return (
    <div className={`${rootClass} ${styles.wrapper}`}>
      {title && (
        <div className={styles.title}>
          <strong>{title}</strong>
        </div>
      )}
      {showControls && (
        <div className={styles.controls}>
          <label>Bin Count: </label>
          <select value={bins} onChange={(event) => setBins(Number(event.target.value))} className={styles.binSelect}>
            {binOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}
      {width ? (
        chart
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={histogramData} margin={chartMargin}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" />}
            {showAxes && (
              <XAxis dataKey="bin" angle={-45} textAnchor="end" height={60} interval={0} tick={{ fontSize: 10 }} />
            )}
            {showAxes && <YAxis />}
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            <Bar dataKey="count" fill={barColor} isAnimationActive={animated} id={`histogram-${variant}-${chartId}`} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default memo(Histogram);
