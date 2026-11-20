import type {
  ClusterProfile,
  EmployeeRecord,
  ModelEvaluation,
  PredictionInput,
  PredictionResult,
  PredictorAlgorithm,
  PredictorMode,
} from "../types/hr";

interface FeatureSchema {
  mode: PredictorMode;
  numericSpecs: Array<{
    key: string;
    label: string;
    mean: number;
    std: number;
    getFromRecord: (r: EmployeeRecord) => number | null;
    getFromInput: (inp: PredictionInput) => number;
  }>;
  categoricalSpecs: Array<{
    key: string;
    label: string;
    categories: string[];
    getFromRecord: (r: EmployeeRecord) => string;
    getFromInput: (inp: PredictionInput) => string;
  }>;
  featureNames: string[];
}

interface TrainedLogistic {
  type: "logistic";
  weights: number[];
  bias: number;
  schema: FeatureSchema;
  evaluation: ModelEvaluation;
  baselineProb: number;
}

interface TreeNode {
  isLeaf: boolean;
  prob: number;
  featureIdx?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

interface TrainedRandomForest {
  type: "random_forest";
  trees: TreeNode[];
  schema: FeatureSchema;
  evaluation: ModelEvaluation;
  baselineVector: number[];
  baselineProb: number;
}

export type TrainedAttritionModel = TrainedLogistic | TrainedRandomForest;

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

function sigmoid(z: number): number {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function buildFeatureSchema(records: EmployeeRecord[], mode: PredictorMode): FeatureSchema {
  const numericDefs: Array<{
    key: string;
    label: string;
    getFromRecord: (r: EmployeeRecord) => number | null;
    getFromInput: (inp: PredictionInput) => number;
  }> =
    mode === "existing"
      ? [
          {
            key: "salaryNGN",
            label: "Salary (NGN)",
            getFromRecord: (r) => r.salaryNGN,
            getFromInput: (inp) => inp.salaryNGN,
          },
          {
            key: "performanceRating",
            label: "Performance Rating",
            getFromRecord: (r) => r.performanceRating,
            getFromInput: (inp) => inp.performanceRating,
          },
          {
            key: "trainingHours",
            label: "Training Hours",
            getFromRecord: (r) => r.trainingHours,
            getFromInput: (inp) => inp.trainingHours,
          },
          {
            key: "absenceDays",
            label: "Absence Days",
            getFromRecord: (r) => r.absenceDays,
            getFromInput: (inp) => inp.absenceDays,
          },
          {
            key: "jobSatisfactionScore",
            label: "Job Satisfaction Score",
            getFromRecord: (r) => r.jobSatisfactionScore,
            getFromInput: (inp) => inp.jobSatisfactionScore,
          },
          {
            key: "tenureYears",
            label: "Employee Tenure (Years)",
            getFromRecord: (r) => r.tenureYears,
            getFromInput: (inp) => inp.tenureYears,
          },
          {
            key: "overtime",
            label: "Overtime",
            getFromRecord: (r) => (r.overtime ? 1 : 0),
            getFromInput: (inp) => (inp.overtime ? 1 : 0),
          },
        ]
      : [
          {
            key: "salaryNGN",
            label: "Offered Salary (NGN)",
            getFromRecord: (r) => r.salaryNGN,
            getFromInput: (inp) => inp.salaryNGN,
          },
          {
            key: "overtime",
            label: "Expected Overtime",
            getFromRecord: (r) => (r.overtime ? 1 : 0),
            getFromInput: (inp) => (inp.overtime ? 1 : 0),
          },
        ];

  const numericSpecs = numericDefs.map((def) => {
    const vals = records
      .map(def.getFromRecord)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const variance =
      vals.length > 0 ? vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length : 1;
    const std = Math.sqrt(variance) || 1;
    return { ...def, mean, std };
  });

  const uniqueCats = (fn: (r: EmployeeRecord) => string) =>
    Array.from(new Set(records.map(fn).filter((v) => v && v !== "Unspecified"))).sort();

  const categoricalSpecs = [
    {
      key: "department",
      label: "Department",
      categories: uniqueCats((r) => r.department),
      getFromRecord: (r: EmployeeRecord) => r.department,
      getFromInput: (inp: PredictionInput) => inp.department,
    },
    {
      key: "jobRole",
      label: "Job Role",
      categories: uniqueCats((r) => r.jobRole),
      getFromRecord: (r: EmployeeRecord) => r.jobRole,
      getFromInput: (inp: PredictionInput) => inp.jobRole,
    },
    {
      key: "employmentType",
      label: "Employment Type",
      categories: uniqueCats((r) => r.employmentType),
      getFromRecord: (r: EmployeeRecord) => r.employmentType,
      getFromInput: (inp: PredictionInput) => inp.employmentType,
    },
  ];

  const featureNames: string[] = [
    ...numericSpecs.map((n) => n.label),
    ...categoricalSpecs.flatMap((c) => c.categories.map((cat) => `${c.label}: ${cat}`)),
  ];

  return { mode, numericSpecs, categoricalSpecs, featureNames };
}

function encodeRecord(r: EmployeeRecord, schema: FeatureSchema): number[] {
  const vec: number[] = [];
  for (const n of schema.numericSpecs) {
    const raw = n.getFromRecord(r);
    const val = raw !== null && Number.isFinite(raw) ? raw : n.mean;
    vec.push((val - n.mean) / n.std);
  }
  for (const c of schema.categoricalSpecs) {
    const val = c.getFromRecord(r);
    for (const cat of c.categories) {
      vec.push(val === cat ? 1 : 0);
    }
  }
  return vec;
}

function encodeInput(inp: PredictionInput, schema: FeatureSchema): number[] {
  const vec: number[] = [];
  for (const n of schema.numericSpecs) {
    const val = n.getFromInput(inp);
    vec.push((val - n.mean) / n.std);
  }
  for (const c of schema.categoricalSpecs) {
    const val = c.getFromInput(inp);
    for (const cat of c.categories) {
      vec.push(val === cat ? 1 : 0);
    }
  }
  return vec;
}

function stratifiedSplit(records: EmployeeRecord[], testRatio = 0.2) {
  const positives = records.filter((r) => r.hasLeft);
  const negatives = records.filter((r) => !r.hasLeft);
  const rng = createRng(20261120);

  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const posShuf = shuffle(positives);
  const negShuf = shuffle(negatives);

  const posTestCount = Math.max(1, Math.round(posShuf.length * testRatio));
  const negTestCount = Math.max(1, Math.round(negShuf.length * testRatio));

  const test = [...posShuf.slice(0, posTestCount), ...negShuf.slice(0, negTestCount)];
  const train = [...posShuf.slice(posTestCount), ...negShuf.slice(negTestCount)];

  return { train: shuffle(train), test: shuffle(test) };
}

function computeRocAuc(yTrue: number[], yProb: number[]): number | null {
  const totalPos = yTrue.filter((y) => y === 1).length;
  const totalNeg = yTrue.length - totalPos;
  if (totalPos === 0 || totalNeg === 0) return null;

  const pairs = yTrue
    .map((y, i) => ({ y, p: yProb[i] }))
    .sort((a, b) => b.p - a.p);

  let tp = 0;
  let fp = 0;
  let prevTpr = 0;
  let prevFpr = 0;
  let auc = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) tp += 1;
    else fp += 1;

    // Handle ties cleanly by advancing to end of equal-probability group
    if (i === pairs.length - 1 || pairs[i + 1].p !== pairs[i].p) {
      const tpr = tp / totalPos;
      const fpr = fp / totalNeg;
      auc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
      prevTpr = tpr;
      prevFpr = fpr;
    }
  }

  return Number(auc.toFixed(3));
}

function evaluatePredictions(
  yTrue: number[],
  yProb: number[],
  threshold: number
): {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number | null;
  confusionMatrix: { tp: number; fp: number; tn: number; fn: number };
} {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    const pred = yProb[i] >= threshold ? 1 : 0;
    const actual = yTrue[i];
    if (pred === 1 && actual === 1) tp += 1;
    else if (pred === 1 && actual === 0) fp += 1;
    else if (pred === 0 && actual === 0) tn += 1;
    else fn += 1;
  }

  const total = yTrue.length || 1;
  const accuracy = (tp + tn) / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const rocAuc = computeRocAuc(yTrue, yProb);

  return {
    accuracy: Number(accuracy.toFixed(3)),
    precision: Number(precision.toFixed(3)),
    recall: Number(recall.toFixed(3)),
    f1Score: Number(f1Score.toFixed(3)),
    rocAuc,
    confusionMatrix: { tp, fp, tn, fn },
  };
}

function trainLogisticCore(
  X: number[][],
  y: number[],
  l2Lambda = 0.8,
  epochs = 450,
  lr = 0.12
) {
  const n = X.length;
  const p = X[0].length;
  const weights = new Array<number>(p).fill(0);
  const posCount = y.filter((v) => v === 1).length;
  const negCount = n - posCount;

  // Balanced class weights so minority attrition class is learned without majority collapse
  const posWeight = posCount > 0 ? n / (2 * posCount) : 1;
  const negWeight = negCount > 0 ? n / (2 * negCount) : 1;
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(p).fill(0);
    let gradB = 0;
    let totalW = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      const row = X[i];
      for (let j = 0; j < p; j++) z += row[j] * weights[j];
      const pred = sigmoid(z);
      const sw = y[i] === 1 ? posWeight : negWeight;
      const err = (pred - y[i]) * sw;
      gradB += err;
      for (let j = 0; j < p; j++) {
        gradW[j] += err * row[j];
      }
      totalW += sw;
    }

    const stepLr = lr / (1 + epoch * 0.005);
    bias -= (stepLr * gradB) / Math.max(1, totalW);
    for (let j = 0; j < p; j++) {
      const reg = (l2Lambda * weights[j]) / Math.max(1, n);
      weights[j] -= stepLr * (gradW[j] / Math.max(1, totalW) + reg);
    }
  }

  return { weights, bias };
}

function predictLogisticProb(x: number[], weights: number[], bias: number): number {
  let z = bias;
  for (let j = 0; j < x.length; j++) z += x[j] * weights[j];
  return sigmoid(z);
}

function buildDecisionTree(
  X: number[][],
  y: number[],
  sampleWeights: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minLeaf: number,
  mTry: number,
  rng: () => number,
  featureImportances: number[]
): TreeNode {
  let wPos = 0;
  let wNeg = 0;
  for (const idx of indices) {
    if (y[idx] === 1) wPos += sampleWeights[idx];
    else wNeg += sampleWeights[idx];
  }
  const totalW = wPos + wNeg || 1;
  const prob = wPos / totalW;

  if (depth >= maxDepth || indices.length < minLeaf * 2 || wPos === 0 || wNeg === 0) {
    return { isLeaf: true, prob };
  }

  const parentGini = 1 - prob * prob - (1 - prob) * (1 - prob);
  const numFeatures = X[0].length;

  // Sample mTry features
  const featPool = Array.from({ length: numFeatures }, (_, i) => i);
  for (let i = featPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [featPool[i], featPool[j]] = [featPool[j], featPool[i]];
  }
  const candidateFeatures = featPool.slice(0, mTry);

  let bestGain = 1e-6;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  for (const f of candidateFeatures) {
    const vals = indices.map((idx) => X[idx][f]);
    const unique = Array.from(new Set(vals)).sort((a, b) => a - b);
    if (unique.length <= 1) continue;

    // Candidate thresholds (up to 10 quantiles for speed & stability)
    const thresholds: number[] = [];
    if (unique.length <= 12) {
      for (let t = 0; t < unique.length - 1; t++) {
        thresholds.push((unique[t] + unique[t + 1]) / 2);
      }
    } else {
      for (let q = 1; q <= 10; q++) {
        const idx = Math.floor((q / 11) * (unique.length - 1));
        thresholds.push((unique[idx] + unique[idx + 1]) / 2);
      }
    }

    for (const thresh of thresholds) {
      let lPos = 0;
      let lNeg = 0;
      let rPos = 0;
      let rNeg = 0;
      let lCount = 0;
      let rCount = 0;

      for (const idx of indices) {
        if (X[idx][f] <= thresh) {
          lCount += 1;
          if (y[idx] === 1) lPos += sampleWeights[idx];
          else lNeg += sampleWeights[idx];
        } else {
          rCount += 1;
          if (y[idx] === 1) rPos += sampleWeights[idx];
          else rNeg += sampleWeights[idx];
        }
      }

      if (lCount < minLeaf || rCount < minLeaf) continue;

      const lTotal = lPos + lNeg || 1;
      const rTotal = rPos + rNeg || 1;
      const lGini = 1 - (lPos / lTotal) ** 2 - (lNeg / lTotal) ** 2;
      const rGini = 1 - (rPos / rTotal) ** 2 - (rNeg / rTotal) ** 2;

      const weightedGini = (lTotal / totalW) * lGini + (rTotal / totalW) * rGini;
      const gain = parentGini - weightedGini;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = thresh;
      }
    }
  }

  if (bestFeature === -1) {
    return { isLeaf: true, prob };
  }

  bestLeft = [];
  bestRight = [];
  for (const idx of indices) {
    if (X[idx][bestFeature] <= bestThreshold) bestLeft.push(idx);
    else bestRight.push(idx);
  }

  featureImportances[bestFeature] += bestGain * totalW;

  return {
    isLeaf: false,
    prob,
    featureIdx: bestFeature,
    threshold: bestThreshold,
    left: buildDecisionTree(
      X,
      y,
      sampleWeights,
      bestLeft,
      depth + 1,
      maxDepth,
      minLeaf,
      mTry,
      rng,
      featureImportances
    ),
    right: buildDecisionTree(
      X,
      y,
      sampleWeights,
      bestRight,
      depth + 1,
      maxDepth,
      minLeaf,
      mTry,
      rng,
      featureImportances
    ),
  };
}

function predictTreeProb(x: number[], node: TreeNode): number {
  let cur = node;
  while (!cur.isLeaf && cur.featureIdx !== undefined && cur.threshold !== undefined) {
    cur = x[cur.featureIdx] <= cur.threshold ? cur.left! : cur.right!;
  }
  return cur.prob;
}

function trainRandomForestCore(X: number[][], y: number[], numTrees = 45) {
  const n = X.length;
  const p = X[0].length;
  const rng = createRng(918273);
  const mTry = Math.max(2, Math.round(Math.sqrt(p)));

  const posCount = y.filter((v) => v === 1).length;
  const negCount = n - posCount;
  const posWeight = posCount > 0 ? n / (2 * posCount) : 1;
  const negWeight = negCount > 0 ? n / (2 * negCount) : 1;
  const sampleWeights = y.map((v) => (v === 1 ? posWeight : negWeight));

  const featureImportances = new Array<number>(p).fill(0);
  const trees: TreeNode[] = [];

  for (let t = 0; t < numTrees; t++) {
    const bootIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      bootIndices.push(Math.floor(rng() * n));
    }
    trees.push(
      buildDecisionTree(X, y, sampleWeights, bootIndices, 0, 5, 4, mTry, rng, featureImportances)
    );
  }

  const totalImp = featureImportances.reduce((a, b) => a + b, 0) || 1;
  const normalizedImportances = featureImportances.map((v) => v / totalImp);

  return { trees, normalizedImportances };
}

function findBestF1Threshold(yTrue: number[], yProb: number[]): number {
  let bestT = 0.5;
  let bestF1 = -1;
  for (let t = 0.25; t <= 0.75; t += 0.05) {
    const ev = evaluatePredictions(yTrue, yProb, t);
    if (ev.f1Score > bestF1) {
      bestF1 = ev.f1Score;
      bestT = Number(t.toFixed(2));
    }
  }
  return bestT;
}

function calibrateToDatasetPrior(rawBalancedProb: number, actualPositiveRate: number): number {
  // Convert balanced-class probability (prior 0.5) back to actual dataset base-rate log-odds
  const eps = 1e-5;
  const p = Math.min(1 - eps, Math.max(eps, rawBalancedProb));
  const prior = Math.min(1 - eps, Math.max(eps, actualPositiveRate));
  const logOdds = Math.log(p / (1 - p));
  const priorShift = Math.log(prior / (1 - prior));
  return sigmoid(logOdds + priorShift);
}

export function trainAttritionModel(
  records: EmployeeRecord[],
  algorithm: PredictorAlgorithm,
  mode: PredictorMode
): TrainedAttritionModel {
  const schema = buildFeatureSchema(records, mode);
  const positives = records.filter((r) => r.hasLeft).length;
  const actualRate = records.length > 0 ? positives / records.length : 0.2;

  const reliabilityReasons: string[] = [];
  if (records.length < 50) {
    reliabilityReasons.push(`Dataset has only ${records.length} records (minimum 50 recommended for stable training).`);
  }
  if (positives < 10) {
    reliabilityReasons.push(`Only ${positives} historical attrition cases available (minimum 10 recommended).`);
  }

  const { train, test } = stratifiedSplit(records, 0.2);
  const XTrain = train.map((r) => encodeRecord(r, schema));
  const yTrain = train.map((r) => (r.hasLeft ? 1 : 0));
  const XTest = test.map((r) => encodeRecord(r, schema));
  const yTest = test.map((r) => (r.hasLeft ? 1 : 0));

  // Mean baseline vector for attribution & fallback
  const d = schema.featureNames.length;
  const baselineVector = new Array<number>(d).fill(0);
  for (const row of XTrain) {
    for (let j = 0; j < d; j++) baselineVector[j] += row[j];
  }
  for (let j = 0; j < d; j++) baselineVector[j] /= Math.max(1, XTrain.length);

  if (algorithm === "logistic") {
    const trainModel = trainLogisticCore(XTrain, yTrain);
    const trainProbs = XTrain.map((x) =>
      calibrateToDatasetPrior(predictLogisticProb(x, trainModel.weights, trainModel.bias), actualRate)
    );
    const optThreshold = findBestF1Threshold(yTrain, trainProbs);

    const testProbs = XTest.map((x) =>
      calibrateToDatasetPrior(predictLogisticProb(x, trainModel.weights, trainModel.bias), actualRate)
    );
    const metrics = evaluatePredictions(yTest, testProbs, optThreshold);

    if (metrics.rocAuc !== null && metrics.rocAuc < 0.55) {
      reliabilityReasons.push(
        `Held-out ROC-AUC (${metrics.rocAuc.toFixed(3)}) indicates weak separability on available features—treat scores as exploratory.`
      );
    }
    if (metrics.f1Score < 0.15) {
      reliabilityReasons.push(
        `Held-out F1 score (${metrics.f1Score.toFixed(3)}) shows limited precision/recall balance on the minority exit class.`
      );
    }

    // Refit on all records for scoring stability while reporting honest held-out metrics
    const XAll = records.map((r) => encodeRecord(r, schema));
    const yAll = records.map((r) => (r.hasLeft ? 1 : 0));
    const fullModel = trainLogisticCore(XAll, yAll);

    const absSum = fullModel.weights.reduce((acc, w) => acc + Math.abs(w), 0) || 1;
    const globalFeatureImportance = schema.featureNames
      .map((feature, j) => ({
        feature,
        importance: Number(((Math.abs(fullModel.weights[j]) / absSum) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 8);

    const evaluation: ModelEvaluation = {
      algorithm: "logistic",
      algorithmLabel: "Logistic Regression (L2-Regularized, Class-Balanced)",
      mode,
      totalRecordsUsed: records.length,
      trainCount: train.length,
      testCount: test.length,
      positiveTotal: positives,
      positiveTest: yTest.filter((v) => v === 1).length,
      ...metrics,
      reliable: reliabilityReasons.length === 0,
      reliabilityReasons,
      globalFeatureImportance,
      optimalThreshold: optThreshold,
    };

    return {
      type: "logistic",
      weights: fullModel.weights,
      bias: fullModel.bias,
      schema,
      evaluation,
      baselineProb: actualRate,
    };
  } else {
    const trainRf = trainRandomForestCore(XTrain, yTrain, 45);
    const rfProb = (x: number[], trees: TreeNode[]) => {
      const avg = trees.reduce((acc, t) => acc + predictTreeProb(x, t), 0) / trees.length;
      return calibrateToDatasetPrior(avg, actualRate);
    };

    const trainProbs = XTrain.map((x) => rfProb(x, trainRf.trees));
    const optThreshold = findBestF1Threshold(yTrain, trainProbs);
    const testProbs = XTest.map((x) => rfProb(x, trainRf.trees));
    const metrics = evaluatePredictions(yTest, testProbs, optThreshold);

    if (metrics.rocAuc !== null && metrics.rocAuc < 0.55) {
      reliabilityReasons.push(
        `Held-out ROC-AUC (${metrics.rocAuc.toFixed(3)}) indicates weak predictive signal on the current historical features.`
      );
    }
    if (metrics.f1Score < 0.15) {
      reliabilityReasons.push(
        `Held-out F1 score (${metrics.f1Score.toFixed(3)}) reflects weak classification separation on the test split.`
      );
    }

    const XAll = records.map((r) => encodeRecord(r, schema));
    const yAll = records.map((r) => (r.hasLeft ? 1 : 0));
    const fullRf = trainRandomForestCore(XAll, yAll, 45);

    const globalFeatureImportance = schema.featureNames
      .map((feature, j) => ({
        feature,
        importance: Number((fullRf.normalizedImportances[j] * 100).toFixed(1)),
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 8);

    const evaluation: ModelEvaluation = {
      algorithm: "random_forest",
      algorithmLabel: "Random Forest Ensemble (45 Trees, Gini)",
      mode,
      totalRecordsUsed: records.length,
      trainCount: train.length,
      testCount: test.length,
      positiveTotal: positives,
      positiveTest: yTest.filter((v) => v === 1).length,
      ...metrics,
      reliable: reliabilityReasons.length === 0,
      reliabilityReasons,
      globalFeatureImportance,
      optimalThreshold: optThreshold,
    };

    return {
      type: "random_forest",
      trees: fullRf.trees,
      schema,
      evaluation,
      baselineVector,
      baselineProb: actualRate,
    };
  }
}

export function predictEmployeeAttrition(
  input: PredictionInput,
  model: TrainedAttritionModel,
  assignedCluster?: ClusterProfile
): PredictionResult {
  const x = encodeInput(input, model.schema);
  const actualRate = model.baselineProb;
  const threshold = model.evaluation.optimalThreshold;

  let prob = 0;
  const rawContributions: Array<{
    factor: string;
    signedDelta: number;
    detail: string;
  }> = [];

  const getValueLabel = (featName: string): string => {
    if (featName === "Salary (NGN)" || featName === "Offered Salary (NGN)") {
      return `₦${Math.round(input.salaryNGN).toLocaleString("en-NG")}`;
    }
    if (featName === "Performance Rating") return `${input.performanceRating}/5`;
    if (featName === "Training Hours") return `${input.trainingHours} hrs`;
    if (featName === "Absence Days") return `${input.absenceDays} days`;
    if (featName === "Job Satisfaction Score") return `${input.jobSatisfactionScore}/5`;
    if (featName === "Employee Tenure (Years)") return `${input.tenureYears} yrs`;
    if (featName === "Overtime" || featName === "Expected Overtime") {
      return input.overtime ? "Yes" : "No";
    }
    return "Active selection";
  };

  if (model.type === "logistic") {
    prob = calibrateToDatasetPrior(predictLogisticProb(x, model.weights, model.bias), actualRate);

    for (let j = 0; j < model.schema.featureNames.length; j++) {
      const name = model.schema.featureNames[j];
      const contrib = model.weights[j] * x[j];
      if (Math.abs(contrib) < 0.01) continue;
      // For categorical one-hot, only surface the active category
      if (name.includes(": ") && x[j] === 0) continue;
      rawContributions.push({
        factor: name,
        signedDelta: contrib,
        detail: getValueLabel(name),
      });
    }
  } else {
    const scoreVec = (vec: number[]) =>
      calibrateToDatasetPrior(
        model.trees.reduce((acc, t) => acc + predictTreeProb(vec, t), 0) / model.trees.length,
        actualRate
      );

    prob = scoreVec(x);

    // Local perturbation attribution relative to dataset baseline vector
    for (let j = 0; j < model.schema.featureNames.length; j++) {
      const name = model.schema.featureNames[j];
      if (name.includes(": ") && x[j] === 0) continue;
      const perturbed = [...x];
      perturbed[j] = model.baselineVector[j];
      const probWithout = scoreVec(perturbed);
      const delta = prob - probWithout;
      if (Math.abs(delta) < 0.002) continue;
      rawContributions.push({
        factor: name,
        signedDelta: delta,
        detail: getValueLabel(name),
      });
    }
  }

  const probabilityPct = Number((prob * 100).toFixed(1));
  const thresholdPct = Number((threshold * 100).toFixed(1));
  const classification: PredictionResult["classification"] =
    prob >= threshold ? "Higher Attrition Risk" : "Lower Attrition Risk";

  const contributingFactors = rawContributions
    .sort((a, b) => Math.abs(b.signedDelta) - Math.abs(a.signedDelta))
    .slice(0, 5)
    .map((c) => ({
      factor: c.factor,
      impact: (c.signedDelta > 0 ? "increases_risk" : "reduces_risk") as
        | "increases_risk"
        | "reduces_risk",
      magnitude: Number(Math.abs(c.signedDelta).toFixed(3)),
      detail: c.detail,
    }));

  // Evidence-grounded retention recommendations tied directly to inputs & drivers
  const recommendations: string[] = [];
  if (model.schema.mode === "new_hire") {
    recommendations.push(
      `Structure a 90-day onboarding check-in cadence for ${input.department} (${input.jobRole}) to mitigate early-tenure attrition observed in historical cohorts.`
    );
    if (input.overtime) {
      recommendations.push(
        "Monitor workload allocation during the first 6 months so expected overtime does not compound onboarding fatigue."
      );
    }
    const salarySpec = model.schema.numericSpecs.find((n) => n.key === "salaryNGN");
    if (salarySpec && input.salaryNGN < salarySpec.mean) {
      recommendations.push(
        `Offered compensation (₦${Math.round(input.salaryNGN).toLocaleString(
          "en-NG"
        )}) sits below the cohort mean (₦${Math.round(salarySpec.mean).toLocaleString(
          "en-NG"
        )}); pair offer with clear 6- and 12-month progression milestones.`
      );
    }
  } else {
    if (input.tenureYears < 2) {
      recommendations.push(
        `Employee tenure (${input.tenureYears} yrs) falls in the early-tenure window; schedule career-pathing and manager alignment reviews.`
      );
    }
    if (input.jobSatisfactionScore <= 2) {
      recommendations.push(
        `Job satisfaction is low (${input.jobSatisfactionScore}/5); conduct a structured stay interview to diagnose role, manager, or workload friction.`
      );
    }
    if (input.absenceDays >= 12) {
      recommendations.push(
        `Absence days (${input.absenceDays} days) are elevated; review burnout indicators, flexible scheduling, and workload balance.`
      );
    }
    if (input.overtime) {
      recommendations.push(
        "Overtime is active; audit sprint/shift load and compensatory rest policies to prevent sustained fatigue."
      );
    }
    if (input.trainingHours < 15) {
      recommendations.push(
        `Training hours (${input.trainingHours} hrs) are below typical cohort levels; enroll in targeted upskilling aligned to ${input.jobRole}.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        "Maintain regular manager feedback loops, competitive compensation benchmarking, and ongoing development opportunities."
      );
    }
  }

  const reliabilityNote = model.evaluation.reliable
    ? `Estimated from ${model.evaluation.algorithmLabel} trained on ${model.evaluation.totalRecordsUsed} historical records (test ROC-AUC: ${
        model.evaluation.rocAuc?.toFixed(3) ?? "N/A"
      }).`
    : `Advisory notice: ${model.evaluation.reliabilityReasons.join(
        " "
      )} Treat this score strictly as an exploratory reference alongside qualitative HR review.`;

  return {
    classification,
    probabilityPct,
    thresholdPct,
    reliable: model.evaluation.reliable,
    reliabilityNote,
    assignedCluster:
      model.schema.mode === "existing" && assignedCluster
        ? {
            code: assignedCluster.code,
            tierTitle: assignedCluster.tierTitle,
            historicalAttritionRatePct: assignedCluster.attritionRatePct,
          }
        : undefined,
    contributingFactors,
    recommendations: recommendations.slice(0, 4),
  };
}
