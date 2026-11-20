import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type {
  DepartmentStat,
  DriverDimension,
  KpiSummary,
  MonthlyExitPoint,
  ScatterRegressionResult,
} from "../types/hr";

interface WorkforceChartsProps {
  kpis: KpiSummary;
  departmentStats: DepartmentStat[];
  monthlyTrend: MonthlyExitPoint[];
  scatterResult: ScatterRegressionResult;
  drivers: DriverDimension[];
  attritionFilterActive: boolean;
}

const CHART_COLORS = {
  navy: "#0F2544",
  slateBlue: "#334E68",
  teal: "#0D9488",
  emerald: "#059669",
  amber: "#D97706",
  softRed: "#E11D48",
  mutedGrid: "#E2E8F0",
};

function formatNairaShort(v: number): string {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${Math.round(v / 1_000)}k`;
  return `₦${Math.round(v)}`;
}

function CustomDeptTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DepartmentStat }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs">
      <p className="font-semibold text-[#0F2544] mb-1">{d.department}</p>
      <div className="space-y-0.5 text-slate-600 tabular-nums">
        <p>Total Headcount: <span className="font-mono font-medium text-slate-900">{d.headcount}</span></p>
        <p>Active: <span className="font-mono text-teal-700">{d.active}</span> · Exited: <span className="font-mono text-rose-700">{d.exited}</span></p>
        <p>Historical Attrition: <span className="font-mono font-medium">{d.attritionRatePct.toFixed(1)}%</span></p>
        <p>Avg Recorded Salary: <span className="font-mono font-medium">₦{Math.round(d.avgSalaryNGN).toLocaleString("en-NG")}</span></p>
      </div>
    </div>
  );
}

function CustomTrendTooltip({
  active,
  payload,
  showRate,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthlyExitPoint }>;
  showRate: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs">
      <p className="font-mono font-semibold text-[#0F2544] mb-1">{p.month}</p>
      <div className="space-y-0.5 text-slate-600 tabular-nums">
        <p>Recorded Exits: <span className="font-mono font-semibold text-rose-700">{p.exits}</span></p>
        {showRate && p.cohortActiveCount !== null && p.monthlyRatePct !== null && (
          <>
            <p>Active Cohort Denominator: <span className="font-mono">{p.cohortActiveCount}</span></p>
            <p>Cohort Monthly Exit Rate: <span className="font-mono font-semibold">{p.monthlyRatePct.toFixed(2)}%</span></p>
          </>
        )}
      </div>
    </div>
  );
}

function CustomScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: {
      employeeId: string;
      department: string;
      trainingHours: number;
      performanceRating: number;
      hasLeft: boolean;
    };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs">
      <p className="font-mono font-semibold text-[#0F2544]">{p.employeeId}</p>
      <p className="text-slate-500 mb-1">{p.department}</p>
      <div className="space-y-0.5 text-slate-700 tabular-nums">
        <p>Training Hours: <span className="font-mono font-medium">{p.trainingHours} hrs</span></p>
        <p>Performance Rating: <span className="font-mono font-medium">{p.performanceRating} / 5</span></p>
        <p>Status: <span className={p.hasLeft ? "text-rose-700 font-medium" : "text-teal-700 font-medium"}>{p.hasLeft ? "Exited" : "Active"}</span></p>
      </div>
    </div>
  );
}

export function WorkforceCharts({
  kpis,
  departmentStats,
  monthlyTrend,
  scatterResult,
  drivers,
  attritionFilterActive,
}: WorkforceChartsProps) {
  const [trendMode, setTrendMode] = useState<"count" | "rate">("count");
  const [driverViewMode, setDriverViewMode] = useState<"all" | "top">("all");

  const hasValidMonthlyDenominators =
    !attritionFilterActive && monthlyTrend.some((m) => m.monthlyRatePct !== null);
  const showRate = trendMode === "rate" && hasValidMonthlyDenominators;

  const retentionData = [
    {
      name: "Retained (Active)",
      value: kpis.activeEmployees,
      pct: kpis.totalEmployees > 0 ? (kpis.activeEmployees / kpis.totalEmployees) * 100 : 0,
      color: CHART_COLORS.teal,
    },
    {
      name: "Attrited (Exited)",
      value: kpis.exitedEmployees,
      pct: kpis.totalEmployees > 0 ? (kpis.exitedEmployees / kpis.totalEmployees) * 100 : 0,
      color: CHART_COLORS.softRed,
    },
  ];

  const salarySortedDepts = [...departmentStats].sort((a, b) => b.avgSalaryNGN - a.avgSalaryNGN);

  const activeScatterPoints = scatterResult.points.filter((p) => !p.hasLeft);
  const exitedScatterPoints = scatterResult.points.filter((p) => p.hasLeft);

  const visibleDrivers =
    driverViewMode === "top"
      ? [...drivers].sort((a, b) => b.spreadPct - a.spreadPct).slice(0, 4)
      : drivers;

  const getHeatCellClasses = (ratePct: number, baselinePct: number) => {
    const delta = ratePct - baselinePct;
    if (delta >= 6) return "bg-rose-50 border-rose-200 text-rose-900";
    if (delta >= 2) return "bg-amber-50 border-amber-200 text-amber-900";
    if (delta <= -3) return "bg-teal-50 border-teal-200 text-teal-900";
    return "bg-slate-50 border-slate-200 text-slate-800";
  };

  return (
    <>
      <section id="analytics-charts" className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* A. Headcount by Department */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F2544]">
                  A. Headcount by Department
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sorted highest to lowest with active vs exited composition
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#0F2544]" aria-hidden="true" />
                  Active
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#E11D48]" aria-hidden="true" />
                  Exited
                </span>
              </div>
            </div>

            <div className="h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={departmentStats}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.mutedGrid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis
                    dataKey="department"
                    type="category"
                    width={132}
                    tick={{ fontSize: 11, fill: "#334155" }}
                  />
                  <Tooltip content={<CustomDeptTooltip />} />
                  <Bar dataKey="active" stackId="a" fill={CHART_COLORS.navy} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="exited" stackId="a" fill={CHART_COLORS.softRed} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* B. Employee Retention vs Attrition */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold text-[#0F2544]">
                B. Employee Retention vs Attrition
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dataset-level historical retention split across {kpis.totalEmployees.toLocaleString()} distinct employees
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
              <div className="sm:col-span-7 h-[270px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={retentionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={102}
                      paddingAngle={2}
                    >
                      {retentionData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [
                        `${Number(val ?? 0).toLocaleString()} employees`,
                        String(name ?? ""),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-2xl font-bold text-[#0F2544] tabular-nums">
                    {(100 - kpis.attritionRatePct).toFixed(1)}%
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">Retention</span>
                </div>
              </div>

              <div className="sm:col-span-5 space-y-4">
                {retentionData.map((item) => (
                  <div key={item.name} className="border border-slate-200 rounded-lg p-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-slate-600">{item.name}</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="font-mono text-xl font-semibold text-[#0F2544] tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                      <span className="font-mono text-sm font-medium text-slate-600 tabular-nums">
                        {item.pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* C. Attrition Trend Over Time */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F2544]">
                  C. Attrition Trend Over Time
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monthly exits by Exit_Date
                  {showRate
                    ? " · Rate uses in-dataset active cohort headcount per month"
                    : " · Monthly exit counts"}
                </p>
              </div>

              {hasValidMonthlyDenominators && (
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setTrendMode("count")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      trendMode === "count"
                        ? "bg-white text-[#0F2544] shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Exit Count
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendMode("rate")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      trendMode === "rate"
                        ? "bg-white text-[#0F2544] shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Cohort Rate %
                  </button>
                </div>
              )}
            </div>

            {monthlyTrend.length === 0 ? (
              <div className="h-[270px] flex items-center justify-center text-sm text-slate-500">
                No dated exit events exist in the current filtered selection.
              </div>
            ) : (
              <div className="h-[270px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyTrend} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.mutedGrid} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748B" }}
                      allowDecimals={showRate}
                      tickFormatter={(v) => (showRate ? `${v}%` : `${v}`)}
                    />
                    <Tooltip content={<CustomTrendTooltip showRate={showRate} />} />
                    <Area
                      type="monotone"
                      dataKey={showRate ? "monthlyRatePct" : "exits"}
                      stroke={CHART_COLORS.softRed}
                      fill="#FFE4E6"
                      fillOpacity={0.55}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey={showRate ? "monthlyRatePct" : "exits"}
                      stroke={CHART_COLORS.softRed}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: CHART_COLORS.softRed }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* D. Average Salary by Department */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold text-[#0F2544]">
                D. Average Salary by Department (NGN)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Recorded Salary_NGN averages by department · Pay frequency unspecified in source CSV
              </p>
            </div>

            <div className="h-[270px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salarySortedDepts} margin={{ top: 8, right: 16, left: 6, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.mutedGrid} vertical={false} />
                  <XAxis
                    dataKey="department"
                    tick={{ fontSize: 10, fill: "#334155" }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickFormatter={(v) => formatNairaShort(Number(v))}
                  />
                  <Tooltip content={<CustomDeptTooltip />} />
                  <Bar dataKey="avgSalaryNGN" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Row 3: E. Training vs Performance Scatter + F. Attrition Drivers Matrix */}
      <section id="attrition-drivers" className="mb-8">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* E. Training Hours vs Performance Rating */}
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
            <div className="mb-3">
              <h2 className="font-display text-base font-semibold text-[#0F2544]">
                E. Training Hours vs Performance Rating
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                OLS regression trendline ·{" "}
                <span className="font-mono font-semibold text-[#0F2544]">
                  r = {scatterResult.pearsonR !== null ? scatterResult.pearsonR.toFixed(3) : "N/A"}
                </span>
              </p>
            </div>

            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 16, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.mutedGrid} />
                  <XAxis
                    type="number"
                    dataKey="trainingHours"
                    name="Training Hours"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    label={{
                      value: "Training Hours",
                      position: "insideBottom",
                      offset: -8,
                      fontSize: 11,
                      fill: "#475569",
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="performanceRating"
                    name="Performance Rating"
                    domain={[0.5, 5.5]}
                    ticks={[1, 2, 3, 4, 5]}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                  />
                  <ZAxis range={[36, 36]} />
                  <Tooltip content={<CustomScatterTooltip />} />
                  <Scatter
                    name="Active"
                    data={activeScatterPoints}
                    fill={CHART_COLORS.teal}
                    fillOpacity={0.65}
                  />
                  <Scatter
                    name="Exited"
                    data={exitedScatterPoints}
                    fill={CHART_COLORS.softRed}
                    fillOpacity={0.75}
                  />
                  {scatterResult.trendLine.length === 2 && (
                    <ReferenceLine
                      segment={[
                        { x: scatterResult.trendLine[0].x, y: scatterResult.trendLine[0].y },
                        { x: scatterResult.trendLine[1].x, y: scatterResult.trendLine[1].y },
                      ]}
                      stroke={CHART_COLORS.navy}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 leading-relaxed">
              {scatterResult.interpretation}
            </div>
          </div>

          {/* F. Attrition Drivers Analysis */}
          <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#0F2544]">
                  F. Attrition Drivers Comparison Matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Historical attrition rates across workforce dimensions vs{" "}
                  <span className="font-mono font-semibold text-[#0F2544]">
                    {kpis.attritionRatePct.toFixed(1)}%
                  </span>{" "}
                  cohort baseline
                </p>
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setDriverViewMode("all")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    driverViewMode === "all"
                      ? "bg-white text-[#0F2544] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All 9 Factors
                </button>
                <button
                  type="button"
                  onClick={() => setDriverViewMode("top")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    driverViewMode === "top"
                      ? "bg-white text-[#0F2544] shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Highest Spread
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {visibleDrivers.map((dim) => (
                <div key={dim.key} className="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-[#0F2544]">{dim.label}</span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      Spread: {dim.spreadPct.toFixed(1)} pp
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {dim.buckets.map((b) => (
                      <div
                        key={b.group}
                        className={`border rounded-lg px-2.5 py-2 transition-colors ${getHeatCellClasses(
                          b.attritionRatePct,
                          kpis.attritionRatePct
                        )}`}
                      >
                        <div className="text-[11px] font-medium truncate" title={b.group}>
                          {b.group}
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-1">
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {b.attritionRatePct.toFixed(1)}%
                          </span>
                          <span className="font-mono text-[10px] opacity-80 tabular-nums">
                            {b.exited}/{b.total}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
