export function linearRegression(xValues: number[], yValues: number[]): [number, number] {
  const validPairs = xValues
    .map((xValue, index) => [xValue, yValues[index]] as const)
    .filter(([xValue, yValue]) => !Number.isNaN(xValue) && !Number.isNaN(yValue));

  if (validPairs.length === 0) {
    return [0, 0];
  }

  const xSum = validPairs.reduce((sum, [xValue]) => sum + xValue, 0);
  const ySum = validPairs.reduce((sum, [, yValue]) => sum + yValue, 0);
  const xxSum = validPairs.reduce((sum, [xValue]) => sum + xValue * xValue, 0);
  const xySum = validPairs.reduce((sum, [xValue, yValue]) => sum + xValue * yValue, 0);
  const count = validPairs.length;
  const denominator = count * xxSum - xSum * xSum;

  if (denominator === 0) {
    return [0, ySum / count];
  }

  const slope = (count * xySum - xSum * ySum) / denominator;
  const intercept = ySum / count - (slope * xSum) / count;

  return [slope, intercept];
}

export function averageLine(yValues: number[]): [number, number] {
  if (yValues.length === 0) {
    return [0, 0];
  }

  return [0, yValues.reduce((sum, value) => sum + value, 0) / yValues.length];
}
