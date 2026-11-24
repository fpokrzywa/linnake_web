import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function localDb(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) {
    if (!sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) {
      sqlite.exec('BEGIN');
      try { sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8')); sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(name); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  }
  const DB = { prepare(query) { return { bind(...args) { return {
    async first() { return sqlite.prepare(query).get(...args) ?? null; },
    async run() { const result = sqlite.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; }
  }; } }; } };
  return { DB, sqlite };
}
