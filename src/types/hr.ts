export interface EmployeeRecord {
  employeeId: string;
  age: number | null;
  gender: string;
  department: string;
  jobRole: string;
  employmentType: string;
  hireDate: string;
  hireDateMs: number | null;
  hireYear: string;
  salaryNGN: number | null;
  performanceRating: number | null;
  trainingHours: number | null;
  absenceDays: number | null;
  jobSatisfactionScore: number | null;
  overtime: boolean;
  overtimeRaw: string;
  manager: string;
  employmentStatus: string;
  exitDate: string;
  exitDateMs: number | null;
  attritionStatus: string;
  hasLeft: boolean;
  tenureYears: number | null;
}

export interface ColumnMissingStat {
  column: string;
  missingCount: number;
  missingPct: number;
}

export interface DataQualityReport {
  totalRawRows: number;
  distinctEmployees: number;
  duplicateIdsRemoved: number;
  duplicateIdList: string[];
  detectedEmploymentStatuses: Array<{ value: string; count: number; classifiedAs: "Active" | "Exited" }>;
  detectedAttritionStatuses: Array<{ value: string; count: number; classifiedAs: "Left" | "Stayed" }>;
  referenceDateISO: string;
  minHireDate: string;
  maxEventDate: string;
  missingStats: ColumnMissingStat[];
  warnings: string[];
  datasetName: string;
}

export interface FilterState {
  department: string;
  jobRole: string;
  gender: string;
  employmentType: string;
  manager: string;
  hirePeriod: string;
  attritionStatus: string;
}

export interface KpiSummary {
  totalEmployees: number;
  activeEmployees: number;
  exitedEmployees: number;
  attritionRatePct: number;
  avgSalaryNGN: number;
  avgPerformance: number;
  avgSatisfaction: number;
  avgTrainingHours: number;
  avgAbsenceDays: number;
  salaryValidCount: number;
  performanceValidCount: number;
  satisfactionValidCount: number;
  trainingValidCount: number;
  absenceValidCount: number;
}

export interface DepartmentStat {
  department: string;
  headcount: number;
  active: number;
  exited: number;
  attritionRatePct: number;
  avgSalaryNGN: number;
}

export interface MonthlyExitPoint {
  month: string; // YYYY-MM
  exits: number;
  cohortActiveCount: number | null;
  monthlyRatePct: number | null;
}

export interface ScatterRegressionResult {
  points: Array<{
    employeeId: string;
    department: string;
    trainingHours: number;
    performanceRating: number;
    hasLeft: boolean;
  }>;
  slope: number;
  intercept: number;
  pearsonR: number | null;
  interpretation: string;
  trendLine: Array<{ x: number; y: number }>;
}

export interface DriverBucket {
  group: string;
  total: number;
  exited: number;
  attritionRatePct: number;
  deltaFromBaselinePct: number;
}

export interface DriverDimension {
  key: string;
  label: string;
  buckets: DriverBucket[];
  spreadPct: number;
}

export interface ClusterProfile {
  id: number;
  code: string;
  tierTitle: string;
  tierDescription: string;
  riskTier: "low" | "moderate" | "high";
  count: number;
  workforcePct: number;
  attritionRatePct: number;
  exitedCount: number;
  avgSatisfaction: number;
  avgPerformance: number;
  avgAbsenceDays: number;
  avgTrainingHours: number;
  avgSalaryNGN: number;
  overtimePct: number;
  topDepartments: Array<{ name: string; count: number }>;
  topEmploymentTypes: Array<{ name: string; count: number }>;
  centroidScaled: number[];
}

export interface ClusterPoint {
  employeeId: string;
  clusterId: number;
  clusterCode: string;
  pc1: number;
  pc2: number;
  department: string;
  jobRole: string;
  hasLeft: boolean;
  satisfaction: number | null;
  performance: number | null;
  salaryNGN: number | null;
  tenureYears: number | null;
  overtime: boolean;
}

export interface SilhouetteEvaluation {
  k: number;
  score: number;
}

export interface ClusteringResult {
  optimalK: number;
  selectedK: number;
  silhouetteScores: SilhouetteEvaluation[];
  pc1VariancePct: number;
  pc2VariancePct: number;
  pc1TopDrivers: string[];
  pc2TopDrivers: string[];
  clusters: ClusterProfile[];
  points: ClusterPoint[];
  featureNames: string[];
  standardizeParams: {
    means: number[];
    stds: number[];
    numericCount: number;
    departments: string[];
    employmentTypes: string[];
    catScaleDept: number;
    catScaleEmpType: number;
  };
  validRecordCount: number;
  sufficientForClustering: boolean;
  message?: string;
}

export interface TraitFinding {
  label: string;
  stayedMetric: string;
  leftMetric: string;
  comparisonNote: string;
  magnitude: number;
}

export interface CommonTraitsAnalysis {
  stayedCount: number;
  leftCount: number;
  likelyToStayTraits: TraitFinding[];
  likelyToLeaveTraits: TraitFinding[];
  comparisonRows: Array<{
    metric: string;
    stayedValue: string;
    leftValue: string;
    difference: string;
  }>;
}

export type PredictorAlgorithm = "logistic" | "random_forest";
export type PredictorMode = "existing" | "new_hire";

export interface ModelEvaluation {
  algorithm: PredictorAlgorithm;
  algorithmLabel: string;
  mode: PredictorMode;
  totalRecordsUsed: number;
  trainCount: number;
  testCount: number;
  positiveTotal: number;
  positiveTest: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number | null;
  confusionMatrix: {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
  };
  reliable: boolean;
  reliabilityReasons: string[];
  globalFeatureImportance: Array<{ feature: string; importance: number }>;
  optimalThreshold: number;
}

export interface PredictionInput {
  department: string;
  jobRole: string;
  employmentType: string;
  salaryNGN: number;
  overtime: boolean;
  // Existing employee only:
  performanceRating: number;
  trainingHours: number;
  absenceDays: number;
  jobSatisfactionScore: number;
  tenureYears: number;
}

export interface PredictionResult {
  classification: "Lower Attrition Risk" | "Higher Attrition Risk";
  probabilityPct: number;
  thresholdPct: number;
  reliable: boolean;
  reliabilityNote: string;
  assignedCluster?: {
    code: string;
    tierTitle: string;
    historicalAttritionRatePct: number;
  };
  contributingFactors: Array<{
    factor: string;
    impact: "increases_risk" | "reduces_risk" | "neutral";
    magnitude: number;
    detail: string;
  }>;
  recommendations: string[];
}

export interface FairnessAuditRow {
  groupType: "Gender" | "Age Group";
  segment: string;
  count: number;
  exited: number;
  attritionRatePct: number;
}

export interface AiInsightsResponse {
  executiveHeadline: string;
  departmentAttritionInsight: string;
  retentionCharacteristicsInsight: string;
  clusterSegmentsInsight: string;
  metricsRelationshipInsight: string;
  prioritizedRecommendations: Array<{
    priority: number;
    title: string;
    evidence: string;
    action: string;
    targetGroup: string;
  }>;
  methodologyCaveat: string;
}
