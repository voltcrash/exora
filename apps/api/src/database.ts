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

export const createDatabaseClient = (connectionString: string): DatabaseClient =>
  new PostgresDatabaseClient(
    postgres(connectionString, {
      connect_timeout: 10,
      idle_timeout: 20,
      max: 10,
    }),
  );
