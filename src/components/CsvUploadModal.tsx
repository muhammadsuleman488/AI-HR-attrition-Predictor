import { useRef, useState } from "react";
import { FileSpreadsheet, RotateCcw, Upload, X } from "lucide-react";

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadCsv: (csvText: string, fileName: string) => void;
  onRestoreDefault: () => void;
  uploadError: string | null;
}

export function CsvUploadModal({
  isOpen,
  onClose,
  onUploadCsv,
  onRestoreDefault,
  uploadError,
}: CsvUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pastedCsv, setPastedCsv] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setLocalError(null);
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setLocalError("Please upload a .csv file exported from Google Sheets or Excel.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      onUploadCsv(text, file.name);
    };
    reader.onerror = () => {
      setLocalError("Failed to read the selected file.");
    };
    reader.readAsText(file);
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!pastedCsv.trim()) {
      setLocalError("Paste CSV text before importing.");
      return;
    }
    onUploadCsv(pastedCsv, "Pasted Google Sheets CSV");
  };

  const displayError = localError || uploadError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="upload-modal-title" className="font-display text-lg font-bold text-[#0F2544]">
              Upload HR Dataset (Google Sheets CSV)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              In Google Sheets: File → Download → Comma Separated Values (.csv). Uploading recalculates all KPIs, charts, K-Means clusters, and predictive models.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upload dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? "border-[#0F2544] bg-slate-50"
                : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <FileSpreadsheet className="w-8 h-8 text-[#0F2544] mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#0F2544]">
              Drop your Google Sheets CSV export here, or click to browse
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Required: Employee_ID · Supported: Age, Gender, Department, Job_Role, Employment_Type, Hire_Date, Salary_NGN, Performance_Rating, Training_Hours, Absence_Days, Job_Satisfaction_Score, Overtime, Manager, Employment_Status, Exit_Date, Attrition_Status
            </p>
          </div>

          <form onSubmit={handlePasteSubmit} className="space-y-2">
            <label htmlFor="paste-csv" className="block text-xs font-semibold text-slate-700">
              Or paste raw CSV rows directly
            </label>
            <textarea
              id="paste-csv"
              rows={4}
              value={pastedCsv}
              onChange={(e) => setPastedCsv(e.target.value)}
              placeholder="Employee_ID,Age,Gender,Department,..."
              className="w-full font-mono text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-[#0F2544]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={onRestoreDefault}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restore Uploaded 500-Row Dataset</span>
              </button>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F2544] hover:bg-[#1A365D] rounded-lg transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Import Pasted CSV</span>
              </button>
            </div>
          </form>

          {displayError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {displayError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
