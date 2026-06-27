// Self-hosted Postgres pool. Reads DATABASE_URL (preferred) or PG* envs.
// Server-only; never import from client modules.
import { Pool, types as pgTypes, type PoolClient, type QueryResultRow } from "pg";

// node-postgres returns int8/bigint (OID 20) as a *string* by default to avoid
// precision loss. This codebase was written against Supabase (which returns
// bigint as a JSON number), so every server function validates row ids with
// `z.number()` and the UI passes ids straight back. Parsing int8 as Number here
// restores that assumption — without it, all bigserial-id mutations (watchlist
// update/remove, my-domains, data sources, prices, coupons, ideas delete, ...)
// fail Zod validation ("expected number, received string"). All ids/counts in
// this app stay well within JS safe-integer range.
pgTypes.setTypeParser(20, (v) => (v === null ? null : Number(v)));

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
