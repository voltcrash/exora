import postgres from "postgres";

export interface DatabaseClient {
  close(): Promise<void>;
  query<T extends Record<string, unknown>>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<T[]>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

type SqlClient = ReturnType<typeof postgres>;

interface DatabaseClientOptions {
  maxConnections?: number;
}

class PostgresDatabaseClient implements DatabaseClient {
  readonly #ownsConnection: boolean;
  readonly #sql: SqlClient;

  constructor(sql: SqlClient, ownsConnection = true) {
    this.#sql = sql;
    this.#ownsConnection = ownsConnection;
  }

  async query<T extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<T[]> {
    const rows = await this.#sql.unsafe(statement, [...parameters] as never[]);
    return rows as unknown as T[];
  }

  async transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const result = await this.#sql.begin((transaction) =>
      callback(new PostgresDatabaseClient(transaction as unknown as SqlClient, false)),
    );
    return result as unknown as T;
  }

  async close(): Promise<void> {
    if (this.#ownsConnection) await this.#sql.end({ timeout: 5 });
  }
}

/**
 * Notices raised by the `IF NOT EXISTS` guards the migrations are built on.
 *
 * Every one of them says the object was already there, which is the outcome those guards exist to
 * produce — reporting it is noise, and the driver's default is to dump the whole notice object,
 * which reads like a failure on an otherwise successful run.
 */
const ALREADY_EXISTS_NOTICES = new Set([
  "42P06", // duplicate schema
  "42P07", // duplicate table, index, or relation
  "42710", // duplicate object, e.g. an extension
  "42701", // duplicate column
]);

export const createDatabaseClient = (
  connectionString: string,
  { maxConnections = 10 }: DatabaseClientOptions = {},
): DatabaseClient =>
  new PostgresDatabaseClient(
    postgres(connectionString, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: maxConnections,
      onnotice: (notice) => {
        if (ALREADY_EXISTS_NOTICES.has(notice.code ?? "")) return;
        // Anything else is worth seeing, but as a line rather than a dumped object.
        console.warn(`[postgres] ${notice.severity ?? "NOTICE"}: ${notice.message ?? ""}`);
      },
    }),
  );
