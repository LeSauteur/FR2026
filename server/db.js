import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');
export const DEFAULT_DB_PATH = join(ROOT, 'data', 'hub.sqlite');

export function openDb(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  // Встроенный lower() в SQLite понимает только латиницу: «Стипендия» ≠ «стипендия».
  db.function('ru_lower', { deterministic: true }, (value) => (value === null ? null : String(value).toLowerCase()));
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
