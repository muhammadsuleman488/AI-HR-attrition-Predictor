import Papa from "papaparse";
import type { ColumnMissingStat, DataQualityReport, EmployeeRecord } from "../types/hr";

const EXPECTED_COLUMNS = [
  "Employee_ID",
  "Age",
  "Gender",
  "Department",
  "Job_Role",
  "Employment_Type",
  "Hire_Date",
  "Salary_NGN",
  "Performance_Rating",
  "Training_Hours",
  "Absence_Days",
  "Job_Satisfaction_Score",
  "Overtime",
  "Manager",
  "Employment_Status",
  "Exit_Date",
  "Attrition_Status",
] as const;

const POSITIVE_ATTRITION_TOKENS = new Set([
  "yes",
  "y",
  "true",
  "1",
  "left",
  "exited",
  "exit",
  "resigned",
  "terminated",
  "attrited",
  "churned",
  "separated",
  "former",
]);

const NEGATIVE_ATTRITION_TOKENS = new Set([
  "no",
  "n",
  "false",
  "0",
  "active",
  "stayed",
  "retained",
  "current",
  "employed",
  "present",
]);

function normalizeHeader(header: string): string {
  return header.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;
  const cleaned = str.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseSalary(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;
  // Handle currency symbols (₦, ?, NGN, $, commas)
  const cleaned = str.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseDateToISO(val: unknown): { iso: string; ms: number | null } {
  if (val === null || val === undefined) return { iso: "", ms: null };
  const raw = String(val).trim();
  if (!raw) return { iso: "", ms: null };

  // Handle YYYY-MM-DD directly to avoid timezone drift
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const ms = Date.UTC(y, m - 1, d);
    const dt = new Date(ms);
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      return { iso: `${y}-${mm}-${dd}`, ms };
    }
  }

  // Handle MM/DD/YYYY or DD/MM/YYYY fallback
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return { iso: `${y}-${mm}-${dd}`, ms: Date.UTC(y, dt.getUTCMonth(), dt.getUTCDate()) };
  }

  return { iso: "", ms: null };
}

function cleanText(val: unknown, fallback = "Unspecified"): string {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim().replace(/\s+/g, " ");
  return s || fallback;
}

function classifyStatusValue(
  value: string,
  exitDateRate: number,
  positiveTokens: Set<string>,
  negativeTokens: Set<string>
): boolean {
  const norm = value.trim().toLowerCase();
  if (positiveTokens.has(norm)) return true;
  if (negativeTokens.has(norm)) return false;
  // Data-driven fallback: if >= 50% of rows with this status have an Exit_Date, classify as left/exited
  return exitDateRate >= 0.5;
}

export interface ParsedDatasetResult {
  records: EmployeeRecord[];
  qualityReport: DataQualityReport;
}

export function parseHrCsv(csvText: string, datasetName: string): ParsedDatasetResult {
  const trimmed = csvText.trim();
  if (!trimmed) {
    throw new Error("The uploaded CSV file is empty.");
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`CSV parsing failed: ${parsed.errors[0].message}`);
  }

  const headers = parsed.meta.fields ?? [];
  const headerMap = new Map<string, string>();
  for (const h of headers) {
    headerMap.set(normalizeHeader(h), h);
  }

  const getField = (row: Record<string, string>, canonical: string): string => {
    const exact = row[canonical];
    if (exact !== undefined) return exact;
    const mapped = headerMap.get(normalizeHeader(canonical));
    return mapped ? row[mapped] ?? "" : "";
  };

  if (!headerMap.has(normalizeHeader("Employee_ID"))) {
    throw new Error(
      "Missing required 'Employee_ID' column. Please ensure your CSV matches the HR dataset schema."
    );
  }

  const rawRows = parsed.data;
  if (rawRows.length === 0) {
    throw new Error("The CSV contains headers but zero employee rows.");
  }

  // First pass: collect distinct values for Employment_Status and Attrition_Status + Exit_Date co-occurrence
  const empStatusStats = new Map<string, { count: number; withExitDate: number }>();
  const attrStatusStats = new Map<string, { count: number; withExitDate: number }>();
  const missingCounts = new Map<string, number>();
  for (const col of EXPECTED_COLUMNS) {
    missingCounts.set(col, 0);
  }

  let maxEventMs = 0;
  let minHireMs = Number.POSITIVE_INFINITY;

  for (const row of rawRows) {
    for (const col of EXPECTED_COLUMNS) {
      const val = getField(row, col);
      if (!String(val ?? "").trim()) {
        missingCounts.set(col, (missingCounts.get(col) ?? 0) + 1);
      }
    }

    const empStatus = cleanText(getField(row, "Employment_Status"), "Unspecified");
    const attrStatus = cleanText(getField(row, "Attrition_Status"), "Unspecified");
    const exitInfo = parseDateToISO(getField(row, "Exit_Date"));
    const hireInfo = parseDateToISO(getField(row, "Hire_Date"));
    const hasExit = exitInfo.ms !== null;

    if (hireInfo.ms !== null) {
      if (hireInfo.ms < minHireMs) minHireMs = hireInfo.ms;
      if (hireInfo.ms > maxEventMs) maxEventMs = hireInfo.ms;
    }
    if (exitInfo.ms !== null && exitInfo.ms > maxEventMs) {
      maxEventMs = exitInfo.ms;
    }

    const es = empStatusStats.get(empStatus) ?? { count: 0, withExitDate: 0 };
    es.count += 1;
    if (hasExit) es.withExitDate += 1;
    empStatusStats.set(empStatus, es);

    const as = attrStatusStats.get(attrStatus) ?? { count: 0, withExitDate: 0 };
    as.count += 1;
    if (hasExit) as.withExitDate += 1;
    attrStatusStats.set(attrStatus, as);
  }

  // Determine classification map for Employment_Status & Attrition_Status dynamically
  const empStatusExitedMap = new Map<string, boolean>();
  const detectedEmploymentStatuses: DataQualityReport["detectedEmploymentStatuses"] = [];
  for (const [val, stat] of empStatusStats.entries()) {
    const exitRate = stat.count > 0 ? stat.withExitDate / stat.count : 0;
    const isExited = classifyStatusValue(
      val,
      exitRate,
      POSITIVE_ATTRITION_TOKENS,
      NEGATIVE_ATTRITION_TOKENS
    );
    empStatusExitedMap.set(val, isExited);
    detectedEmploymentStatuses.push({
      value: val,
      count: stat.count,
      classifiedAs: isExited ? "Exited" : "Active",
    });
  }

  const attrStatusLeftMap = new Map<string, boolean>();
  const detectedAttritionStatuses: DataQualityReport["detectedAttritionStatuses"] = [];
  for (const [val, stat] of attrStatusStats.entries()) {
    const exitRate = stat.count > 0 ? stat.withExitDate / stat.count : 0;
    const isLeft = classifyStatusValue(
      val,
      exitRate,
      POSITIVE_ATTRITION_TOKENS,
      NEGATIVE_ATTRITION_TOKENS
    );
    attrStatusLeftMap.set(val, isLeft);
    detectedAttritionStatuses.push({
      value: val,
      count: stat.count,
      classifiedAs: isLeft ? "Left" : "Stayed",
    });
  }

  // Reference date for active employee tenure: latest observed event date in dataset
  const refMs = maxEventMs > 0 ? maxEventMs : Date.now();
  const refDate = new Date(refMs);
  const referenceDateISO = `${refDate.getUTCFullYear()}-${String(
    refDate.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(refDate.getUTCDate()).padStart(2, "0")}`;

  const minHireDateObj = Number.isFinite(minHireMs) ? new Date(minHireMs) : refDate;
  const minHireDateISO = `${minHireDateObj.getUTCFullYear()}-${String(
    minHireDateObj.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(minHireDateObj.getUTCDate()).padStart(2, "0")}`;

  // Second pass: construct deduplicated standardized EmployeeRecord[]
  const seenIds = new Set<string>();
  const duplicateIdList: string[] = [];
  const records: EmployeeRecord[] = [];
  let statusDiscrepancyCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const empId = cleanText(getField(row, "Employee_ID"), "");
    if (!empId) continue;

    if (seenIds.has(empId)) {
      duplicateIdList.push(empId);
      continue;
    }
    seenIds.add(empId);

    const hireParsed = parseDateToISO(getField(row, "Hire_Date"));
    const exitParsed = parseDateToISO(getField(row, "Exit_Date"));
    const empStatus = cleanText(getField(row, "Employment_Status"), "Unspecified");
    const attrStatus = cleanText(getField(row, "Attrition_Status"), "Unspecified");

    const attrLeft = attrStatusLeftMap.get(attrStatus) ?? false;
    const empExited = empStatusExitedMap.get(empStatus) ?? false;
    if (attrStatus !== "Unspecified" && empStatus !== "Unspecified" && attrLeft !== empExited) {
      statusDiscrepancyCount += 1;
    }

    // Use Attrition_Status primarily if present, otherwise Employment_Status or Exit_Date
    const hasLeft =
      attrStatus !== "Unspecified"
        ? attrLeft
        : empStatus !== "Unspecified"
        ? empExited
        : exitParsed.ms !== null;

    const endMs = hasLeft && exitParsed.ms !== null ? exitParsed.ms : refMs;
    let tenureYears: number | null = null;
    if (hireParsed.ms !== null) {
      const diffYears = (endMs - hireParsed.ms) / (1000 * 60 * 60 * 24 * 365.25);
      tenureYears = Math.max(0, Number(diffYears.toFixed(2)));
    }

    const overtimeRaw = cleanText(getField(row, "Overtime"), "No");
    const overtime = ["yes", "y", "true", "1"].includes(overtimeRaw.toLowerCase());

    records.push({
      employeeId: empId,
      age: parseNumber(getField(row, "Age")),
      gender: cleanText(getField(row, "Gender")),
      department: cleanText(getField(row, "Department")),
      jobRole: cleanText(getField(row, "Job_Role")),
      employmentType: cleanText(getField(row, "Employment_Type")),
      hireDate: hireParsed.iso,
      hireDateMs: hireParsed.ms,
      hireYear: hireParsed.iso ? hireParsed.iso.slice(0, 4) : "Unknown",
      salaryNGN: parseSalary(getField(row, "Salary_NGN")),
      performanceRating: parseNumber(getField(row, "Performance_Rating")),
      trainingHours: parseNumber(getField(row, "Training_Hours")),
      absenceDays: parseNumber(getField(row, "Absence_Days")),
      jobSatisfactionScore: parseNumber(getField(row, "Job_Satisfaction_Score")),
      overtime,
      overtimeRaw,
      manager: cleanText(getField(row, "Manager")),
      employmentStatus: empStatus,
      exitDate: exitParsed.iso,
      exitDateMs: exitParsed.ms,
      attritionStatus: attrStatus,
      hasLeft,
      tenureYears,
    });
  }

  const missingStats: ColumnMissingStat[] = EXPECTED_COLUMNS.map((col) => {
    const missingCount = missingCounts.get(col) ?? 0;
    return {
      column: col,
      missingCount,
      missingPct: rawRows.length > 0 ? Number(((missingCount / rawRows.length) * 100).toFixed(1)) : 0,
    };
  });

  const warnings: string[] = [];
  if (duplicateIdList.length > 0) {
    warnings.push(`Removed ${duplicateIdList.length} duplicate Employee_ID record(s).`);
  }
  if (statusDiscrepancyCount > 0) {
    warnings.push(
      `Detected ${statusDiscrepancyCount} row(s) where Employment_Status and Attrition_Status diverged; Attrition_Status was prioritized.`
    );
  }
  const missingCoreCols = missingStats.filter(
    (m) => m.column !== "Exit_Date" && m.missingCount > 0
  );
  if (missingCoreCols.length > 0) {
    warnings.push(
      `Missing values detected in: ${missingCoreCols
        .map((m) => `${m.column} (${m.missingCount})`)
        .join(", ")}.`
    );
  }

  return {
    records,
    qualityReport: {
      totalRawRows: rawRows.length,
      distinctEmployees: records.length,
      duplicateIdsRemoved: duplicateIdList.length,
      duplicateIdList,
      detectedEmploymentStatuses,
      detectedAttritionStatuses,
      referenceDateISO,
      minHireDate: minHireDateISO,
      maxEventDate: referenceDateISO,
      missingStats,
      warnings,
      datasetName,
    },
  };
}
