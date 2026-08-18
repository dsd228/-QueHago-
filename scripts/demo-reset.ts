import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = path.join(process.cwd(), "data", "quehago.db");
const db = new DatabaseSync(dbPath, { timeout: 10_000 });
db.exec("PRAGMA foreign_keys = ON;");

const count = db.prepare("SELECT COUNT(*) AS count FROM analyses WHERE is_example = 0").get() as { count: number };

db.exec("BEGIN IMMEDIATE");
try {
  db.prepare("DELETE FROM analyses WHERE is_example = 0").run();
  db.exec("COMMIT");
} catch (error) {
  if (db.isTransaction) db.exec("ROLLBACK");
  throw error;
}

console.log(`¿QuéHago?: eliminados ${count.count} análisis de prueba. Los ejemplos base se conservaron.`);
