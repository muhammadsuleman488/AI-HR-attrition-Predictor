import { Upload } from "lucide-react";

interface TopNavHeaderProps {
  onOpenUpload: () => void;
}

export function TopNavHeader({ onOpenUpload }: TopNavHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <a
          href="#overview"
          className="font-display text-lg font-bold tracking-tight text-[#0F2544] whitespace-nowrap shrink-0"
        >
          WorkforceIQ
        </a>

        <nav
          aria-label="Dashboard sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#overview"
            className="hover:text-[#0F2544] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0F2544]"
          >
            Overview
          </a>
          <a
            href="#analytics-charts"
            className="hover:text-[#0F2544] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0F2544]"
          >
            Charts
          </a>
          <a
            href="#attrition-drivers"
            className="hover:text-[#0F2544] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0F2544]"
          >
            Drivers
          </a>
          <a
            href="#employee-clustering"
            className="hover:text-[#0F2544] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0F2544]"
          >
            Clustering
          </a>
          <a
            href="#attrition-predictor"
            className="hover:text-[#0F2544] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0F2544]"
          >
            Predictor
          </a>
          <a
            href="#ai-intelligence"
            className="hover:text-[#0F2544] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#0F2544]"
          >
            AI Insights
          </a>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F2544] hover:bg-[#1A365D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2544]"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload Dataset</span>
          </button>
        </div>
      </div>
    </header>
  );
}
