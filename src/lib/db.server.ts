// Self-hosted Postgres pool. Reads DATABASE_URL (preferred) or PG* envs.
// Server-only; never import from client modules.
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const cs = process.env.DATABASE_URL;
  if (cs) {
    return new Pool({
      connectionString: cs,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
    });
  }
  return new Pool({
    host: process.env.PGHOST || "postgres",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "domainhunter",
    max: Number(process.env.PG_POOL_MAX || 10),
  });
}

export function getPool(): Pool {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = makePool();
  }
  return globalThis.__pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const r = await getPool().query<T>(sql, params as never);
  return { rows: r.rows, rowCount: r.rowCount ?? 0 };
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}
