import type {
  ClusterPoint,
  ClusterProfile,
  ClusteringResult,
  EmployeeRecord,
  PredictionInput,
  SilhouetteEvaluation,
} from "../types/hr";

// Deterministic Mulberry32 PRNG for reproducible K-Means++ initialization
function createRng(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sqDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function euclidDist(a: number[], b: number[]): number {
  return Math.sqrt(sqDist(a, b));
}

function runKMeansSingle(
  X: number[][],
  k: number,
  seed: number,
  maxIter = 60
): { assignments: number[]; centroids: number[][]; inertia: number } {
  const n = X.length;
  const d = X[0].length;
  const rng = createRng(seed);

  // K-Means++ initialization
  const centroids: number[][] = [];
  const firstIdx = Math.floor(rng() * n);
  centroids.push([...X[firstIdx]]);

  const minDists = new Array<number>(n).fill(Number.POSITIVE_INFINITY);

  for (let c = 1; c < k; c++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const dist = sqDist(X[i], centroids[c - 1]);
      if (dist < minDists[i]) minDists[i] = dist;
      sumSq += minDists[i];
    }

    if (sumSq === 0) {
      centroids.push([...X[Math.floor(rng() * n)]]);
      continue;
    }

    let r = rng() * sumSq;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= minDists[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push([...X[chosen]]);
  }

  const assignments = new Array<number>(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < k; c++) {
        const dist = sqDist(X[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestC = c;
        }
      }
      if (assignments[i] !== bestC) {
        assignments[i] = bestC;
        changed = true;
      }
    }

    // Recompute centroids
    const sums: number[][] = Array.from({ length: k }, () => new Array<number>(d).fill(0));
    const counts = new Array<number>(k).fill(0);

    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c] += 1;
      for (let j = 0; j < d; j++) {
        sums[c][j] += X[i][j];
      }
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let j = 0; j < d; j++) {
          centroids[c][j] = sums[c][j] / counts[c];
        }
      } else {
        // Re-seed empty centroid to farthest point
        let farIdx = 0;
        let maxD = -1;
        for (let i = 0; i < n; i++) {
          const dist = sqDist(X[i], centroids[assignments[i]]);
          if (dist > maxD) {
            maxD = dist;
            farIdx = i;
          }
        }
        centroids[c] = [...X[farIdx]];
      }
    }

    if (!changed) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += sqDist(X[i], centroids[assignments[i]]);
  }

  return { assignments, centroids, inertia };
}

function runBestKMeans(X: number[][], k: number, restarts = 8) {
  let best = runKMeansSingle(X, k, 42 + k * 101);
  for (let r = 1; r < restarts; r++) {
    const candidate = runKMeansSingle(X, k, 42 + k * 101 + r * 37);
    if (candidate.inertia < best.inertia) {
      best = candidate;
    }
  }
  return best;
}

function computeSilhouetteScore(X: number[][], assignments: number[], k: number): number {
  const n = X.length;
  if (n <= k || k < 2) return 0;

  // Group indices by cluster
  const clusterIndices: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) {
    clusterIndices[assignments[i]].push(i);
  }
  if (clusterIndices.some((c) => c.length === 0)) return -1;

  // For large datasets (>600), subsample deterministically to keep UI <50ms
  const step = n > 600 ? Math.ceil(n / 400) : 1;
  let totalS = 0;
  let evaluated = 0;

  for (let i = 0; i < n; i += step) {
    const ownCluster = assignments[i];
    const ownMembers = clusterIndices[ownCluster];

    let a = 0;
    if (ownMembers.length > 1) {
      for (const m of ownMembers) {
        if (m !== i) a += euclidDist(X[i], X[m]);
      }
      a /= ownMembers.length - 1;
    }

    let b = Number.POSITIVE_INFINITY;
    for (let c = 0; c < k; c++) {
      if (c === ownCluster) continue;
      const members = clusterIndices[c];
      let sumD = 0;
      for (const m of members) {
        sumD += euclidDist(X[i], X[m]);
      }
      const meanD = sumD / members.length;
      if (meanD < b) b = meanD;
    }

    const denom = Math.max(a, b);
    const s = denom > 0 ? (b - a) / denom : 0;
    totalS += s;
    evaluated += 1;
  }

  return evaluated > 0 ? totalS / evaluated : 0;
}

// Exact Jacobi Eigenvalue Decomposition on symmetric covariance matrix for PCA
function computePca2D(X: number[][], featureNames: string[]) {
  const n = X.length;
  const d = X[0].length;

  // Center columns
  const colMeans = new Array<number>(d).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) colMeans[j] += X[i][j];
  }
  for (let j = 0; j < d; j++) colMeans[j] /= n;

  const centered = X.map((row) => row.map((v, j) => v - colMeans[j]));

  // Covariance matrix (d x d)
  const cov: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let i = 0; i < n; i++) {
    const row = centered[i];
    for (let a = 0; a < d; a++) {
      for (let b = a; b < d; b++) {
        cov[a][b] += row[a] * row[b];
      }
    }
  }
  const denom = Math.max(1, n - 1);
  for (let a = 0; a < d; a++) {
    for (let b = a; b < d; b++) {
      cov[a][b] /= denom;
      cov[b][a] = cov[a][b];
    }
  }

  // Jacobi rotations
  const V: number[][] = Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (__, j) => (i === j ? 1 : 0))
  );
  const A = cov.map((r) => [...r]);

  const maxSweeps = 50;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOff = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const val = Math.abs(A[i][j]);
        if (val > maxOff) {
          maxOff = val;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < 1e-9) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    const tau = (aqq - app) / (2 * apq);
    const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    A[p][p] = app - t * apq;
    A[q][q] = aqq + t * apq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let r = 0; r < d; r++) {
      if (r !== p && r !== q) {
        const arp = A[r][p];
        const arq = A[r][q];
        A[r][p] = c * arp - s * arq;
        A[p][r] = A[r][p];
        A[r][q] = s * arp + c * arq;
        A[q][r] = A[r][q];
      }
    }

    for (let r = 0; r < d; r++) {
      const vrp = V[r][p];
      const vrq = V[r][q];
      V[r][p] = c * vrp - s * vrq;
      V[r][q] = s * vrp + c * vrq;
    }
  }

  const eigenPairs = Array.from({ length: d }, (_, idx) => ({
    eigenvalue: Math.max(0, A[idx][idx]),
    vector: V.map((row) => row[idx]),
  })).sort((a, b) => b.eigenvalue - a.eigenvalue);

  const totalVar = eigenPairs.reduce((acc, e) => acc + e.eigenvalue, 0) || 1;
  const pc1Vec = eigenPairs[0].vector;
  const pc2Vec = eigenPairs[1]?.vector ?? new Array<number>(d).fill(0);

  const pc1VariancePct = (eigenPairs[0].eigenvalue / totalVar) * 100;
  const pc2VariancePct = ((eigenPairs[1]?.eigenvalue ?? 0) / totalVar) * 100;

  const topDrivers = (vec: number[]) =>
    vec
      .map((loading, idx) => ({ name: featureNames[idx], abs: Math.abs(loading), sign: loading >= 0 ? "+" : "-" }))
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 3)
      .map((x) => `${x.name} (${x.sign})`);

  const projected = centered.map((row) => {
    let x = 0;
    let y = 0;
    for (let j = 0; j < d; j++) {
      x += row[j] * pc1Vec[j];
      y += row[j] * pc2Vec[j];
    }
    return { pc1: Number(x.toFixed(3)), pc2: Number(y.toFixed(3)) };
  });

  return {
    projected,
    pc1VariancePct: Number(pc1VariancePct.toFixed(1)),
    pc2VariancePct: Number(pc2VariancePct.toFixed(1)),
    pc1TopDrivers: topDrivers(pc1Vec),
    pc2TopDrivers: topDrivers(pc2Vec),
  };
}

export function performEmployeeClustering(
  records: EmployeeRecord[],
  forcedK?: number
): ClusteringResult {
  if (records.length < 15) {
    return {
      optimalK: 0,
      selectedK: 0,
      silhouetteScores: [],
      pc1VariancePct: 0,
      pc2VariancePct: 0,
      pc1TopDrivers: [],
      pc2TopDrivers: [],
      clusters: [],
      points: [],
      featureNames: [],
      standardizeParams: {
        means: [],
        stds: [],
        numericCount: 0,
        departments: [],
        employmentTypes: [],
        catScaleDept: 1,
        catScaleEmpType: 1,
      },
      validRecordCount: records.length,
      sufficientForClustering: false,
      message: "At least 15 employee records are required in the current filter scope to form meaningful clusters.",
    };
  }

  // Strictly exclude Employee_ID, Exit_Date, Employment_Status, Attrition_Status (and Age/Gender kept separate)
  // Numeric features: Satisfaction, Performance, Training Hours, Absence Days, Salary, Tenure, Overtime(0/1)
  const numericExtractors: Array<{ name: string; get: (r: EmployeeRecord) => number | null }> = [
    { name: "Job Satisfaction", get: (r) => r.jobSatisfactionScore },
    { name: "Performance Rating", get: (r) => r.performanceRating },
    { name: "Training Hours", get: (r) => r.trainingHours },
    { name: "Absence Days", get: (r) => r.absenceDays },
    { name: "Salary (NGN)", get: (r) => r.salaryNGN },
    { name: "Tenure (Years)", get: (r) => r.tenureYears },
    { name: "Overtime", get: (r) => (r.overtime ? 1 : 0) },
  ];

  // Compute column means for imputation of occasional missing values
  const colMeans = numericExtractors.map(({ get }) => {
    const vals = records.map(get).filter((v): v is number => v !== null && Number.isFinite(v));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  const colStds = numericExtractors.map(({ get }, idx) => {
    const vals = records.map((r) => get(r) ?? colMeans[idx]);
    const mean = colMeans[idx];
    const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, vals.length);
    return Math.sqrt(variance) || 1;
  });

  const departments = Array.from(new Set(records.map((r) => r.department))).sort();
  const employmentTypes = Array.from(new Set(records.map((r) => r.employmentType))).sort();

  // Scale categorical one-hot blocks so each categorical variable carries roughly unit variance weight
  const catScaleDept = departments.length > 1 ? 1 / Math.sqrt(departments.length) : 0;
  const catScaleEmpType = employmentTypes.length > 1 ? 1 / Math.sqrt(employmentTypes.length) : 0;

  const featureNames = [
    ...numericExtractors.map((n) => n.name),
    ...(departments.length > 1 ? departments.map((d) => `Dept: ${d}`) : []),
    ...(employmentTypes.length > 1 ? employmentTypes.map((e) => `Type: ${e}`) : []),
  ];

  const X: number[][] = records.map((r) => {
    const vec: number[] = numericExtractors.map(({ get }, j) => {
      const raw = get(r) ?? colMeans[j];
      return (raw - colMeans[j]) / colStds[j];
    });
    if (departments.length > 1) {
      for (const d of departments) {
        vec.push(r.department === d ? catScaleDept : 0);
      }
    }
    if (employmentTypes.length > 1) {
      for (const e of employmentTypes) {
        vec.push(r.employmentType === e ? catScaleEmpType : 0);
      }
    }
    return vec;
  });

  // Evaluate Silhouette scores for k = 2..5 (or capped by record count)
  const maxK = Math.min(5, Math.floor(records.length / 5));
  const candidateKs: number[] = [];
  for (let k = 2; k <= maxK; k++) candidateKs.push(k);
  if (candidateKs.length === 0) candidateKs.push(2);

  const modelsByK = new Map<
    number,
    { assignments: number[]; centroids: number[][]; inertia: number; silhouette: number }
  >();

  for (const k of candidateKs) {
    const res = runBestKMeans(X, k, 8);
    const sil = computeSilhouetteScore(X, res.assignments, k);
    modelsByK.set(k, { ...res, silhouette: sil });
  }

  const silhouetteScores: SilhouetteEvaluation[] = candidateKs.map((k) => ({
    k,
    score: Number((modelsByK.get(k)?.silhouette ?? 0).toFixed(4)),
  }));

  const optimalK = silhouetteScores.reduce(
    (best, cur) => (cur.score > best.score ? cur : best),
    silhouetteScores[0]
  ).k;

  const selectedK = forcedK && modelsByK.has(forcedK) ? forcedK : optimalK;
  const chosenModel = modelsByK.get(selectedK)!;

  // PCA 2D projection
  const pca = computePca2D(X, featureNames);

  // Overall baseline attrition rate
  const baselineRate =
    records.length > 0 ? (records.filter((r) => r.hasLeft).length / records.length) * 100 : 0;

  // Build raw cluster summaries, then sort by historical attrition rate ascending -> Cluster A, B, C...
  const rawClusters = Array.from({ length: selectedK }, (_, cId) => {
    const indices: number[] = [];
    for (let i = 0; i < records.length; i++) {
      if (chosenModel.assignments[i] === cId) indices.push(i);
    }
    const members = indices.map((i) => records[i]);
    const count = members.length;
    const exitedCount = members.filter((m) => m.hasLeft).length;
    const attritionRatePct = count > 0 ? (exitedCount / count) * 100 : 0;

    const avgOf = (fn: (m: EmployeeRecord) => number | null) => {
      const vals = members.map(fn).filter((v): v is number => v !== null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const topCounts = (arr: string[]) => {
      const map = new Map<string, number>();
      for (const item of arr) map.set(item, (map.get(item) ?? 0) + 1);
      return Array.from(map.entries())
        .map(([name, c]) => ({ name, count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);
    };

    return {
      rawId: cId,
      count,
      workforcePct: records.length > 0 ? (count / records.length) * 100 : 0,
      attritionRatePct,
      exitedCount,
      avgSatisfaction: avgOf((m) => m.jobSatisfactionScore),
      avgPerformance: avgOf((m) => m.performanceRating),
      avgAbsenceDays: avgOf((m) => m.absenceDays),
      avgTrainingHours: avgOf((m) => m.trainingHours),
      avgSalaryNGN: avgOf((m) => m.salaryNGN),
      overtimePct: count > 0 ? (members.filter((m) => m.overtime).length / count) * 100 : 0,
      topDepartments: topCounts(members.map((m) => m.department)),
      topEmploymentTypes: topCounts(members.map((m) => m.employmentType)),
      centroidScaled: chosenModel.centroids[cId],
    };
  }).sort((a, b) => a.attritionRatePct - b.attritionRatePct);

  const letters = ["A", "B", "C", "D", "E"];
  const rawToSortedIdx = new Map<number, number>();
  const clusters: ClusterProfile[] = rawClusters.map((rc, sortedIdx) => {
    rawToSortedIdx.set(rc.rawId, sortedIdx);
    const code = `Cluster ${letters[sortedIdx] ?? sortedIdx + 1}`;
    const delta = rc.attritionRatePct - baselineRate;

    let riskTier: "low" | "moderate" | "high" = "moderate";
    let tierTitle = `${code}: Retention Watchlist`;
    let tierDescription = `Employees in this segment exhibit a moderate historical attrition rate (${rc.attritionRatePct.toFixed(
      1
    )}%), close to the ${baselineRate.toFixed(1)}% cohort average.`;

    if (selectedK === 3) {
      if (sortedIdx === 0) {
        riskTier = "low";
        tierTitle = `${code}: Higher Retention`;
        tierDescription = `Lowest historical attrition segment (${rc.attritionRatePct.toFixed(
          1
        )}% vs ${baselineRate.toFixed(1)}% cohort baseline).`;
      } else if (sortedIdx === 1) {
        riskTier = "moderate";
        tierTitle = `${code}: Retention Watchlist`;
        tierDescription = `Moderate historical attrition segment (${rc.attritionRatePct.toFixed(
          1
        )}% vs ${baselineRate.toFixed(1)}% cohort baseline).`;
      } else {
        riskTier = "high";
        tierTitle = `${code}: Higher Attrition`;
        tierDescription = `Highest historical attrition segment (${rc.attritionRatePct.toFixed(
          1
        )}% vs ${baselineRate.toFixed(1)}% cohort baseline).`;
      }
    } else if (delta <= -3) {
      riskTier = "low";
      tierTitle = `${code}: Higher Retention`;
      tierDescription = `Below-average historical attrition (${rc.attritionRatePct.toFixed(
        1
      )}% vs ${baselineRate.toFixed(1)}% baseline).`;
    } else if (delta >= 3) {
      riskTier = "high";
      tierTitle = `${code}: Higher Attrition`;
      tierDescription = `Elevated historical attrition (${rc.attritionRatePct.toFixed(
        1
      )}% vs ${baselineRate.toFixed(1)}% baseline).`;
    }

    return {
      id: sortedIdx,
      code,
      tierTitle,
      tierDescription,
      riskTier,
      count: rc.count,
      workforcePct: rc.workforcePct,
      attritionRatePct: rc.attritionRatePct,
      exitedCount: rc.exitedCount,
      avgSatisfaction: rc.avgSatisfaction,
      avgPerformance: rc.avgPerformance,
      avgAbsenceDays: rc.avgAbsenceDays,
      avgTrainingHours: rc.avgTrainingHours,
      avgSalaryNGN: rc.avgSalaryNGN,
      overtimePct: rc.overtimePct,
      topDepartments: rc.topDepartments,
      topEmploymentTypes: rc.topEmploymentTypes,
      centroidScaled: rc.centroidScaled,
    };
  });

  const points: ClusterPoint[] = records.map((r, i) => {
    const sortedIdx = rawToSortedIdx.get(chosenModel.assignments[i]) ?? 0;
    const clusterObj = clusters[sortedIdx];
    return {
      employeeId: r.employeeId,
      clusterId: sortedIdx,
      clusterCode: clusterObj.code,
      pc1: pca.projected[i].pc1,
      pc2: pca.projected[i].pc2,
      department: r.department,
      jobRole: r.jobRole,
      hasLeft: r.hasLeft,
      satisfaction: r.jobSatisfactionScore,
      performance: r.performanceRating,
      salaryNGN: r.salaryNGN,
      tenureYears: r.tenureYears,
      overtime: r.overtime,
    };
  });

  return {
    optimalK,
    selectedK,
    silhouetteScores,
    pc1VariancePct: pca.pc1VariancePct,
    pc2VariancePct: pca.pc2VariancePct,
    pc1TopDrivers: pca.pc1TopDrivers,
    pc2TopDrivers: pca.pc2TopDrivers,
    clusters,
    points,
    featureNames,
    standardizeParams: {
      means: colMeans,
      stds: colStds,
      numericCount: numericExtractors.length,
      departments,
      employmentTypes,
      catScaleDept,
      catScaleEmpType,
    },
    validRecordCount: records.length,
    sufficientForClustering: true,
  };
}

export function assignInputToCluster(
  input: PredictionInput,
  clustering: ClusteringResult
): ClusterProfile | undefined {
  if (!clustering.sufficientForClustering || clustering.clusters.length === 0) return undefined;

  const { means, stds, departments, employmentTypes, catScaleDept, catScaleEmpType } =
    clustering.standardizeParams;

  const rawNumeric = [
    input.jobSatisfactionScore,
    input.performanceRating,
    input.trainingHours,
    input.absenceDays,
    input.salaryNGN,
    input.tenureYears,
    input.overtime ? 1 : 0,
  ];

  const vec: number[] = rawNumeric.map((val, j) => (val - means[j]) / (stds[j] || 1));

  if (departments.length > 1) {
    for (const d of departments) {
      vec.push(input.department === d ? catScaleDept : 0);
    }
  }
  if (employmentTypes.length > 1) {
    for (const e of employmentTypes) {
      vec.push(input.employmentType === e ? catScaleEmpType : 0);
    }
  }

  let bestCluster = clustering.clusters[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of clustering.clusters) {
    if (c.centroidScaled.length !== vec.length) continue;
    const d = sqDist(vec, c.centroidScaled);
    if (d < bestDist) {
      bestDist = d;
      bestCluster = c;
    }
  }

  return bestCluster;
}
