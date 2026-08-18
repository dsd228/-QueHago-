import type { AnalysisAction, AnalysisFact } from "@/lib/ai/schema";

export type AnalysisCategory =
  | "pago"
  | "turno"
  | "tramite"
  | "mensaje"
  | "documento"
  | "seguridad"
  | "otro";

export type Priority = "baja" | "media" | "alta";
export type Risk = "ninguno" | "bajo" | "medio" | "alto";
export type AnalysisStatus = "pendiente" | "resuelto";
export type AnalysisSourceKind = "text" | "image" | "example";

export interface AnalysisRecord {
  id: string;
  category: AnalysisCategory;
  title: string;
  summary: string;
  rawText: string | null;
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  priority: Priority;
  risk: Risk;
  confidence: number;
  status: AnalysisStatus;
  isExample: boolean;
  createdAt: string;
  facts: AnalysisFact[];
  actions: AnalysisAction[];
  warnings: string[];
  missingInformation: string[];
  calendarEventId: string | null;
  calendarEventUrl: string | null;
  calendarSyncedAt: string | null;
  calendarDeletedAt: string | null;
  calendarTitle: string | null;
  calendarStart: string | null;
  calendarEnd: string | null;
  calendarAllDay: boolean | null;
  sourceKind: AnalysisSourceKind;
  sourceName: string | null;
  sourceMime: string | null;
}

export interface ReminderRecord {
  id: string;
  analysisId: string;
  title: string;
  dueAt: string;
  note: string | null;
  status: "pendiente" | "completado";
  createdAt: string;
}


export interface ChecklistItemRecord {
  id: string;
  analysisId: string;
  label: string;
  position: number;
  completed: boolean;
  createdAt: string;
}
