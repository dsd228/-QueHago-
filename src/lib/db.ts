import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "quehago.db");

const globalForDb = globalThis as typeof globalThis & {
  __queHagoDb?: DatabaseSync;
  __queHagoDbMigrated?: boolean;
};

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedExamplesIfEmpty(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM analyses").get() as { count: number };
  if (Number(row.count) > 0) return;

  const insert = db.prepare(`
    INSERT INTO analyses (
      id, category, title, summary, raw_text, deadline, amount, currency,
      priority, risk, confidence, status, is_example, created_at,
      facts_json, actions_json, warnings_json, missing_information_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `);

  const examples = [
    {
      base: [
        "ej-factura", "pago", "Factura de internet",
        "Pagá $34.860 antes del 28 de agosto.",
        "Tu factura de Internet vence el 28/08/2026. Total a pagar: $34.860.",
        "2026-08-28T23:59:00-03:00", 34860, "ARS", "media", "bajo", 1, "pendiente", "2026-08-18T10:00:00-03:00"
      ],
      facts: [{ label: "Vencimiento", value: "28/08/2026" }, { label: "Total", value: "$34.860" }],
      actions: [
        { type: "reminder", label: "Recordármelo", reason: "Hay una fecha de vencimiento explícita." },
        { type: "calendar", label: "Agregar al calendario", reason: "Podés guardar el vencimiento como evento." }
      ],
      warnings: [], missing: []
    },
    {
      base: [
        "ej-turno", "turno", "Turno con Dermatología",
        "Agendá tu turno de Dermatología para el 27 de agosto a las 16:30.",
        "Te recordamos tu turno con Dermatología el jueves 27 de agosto a las 16:30.",
        "2026-08-27T16:30:00-03:00", null, null, "media", "ninguno", 1, "pendiente", "2026-08-18T10:05:00-03:00"
      ],
      facts: [{ label: "Especialidad", value: "Dermatología" }, { label: "Fecha y hora", value: "jueves 27 de agosto a las 16:30" }],
      actions: [
        { type: "calendar", label: "Agregar al calendario", reason: "El mensaje contiene fecha y hora." },
        { type: "reminder", label: "Recordármelo", reason: "Podés crear un aviso antes del turno." }
      ],
      warnings: ["El año se normalizó usando la fecha de referencia del proyecto."], missing: []
    },
    {
      base: [
        "ej-seguridad", "seguridad", "Posible mensaje fraudulento",
        "No abras el enlace desde ese mensaje y verificá la situación por un canal oficial que ya conozcas.",
        "Banco Nación: bloqueamos su cuenta. Ingrese inmediatamente a http://bna-validacion-premios.example para verificar sus datos.",
        null, null, null, "alta", "alto", 0.98, "pendiente", "2026-08-18T10:10:00-03:00"
      ],
      facts: [{ label: "Señal", value: "Pedido de acción inmediata" }, { label: "Señal", value: "Enlace externo incluido en el mensaje" }],
      actions: [
        { type: "explain", label: "Ver por qué parece sospechoso", reason: "Hay señales observables de riesgo." },
        { type: "checklist", label: "Crear checklist de seguridad", reason: "Conviene verificar por canales conocidos antes de actuar." }
      ],
      warnings: ["No se puede confirmar fraude sólo con este texto."], missing: []
    },
    {
      base: [
        "ej-tramite", "tramite", "Renovación de licencia",
        "Prepará tu DNI y la licencia actual antes del 12 de septiembre.",
        "Su licencia vence el 12/09/2026. Para renovarla deberá presentar DNI y licencia actual.",
        "2026-09-12T23:59:00-03:00", null, null, "media", "ninguno", 1, "pendiente", "2026-08-18T10:15:00-03:00"
      ],
      facts: [{ label: "Vencimiento", value: "12/09/2026" }, { label: "Documentación", value: "DNI y licencia actual" }],
      actions: [
        { type: "checklist", label: "Crear checklist", reason: "El mensaje enumera documentación requerida." },
        { type: "reminder", label: "Recordármelo", reason: "Hay una fecha de vencimiento explícita." }
      ],
      warnings: [], missing: []
    }
  ];

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of examples) {
      insert.run(
        ...item.base,
        JSON.stringify(item.facts),
        JSON.stringify(item.actions),
        JSON.stringify(item.warnings),
        JSON.stringify(item.missing),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function migrateDatabase(db: DatabaseSync) {
  if (globalForDb.__queHagoDbMigrated) return;

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      raw_text TEXT,
      deadline TEXT,
      amount REAL,
      currency TEXT,
      priority TEXT NOT NULL CHECK (priority IN ('baja','media','alta')),
      risk TEXT NOT NULL CHECK (risk IN ('ninguno','bajo','medio','alto')),
      confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
      status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','resuelto')),
      is_example INTEGER NOT NULL DEFAULT 0 CHECK (is_example IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_at TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','completado')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL,
      label TEXT NOT NULL,
      position INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_status_deadline
      ON analyses(status, deadline);
    CREATE INDEX IF NOT EXISTS idx_reminders_due_at
      ON reminders(due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_analysis_unique
      ON reminders(analysis_id);
    CREATE INDEX IF NOT EXISTS idx_checklist_analysis
      ON checklist_items(analysis_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_analysis_position
      ON checklist_items(analysis_id, position);
  `);

  ensureColumn(db, "analyses", "facts_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "analyses", "actions_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "analyses", "warnings_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "analyses", "missing_information_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "analyses", "calendar_event_id", "TEXT");
  ensureColumn(db, "analyses", "calendar_event_url", "TEXT");
  ensureColumn(db, "analyses", "calendar_synced_at", "TEXT");
  ensureColumn(db, "analyses", "calendar_deleted_at", "TEXT");
  ensureColumn(db, "analyses", "calendar_title", "TEXT");
  ensureColumn(db, "analyses", "calendar_start", "TEXT");
  ensureColumn(db, "analyses", "calendar_end", "TEXT");
  ensureColumn(db, "analyses", "calendar_all_day", "INTEGER");
  ensureColumn(db, "analyses", "source_kind", "TEXT NOT NULL DEFAULT 'text'");
  ensureColumn(db, "analyses", "source_name", "TEXT");
  ensureColumn(db, "analyses", "source_mime", "TEXT");

  seedExamplesIfEmpty(db);
  globalForDb.__queHagoDbMigrated = true;
}

export function getDb(): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });

  if (!globalForDb.__queHagoDb) {
    globalForDb.__queHagoDb = new DatabaseSync(dbPath, { timeout: 10_000 });
  }

  migrateDatabase(globalForDb.__queHagoDb);
  return globalForDb.__queHagoDb;
}
