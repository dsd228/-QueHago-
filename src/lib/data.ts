import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { AnalysisResult } from "./ai/schema";
import type { AnalysisRecord, ChecklistItemRecord, ReminderRecord } from "./types";
import { buildChecklistLabels } from "./checklist";
import { getEffectivePriority } from "./priority";

type AnalysisRow = {
  id: string;
  category: AnalysisRecord["category"];
  title: string;
  summary: string;
  raw_text: string | null;
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  priority: AnalysisRecord["priority"];
  risk: AnalysisRecord["risk"];
  confidence: number;
  status: AnalysisRecord["status"];
  is_example: number;
  created_at: string;
  facts_json: string;
  actions_json: string;
  warnings_json: string;
  missing_information_json: string;
  calendar_event_id: string | null;
  calendar_event_url: string | null;
  calendar_synced_at: string | null;
  calendar_deleted_at: string | null;
  calendar_title: string | null;
  calendar_start: string | null;
  calendar_end: string | null;
  calendar_all_day: number | null;
  source_kind: "text" | "image" | "example";
  source_name: string | null;
  source_mime: string | null;
};

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapAnalysis(row: AnalysisRow): AnalysisRecord {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    summary: row.summary,
    rawText: row.raw_text,
    deadline: row.deadline,
    amount: row.amount,
    currency: row.currency,
    priority: getEffectivePriority({
      category: row.category,
      risk: row.risk,
      deadline: row.deadline,
      suggested: row.priority,
    }),
    risk: row.risk,
    confidence: row.confidence,
    status: row.status,
    isExample: row.is_example === 1,
    createdAt: row.created_at,
    facts: safeJson(row.facts_json, []),
    actions: safeJson(row.actions_json, []),
    warnings: safeJson(row.warnings_json, []),
    missingInformation: safeJson(row.missing_information_json, []),
    calendarEventId: row.calendar_event_id,
    calendarEventUrl: row.calendar_event_url,
    calendarSyncedAt: row.calendar_synced_at,
    calendarDeletedAt: row.calendar_deleted_at,
    calendarTitle: row.calendar_title,
    calendarStart: row.calendar_start,
    calendarEnd: row.calendar_end,
    calendarAllDay: row.calendar_all_day === null ? null : row.calendar_all_day === 1,
    sourceKind: row.is_example === 1 ? "example" : row.source_kind,
    sourceName: row.source_name,
    sourceMime: row.source_mime,
  };
}

export function listRecentAnalyses(limit = 4): AnalysisRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM analyses ORDER BY created_at DESC LIMIT ?")
    .all(limit) as AnalysisRow[];
  return rows.map(mapAnalysis);
}

export function listExampleAnalyses(limit = 4): AnalysisRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM analyses WHERE is_example = 1 ORDER BY created_at DESC LIMIT ?")
    .all(limit) as AnalysisRow[];
  return rows.map(mapAnalysis);
}

export function getAnalysisById(id: string): AnalysisRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as AnalysisRow | undefined;
  return row ? mapAnalysis(row) : null;
}

export function createAnalysis(
  rawText: string | null,
  result: AnalysisResult,
  source: { kind: "text" | "image"; name?: string; mime?: string } = { kind: "text" },
): string {
  const db = getDb();
  const id = randomBytes(5).toString("base64url");
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO analyses (
      id, category, title, summary, raw_text, deadline, amount, currency,
      priority, risk, confidence, status, is_example, created_at,
      facts_json, actions_json, warnings_json, missing_information_json,
      source_kind, source_name, source_mime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    result.category,
    result.title.trim(),
    result.summary.trim(),
    rawText,
    result.deadline,
    result.amount,
    result.currency,
    result.priority,
    result.risk,
    result.confidence,
    createdAt,
    JSON.stringify(result.facts),
    JSON.stringify(result.actions),
    JSON.stringify(result.warnings),
    JSON.stringify(result.missing_information),
    source.kind,
    source.name ?? null,
    source.mime ?? null,
  );

  return id;
}


export function saveCalendarSync(
  analysisId: string,
  eventId: string,
  eventUrl: string,
  payload: { title: string; start: string; end: string; all_day: boolean },
): void {
  const db = getDb();
  db.prepare(`
    UPDATE analyses
    SET calendar_event_id = ?,
        calendar_event_url = ?,
        calendar_synced_at = ?,
        calendar_deleted_at = NULL,
        calendar_title = ?,
        calendar_start = ?,
        calendar_end = ?,
        calendar_all_day = ?
    WHERE id = ?
  `).run(
    eventId,
    eventUrl,
    new Date().toISOString(),
    payload.title,
    payload.start,
    payload.end,
    payload.all_day ? 1 : 0,
    analysisId,
  );
}

export function markCalendarUndone(analysisId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE analyses
    SET calendar_deleted_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), analysisId);
}


type ReminderRow = {
  id: string;
  analysis_id: string;
  title: string;
  due_at: string;
  note: string | null;
  status: ReminderRecord["status"];
  created_at: string;
};

function mapReminder(row: ReminderRow): ReminderRecord {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    title: row.title,
    dueAt: row.due_at,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function getReminderByAnalysisId(analysisId: string): ReminderRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reminders WHERE analysis_id = ? LIMIT 1").get(analysisId) as ReminderRow | undefined;
  return row ? mapReminder(row) : null;
}

export function createReminderForAnalysis(item: AnalysisRecord): ReminderRecord {
  if (!item.deadline) throw new Error("REMINDER_DATE_MISSING");

  const existing = getReminderByAnalysisId(item.id);
  if (existing) return existing;

  const db = getDb();
  const id = randomBytes(5).toString("base64url");
  const createdAt = new Date().toISOString();
  const title = item.category === "pago" ? `Pagar: ${item.title}` : item.title;
  const noteParts = ["Creado por ¿QuéHago? después de tu confirmación."];
  if (item.amount !== null) {
    const amount = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: item.currency ?? "ARS",
    }).format(item.amount);
    noteParts.push(`Importe: ${amount}`);
  }

  db.prepare(`
    INSERT INTO reminders (id, analysis_id, title, due_at, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pendiente', ?)
  `).run(id, item.id, title, item.deadline, noteParts.join("\n"), createdAt);

  return {
    id,
    analysisId: item.id,
    title,
    dueAt: item.deadline,
    note: noteParts.join("\n"),
    status: "pendiente",
    createdAt,
  };
}

export function listPendingAnalyses(): AnalysisRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM analyses WHERE status = 'pendiente' ORDER BY created_at DESC")
    .all() as AnalysisRow[];
  return rows.map(mapAnalysis);
}

export function listResolvedAnalyses(limit = 6): AnalysisRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM analyses WHERE status = 'resuelto' AND is_example = 0 ORDER BY created_at DESC LIMIT ?")
    .all(limit) as AnalysisRow[];
  return rows.map(mapAnalysis);
}

export function markAnalysisResolved(analysisId: string): void {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE analyses SET status = 'resuelto' WHERE id = ?").run(analysisId);
    db.prepare("UPDATE reminders SET status = 'completado' WHERE analysis_id = ?").run(analysisId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}


type ChecklistRow = {
  id: string;
  analysis_id: string;
  label: string;
  position: number;
  completed: number;
  created_at: string;
};

function mapChecklistItem(row: ChecklistRow): ChecklistItemRecord {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    label: row.label,
    position: row.position,
    completed: row.completed === 1,
    createdAt: row.created_at,
  };
}

export function getChecklistByAnalysisId(analysisId: string): ChecklistItemRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM checklist_items WHERE analysis_id = ? ORDER BY position ASC")
    .all(analysisId) as ChecklistRow[];
  return rows.map(mapChecklistItem);
}

export function createChecklistForAnalysis(item: AnalysisRecord): ChecklistItemRecord[] {
  const existing = getChecklistByAnalysisId(item.id);
  if (existing.length) return existing;

  const labels = buildChecklistLabels(item);
  if (!labels.length) return [];

  const db = getDb();
  const createdAt = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO checklist_items (id, analysis_id, label, position, completed, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    labels.forEach((label, index) => {
      insert.run(
        randomBytes(5).toString("base64url"),
        item.id,
        label,
        index,
        createdAt,
      );
    });
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }

  return getChecklistByAnalysisId(item.id);
}

export function toggleChecklistItem(analysisId: string, checklistItemId: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE checklist_items
    SET completed = CASE completed WHEN 1 THEN 0 ELSE 1 END
    WHERE id = ? AND analysis_id = ?
  `).run(checklistItemId, analysisId);
}
