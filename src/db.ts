import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export async function initDB(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reminders (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      phone     TEXT NOT NULL,
      task      TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      sent      INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("✅ DB initialized");
}

// Normalize ISO 8601 string to SQLite-compatible UTC format: "YYYY-MM-DD HH:MM:SS"
function toSQLiteUTC(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

export async function addReminder(
  phone: string,
  task: string,
  remindAt: string
): Promise<number> {
  const normalizedAt = toSQLiteUTC(remindAt);
  console.log(`📅 Storing remind_at as: ${normalizedAt}`);
  const result = await db.execute({
    sql: `INSERT INTO reminders (phone, task, remind_at) VALUES (?, ?, ?)`,
    args: [phone, task, normalizedAt],
  });
  return Number(result.lastInsertRowid);
}

export async function listReminders(phone: string) {
  const result = await db.execute({
    sql: `SELECT * FROM reminders WHERE phone = ? AND sent = 0 ORDER BY remind_at ASC`,
    args: [phone],
  });
  return result.rows;
}

export async function deleteReminder(
  phone: string,
  index: number
): Promise<boolean> {
  const reminders = await listReminders(phone);
  if (index < 1 || index > reminders.length) return false;
  const row = reminders[index - 1];
  await db.execute({
    sql: `DELETE FROM reminders WHERE id = ?`,
    args: [row.id],
  });
  return true;
}

export async function getDueReminders() {
  // datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC
  // remind_at is now stored in the same format, so comparison works correctly
  const result = await db.execute({
    sql: `SELECT * FROM reminders WHERE sent = 0 AND remind_at <= datetime('now')`,
    args: [],
  });
  return result.rows;
}

export async function markSent(id: number): Promise<void> {
  await db.execute({
    sql: `UPDATE reminders SET sent = 1 WHERE id = ?`,
    args: [id],
  });
}