import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function sqliteStore(filename) {
  const conn = new DatabaseSync(filename);
  conn.exec("PRAGMA busy_timeout=4000; PRAGMA journal_mode=WAL;");
  conn.exec(readFileSync(new URL("../drizzle/0000_rooms.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      const stmt = conn.prepare(sql);
      return { bind(...args) { return {
        run: () => ({ meta: stmt.run(...args) }),
        first: () => stmt.get(...args),
        all: () => ({ results: stmt.all(...args) })
      }; } };
    },
    close: () => conn.close()
  };
}
