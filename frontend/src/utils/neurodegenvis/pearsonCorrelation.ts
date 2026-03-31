import * as d3 from "d3";

export function pearsonCorrelation(x: number[], y: number[]) {
  if (x.length !== y.length) {
    throw new Error("The two columns must have the same length.");
  }

  const xMean = d3.mean(x) ?? 0;
  const yMean = d3.mean(y) ?? 0;

  const covariance = d3.sum(x, (_, index) => (x[index] - xMean) * (y[index] - yMean));
  const sigmaX = d3.sum(x, (value) => (value - xMean) ** 2);
  const sigmaY = d3.sum(y, (value) => (value - yMean) ** 2);

  return covariance / Math.sqrt(sigmaX * sigmaY);
}
