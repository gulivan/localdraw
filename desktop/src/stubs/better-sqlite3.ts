import { Database as BunDatabase, type SQLQueryBindings } from "bun:sqlite";

type Binding = SQLQueryBindings;

class BunStatement {
  private bindings: Binding[] = [];

  constructor(private readonly statement: ReturnType<BunDatabase["prepare"]>) {}

  get reader() {
    return this.statement.columnNames.length > 0;
  }

  bind(bindings: Binding[]) {
    this.bindings = bindings;
    return this;
  }

  run() {
    return this.statement.run(...this.bindings);
  }

  columns() {
    return this.statement.columnNames.map((name, index) => ({
      name,
      type: this.statement.declaredTypes[index] ?? null,
    }));
  }

  raw() {
    return {
      all: () => this.statement.values(...this.bindings),
    };
  }
}

/**
 * The Prisma adapter uses only this small subset of better-sqlite3. Mapping it
 * to Bun's built-in SQLite keeps desktop builds free of a second native SQLite
 * runtime while the server continues using better-sqlite3 normally.
 */
export default class BunSqliteCompat {
  private readonly database: BunDatabase;

  constructor(filename: string) {
    this.database = new BunDatabase(filename, { safeIntegers: true });
  }

  defaultSafeIntegers() {}

  prepare(sql: string) {
    return new BunStatement(this.database.prepare(sql));
  }

  exec(sql: string) {
    return this.database.exec(sql);
  }

  close() {
    this.database.close();
  }
}
