import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { AnalysisRecord } from "./types";
import { verifySourceTrust, type TrustedSourceId } from "./trusted-sources";

export type GuideSessionStatus = "active" | "completed" | "cancelled";

export type GuideSession = {
  token: string;
  analysisId: string;
  sourceId: TrustedSourceId;
  sourceName: string;
  officialUrl: string;
  trustedDomains: string[];
  goal: string;
  status: GuideSessionStatus;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
};

type GuideSessionRow = {
  token: string;
  analysis_id: string;
  source_id: TrustedSourceId;
  source_name: string;
  official_url: string;
  trusted_domains_json: string;
  goal: string;
  status: GuideSessionStatus;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
};

function ensureGuideSessionsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS guide_sessions (
      token TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      official_url TEXT NOT NULL,
      trusted_domains_json TEXT NOT NULL DEFAULT '[]',
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_guide_sessions_analysis
      ON guide_sessions(analysis_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_guide_sessions_status_expiry
      ON guide_sessions(status, expires_at);
  `);
  return db;
}

function trustText(item: AnalysisRecord): string {
  return [
    item.rawText ?? "",
    item.title,
    item.summary,
    ...item.facts.map((fact) => `${fact.label} ${fact.value}`),
    ...item.warnings,
  ].join(" ");
}

function safeDomains(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function mapRow(row: GuideSessionRow): GuideSession {
  return {
    token: row.token,
    analysisId: row.analysis_id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    officialUrl: row.official_url,
    trustedDomains: safeDomains(row.trusted_domains_json),
    goal: row.goal,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  };
}

export function getGuideSource(item: AnalysisRecord) {
  const trust = verifySourceTrust(trustText(item));
  return trust.source;
}

export function createGuideSession(item: AnalysisRecord): GuideSession {
  const source = getGuideSource(item);
  if (!source) throw new Error("GUIDE_SOURCE_UNKNOWN");

  const db = ensureGuideSessionsTable();
  const token = randomBytes(18).toString("base64url");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
  const goal = item.summary.trim() || `Resolver este caso en ${source.name}.`;

  db.prepare(`
    INSERT INTO guide_sessions (
      token, analysis_id, source_id, source_name, official_url,
      trusted_domains_json, goal, status, created_at, expires_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)
  `).run(
    token,
    item.id,
    source.id,
    source.name,
    source.officialUrl,
    JSON.stringify(source.trustedDomains),
    goal.slice(0, 500),
    createdAt.toISOString(),
    expiresAt.toISOString(),
  );

  return {
    token,
    analysisId: item.id,
    sourceId: source.id,
    sourceName: source.name,
    officialUrl: source.officialUrl,
    trustedDomains: [...source.trustedDomains],
    goal: goal.slice(0, 500),
    status: "active",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    completedAt: null,
  };
}

export function getGuideSession(token: string): GuideSession | null {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const db = ensureGuideSessionsTable();
  const row = db.prepare("SELECT * FROM guide_sessions WHERE token = ? LIMIT 1").get(token) as GuideSessionRow | undefined;
  if (!row) return null;

  const session = mapRow(row);
  if (session.status !== "active") return session;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return session;
}

export function completeGuideSession(token: string): void {
  const db = ensureGuideSessionsTable();
  db.prepare(`
    UPDATE guide_sessions
    SET status = 'completed', completed_at = ?
    WHERE token = ? AND status = 'active'
  `).run(new Date().toISOString(), token);
}
