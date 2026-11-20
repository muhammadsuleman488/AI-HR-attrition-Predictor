import Papa from "papaparse";
import type {
  ClusterProfile,
  CommonTraitsAnalysis,
  DepartmentStat,
  DriverDimension,
  EmployeeRecord,
  FairnessAuditRow,
  KpiSummary,
  ModelEvaluation,
} from "../types/hr";

function triggerCsvDownload(csvString: string, filename: string) {
  // Add UTF-8 BOM so Excel / Google Sheets renders ₦ Naira symbol cleanly
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportFilteredEmployeesCsv(records: EmployeeRecord[]) {
  const rows = records.map((r) => ({
    Employee_ID: r.employeeId,
    Age: r.age ?? "",
    Gender: r.gender,
    Department: r.department,
    Job_Role: r.jobRole,
    Employment_Type: r.employmentType,
    Hire_Date: r.hireDate,
    Tenure_Years: r.tenureYears ?? "",
    Salary_NGN: r.salaryNGN ?? "",
    Performance_Rating: r.performanceRating ?? "",
    Training_Hours: r.trainingHours ?? "",
    Absence_Days: r.absenceDays ?? "",
    Job_Satisfaction_Score: r.jobSatisfactionScore ?? "",
    Overtime: r.overtime ? "Yes" : "No",
    Manager: r.manager,
    Employment_Status: r.employmentStatus,
    Exit_Date: r.exitDate,
    Attrition_Status: r.attritionStatus,
  }));
  const csv = Papa.unparse(rows);
  triggerCsvDownload(csv, "hr_filtered_workforce_records.csv");
}

export function exportClusterProfilesCsv(clusters: ClusterProfile[]) {
  const rows = clusters.map((c) => ({
    Cluster: c.code,
    Business_Segment: c.tierTitle,
    Employees: c.count,
    Workforce_Share_Pct: c.workforcePct.toFixed(1),
    Historical_Attrition_Rate_Pct: c.attritionRatePct.toFixed(1),
    Exited_Count: c.exitedCount,
    Avg_Satisfaction: c.avgSatisfaction.toFixed(2),
    Avg_Performance: c.avgPerformance.toFixed(2),
    Avg_Absence_Days: c.avgAbsenceDays.toFixed(1),
    Avg_Training_Hours: c.avgTrainingHours.toFixed(1),
    Avg_Salary_NGN: Math.round(c.avgSalaryNGN),
    Overtime_Prevalence_Pct: c.overtimePct.toFixed(1),
    Top_Departments: c.topDepartments.map((d) => `${d.name} (${d.count})`).join("; "),
    Top_Employment_Types: c.topEmploymentTypes.map((e) => `${e.name} (${e.count})`).join("; "),
  }));
  const csv = Papa.unparse(rows);
  triggerCsvDownload(csv, "hr_employee_cluster_profiles.csv");
}

export function exportAnalyticalSummaryCsv(params: {
  kpis: KpiSummary;
  departments: DepartmentStat[];
  drivers: DriverDimension[];
  commonTraits: CommonTraitsAnalysis;
  fairness: FairnessAuditRow[];
  modelEval: ModelEvaluation;
}) {
  const rows: Array<Record<string, string | number>> = [];

  rows.push({ Section: "KPI Summary", Metric: "Total Distinct Employees", Value: params.kpis.totalEmployees, Notes: "" });
  rows.push({ Section: "KPI Summary", Metric: "Active Employees", Value: params.kpis.activeEmployees, Notes: "" });
  rows.push({ Section: "KPI Summary", Metric: "Exited Employees", Value: params.kpis.exitedEmployees, Notes: "" });
  rows.push({
    Section: "KPI Summary",
    Metric: "Dataset Historical Attrition Rate (%)",
    Value: params.kpis.attritionRatePct.toFixed(2),
    Notes: "Dataset-level historical rate",
  });
  rows.push({ Section: "KPI Summary", Metric: "Average Salary (NGN)", Value: Math.round(params.kpis.avgSalaryNGN), Notes: "" });
  rows.push({ Section: "KPI Summary", Metric: "Average Performance Rating", Value: params.kpis.avgPerformance.toFixed(2), Notes: "" });
  rows.push({ Section: "KPI Summary", Metric: "Average Job Satisfaction", Value: params.kpis.avgSatisfaction.toFixed(2), Notes: "" });
  rows.push({ Section: "KPI Summary", Metric: "Average Training Hours", Value: params.kpis.avgTrainingHours.toFixed(1), Notes: "" });
  rows.push({ Section: "KPI Summary", Metric: "Average Absence Days", Value: params.kpis.avgAbsenceDays.toFixed(1), Notes: "" });

  for (const d of params.departments) {
    rows.push({
      Section: "Department Breakdown",
      Metric: d.department,
      Value: `${d.headcount} headcount / ${d.attritionRatePct.toFixed(1)}% attrition`,
      Notes: `Avg Salary ₦${Math.round(d.avgSalaryNGN).toLocaleString("en-NG")}`,
    });
  }

  for (const dim of params.drivers) {
    for (const b of dim.buckets) {
      rows.push({
        Section: `Driver: ${dim.label}`,
        Metric: b.group,
        Value: `${b.attritionRatePct.toFixed(1)}% (${b.exited}/${b.total})`,
        Notes: `${b.deltaFromBaselinePct >= 0 ? "+" : ""}${b.deltaFromBaselinePct.toFixed(1)} pp vs baseline`,
      });
    }
  }

  for (const c of params.commonTraits.comparisonRows) {
    rows.push({
      Section: "Stayed vs Left Comparison",
      Metric: c.metric,
      Value: `Stayed: ${c.stayedValue} | Left: ${c.leftValue}`,
      Notes: `Difference: ${c.difference}`,
    });
  }

  for (const f of params.fairness) {
    rows.push({
      Section: `Fairness Audit (${f.groupType})`,
      Metric: f.segment,
      Value: `${f.attritionRatePct.toFixed(1)}% (${f.exited}/${f.count})`,
      Notes: "Aggregate audit only (excluded from individual risk scoring)",
    });
  }

  rows.push({
    Section: "Predictive Model Evaluation",
    Metric: params.modelEval.algorithmLabel,
    Value: `Acc ${params.modelEval.accuracy} | Prec ${params.modelEval.precision} | Rec ${params.modelEval.recall} | F1 ${params.modelEval.f1Score} | AUC ${params.modelEval.rocAuc ?? "N/A"}`,
    Notes: `Records: ${params.modelEval.totalRecordsUsed}`,
  });

  const csv = Papa.unparse(rows);
  triggerCsvDownload(csv, "hr_analytical_summary.csv");
}
