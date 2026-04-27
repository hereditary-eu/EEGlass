import type { NeuroPatient } from "../../types/neuro";

type Point = number[];

function euclideanDistance(pointA: Point, pointB: Point) {
  return Math.sqrt(pointA.reduce((sum, value, index) => sum + (value - pointB[index]) ** 2, 0));
}

function initializeCentroids(data: Point[], k: number) {
  const centroids: Point[] = [data[0]];

  while (centroids.length < k) {
    const distances = data.map((point) => Math.min(...centroids.map((centroid) => euclideanDistance(point, centroid))));
    const weightedDistances = distances.map((distance) => distance ** 2);
    const totalDistance = weightedDistances.reduce((sum, value) => sum + value, 0);

    if (totalDistance === 0) {
      while (centroids.length < k) {
        centroids.push(data[centroids.length % data.length]);
      }
      return centroids;
    }

    const target = totalDistance * (centroids.length / k);
    let cumulative = 0;

    for (let index = 0; index < data.length; index += 1) {
      cumulative += weightedDistances[index];
      if (cumulative >= target) {
        centroids.push(data[index]);
        break;
      }
    }
  }

  return centroids;
}

function assignClusters(data: Point[], centroids: Point[]) {
  return data.map((point) => {
    let closestIndex = 0;
    let minDistance = euclideanDistance(point, centroids[0]);

    for (let index = 1; index < centroids.length; index += 1) {
      const distance = euclideanDistance(point, centroids[index]);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    }

    return closestIndex;
  });
}

function updateCentroids(data: Point[], assignments: number[], k: number) {
  const nextCentroids = Array.from({ length: k }, () => Array(data[0].length).fill(0));
  const counts = Array(k).fill(0);

  assignments.forEach((clusterIndex, rowIndex) => {
    counts[clusterIndex] += 1;
    data[rowIndex].forEach((value, columnIndex) => {
      nextCentroids[clusterIndex][columnIndex] += value;
    });
  });

  return nextCentroids.map((centroid, index) =>
    counts[index] === 0 ? centroid : centroid.map((value) => value / counts[index]),
  );
}

export function kMeans(data: Point[], k: number, maxIterations = 50) {
  if (data.length === 0 || k <= 0) {
    throw new Error("Data must not be empty and k must be greater than 0.");
  }

  let centroids = initializeCentroids(data, k);
  let assignments = Array(data.length).fill(0);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextAssignments = assignClusters(data, centroids);
    const nextCentroids = updateCentroids(data, nextAssignments, k);
    const converged = centroids.every(
      (centroid, index) => euclideanDistance(centroid, nextCentroids[index]) < 1e-6,
    );

    assignments = nextAssignments;
    centroids = nextCentroids;

    if (converged) {
      break;
    }
  }

  return assignments;
}

export function assignNeuroKMeansClusters(patients: NeuroPatient[], k: number) {
  if (k <= 1) {
    return patients.map((patient) => ({
      ...patient,
      k_mean_cluster: patient.valid_pc ? 0 : -1,
    }));
  }

  const validPatients = patients.filter((patient) => patient.valid_pc);
  const clusteringData = validPatients.map((patient) => [Number(patient.pc1), Number(patient.pc2)]);
  const assignments = kMeans(clusteringData, k);

  let assignmentIndex = 0;
  return patients.map((patient) => {
    if (!patient.valid_pc) {
      return { ...patient, k_mean_cluster: -1 };
    }

    const cluster = assignments[assignmentIndex];
    assignmentIndex += 1;
    return { ...patient, k_mean_cluster: cluster };
  });
}
