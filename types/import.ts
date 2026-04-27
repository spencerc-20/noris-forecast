// types/import.ts — Import batch tracking types for forecast_v1/imports/{importBatchId}

export interface ImportBatch {
  id: string; // Firebase key
  importedAt: number; // Unix timestamp ms
  importedBy: string; // userId (admin only)
  filename: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  errors: ImportError[];
  columnMapping: Record<string, string>; // CSV column → field mapping used during this import
}

export interface ImportRow {
  rowIndex: number; // 0-based row number in CSV (excluding header)
  customerName: string;
  state: string;
  annualRevenue: Record<number, number>; // year → $ value parsed from revenue_YYYY columns
  practiceName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  currentSystems?: string;
  norisImplantUse?: string;
  primaryPainPoint?: string;
}

export interface ImportError {
  rowIndex: number;
  field: string | null; // null = row-level error
  message: string;
  rawValue?: string;
}
