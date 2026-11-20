import { AlertCircle, BrainCircuit, RefreshCw } from "lucide-react";
import type { AiInsightsResponse } from "../types/hr";

interface AiWorkforceIntelligenceProps {
  insights: AiInsightsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function AiWorkforceIntelligence({
  insights,
  loading,
  error,
  onRefresh,
}: AiWorkforceIntelligenceProps) {
  return (
    <section id="ai-intelligence" className="mb-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#0F2544]" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold text-[#0F2544]">
                AI Workforce Intelligence
              </h2>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Executive narrative and prioritized HR interventions synthesized exclusively from your computed cohort metrics, clusters, and model evaluations.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0F2544] bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{loading ? "Analyzing Metrics..." : "Regenerate Insights"}</span>
          </button>
        </div>

        {loading && !insights && (
          <div className="py-8 space-y-4">
            <div className="h-5 bg-slate-100 rounded w-3/4 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5 text-xs text-rose-900">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Unable to generate AI Workforce Intelligence</p>
                <p className="mt-0.5 text-rose-800">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="px-3 py-1.5 text-xs font-semibold text-rose-900 bg-white border border-rose-200 rounded-md hover:bg-rose-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {insights && (
          <div className={`pt-5 space-y-6 ${loading ? "opacity-60 transition-opacity" : ""}`}>
            <div className="p-4 bg-[#0F2544] text-white rounded-xl">
              <div className="text-[11px] font-medium text-slate-300 mb-1">
                Executive Takeaway
              </div>
              <p className="text-sm sm:text-base font-medium leading-relaxed">
                {insights.executiveHeadline}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-display text-xs font-bold text-[#0F2544] mb-1.5">
                  Department Attrition Concentration
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {insights.departmentAttritionInsight}
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-display text-xs font-bold text-[#0F2544] mb-1.5">
                  Retention vs Exit Characteristics
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {insights.retentionCharacteristicsInsight}
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-display text-xs font-bold text-[#0F2544] mb-1.5">
                  Workforce Cluster Segments
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {insights.clusterSegmentsInsight}
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4">
                <h3 className="font-display text-xs font-bold text-[#0F2544] mb-1.5">
                  Satisfaction, Training &amp; Performance Associations
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {insights.metricsRelationshipInsight}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-display text-sm font-bold text-[#0F2544] mb-3">
                Prioritized HR Leadership Recommendations
              </h3>
              <div className="space-y-2.5">
                {insights.prioritizedRecommendations.map((rec) => (
                  <div
                    key={rec.priority}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-start gap-4"
                  >
                    <div className="font-mono text-sm font-bold text-[#0F2544] bg-slate-100 rounded-lg px-2.5 py-1 shrink-0 self-start tabular-nums">
                      0{rec.priority}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#0F2544]">{rec.title}</h4>
                        <span className="text-xs font-medium text-teal-800">
                          Target: {rec.targetGroup}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{rec.action}</p>
                      <p className="text-[11px] text-slate-500">
                        Dataset Evidence: {rec.evidence}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              Statistical Governance Note: {insights.methodologyCaveat}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
