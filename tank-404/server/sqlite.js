import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function localDatabase(filename) {
  const connection = new DatabaseSync(filename);
  connection.exec("PRAGMA busy_timeout=4000; PRAGMA journal_mode=WAL;");
  connection.exec(readFileSync(new URL("../drizzle/0000_case_files.sql", import.meta.url), "utf8"));
  return {
    prepare(sql) {
      const statement = connection.prepare(sql);
      return { bind(...args) {
        return {
          first: () => statement.get(...args),
          run: () => ({ meta: statement.run(...args) })
        };
      } };
    },
    close: () => connection.close()
  };
}
