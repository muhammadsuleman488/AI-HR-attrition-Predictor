import type { DataQualityReport, FairnessAuditRow } from "../types/hr";

interface DataQualityAndAuditProps {
  quality: DataQualityReport;
  fairnessAudit: FairnessAuditRow[];
}

export function DataQualityAndAudit({ quality, fairnessAudit }: DataQualityAndAuditProps) {
  const nonZeroMissing = quality.missingStats.filter((m) => m.missingCount > 0);

  return (
    <section id="data-governance" className="mb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Data Quality & Schema Detection */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-display text-base font-bold text-[#0F2544]">
            Dataset Inspection &amp; Data Quality Report
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Automated schema inspection, status-value detection, and deduplication on{" "}
            <span className="font-medium text-slate-700">{quality.datasetName}</span>
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] text-slate-500">Raw CSV Rows</div>
              <div className="font-mono text-lg font-semibold text-[#0F2544] tabular-nums">
                {quality.totalRawRows.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] text-slate-500">Distinct Employee_ID</div>
              <div className="font-mono text-lg font-semibold text-[#0F2544] tabular-nums">
                {quality.distinctEmployees.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] text-slate-500">Duplicates Removed</div>
              <div className="font-mono text-lg font-semibold text-[#0F2544] tabular-nums">
                {quality.duplicateIdsRemoved}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] text-slate-500">Date Span</div>
              <div className="font-mono text-xs font-semibold text-[#0F2544] tabular-nums mt-1">
                {quality.minHireDate} → {quality.maxEventDate}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="border border-slate-200 rounded-lg p-3.5">
              <h3 className="text-xs font-semibold text-[#0F2544] mb-2">
                Detected Employment_Status Values
              </h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {quality.detectedEmploymentStatuses.map((s) => (
                  <li key={s.value} className="flex items-center justify-between">
                    <span>
                      &ldquo;{s.value}&rdquo; → <span className="font-medium text-slate-800">{s.classifiedAs}</span>
                    </span>
                    <span className="font-mono tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5">
              <h3 className="text-xs font-semibold text-[#0F2544] mb-2">
                Detected Attrition_Status Values
              </h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {quality.detectedAttritionStatuses.map((s) => (
                  <li key={s.value} className="flex items-center justify-between">
                    <span>
                      &ldquo;{s.value}&rdquo; → <span className="font-medium text-slate-800">{s.classifiedAs}</span>
                    </span>
                    <span className="font-mono tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-xs text-slate-600">
            <span className="font-semibold text-[#0F2544]">Missing Values Check: </span>
            {nonZeroMissing.length === 0 ? (
              <span>Zero missing values across all columns.</span>
            ) : (
              <span>
                {nonZeroMissing
                  .map((m) => `${m.column}: ${m.missingCount} (${m.missingPct}%)`)
                  .join(" · ")}
                {" "}
                (Blank Exit_Date is expected for active employees.)
              </span>
            )}
          </div>

          {quality.warnings.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
              {quality.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}
        </div>

        {/* Aggregate Demographic Fairness Audit */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-display text-base font-bold text-[#0F2544]">
            Aggregate Workforce Fairness Audit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Age and Gender are excluded from individual attrition risk scoring and monitored here strictly at aggregate level.
          </p>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2 px-3 font-semibold">Dimension</th>
                  <th className="py-2 px-3 font-semibold">Group</th>
                  <th className="py-2 px-3 font-semibold text-right">Headcount</th>
                  <th className="py-2 px-3 font-semibold text-right">Exits</th>
                  <th className="py-2 px-3 font-semibold text-right">Attrition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fairnessAudit.map((row) => (
                  <tr key={`${row.groupType}-${row.segment}`} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3 text-slate-500">{row.groupType}</td>
                    <td className="py-2 px-3 font-medium text-[#0F2544]">{row.segment}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{row.count}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{row.exited}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-slate-800">
                      {row.attritionRatePct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
