import type { AnalysisCategory, Priority, Risk } from "@/lib/types";

export type AnalysisActionType =
  | "reminder"
  | "calendar"
  | "checklist"
  | "draft"
  | "explain"
  | "none";

export interface AnalysisFact {
  label: string;
  value: string;
}

export interface AnalysisAction {
  type: AnalysisActionType;
  label: string;
  reason: string;
}

export interface AnalysisResult {
  category: AnalysisCategory;
  title: string;
  summary: string;
  facts: AnalysisFact[];
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  priority: Priority;
  risk: Risk;
  confidence: number;
  actions: AnalysisAction[];
  warnings: string[];
  missing_information: string[];
}

export const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["pago", "turno", "tramite", "mensaje", "documento", "seguridad", "otro"],
    },
    title: { type: "string" },
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["label", "value"],
      },
    },
    deadline: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    priority: { type: "string", enum: ["baja", "media", "alta"] },
    risk: { type: "string", enum: ["ninguno", "bajo", "medio", "alto"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["reminder", "calendar", "checklist", "draft", "explain", "none"],
          },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["type", "label", "reason"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
  },
  required: [
    "category",
    "title",
    "summary",
    "facts",
    "deadline",
    "amount",
    "currency",
    "priority",
    "risk",
    "confidence",
    "actions",
    "warnings",
    "missing_information",
  ],
} as const;

const categories = new Set(["pago", "turno", "tramite", "mensaje", "documento", "seguridad", "otro"]);
const priorities = new Set(["baja", "media", "alta"]);
const risks = new Set(["ninguno", "bajo", "medio", "alto"]);
const actionTypes = new Set(["reminder", "calendar", "checklist", "draft", "explain", "none"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateAnalysis(value: unknown): AnalysisResult | null {
  if (!isRecord(value)) return null;

  if (typeof value.category !== "string" || !categories.has(value.category)) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.summary !== "string" || !value.summary.trim()) return null;
  if (typeof value.priority !== "string" || !priorities.has(value.priority)) return null;
  if (typeof value.risk !== "string" || !risks.has(value.risk)) return null;
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) return null;

  if (value.deadline !== null && typeof value.deadline !== "string") return null;
  if (value.amount !== null && typeof value.amount !== "number") return null;
  if (value.currency !== null && typeof value.currency !== "string") return null;

  if (!Array.isArray(value.facts) || !value.facts.every((fact) =>
    isRecord(fact) && typeof fact.label === "string" && typeof fact.value === "string"
  )) return null;

  if (!Array.isArray(value.actions) || !value.actions.every((action) =>
    isRecord(action) &&
    typeof action.type === "string" && actionTypes.has(action.type) &&
    typeof action.label === "string" &&
    typeof action.reason === "string"
  )) return null;

  if (!isStringArray(value.warnings) || !isStringArray(value.missing_information)) return null;

  return value as unknown as AnalysisResult;
}
