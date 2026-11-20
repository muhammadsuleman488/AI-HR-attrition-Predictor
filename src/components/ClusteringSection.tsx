import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ClusterPoint, ClusteringResult, CommonTraitsAnalysis } from "../types/hr";

interface ClusteringSectionProps {
  clustering: ClusteringResult;
  commonTraits: CommonTraitsAnalysis;
  selectedKOverride: number | null;
  onSelectK: (k: number | null) => void;
}

const CLUSTER_COLORS: Record<"low" | "moderate" | "high", string> = {
  low: "#0D9488",
  moderate: "#D97706",
  high: "#E11D48",
};

const FALLBACK_PALETTE = ["#0D9488", "#2563EB", "#D97706", "#E11D48", "#7C3AED"];

function CustomClusterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ClusterPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs max-w-[240px]">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-mono font-semibold text-[#0F2544]">{p.employeeId}</span>
        <span className="font-medium text-slate-600">{p.clusterCode}</span>
      </div>
      <p className="text-slate-600 mb-1.5">
        {p.department} · {p.jobRole}
      </p>
      <div className="space-y-0.5 text-slate-700 tabular-nums">
        <p>Satisfaction: <span className="font-mono">{p.satisfaction ?? "N/A"}/5</span> · Perf: <span className="font-mono">{p.performance ?? "N/A"}/5</span></p>
        <p>Salary: <span className="font-mono">{p.salaryNGN ? `₦${Math.round(p.salaryNGN).toLocaleString("en-NG")}` : "N/A"}</span></p>
        <p>Tenure: <span className="font-mono">{p.tenureYears !== null ? `${p.tenureYears.toFixed(1)} yrs` : "N/A"}</span> · Overtime: <span className="font-mono">{p.overtime ? "Yes" : "No"}</span></p>
        <p>Historical Outcome: <span className={p.hasLeft ? "text-rose-700 font-semibold" : "text-teal-700 font-semibold"}>{p.hasLeft ? "Exited" : "Active"}</span></p>
      </div>
    </div>
  );
}

export function ClusteringSection({
  clustering,
  commonTraits,
  selectedKOverride,
  onSelectK,
}: ClusteringSectionProps) {
  const tierStyles = {
    low: {
      badge: "text-teal-800 bg-teal-50 border-teal-200",
      rate: "text-teal-700",
    },
    moderate: {
      badge: "text-amber-800 bg-amber-50 border-amber-200",
      rate: "text-amber-700",
    },
    high: {
      badge: "text-rose-800 bg-rose-50 border-rose-200",
      rate: "text-rose-700",
    },
  };

  return (
    <section id="employee-clustering" className="mb-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="font-display text-xl font-bold text-[#0F2544]">
              Employee Clustering Analysis
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Unsupervised K-Means++ segmentation over standardized numeric features (satisfaction, performance, training, absence, salary, tenure, overtime) and scaled categorical encodings (department, employment type).{" "}
              <span className="font-medium text-slate-800">
                Employee_ID, Exit_Date, Employment_Status, and Attrition_Status are strictly excluded from clustering inputs
              </span>{" "}
              and evaluated post-hoc.
            </p>
          </div>

          {clustering.sufficientForClustering && (
            <div className="flex flex-col items-start lg:items-end gap-1.5 shrink-0">
              <div className="text-[11px] font-medium text-slate-500">
                Silhouette-Selected k={clustering.optimalK} (Score:{" "}
                <span className="font-mono font-semibold text-[#0F2544]">
                  {clustering.silhouetteScores
                    .find((s) => s.k === clustering.selectedK)
                    ?.score.toFixed(3)}
                </span>
                )
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {clustering.silhouetteScores.map((s) => {
                  const active = clustering.selectedK === s.k;
                  return (
                    <button
                      key={s.k}
                      type="button"
                      onClick={() => onSelectK(s.k === clustering.optimalK ? null : s.k)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
                        active
                          ? "bg-white text-[#0F2544] shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      k={s.k} ({s.score.toFixed(2)})
                    </button>
                  );
                })}
                {selectedKOverride !== null && (
                  <button
                    type="button"
                    onClick={() => onSelectK(null)}
                    className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-[#0F2544] whitespace-nowrap cursor-pointer"
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {!clustering.sufficientForClustering ? (
          <div className="py-12 text-center text-sm text-slate-600">
            {clustering.message}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pt-6">
              {/* Left: PCA Scatter Plot */}
              <div className="xl:col-span-7 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[#0F2544]">
                      PCA 2D Projection of Employee Feature Space
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      PC1 ({clustering.pc1VariancePct}% var): {clustering.pc1TopDrivers.join(", ")} · PC2 ({clustering.pc2VariancePct}% var): {clustering.pc2TopDrivers.join(", ")}
                    </p>
                  </div>
                </div>

                <div className="h-[360px] border border-slate-200 rounded-xl p-3 bg-[#FCFDFF]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 12, right: 18, bottom: 24, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        type="number"
                        dataKey="pc1"
                        name="PC1"
                        tick={{ fontSize: 11, fill: "#64748B" }}
                        label={{
                          value: `Principal Component 1 (${clustering.pc1VariancePct}% variance)`,
                          position: "insideBottom",
                          offset: -14,
                          fontSize: 11,
                          fill: "#334155",
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="pc2"
                        name="PC2"
                        tick={{ fontSize: 11, fill: "#64748B" }}
                        label={{
                          value: `PC2 (${clustering.pc2VariancePct}% var)`,
                          angle: -90,
                          position: "insideLeft",
                          offset: 6,
                          fontSize: 11,
                          fill: "#334155",
                        }}
                      />
                      <ZAxis range={[44, 44]} />
                      <Tooltip content={<CustomClusterTooltip />} />
                      {clustering.clusters.map((cluster, idx) => {
                        const clusterPts = clustering.points.filter(
                          (pt) => pt.clusterId === cluster.id
                        );
                        const color =
                          clustering.selectedK <= 3
                            ? CLUSTER_COLORS[cluster.riskTier]
                            : FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
                        return (
                          <Scatter
                            key={cluster.code}
                            name={cluster.tierTitle}
                            data={clusterPts}
                            fill={color}
                            fillOpacity={0.78}
                          />
                        );
                      })}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  {clustering.clusters.map((cluster, idx) => {
                    const color =
                      clustering.selectedK <= 3
                        ? CLUSTER_COLORS[cluster.riskTier]
                        : FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
                    return (
                      <div key={cluster.code} className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        <span className="font-medium text-slate-800">{cluster.tierTitle}</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          ({cluster.count})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Cluster Profiles */}
              <div className="xl:col-span-5 space-y-3">
                {clustering.clusters.map((c) => {
                  const st = tierStyles[c.riskTier];
                  return (
                    <div
                      key={c.code}
                      className="border border-slate-200 rounded-xl p-4 bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#0F2544]">
                            {c.tierTitle}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{c.tierDescription}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-mono text-lg font-bold tabular-nums ${st.rate}`}>
                            {c.attritionRatePct.toFixed(1)}%
                          </div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {c.exitedCount}/{c.count} ({c.workforcePct.toFixed(1)}%)
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                        <div>
                          <div className="text-[11px] text-slate-500">Satisf.</div>
                          <div className="font-mono font-semibold text-slate-800 tabular-nums">
                            {c.avgSatisfaction.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Perf.</div>
                          <div className="font-mono font-semibold text-slate-800 tabular-nums">
                            {c.avgPerformance.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Absence</div>
                          <div className="font-mono font-semibold text-slate-800 tabular-nums">
                            {c.avgAbsenceDays.toFixed(1)}d
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Training</div>
                          <div className="font-mono font-semibold text-slate-800 tabular-nums">
                            {c.avgTrainingHours.toFixed(1)}h
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Overtime</div>
                          <div className="font-mono font-semibold text-slate-800 tabular-nums">
                            {c.overtimePct.toFixed(0)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Avg Salary</div>
                          <div className="font-mono font-semibold text-slate-800 tabular-nums">
                            ₦{Math.round(c.avgSalaryNGN / 1000)}k
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Top Depts:{" "}
                          <span className="font-medium text-slate-800">
                            {c.topDepartments.map((d) => `${d.name} (${d.count})`).join(", ")}
                          </span>
                        </span>
                        <span>
                          Types:{" "}
                          <span className="font-medium text-slate-800">
                            {c.topEmploymentTypes.map((e) => `${e.name} (${e.count})`).join(", ")}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Common Traits Analysis: Stayed vs Left */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Likely to Stay */}
                <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-display text-sm font-bold tracking-tight text-teal-900">
                      COMMON TRAITS: EMPLOYEES LIKELY TO STAY
                    </h3>
                    <span className="font-mono text-xs font-medium text-teal-800 tabular-nums">
                      n = {commonTraits.stayedCount.toLocaleString()} active
                    </span>
                  </div>

                  {commonTraits.likelyToStayTraits.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      No subgroup showed a retention advantage of at least 1.5 percentage points above baseline in the current filter scope.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {commonTraits.likelyToStayTraits.map((t) => (
                        <li
                          key={t.label}
                          className="bg-white border border-teal-100 rounded-lg p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#0F2544]">{t.label}</span>
                            <span className="font-mono font-medium text-teal-700 tabular-nums">
                              {t.stayedMetric}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-1">{t.comparisonNote}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Likely to Leave */}
                <div className="border border-rose-200 bg-rose-50/40 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="font-display text-sm font-bold tracking-tight text-rose-900">
                      COMMON TRAITS: EMPLOYEES LIKELY TO LEAVE
                    </h3>
                    <span className="font-mono text-xs font-medium text-rose-800 tabular-nums">
                      n = {commonTraits.leftCount.toLocaleString()} exited
                    </span>
                  </div>

                  {commonTraits.likelyToLeaveTraits.length === 0 ? (
                    <p className="text-xs text-slate-600">
                      No subgroup showed an attrition elevation of at least 1.5 percentage points above baseline in the current filter scope.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {commonTraits.likelyToLeaveTraits.map((t) => (
                        <li
                          key={t.label}
                          className="bg-white border border-rose-100 rounded-lg p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#0F2544]">{t.label}</span>
                            <span className="font-mono font-medium text-rose-700 tabular-nums">
                              {t.leftMetric}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-1">{t.comparisonNote}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Statistical Comparison Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2.5 px-4 font-semibold">Workforce Characteristic</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Retained Mean</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Exited Mean</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Observed Difference (Stayed − Left)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {commonTraits.comparisonRows.map((row) => (
                      <tr key={row.metric} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-medium text-[#0F2544]">{row.metric}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-teal-700 tabular-nums">
                          {row.stayedValue}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-rose-700 tabular-nums">
                          {row.leftValue}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                          {row.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
