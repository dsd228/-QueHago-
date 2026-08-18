import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const dbFile = path.join(process.cwd(), "data", "quehago.db");
if (existsSync(dbFile)) rmSync(dbFile);
for (const suffix of ["-shm", "-wal"]) {
  const file = `${dbFile}${suffix}`;
  if (existsSync(file)) rmSync(file);
}

const { getDb } = await import("../src/lib/db.ts");
const db = getDb();
const count = db.prepare("SELECT COUNT(*) AS count FROM analyses").get() as { count: number };
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;

console.log(JSON.stringify({
  database: dbFile,
  exists: existsSync(dbFile),
  seedCount: Number(count.count),
  tables: tables.map((row) => row.name),
}, null, 2));
