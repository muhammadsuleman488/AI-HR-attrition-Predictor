import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type {
  ClusteringResult,
  EmployeeRecord,
  PredictionInput,
  PredictionResult,
  PredictorAlgorithm,
  PredictorMode,
} from "../types/hr";
import type { TrainedAttritionModel } from "../engine/mlPredictor";
import { predictEmployeeAttrition } from "../engine/mlPredictor";
import { assignInputToCluster } from "../engine/mlClustering";

interface AttritionPredictorProps {
  allRecords: EmployeeRecord[];
  model: TrainedAttritionModel;
  algorithm: PredictorAlgorithm;
  mode: PredictorMode;
  clustering: ClusteringResult;
  onChangeAlgorithm: (alg: PredictorAlgorithm) => void;
  onChangeMode: (mode: PredictorMode) => void;
}

export function AttritionPredictor({
  allRecords,
  model,
  algorithm,
  mode,
  clustering,
  onChangeAlgorithm,
  onChangeMode,
}: AttritionPredictorProps) {
  const departments = Array.from(new Set(allRecords.map((r) => r.department))).sort();
  const employmentTypes = Array.from(new Set(allRecords.map((r) => r.employmentType))).sort();

  const rolesByDept = (dept: string) => {
    const filtered = allRecords.filter((r) => r.department === dept).map((r) => r.jobRole);
    const list = Array.from(new Set(filtered)).sort();
    return list.length > 0
      ? list
      : Array.from(new Set(allRecords.map((r) => r.jobRole))).sort();
  };

  const defaultDept = departments[0] ?? "Technology";
  const defaultRole = rolesByDept(defaultDept)[0] ?? "Data Analyst";
  const defaultType = employmentTypes[0] ?? "Full-time";

  const [form, setForm] = useState<PredictionInput>({
    department: defaultDept,
    jobRole: defaultRole,
    employmentType: defaultType,
    salaryNGN: 550000,
    overtime: false,
    performanceRating: 3,
    trainingHours: 28,
    absenceDays: 7,
    jobSatisfactionScore: 3,
    tenureYears: 2.5,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  // Sync valid department/role/type options when dataset changes
  useEffect(() => {
    setForm((prev) => {
      const nextDept = departments.includes(prev.department) ? prev.department : defaultDept;
      const validRoles = rolesByDept(nextDept);
      const nextRole = validRoles.includes(prev.jobRole) ? prev.jobRole : validRoles[0] ?? "";
      const nextType = employmentTypes.includes(prev.employmentType)
        ? prev.employmentType
        : defaultType;
      return { ...prev, department: nextDept, jobRole: nextRole, employmentType: nextType };
    });
    setPrediction(null);
  }, [allRecords]);

  // Clear stale prediction when switching algorithm or mode
  useEffect(() => {
    setPrediction(null);
  }, [algorithm, mode]);

  const handleDepartmentChange = (dept: string) => {
    const validRoles = rolesByDept(dept);
    setForm((prev) => ({
      ...prev,
      department: dept,
      jobRole: validRoles.includes(prev.jobRole) ? prev.jobRole : validRoles[0] ?? "",
    }));
  };

  const handlePredict = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!Number.isFinite(form.salaryNGN) || form.salaryNGN <= 0) {
      setValidationError("Please enter a valid positive Salary (NGN).");
      return;
    }
    if (mode === "existing") {
      if (form.performanceRating < 1 || form.performanceRating > 5) {
        setValidationError("Performance Rating must be between 1 and 5.");
        return;
      }
      if (form.jobSatisfactionScore < 1 || form.jobSatisfactionScore > 5) {
        setValidationError("Job Satisfaction Score must be between 1 and 5.");
        return;
      }
      if (form.trainingHours < 0 || form.absenceDays < 0 || form.tenureYears < 0) {
        setValidationError("Training hours, absence days, and tenure cannot be negative.");
        return;
      }
    }

    const matchedCluster =
      mode === "existing" ? assignInputToCluster(form, clustering) : undefined;
    const result = predictEmployeeAttrition(form, model, matchedCluster);
    setPrediction(result);
  };

  const ev = model.evaluation;
  const availableRoles = rolesByDept(form.department);

  return (
    <section id="attrition-predictor" className="mb-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="font-display text-xl font-bold text-[#0F2544]">
              AI Attrition Predictor
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Supervised machine learning classifier trained on historical employee records with zero target leakage.{" "}
              <span className="font-medium text-slate-800">
                Age and Gender are excluded from individual scoring
              </span>{" "}
              for fairness compliance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Existing vs New Hire Mode */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeMode("existing")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === "existing"
                    ? "bg-white text-[#0F2544] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Existing Employee
              </button>
              <button
                type="button"
                onClick={() => onChangeMode("new_hire")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === "new_hire"
                    ? "bg-white text-[#0F2544] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                New Hire Mode
              </button>
            </div>

            {/* Algorithm Selector */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => onChangeAlgorithm("logistic")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  algorithm === "logistic"
                    ? "bg-white text-[#0F2544] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Logistic Regression
              </button>
              <button
                type="button"
                onClick={() => onChangeAlgorithm("random_forest")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  algorithm === "random_forest"
                    ? "bg-white text-[#0F2544] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Random Forest
              </button>
            </div>
          </div>
        </div>

        {/* Held-out Model Evaluation Strip */}
        <div className="py-4 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0F2544]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>{ev.algorithmLabel}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-normal text-slate-500 tabular-nums">
                80/20 Stratified Split ({ev.trainCount} train / {ev.testCount} test · {ev.positiveTotal} historical exits)
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-medium">
              {ev.reliable ? (
                <span className="inline-flex items-center gap-1 text-teal-700">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Evaluation Gate Passed</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Exploratory Model — Limited Test Signal</span>
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Accuracy", val: `${(ev.accuracy * 100).toFixed(1)}%` },
              { label: "Precision", val: `${(ev.precision * 100).toFixed(1)}%` },
              { label: "Recall", val: `${(ev.recall * 100).toFixed(1)}%` },
              { label: "F1 Score", val: ev.f1Score.toFixed(3) },
              { label: "ROC-AUC", val: ev.rocAuc !== null ? ev.rocAuc.toFixed(3) : "N/A" },
            ].map((m) => (
              <div key={m.label} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="text-[11px] text-slate-500">{m.label}</div>
                <div className="font-mono text-base font-semibold text-[#0F2544] tabular-nums">
                  {m.val}
                </div>
              </div>
            ))}
          </div>

          {!ev.reliable && ev.reliabilityReasons.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold">Model Reliability Advisory: </span>
                {ev.reliabilityReasons.join(" ")}
              </div>
            </div>
          )}
        </div>

        {/* Main 2-column Interactive Form & Output */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6">
          {/* Left: Editable Form */}
          <form onSubmit={handlePredict} className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#0F2544]">
                {mode === "new_hire"
                  ? "New Hire Onboarding Profile (Pre-Start Inputs Only)"
                  : "Employee Characteristics"}
              </h3>
              <span className="text-xs text-slate-500">
                {mode === "new_hire" ? "5 onboarding inputs" : "10 workforce inputs"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="pred-dept" className="block text-xs font-medium text-slate-600 mb-1">
                  Department
                </label>
                <select
                  id="pred-dept"
                  value={form.department}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544]"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pred-role" className="block text-xs font-medium text-slate-600 mb-1">
                  Job Role
                </label>
                <select
                  id="pred-role"
                  value={form.jobRole}
                  onChange={(e) => setForm((p) => ({ ...p, jobRole: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544]"
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pred-type" className="block text-xs font-medium text-slate-600 mb-1">
                  Employment Type
                </label>
                <select
                  id="pred-type"
                  value={form.employmentType}
                  onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544]"
                >
                  {employmentTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pred-salary" className="block text-xs font-medium text-slate-600 mb-1">
                  {mode === "new_hire" ? "Offered Salary (₦ NGN)" : "Salary (₦ NGN)"}
                </label>
                <input
                  id="pred-salary"
                  type="number"
                  min={50000}
                  step={5000}
                  value={form.salaryNGN}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, salaryNGN: Number(e.target.value) || 0 }))
                  }
                  className="w-full font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544] tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="pred-overtime" className="block text-xs font-medium text-slate-600 mb-1">
                  {mode === "new_hire" ? "Expected Overtime" : "Overtime"}
                </label>
                <select
                  id="pred-overtime"
                  value={form.overtime ? "Yes" : "No"}
                  onChange={(e) => setForm((p) => ({ ...p, overtime: e.target.value === "Yes" }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544]"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>

              {mode === "existing" && (
                <>
                  <div>
                    <label
                      htmlFor="pred-tenure"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Employee Tenure (Years)
                    </label>
                    <input
                      id="pred-tenure"
                      type="number"
                      min={0}
                      max={40}
                      step={0.1}
                      value={form.tenureYears}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, tenureYears: Number(e.target.value) || 0 }))
                      }
                      className="w-full font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544] tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pred-sat"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Job Satisfaction (1–5)
                    </label>
                    <select
                      id="pred-sat"
                      value={form.jobSatisfactionScore}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, jobSatisfactionScore: Number(e.target.value) }))
                      }
                      className="w-full font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544]"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} / 5
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="pred-perf"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Performance Rating (1–5)
                    </label>
                    <select
                      id="pred-perf"
                      value={form.performanceRating}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, performanceRating: Number(e.target.value) }))
                      }
                      className="w-full font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544]"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} / 5
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="pred-train"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Training Hours
                    </label>
                    <input
                      id="pred-train"
                      type="number"
                      min={0}
                      max={200}
                      step={1}
                      value={form.trainingHours}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, trainingHours: Number(e.target.value) || 0 }))
                      }
                      className="w-full font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544] tabular-nums"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pred-abs"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Absence Days
                    </label>
                    <input
                      id="pred-abs"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={form.absenceDays}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, absenceDays: Number(e.target.value) || 0 }))
                      }
                      className="w-full font-mono bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#0F2544] tabular-nums"
                    />
                  </div>
                </>
              )}
            </div>

            {validationError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {validationError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-5 bg-[#0F2544] hover:bg-[#1A365D] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Predict Employee Attrition Risk
            </button>

            <div className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Decision-support notice: Estimates reflect statistical patterns in historical records, are not guarantees of individual behavior, and must not be used as the sole basis for employment decisions.
              </span>
            </div>
          </form>

          {/* Right: Prediction Assessment Output */}
          <div className="lg:col-span-6">
            {!prediction ? (
              <div className="h-full min-h-[340px] border border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/50">
                <Info className="w-8 h-8 text-slate-400 mb-3" aria-hidden="true" />
                <p className="font-display text-sm font-semibold text-[#0F2544]">
                  Ready to Assess Retention Risk
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Adjust the employee profile on the left and select{" "}
                  <span className="font-semibold text-slate-700">
                    Predict Employee Attrition Risk
                  </span>{" "}
                  to run the trained {algorithm === "logistic" ? "Logistic Regression" : "Random Forest"} classifier.
                </p>
                <div className="mt-5 w-full max-w-sm text-left">
                  <p className="text-[11px] font-semibold text-slate-600 mb-2">
                    Top Global Predictors Learned by Active Model
                  </p>
                  <div className="space-y-1.5">
                    {ev.globalFeatureImportance.slice(0, 5).map((f) => (
                      <div key={f.feature} className="flex items-center gap-2 text-[11px]">
                        <span className="w-40 truncate text-slate-600">{f.feature}</span>
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0F2544]"
                            style={{ width: `${Math.min(100, f.importance * 3)}%` }}
                          />
                        </div>
                        <span className="font-mono text-slate-700 tabular-nums w-10 text-right">
                          {f.importance.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl p-5 bg-[#FCFDFF] space-y-4">
                <div
                  className={`p-4 rounded-lg border ${
                    prediction.classification === "Higher Attrition Risk"
                      ? "bg-rose-50 border-rose-200"
                      : "bg-teal-50 border-teal-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-medium text-slate-600">
                        Predicted Classification
                      </div>
                      <div
                        className={`font-display text-lg font-bold ${
                          prediction.classification === "Higher Attrition Risk"
                            ? "text-rose-800"
                            : "text-teal-800"
                        }`}
                      >
                        {prediction.classification}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-medium text-slate-600">
                        Estimated Exit Probability
                      </div>
                      <div className="font-mono text-2xl font-bold text-[#0F2544] tabular-nums">
                        {prediction.probabilityPct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-500 tabular-nums">
                        Decision threshold: {prediction.thresholdPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                {prediction.assignedCluster && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Closest K-Means Segment: </span>
                      <span className="font-semibold text-[#0F2544]">
                        {prediction.assignedCluster.tierTitle}
                      </span>
                    </div>
                    <span className="font-mono text-slate-700 tabular-nums shrink-0">
                      Segment historical rate:{" "}
                      {prediction.assignedCluster.historicalAttritionRatePct.toFixed(1)}%
                    </span>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-[#0F2544] mb-2">
                    Main Factors Influencing This Prediction
                  </h4>
                  {prediction.contributingFactors.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Inputs closely match the dataset baseline average.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {prediction.contributingFactors.map((cf) => (
                        <div
                          key={cf.factor}
                          className="flex items-center justify-between gap-3 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <div>
                            <span className="font-medium text-slate-800">{cf.factor}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="font-mono text-slate-600">{cf.detail}</span>
                          </div>
                          <span
                            className={`font-medium shrink-0 ${
                              cf.impact === "increases_risk" ? "text-rose-700" : "text-teal-700"
                            }`}
                          >
                            {cf.impact === "increases_risk" ? "Raises Risk" : "Supports Retention"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#0F2544] mb-2">
                    Practical Retention Recommendations
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                    {prediction.recommendations.map((rec, i) => (
                      <li key={i} className="leading-relaxed">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200 leading-relaxed">
                  {prediction.reliabilityNote}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
