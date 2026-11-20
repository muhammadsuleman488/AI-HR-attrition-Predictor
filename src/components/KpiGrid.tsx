import {
  Activity,
  Award,
  Banknote,
  BookOpen,
  CalendarX2,
  HeartHandshake,
  UserCheck,
  Users,
} from "lucide-react";
import type { KpiSummary } from "../types/hr";

interface KpiGridProps {
  kpis: KpiSummary;
}

export function KpiGrid({ kpis }: KpiGridProps) {
  const activePct =
    kpis.totalEmployees > 0 ? ((kpis.activeEmployees / kpis.totalEmployees) * 100).toFixed(1) : "0.0";

  const cards = [
    {
      label: "Total Employees",
      value: kpis.totalEmployees.toLocaleString(),
      subtext: "Distinct Employee_ID records",
      icon: Users,
      tone: "navy" as const,
    },
    {
      label: "Active Employees",
      value: kpis.activeEmployees.toLocaleString(),
      subtext: `${activePct}% currently retained in scope`,
      icon: UserCheck,
      tone: "teal" as const,
    },
    {
      label: "Historical Attrition Rate",
      value: `${kpis.attritionRatePct.toFixed(1)}%`,
      subtext: `${kpis.exitedEmployees.toLocaleString()} exited (dataset-level rate)`,
      icon: Activity,
      tone:
        kpis.attritionRatePct >= 25
          ? ("danger" as const)
          : kpis.attritionRatePct >= 15
          ? ("amber" as const)
          : ("teal" as const),
    },
    {
      label: "Average Salary",
      value: `₦${Math.round(kpis.avgSalaryNGN).toLocaleString("en-NG")}`,
      subtext: `Recorded NGN (n=${kpis.salaryValidCount.toLocaleString()})`,
      icon: Banknote,
      tone: "navy" as const,
    },
    {
      label: "Avg Performance Rating",
      value: `${kpis.avgPerformance.toFixed(2)}`,
      subtext: `Out of 5.00 scale (n=${kpis.performanceValidCount.toLocaleString()})`,
      icon: Award,
      tone: kpis.avgPerformance >= 3.5 ? ("teal" as const) : ("navy" as const),
    },
    {
      label: "Avg Job Satisfaction",
      value: `${kpis.avgSatisfaction.toFixed(2)}`,
      subtext: `Out of 5.00 scale (n=${kpis.satisfactionValidCount.toLocaleString()})`,
      icon: HeartHandshake,
      tone:
        kpis.avgSatisfaction >= 3.3
          ? ("teal" as const)
          : kpis.avgSatisfaction >= 2.7
          ? ("amber" as const)
          : ("danger" as const),
    },
    {
      label: "Avg Training Hours",
      value: `${kpis.avgTrainingHours.toFixed(1)} hrs`,
      subtext: `Recorded per employee (n=${kpis.trainingValidCount.toLocaleString()})`,
      icon: BookOpen,
      tone: "navy" as const,
    },
    {
      label: "Avg Absence Days",
      value: `${kpis.avgAbsenceDays.toFixed(1)} days`,
      subtext: `Recorded per employee (n=${kpis.absenceValidCount.toLocaleString()})`,
      icon: CalendarX2,
      tone:
        kpis.avgAbsenceDays >= 10
          ? ("danger" as const)
          : kpis.avgAbsenceDays >= 7.5
          ? ("amber" as const)
          : ("teal" as const),
    },
  ];

  const toneStyles = {
    navy: {
      iconBg: "bg-[#0F2544]/8 text-[#0F2544]",
      valueColor: "text-[#0F2544]",
    },
    teal: {
      iconBg: "bg-teal-50 text-teal-700",
      valueColor: "text-teal-700",
    },
    amber: {
      iconBg: "bg-amber-50 text-amber-700",
      valueColor: "text-amber-700",
    },
    danger: {
      iconBg: "bg-rose-50 text-rose-700",
      valueColor: "text-rose-700",
    },
  };

  return (
    <section aria-label="Executive Key Performance Indicators" className="mb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const style = toneStyles[card.tone];
          return (
            <div
              key={card.label}
              className="bg-white border border-slate-200 rounded-xl p-5 transition-colors hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <p
                    className={`mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums ${style.valueColor}`}
                  >
                    {card.value}
                  </p>
                </div>
                <div className={`p-2.5 rounded-lg shrink-0 ${style.iconBg}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 tabular-nums">{card.subtext}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
