import type {
  CommonTraitsAnalysis,
  DepartmentStat,
  DriverBucket,
  DriverDimension,
  EmployeeRecord,
  FairnessAuditRow,
  FilterState,
  KpiSummary,
  MonthlyExitPoint,
  ScatterRegressionResult,
  TraitFinding,
} from "../types/hr";

export function getFilterOptions(records: EmployeeRecord[]) {
  const uniqueSorted = (vals: string[]) =>
    Array.from(new Set(vals.filter((v) => v && v !== "Unspecified"))).sort((a, b) =>
      a.localeCompare(b)
    );

  return {
    departments: uniqueSorted(records.map((r) => r.department)),
    jobRoles: uniqueSorted(records.map((r) => r.jobRole)),
    genders: uniqueSorted(records.map((r) => r.gender)),
    employmentTypes: uniqueSorted(records.map((r) => r.employmentType)),
    managers: uniqueSorted(records.map((r) => r.manager)),
    hirePeriods: uniqueSorted(records.map((r) => r.hireYear)).sort((a, b) => b.localeCompare(a)),
    attritionStatuses: uniqueSorted(records.map((r) => r.attritionStatus)),
  };
}

export function applyFilters(records: EmployeeRecord[], filters: FilterState): EmployeeRecord[] {
  return records.filter((r) => {
    if (filters.department !== "All" && r.department !== filters.department) return false;
    if (filters.jobRole !== "All" && r.jobRole !== filters.jobRole) return false;
    if (filters.gender !== "All" && r.gender !== filters.gender) return false;
    if (filters.employmentType !== "All" && r.employmentType !== filters.employmentType) return false;
    if (filters.manager !== "All" && r.manager !== filters.manager) return false;
    if (filters.hirePeriod !== "All" && r.hireYear !== filters.hirePeriod) return false;
    if (filters.attritionStatus !== "All" && r.attritionStatus !== filters.attritionStatus)
      return false;
    return true;
  });
}

function meanOf(nums: Array<number | null>): { avg: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const n of nums) {
    if (n !== null && Number.isFinite(n)) {
      sum += n;
      count += 1;
    }
  }
  return { avg: count > 0 ? sum / count : 0, count };
}

export function computeKpis(records: EmployeeRecord[]): KpiSummary {
  const totalEmployees = records.length;
  const exitedEmployees = records.filter((r) => r.hasLeft).length;
  const activeEmployees = totalEmployees - exitedEmployees;
  const attritionRatePct = totalEmployees > 0 ? (exitedEmployees / totalEmployees) * 100 : 0;

  const sal = meanOf(records.map((r) => r.salaryNGN));
  const perf = meanOf(records.map((r) => r.performanceRating));
  const sat = meanOf(records.map((r) => r.jobSatisfactionScore));
  const train = meanOf(records.map((r) => r.trainingHours));
  const abs = meanOf(records.map((r) => r.absenceDays));

  return {
    totalEmployees,
    activeEmployees,
    exitedEmployees,
    attritionRatePct,
    avgSalaryNGN: sal.avg,
    avgPerformance: perf.avg,
    avgSatisfaction: sat.avg,
    avgTrainingHours: train.avg,
    avgAbsenceDays: abs.avg,
    salaryValidCount: sal.count,
    performanceValidCount: perf.count,
    satisfactionValidCount: sat.count,
    trainingValidCount: train.count,
    absenceValidCount: abs.count,
  };
}

export function computeDepartmentStats(records: EmployeeRecord[]): DepartmentStat[] {
  const map = new Map<
    string,
    { headcount: number; exited: number; salarySum: number; salaryCount: number }
  >();

  for (const r of records) {
    const entry = map.get(r.department) ?? {
      headcount: 0,
      exited: 0,
      salarySum: 0,
      salaryCount: 0,
    };
    entry.headcount += 1;
    if (r.hasLeft) entry.exited += 1;
    if (r.salaryNGN !== null) {
      entry.salarySum += r.salaryNGN;
      entry.salaryCount += 1;
    }
    map.set(r.department, entry);
  }

  return Array.from(map.entries())
    .map(([department, d]) => ({
      department,
      headcount: d.headcount,
      active: d.headcount - d.exited,
      exited: d.exited,
      attritionRatePct: d.headcount > 0 ? (d.exited / d.headcount) * 100 : 0,
      avgSalaryNGN: d.salaryCount > 0 ? d.salarySum / d.salaryCount : 0,
    }))
    .sort((a, b) => b.headcount - a.headcount);
}

export function computeMonthlyAttritionTrend(
  records: EmployeeRecord[],
  attritionFilterActive: boolean
): MonthlyExitPoint[] {
  const exitedWithDates = records.filter((r) => r.hasLeft && r.exitDate && r.exitDateMs !== null);
  if (exitedWithDates.length === 0) return [];

  const monthExitCounts = new Map<string, number>();
  let minExitMs = Number.POSITIVE_INFINITY;
  let maxExitMs = 0;

  for (const r of exitedWithDates) {
    const ym = r.exitDate.slice(0, 7);
    monthExitCounts.set(ym, (monthExitCounts.get(ym) ?? 0) + 1);
    if (r.exitDateMs !== null) {
      if (r.exitDateMs < minExitMs) minExitMs = r.exitDateMs;
      if (r.exitDateMs > maxExitMs) maxExitMs = r.exitDateMs;
    }
  }

  // Generate contiguous monthly timeline from first exit month to last exit month
  const startDt = new Date(minExitMs);
  const endDt = new Date(maxExitMs);
  let year = startDt.getUTCFullYear();
  let month = startDt.getUTCMonth(); // 0-indexed
  const endYear = endDt.getUTCFullYear();
  const endMonth = endDt.getUTCMonth();

  const timeline: MonthlyExitPoint[] = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    const exits = monthExitCounts.get(ym) ?? 0;

    // Only compute cohort active rate if not filtered exclusively to exited/active status
    let cohortActiveCount: number | null = null;
    let monthlyRatePct: number | null = null;
    if (!attritionFilterActive) {
      const monthStartMs = Date.UTC(year, month, 1);
      const monthEndMs = Date.UTC(year, month + 1, 0, 23, 59, 59);
      let activeDuringMonth = 0;
      for (const r of records) {
        if (r.hireDateMs !== null && r.hireDateMs <= monthEndMs) {
          if (!r.hasLeft || r.exitDateMs === null || r.exitDateMs >= monthStartMs) {
            activeDuringMonth += 1;
          }
        }
      }
      if (activeDuringMonth >= 15) {
        cohortActiveCount = activeDuringMonth;
        monthlyRatePct = Number(((exits / activeDuringMonth) * 100).toFixed(2));
      }
    }

    timeline.push({
      month: ym,
      exits,
      cohortActiveCount,
      monthlyRatePct,
    });

    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return timeline;
}

export function computeTrainingPerformanceScatter(
  records: EmployeeRecord[]
): ScatterRegressionResult {
  const valid = records.filter(
    (r) => r.trainingHours !== null && r.performanceRating !== null
  );

  const points = valid.map((r) => ({
    employeeId: r.employeeId,
    department: r.department,
    trainingHours: r.trainingHours as number,
    performanceRating: r.performanceRating as number,
    hasLeft: r.hasLeft,
  }));

  if (points.length < 3) {
    return {
      points,
      slope: 0,
      intercept: 0,
      pearsonR: null,
      interpretation: "Insufficient paired records to calculate a reliable correlation.",
      trendLine: [],
    };
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (const p of points) {
    const x = p.trainingHours;
    const y = p.performanceRating;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const covXY = sumXY - n * meanX * meanY;
  const varX = sumXX - n * meanX * meanX;
  const varY = sumYY - n * meanY * meanY;

  const slope = varX > 0 ? covXY / varX : 0;
  const intercept = meanY - slope * meanX;
  const denom = Math.sqrt(Math.max(0, varX) * Math.max(0, varY));
  const pearsonR = denom > 0 ? covXY / denom : 0;

  const absR = Math.abs(pearsonR);
  let interpretation = "";
  if (absR < 0.1) {
    interpretation = `Negligible linear association (r = ${pearsonR.toFixed(
      3
    )}). Training hours and performance ratings show virtually no linear relationship in these records; correlation does not imply causation.`;
  } else if (absR < 0.3) {
    interpretation = `Weak ${pearsonR > 0 ? "positive" : "negative"} linear association (r = ${pearsonR.toFixed(
      3
    )}). Higher training hours only slightly ${
      pearsonR > 0 ? "co-occur with higher" : "co-occur with lower"
    } ratings; correlation does not imply causation.`;
  } else if (absR < 0.5) {
    interpretation = `Moderate ${pearsonR > 0 ? "positive" : "negative"} linear association (r = ${pearsonR.toFixed(
      3
    )}). Observed relationship is associative only and does not imply causation.`;
  } else {
    interpretation = `Strong ${pearsonR > 0 ? "positive" : "negative"} linear association (r = ${pearsonR.toFixed(
      3
    )}). Observed relationship is associative only and does not imply causation.`;
  }

  return {
    points,
    slope,
    intercept,
    pearsonR,
    interpretation,
    trendLine: [
      { x: minX, y: Number((slope * minX + intercept).toFixed(3)) },
      { x: maxX, y: Number((slope * maxX + intercept).toFixed(3)) },
    ],
  };
}

function makeDimension(
  key: string,
  label: string,
  baselineRatePct: number,
  groups: Array<{ group: string; items: EmployeeRecord[] }>
): DriverDimension {
  const buckets: DriverBucket[] = groups
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const total = g.items.length;
      const exited = g.items.filter((i) => i.hasLeft).length;
      const attritionRatePct = (exited / total) * 100;
      return {
        group: g.group,
        total,
        exited,
        attritionRatePct,
        deltaFromBaselinePct: attritionRatePct - baselineRatePct,
      };
    });

  const rates = buckets.map((b) => b.attritionRatePct);
  const spreadPct = rates.length >= 2 ? Math.max(...rates) - Math.min(...rates) : 0;

  return {
    key,
    label,
    buckets,
    spreadPct,
  };
}

export function computeAttritionDrivers(records: EmployeeRecord[]): DriverDimension[] {
  if (records.length === 0) return [];
  const baseline = (records.filter((r) => r.hasLeft).length / records.length) * 100;

  // 1. Job Satisfaction Score (1..5)
  const satValues = Array.from(
    new Set(records.map((r) => r.jobSatisfactionScore).filter((v): v is number => v !== null))
  ).sort((a, b) => a - b);
  const satDim = makeDimension(
    "satisfaction",
    "Job Satisfaction Score",
    baseline,
    satValues.map((s) => ({
      group: `Score ${s}`,
      items: records.filter((r) => r.jobSatisfactionScore === s),
    }))
  );

  // 2. Absence Days (4 dynamic or domain ranges)
  const absDim = makeDimension("absence", "Absence Days", baseline, [
    { group: "0–4 days", items: records.filter((r) => r.absenceDays !== null && r.absenceDays <= 4) },
    {
      group: "5–8 days",
      items: records.filter((r) => r.absenceDays !== null && r.absenceDays >= 5 && r.absenceDays <= 8),
    },
    {
      group: "9–12 days",
      items: records.filter((r) => r.absenceDays !== null && r.absenceDays >= 9 && r.absenceDays <= 12),
    },
    { group: "13+ days", items: records.filter((r) => r.absenceDays !== null && r.absenceDays >= 13) },
  ]);

  // 3. Overtime
  const otDim = makeDimension("overtime", "Overtime", baseline, [
    { group: "No Overtime", items: records.filter((r) => !r.overtime) },
    { group: "Overtime: Yes", items: records.filter((r) => r.overtime) },
  ]);

  // 4. Performance Rating
  const perfValues = Array.from(
    new Set(records.map((r) => r.performanceRating).filter((v): v is number => v !== null))
  ).sort((a, b) => a - b);
  const perfDim = makeDimension(
    "performance",
    "Performance Rating",
    baseline,
    perfValues.map((p) => ({
      group: `Rating ${p}`,
      items: records.filter((r) => r.performanceRating === p),
    }))
  );

  // 5. Salary Quartiles (NGN)
  const salaries = records
    .map((r) => r.salaryNGN)
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);
  let salGroups: Array<{ group: string; items: EmployeeRecord[] }> = [];
  if (salaries.length >= 4) {
    const q1 = salaries[Math.floor(salaries.length * 0.25)];
    const q2 = salaries[Math.floor(salaries.length * 0.5)];
    const q3 = salaries[Math.floor(salaries.length * 0.75)];
    const fmtK = (n: number) => `₦${Math.round(n / 1000)}k`;
    salGroups = [
      {
        group: `≤ ${fmtK(q1)}`,
        items: records.filter((r) => r.salaryNGN !== null && r.salaryNGN <= q1),
      },
      {
        group: `${fmtK(q1)}–${fmtK(q2)}`,
        items: records.filter((r) => r.salaryNGN !== null && r.salaryNGN > q1 && r.salaryNGN <= q2),
      },
      {
        group: `${fmtK(q2)}–${fmtK(q3)}`,
        items: records.filter((r) => r.salaryNGN !== null && r.salaryNGN > q2 && r.salaryNGN <= q3),
      },
      {
        group: `> ${fmtK(q3)}`,
        items: records.filter((r) => r.salaryNGN !== null && r.salaryNGN > q3),
      },
    ];
  }
  const salDim = makeDimension("salary", "Salary Tier (NGN)", baseline, salGroups);

  // 6. Training Hours
  const trainDim = makeDimension("training", "Training Hours", baseline, [
    { group: "0–15 hrs", items: records.filter((r) => r.trainingHours !== null && r.trainingHours <= 15) },
    {
      group: "16–30 hrs",
      items: records.filter(
        (r) => r.trainingHours !== null && r.trainingHours >= 16 && r.trainingHours <= 30
      ),
    },
    {
      group: "31–45 hrs",
      items: records.filter(
        (r) => r.trainingHours !== null && r.trainingHours >= 31 && r.trainingHours <= 45
      ),
    },
    { group: "46+ hrs", items: records.filter((r) => r.trainingHours !== null && r.trainingHours >= 46) },
  ]);

  // 7. Employment Type
  const empTypes = Array.from(new Set(records.map((r) => r.employmentType))).sort();
  const empTypeDim = makeDimension(
    "employmentType",
    "Employment Type",
    baseline,
    empTypes.map((et) => ({
      group: et,
      items: records.filter((r) => r.employmentType === et),
    }))
  );

  // 8. Department
  const depts = Array.from(new Set(records.map((r) => r.department))).sort();
  const deptDim = makeDimension(
    "department",
    "Department",
    baseline,
    depts.map((d) => ({
      group: d,
      items: records.filter((r) => r.department === d),
    }))
  );

  // 9. Employee Tenure
  const tenureDim = makeDimension("tenure", "Employee Tenure", baseline, [
    { group: "< 1 yr", items: records.filter((r) => r.tenureYears !== null && r.tenureYears < 1) },
    {
      group: "1–3 yrs",
      items: records.filter((r) => r.tenureYears !== null && r.tenureYears >= 1 && r.tenureYears < 3),
    },
    {
      group: "3–5 yrs",
      items: records.filter((r) => r.tenureYears !== null && r.tenureYears >= 3 && r.tenureYears < 5),
    },
    { group: "5+ yrs", items: records.filter((r) => r.tenureYears !== null && r.tenureYears >= 5) },
  ]);

  return [satDim, absDim, otDim, perfDim, salDim, trainDim, empTypeDim, deptDim, tenureDim].filter(
    (d) => d.buckets.length > 0
  );
}

export function computeCommonTraits(
  records: EmployeeRecord[],
  drivers: DriverDimension[]
): CommonTraitsAnalysis {
  const stayed = records.filter((r) => !r.hasLeft);
  const left = records.filter((r) => r.hasLeft);

  const fmtNaira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

  const stayedSal = meanOf(stayed.map((r) => r.salaryNGN)).avg;
  const leftSal = meanOf(left.map((r) => r.salaryNGN)).avg;
  const stayedSat = meanOf(stayed.map((r) => r.jobSatisfactionScore)).avg;
  const leftSat = meanOf(left.map((r) => r.jobSatisfactionScore)).avg;
  const stayedPerf = meanOf(stayed.map((r) => r.performanceRating)).avg;
  const leftPerf = meanOf(left.map((r) => r.performanceRating)).avg;
  const stayedTrain = meanOf(stayed.map((r) => r.trainingHours)).avg;
  const leftTrain = meanOf(left.map((r) => r.trainingHours)).avg;
  const stayedAbs = meanOf(stayed.map((r) => r.absenceDays)).avg;
  const leftAbs = meanOf(left.map((r) => r.absenceDays)).avg;
  const stayedTenure = meanOf(stayed.map((r) => r.tenureYears)).avg;
  const leftTenure = meanOf(left.map((r) => r.tenureYears)).avg;
  const stayedOt = stayed.length > 0 ? (stayed.filter((r) => r.overtime).length / stayed.length) * 100 : 0;
  const leftOt = left.length > 0 ? (left.filter((r) => r.overtime).length / left.length) * 100 : 0;

  const comparisonRows = [
    {
      metric: "Average Tenure",
      stayedValue: `${stayedTenure.toFixed(2)} yrs`,
      leftValue: `${leftTenure.toFixed(2)} yrs`,
      difference: `${(stayedTenure - leftTenure >= 0 ? "+" : "")}${(stayedTenure - leftTenure).toFixed(2)} yrs`,
    },
    {
      metric: "Average Salary",
      stayedValue: fmtNaira(stayedSal),
      leftValue: fmtNaira(leftSal),
      difference: `${stayedSal - leftSal >= 0 ? "+" : "-"}${fmtNaira(Math.abs(stayedSal - leftSal))}`,
    },
    {
      metric: "Job Satisfaction (1–5)",
      stayedValue: stayedSat.toFixed(2),
      leftValue: leftSat.toFixed(2),
      difference: `${stayedSat - leftSat >= 0 ? "+" : ""}${(stayedSat - leftSat).toFixed(2)}`,
    },
    {
      metric: "Performance Rating (1–5)",
      stayedValue: stayedPerf.toFixed(2),
      leftValue: leftPerf.toFixed(2),
      difference: `${stayedPerf - leftPerf >= 0 ? "+" : ""}${(stayedPerf - leftPerf).toFixed(2)}`,
    },
    {
      metric: "Training Hours",
      stayedValue: `${stayedTrain.toFixed(1)} hrs`,
      leftValue: `${leftTrain.toFixed(1)} hrs`,
      difference: `${stayedTrain - leftTrain >= 0 ? "+" : ""}${(stayedTrain - leftTrain).toFixed(1)} hrs`,
    },
    {
      metric: "Absence Days",
      stayedValue: `${stayedAbs.toFixed(1)} days`,
      leftValue: `${leftAbs.toFixed(1)} days`,
      difference: `${stayedAbs - leftAbs >= 0 ? "+" : ""}${(stayedAbs - leftAbs).toFixed(1)} days`,
    },
    {
      metric: "Overtime Prevalence",
      stayedValue: `${stayedOt.toFixed(1)}%`,
      leftValue: `${leftOt.toFixed(1)}%`,
      difference: `${stayedOt - leftOt >= 0 ? "+" : ""}${(stayedOt - leftOt).toFixed(1)} pp`,
    },
  ];

  const stayCandidates: TraitFinding[] = [];
  const leaveCandidates: TraitFinding[] = [];

  for (const dim of drivers) {
    const eligible = dim.buckets.filter((b) => b.total >= 5);
    if (eligible.length === 0) continue;

    // Lowest attrition bucket -> likely to stay
    const lowest = [...eligible].sort((a, b) => a.attritionRatePct - b.attritionRatePct)[0];
    if (lowest && lowest.deltaFromBaselinePct <= -1.5) {
      const shareInStayed =
        stayed.length > 0 ? ((lowest.total - lowest.exited) / stayed.length) * 100 : 0;
      const shareInLeft = left.length > 0 ? (lowest.exited / left.length) * 100 : 0;
      stayCandidates.push({
        label: `${dim.label}: ${lowest.group}`,
        stayedMetric: `${(100 - lowest.attritionRatePct).toFixed(1)}% retention (n=${lowest.total})`,
        leftMetric: `${lowest.attritionRatePct.toFixed(1)}% attrition (${Math.abs(
          lowest.deltaFromBaselinePct
        ).toFixed(1)} pp below avg)`,
        comparisonNote: `Accounts for ${shareInStayed.toFixed(1)}% of retained staff vs ${shareInLeft.toFixed(
          1
        )}% of exits.`,
        magnitude: Math.abs(lowest.deltaFromBaselinePct),
      });
    }

    // Highest attrition bucket -> likely to leave
    const highest = [...eligible].sort((a, b) => b.attritionRatePct - a.attritionRatePct)[0];
    if (highest && highest.deltaFromBaselinePct >= 1.5) {
      const shareInStayed =
        stayed.length > 0 ? ((highest.total - highest.exited) / stayed.length) * 100 : 0;
      const shareInLeft = left.length > 0 ? (highest.exited / left.length) * 100 : 0;
      leaveCandidates.push({
        label: `${dim.label}: ${highest.group}`,
        stayedMetric: `${(100 - highest.attritionRatePct).toFixed(1)}% retention`,
        leftMetric: `${highest.attritionRatePct.toFixed(1)}% attrition (+${highest.deltaFromBaselinePct.toFixed(
          1
        )} pp above avg, n=${highest.total})`,
        comparisonNote: `Represents ${shareInLeft.toFixed(1)}% of all exits vs ${shareInStayed.toFixed(
          1
        )}% of retained employees.`,
        magnitude: Math.abs(highest.deltaFromBaselinePct),
      });
    }
  }

  // Also add significant continuous mean differences if observed
  if (Math.abs(stayedTenure - leftTenure) >= 0.3 && stayed.length > 0 && left.length > 0) {
    const target = stayedTenure > leftTenure ? stayCandidates : leaveCandidates;
    const other = stayedTenure > leftTenure ? leaveCandidates : stayCandidates;
    target.push({
      label: `Longer Tenure Profile (${stayedTenure.toFixed(1)} yrs avg)`,
      stayedMetric: `${stayedTenure.toFixed(2)} yrs mean tenure`,
      leftMetric: `${leftTenure.toFixed(2)} yrs mean tenure`,
      comparisonNote: `Retained employees average ${Math.abs(stayedTenure - leftTenure).toFixed(
        2
      )} years more tenure than exited staff.`,
      magnitude: Math.abs(stayedTenure - leftTenure) * 4,
    });
    other.push({
      label: `Shorter Tenure Profile (${leftTenure.toFixed(1)} yrs avg)`,
      stayedMetric: `${stayedTenure.toFixed(2)} yrs mean tenure`,
      leftMetric: `${leftTenure.toFixed(2)} yrs mean tenure`,
      comparisonNote: `Exited employees averaged ${leftTenure.toFixed(2)} yrs vs ${stayedTenure.toFixed(
        2
      )} yrs for active staff.`,
      magnitude: Math.abs(stayedTenure - leftTenure) * 4,
    });
  }

  return {
    stayedCount: stayed.length,
    leftCount: left.length,
    likelyToStayTraits: stayCandidates.sort((a, b) => b.magnitude - a.magnitude).slice(0, 5),
    likelyToLeaveTraits: leaveCandidates.sort((a, b) => b.magnitude - a.magnitude).slice(0, 5),
    comparisonRows,
  };
}

export function computeFairnessAudit(records: EmployeeRecord[]): FairnessAuditRow[] {
  const rows: FairnessAuditRow[] = [];

  const genders = Array.from(new Set(records.map((r) => r.gender))).sort();
  for (const g of genders) {
    const subset = records.filter((r) => r.gender === g);
    const exited = subset.filter((r) => r.hasLeft).length;
    rows.push({
      groupType: "Gender",
      segment: g,
      count: subset.length,
      exited,
      attritionRatePct: subset.length > 0 ? (exited / subset.length) * 100 : 0,
    });
  }

  const ageBrackets = [
    { label: "Under 25", fn: (a: number) => a < 25 },
    { label: "25–34", fn: (a: number) => a >= 25 && a <= 34 },
    { label: "35–44", fn: (a: number) => a >= 35 && a <= 44 },
    { label: "45+", fn: (a: number) => a >= 45 },
  ];

  for (const b of ageBrackets) {
    const subset = records.filter((r) => r.age !== null && b.fn(r.age));
    if (subset.length === 0) continue;
    const exited = subset.filter((r) => r.hasLeft).length;
    rows.push({
      groupType: "Age Group",
      segment: b.label,
      count: subset.length,
      exited,
      attritionRatePct: (exited / subset.length) * 100,
    });
  }

  return rows;
}
