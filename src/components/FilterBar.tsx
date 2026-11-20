import { Download, RotateCcw } from "lucide-react";
import type { FilterState } from "../types/hr";

interface FilterOptions {
  departments: string[];
  jobRoles: string[];
  genders: string[];
  employmentTypes: string[];
  managers: string[];
  hirePeriods: string[];
  attritionStatuses: string[];
}

interface FilterBarProps {
  filters: FilterState;
  options: FilterOptions;
  filteredCount: number;
  totalCount: number;
  datasetName: string;
  referenceDateISO: string;
  onChangeFilter: (key: keyof FilterState, value: string) => void;
  onResetFilters: () => void;
  onExportFiltered: () => void;
  onExportClusters: () => void;
  onExportSummary: () => void;
}

export function FilterBar({
  filters,
  options,
  filteredCount,
  totalCount,
  datasetName,
  referenceDateISO,
  onChangeFilter,
  onResetFilters,
  onExportFiltered,
  onExportClusters,
  onExportSummary,
}: FilterBarProps) {
  const hasActiveFilters = Object.values(filters).some((v) => v !== "All");

  const selectClass =
    "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:border-[#0F2544] focus:ring-1 focus:ring-[#0F2544] transition-colors cursor-pointer";

  return (
    <section id="overview" className="pt-6 pb-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2544] text-balance">
            HR Workforce Analytics Dashboard
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1">
            Attrition, Retention &amp; Employee Clustering Insights
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{datasetName}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-medium text-[#0F2544]">
              {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} employees in active view
            </span>
            <span aria-hidden="true">·</span>
            <span>Tenure reference date: {referenceDateISO}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onExportFiltered}
            disabled={filteredCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export Records CSV</span>
          </button>
          <button
            type="button"
            onClick={onExportClusters}
            disabled={filteredCount < 15}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export Clusters CSV</span>
          </button>
          <button
            type="button"
            onClick={onExportSummary}
            disabled={filteredCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>Export Summary CSV</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
          <div>
            <label htmlFor="filter-dept" className="block text-[11px] font-medium text-slate-500 mb-1">
              Department
            </label>
            <select
              id="filter-dept"
              value={filters.department}
              onChange={(e) => onChangeFilter("department", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Departments</option>
              {options.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-role" className="block text-[11px] font-medium text-slate-500 mb-1">
              Job Role
            </label>
            <select
              id="filter-role"
              value={filters.jobRole}
              onChange={(e) => onChangeFilter("jobRole", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Job Roles</option>
              {options.jobRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-gender" className="block text-[11px] font-medium text-slate-500 mb-1">
              Gender
            </label>
            <select
              id="filter-gender"
              value={filters.gender}
              onChange={(e) => onChangeFilter("gender", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Genders</option>
              {options.genders.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-type" className="block text-[11px] font-medium text-slate-500 mb-1">
              Employment Type
            </label>
            <select
              id="filter-type"
              value={filters.employmentType}
              onChange={(e) => onChangeFilter("employmentType", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Types</option>
              {options.employmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-manager" className="block text-[11px] font-medium text-slate-500 mb-1">
              Manager
            </label>
            <select
              id="filter-manager"
              value={filters.manager}
              onChange={(e) => onChangeFilter("manager", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Managers</option>
              {options.managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-hire" className="block text-[11px] font-medium text-slate-500 mb-1">
              Hire Period
            </label>
            <select
              id="filter-hire"
              value={filters.hirePeriod}
              onChange={(e) => onChangeFilter("hirePeriod", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Hire Years</option>
              {options.hirePeriods.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-attrition" className="block text-[11px] font-medium text-slate-500 mb-1">
              Attrition Status
            </label>
            <select
              id="filter-attrition"
              value={filters.attritionStatus}
              onChange={(e) => onChangeFilter("attritionStatus", e.target.value)}
              className={selectClass}
            >
              <option value="All">All Statuses</option>
              {options.attritionStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={onResetFilters}
              disabled={!hasActiveFilters}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0F2544] bg-slate-100 hover:bg-slate-200 disabled:opacity-45 disabled:hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
