import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Users } from "lucide-react";
import { DEFAULT_DATASET_NAME, DEFAULT_HR_CSV } from "./data/defaultDataset";
import { parseHrCsv, type ParsedDatasetResult } from "./engine/hrParser";
import {
  applyFilters,
  computeAttritionDrivers,
  computeCommonTraits,
  computeDepartmentStats,
  computeFairnessAudit,
  computeKpis,
  computeMonthlyAttritionTrend,
  computeTrainingPerformanceScatter,
  getFilterOptions,
} from "./engine/hrAnalytics";
import { performEmployeeClustering } from "./engine/mlClustering";
import { trainAttritionModel } from "./engine/mlPredictor";
import type {
  AiInsightsResponse,
  FilterState,
  PredictorAlgorithm,
  PredictorMode,
} from "./types/hr";
import { TopNavHeader } from "./components/TopNavHeader";
import { FilterBar } from "./components/FilterBar";
import { KpiGrid } from "./components/KpiGrid";
import { WorkforceCharts } from "./components/WorkforceCharts";
import { ClusteringSection } from "./components/ClusteringSection";
import { AttritionPredictor } from "./components/AttritionPredictor";
import { AiWorkforceIntelligence } from "./components/AiWorkforceIntelligence";
import { DataQualityAndAudit } from "./components/DataQualityAndAudit";
import { CsvUploadModal } from "./components/CsvUploadModal";
import {
  exportAnalyticalSummaryCsv,
  exportClusterProfilesCsv,
  exportFilteredEmployeesCsv,
} from "./utils/csvExport";

const INITIAL_FILTERS: FilterState = {
  department: "All",
  jobRole: "All",
  gender: "All",
  employmentType: "All",
  manager: "All",
  hirePeriod: "All",
  attritionStatus: "All",
};

export default function App() {
  const [dataset, setDataset] = useState<ParsedDatasetResult>(() =>
    parseHrCsv(DEFAULT_HR_CSV, DEFAULT_DATASET_NAME)
  );
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedKOverride, setSelectedKOverride] = useState<number | null>(null);
  const [algorithm, setAlgorithm] = useState<PredictorAlgorithm>("logistic");
  const [predictorMode, setPredictorMode] = useState<PredictorMode>("existing");

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [aiInsights, setAiInsights] = useState<AiInsightsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const filterOptions = useMemo(() => getFilterOptions(dataset.records), [dataset.records]);

  const filteredRecords = useMemo(
    () => applyFilters(dataset.records, filters),
    [dataset.records, filters]
  );

  const kpis = useMemo(() => computeKpis(filteredRecords), [filteredRecords]);
  const departmentStats = useMemo(
    () => computeDepartmentStats(filteredRecords),
    [filteredRecords]
  );
  const monthlyTrend = useMemo(
    () =>
      computeMonthlyAttritionTrend(
        filteredRecords,
        filters.attritionStatus !== "All"
      ),
    [filteredRecords, filters.attritionStatus]
  );
  const scatterResult = useMemo(
    () => computeTrainingPerformanceScatter(filteredRecords),
    [filteredRecords]
  );
  const drivers = useMemo(
    () => computeAttritionDrivers(filteredRecords),
    [filteredRecords]
  );
  const commonTraits = useMemo(
    () => computeCommonTraits(filteredRecords, drivers),
    [filteredRecords, drivers]
  );
  const fairnessAudit = useMemo(
    () => computeFairnessAudit(filteredRecords),
    [filteredRecords]
  );

  const clustering = useMemo(
    () => performEmployeeClustering(filteredRecords, selectedKOverride ?? undefined),
    [filteredRecords, selectedKOverride]
  );

  // Train predictive model on full dataset records (both Active & Exited examples needed)
  const trainedModel = useMemo(
    () => trainAttritionModel(dataset.records, algorithm, predictorMode),
    [dataset.records, algorithm, predictorMode]
  );

  const buildInsightsSummaryPayload = useCallback(() => {
    const activeFilterEntries = Object.entries(filters)
      .filter(([, v]) => v !== "All")
      .map(([k, v]) => `${k}=${v}`);

    const scopeLabel =
      activeFilterEntries.length === 0
        ? `Full Dataset (${dataset.qualityReport.datasetName})`
        : `Filtered Scope (${activeFilterEntries.join(", ")})`;

    return {
      scopeLabel,
      totalEmployees: kpis.totalEmployees,
      activeEmployees: kpis.activeEmployees,
      exitedEmployees: kpis.exitedEmployees,
      attritionRatePct: Number(kpis.attritionRatePct.toFixed(2)),
      avgSalaryNGN: Math.round(kpis.avgSalaryNGN),
      avgPerformance: Number(kpis.avgPerformance.toFixed(2)),
      avgSatisfaction: Number(kpis.avgSatisfaction.toFixed(2)),
      avgTrainingHours: Number(kpis.avgTrainingHours.toFixed(1)),
      avgAbsenceDays: Number(kpis.avgAbsenceDays.toFixed(1)),
      trainingPerformanceCorrR:
        scatterResult.pearsonR !== null ? Number(scatterResult.pearsonR.toFixed(3)) : null,
      departmentBreakdown: departmentStats.map((d) => ({
        department: d.department,
        headcount: d.headcount,
        exited: d.exited,
        attritionRatePct: Number(d.attritionRatePct.toFixed(1)),
        avgSalaryNGN: Math.round(d.avgSalaryNGN),
      })),
      driversSummary: drivers.map((dim) => {
        const sorted = [...dim.buckets].sort((a, b) => b.attritionRatePct - a.attritionRatePct);
        const hi = sorted[0];
        const lo = sorted[sorted.length - 1];
        return {
          factor: dim.label,
          highestGroup: hi?.group ?? "N/A",
          highestRatePct: Number((hi?.attritionRatePct ?? 0).toFixed(1)),
          highestCount: hi?.total ?? 0,
          lowestGroup: lo?.group ?? "N/A",
          lowestRatePct: Number((lo?.attritionRatePct ?? 0).toFixed(1)),
          lowestCount: lo?.total ?? 0,
        };
      }),
      clusters: clustering.clusters.map((c) => ({
        name: c.code,
        tierLabel: c.tierTitle,
        count: c.count,
        sharePct: Number(c.workforcePct.toFixed(1)),
        attritionRatePct: Number(c.attritionRatePct.toFixed(1)),
        avgSatisfaction: Number(c.avgSatisfaction.toFixed(2)),
        avgPerformance: Number(c.avgPerformance.toFixed(2)),
        avgAbsenceDays: Number(c.avgAbsenceDays.toFixed(1)),
        avgTrainingHours: Number(c.avgTrainingHours.toFixed(1)),
        avgSalaryNGN: Math.round(c.avgSalaryNGN),
        overtimePct: Number(c.overtimePct.toFixed(1)),
        topDepartments: c.topDepartments.map((d) => `${d.name} (${d.count})`),
      })),
      stayedVsLeft: commonTraits.comparisonRows.map((row) => ({
        metric: row.metric,
        stayedAvg: row.stayedValue,
        leftAvg: row.leftValue,
        difference: row.difference,
      })),
      modelMetrics: {
        modelName: trainedModel.evaluation.algorithmLabel,
        accuracy: trainedModel.evaluation.accuracy,
        precision: trainedModel.evaluation.precision,
        recall: trainedModel.evaluation.recall,
        f1: trainedModel.evaluation.f1Score,
        rocAuc: trainedModel.evaluation.rocAuc,
        topFeatures: trainedModel.evaluation.globalFeatureImportance.slice(0, 5),
        reliable: trainedModel.evaluation.reliable,
      },
    };
  }, [
    filters,
    dataset.qualityReport.datasetName,
    kpis,
    scatterResult.pearsonR,
    departmentStats,
    drivers,
    clustering.clusters,
    commonTraits.comparisonRows,
    trainedModel.evaluation,
  ]);

  const fetchAiInsights = useCallback(async () => {
    if (filteredRecords.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const summary = buildInsightsSummaryPayload();
      const resp = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const data = (await resp.json()) as { insights?: AiInsightsResponse; error?: string };
      if (!resp.ok || !data.insights) {
        throw new Error(data.error || `Request failed with status ${resp.status}`);
      }
      setAiInsights(data.insights);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Failed to fetch AI Workforce Intelligence.");
    } finally {
      setAiLoading(false);
    }
  }, [filteredRecords.length, buildInsightsSummaryPayload]);

  // Trigger AI insights on initial load and whenever a new CSV dataset is loaded
  const lastDatasetNameRef = useRef<string>("");
  useEffect(() => {
    const marker = `${dataset.qualityReport.datasetName}:${dataset.records.length}`;
    if (lastDatasetNameRef.current !== marker) {
      lastDatasetNameRef.current = marker;
      fetchAiInsights();
    }
  }, [dataset.qualityReport.datasetName, dataset.records.length, fetchAiInsights]);

  const handleChangeFilter = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setSelectedKOverride(null);
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setSelectedKOverride(null);
  };

  const handleUploadCsv = (csvText: string, fileName: string) => {
    try {
      setUploadError(null);
      const parsed = parseHrCsv(csvText, fileName);
      setDataset(parsed);
      setFilters(INITIAL_FILTERS);
      setSelectedKOverride(null);
      setAiInsights(null);
      setUploadModalOpen(false);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Unable to parse uploaded CSV.");
    }
  };

  const handleRestoreDefault = () => {
    setUploadError(null);
    const parsed = parseHrCsv(DEFAULT_HR_CSV, DEFAULT_DATASET_NAME);
    setDataset(parsed);
    setFilters(INITIAL_FILTERS);
    setSelectedKOverride(null);
    setAiInsights(null);
    setUploadModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <TopNavHeader onOpenUpload={() => setUploadModalOpen(true)} />

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <FilterBar
          filters={filters}
          options={filterOptions}
          filteredCount={filteredRecords.length}
          totalCount={dataset.records.length}
          datasetName={dataset.qualityReport.datasetName}
          referenceDateISO={dataset.qualityReport.referenceDateISO}
          onChangeFilter={handleChangeFilter}
          onResetFilters={handleResetFilters}
          onExportFiltered={() => exportFilteredEmployeesCsv(filteredRecords)}
          onExportClusters={() => exportClusterProfilesCsv(clustering.clusters)}
          onExportSummary={() =>
            exportAnalyticalSummaryCsv({
              kpis,
              departments: departmentStats,
              drivers,
              commonTraits,
              fairness: fairnessAudit,
              modelEval: trainedModel.evaluation,
            })
          }
        />

        {filteredRecords.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center my-6">
            <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-[#0F2544]">
              No Employees Match the Selected Filters
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              Adjust one or more filter criteria above or reset all filters to restore the workforce cohort view.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F2544] hover:bg-[#1A365D] rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset All Filters</span>
            </button>
          </div>
        ) : (
          <>
            <KpiGrid kpis={kpis} />

            <WorkforceCharts
              kpis={kpis}
              departmentStats={departmentStats}
              monthlyTrend={monthlyTrend}
              scatterResult={scatterResult}
              drivers={drivers}
              attritionFilterActive={filters.attritionStatus !== "All"}
            />

            <ClusteringSection
              clustering={clustering}
              commonTraits={commonTraits}
              selectedKOverride={selectedKOverride}
              onSelectK={setSelectedKOverride}
            />
          </>
        )}

        <AttritionPredictor
          allRecords={dataset.records}
          model={trainedModel}
          algorithm={algorithm}
          mode={predictorMode}
          clustering={clustering}
          onChangeAlgorithm={setAlgorithm}
          onChangeMode={setPredictorMode}
        />

        <AiWorkforceIntelligence
          insights={aiInsights}
          loading={aiLoading}
          error={aiError}
          onRefresh={fetchAiInsights}
        />

        <DataQualityAndAudit
          quality={dataset.qualityReport}
          fairnessAudit={fairnessAudit}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>HR Workforce Analytics Dashboard · Statistical &amp; ML Decision-Support Platform</span>
          <span>
            Predictions are probabilistic estimates and must not be used as the sole basis for employment decisions.
          </span>
        </div>
      </footer>

      <CsvUploadModal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setUploadError(null);
        }}
        onUploadCsv={handleUploadCsv}
        onRestoreDefault={handleRestoreDefault}
        uploadError={uploadError}
      />
    </div>
  );
}
