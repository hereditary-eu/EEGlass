export const isNumericValue = (value: unknown): value is number | string => {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (typeof value === "number") {
    return !Number.isNaN(value) && Number.isFinite(value);
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    return !Number.isNaN(numericValue) && Number.isFinite(numericValue);
  }

  return false;
};

export const isNumericDataPoint = (point: unknown[]): point is [number, number, ...unknown[]] =>
  point.length >= 2 && isNumericValue(point[0]) && isNumericValue(point[1]);
