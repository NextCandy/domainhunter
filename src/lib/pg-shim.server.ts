// PostgREST-style query builder over node-postgres.
// Implements the subset of the JS client used in this codebase:
//   from(t).select/insert/update/upsert/delete + eq/neq/in/gt/gte/lt/lte/is/like/ilike/not/order/limit/range
//   .single() / .maybeSingle() / { count: "exact"[, head: true] }
//   .rpc("has_role", { _user_id, _role })
// Returns thenable `{ data, error, count? }` so `await q` works.
//
// Embedded select syntax (e.g. "*, foo:bar(*)") is NOT supported — callers
// rewritten to issue two queries manually.

import { query } from "./db.server";
import { hasRole } from "./auth.server";

type Cmp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "like" | "ilike";

type Filter =
  | { kind: Cmp; col: string; val: unknown }
  | { kind: "in"; col: string; vals: unknown[] }
  | { kind: "not"; col: string; op: Cmp; val: unknown };

type Order = { col: string; asc: boolean; nullsFirst?: boolean };

const OPS: Record<Cmp, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  is: "IS",
  like: "LIKE",
  ilike: "ILIKE",
};

function ident(name: string): string {
  // basic identifier quoting (column or table). Allow dotted refs.
  return name
    .split(".")
    .map((p) => (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p) ? p : `"${p.replace(/"/g, '""')}"`))
    .join(".");
}

function buildSelectCols(sel: string): string {
  // Strip whitespace/newlines; reject embedded join syntax (foo:bar(*)).
  const trimmed = sel.replace(/\s+/g, "");
  if (/[():]/.test(trimmed)) {
    throw new Error(
      `pg-shim: embedded select syntax not supported (${sel}). Rewrite to manual JOIN.`,
    );
  }
  if (trimmed === "*" || trimmed === "") return "*";
  return trimmed
    .split(",")
    .map((c) => ident(c))
    .join(", ");
}

class Builder<T = any> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private rangeTo: number | null = null;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private selectCols = "*";
  private insertRows: Record<string, unknown>[] = [];
  private updatePatch: Record<string, unknown> = {};
  private onConflict: string | null = null;
  private ignoreDup = false;
  private returning = false;
  private singleMode: "none" | "single" | "maybe" = "none";
  private countMode: "none" | "exact" = "none";
  private headOnly = false;

  constructor(private readonly table: string) {}

  // ── modifiers ────────────────────────────────────────────────────────────
  select(cols = "*", opts?: { count?: "exact"; head?: boolean }): this {
    this.selectCols = cols || "*";
    if (opts?.count === "exact") this.countMode = "exact";
    if (opts?.head) this.headOnly = true;
    if (
      this.mode === "insert" ||
      this.mode === "upsert" ||
      this.mode === "update" ||
      this.mode === "delete"
    ) {
      this.returning = true;
    }
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ kind: "neq", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ kind: "gt", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ kind: "gte", col, val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ kind: "lt", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ kind: "lte", col, val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ kind: "is", col, val });
    return this;
  }
  like(col: string, val: string) {
    this.filters.push({ kind: "like", col, val });
    return this;
  }
  ilike(col: string, val: string) {
    this.filters.push({ kind: "ilike", col, val });
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push({ kind: "in", col, vals });
    return this;
  }
  not(col: string, op: Cmp, val: unknown) {
    this.filters.push({ kind: "not", col, op, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }

  // ── mutations ────────────────────────────────────────────────────────────
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.mode = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Record<string, unknown>) {
    this.mode = "update";
    this.updatePatch = patch;
    return this;
  }
  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.mode = "upsert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  // ── execution ────────────────────────────────────────────────────────────
  private buildWhere(startIdx = 1): { sql: string; params: unknown[]; nextIdx: number } {
    if (this.filters.length === 0) return { sql: "", params: [], nextIdx: startIdx };
    const params: unknown[] = [];
    let i = startIdx;
    const parts = this.filters.map((f) => {
      if (f.kind === "in") {
        if (f.vals.length === 0) return "FALSE";
        const ph = f.vals.map(() => `$${i++}`).join(", ");
        params.push(...f.vals);
        return `${ident(f.col)} IN (${ph})`;
      }
      if (f.kind === "not") {
        if (f.val === null) {
          return `${ident(f.col)} IS NOT NULL`;
        }
        params.push(f.val);
        return `NOT (${ident(f.col)} ${OPS[f.op]} $${i++})`;
      }
      // is null / is not null
      if (f.kind === "is" && (f.val === null || f.val === "null")) {
        return `${ident(f.col)} IS NULL`;
      }
      params.push(f.val);
      return `${ident(f.col)} ${OPS[f.kind]} $${i++}`;
    });
    return { sql: " WHERE " + parts.join(" AND "), params, nextIdx: i };
  }

  private orderLimitSql(): string {
    let s = "";
    if (this.orders.length) {
      s +=
        " ORDER BY " +
        this.orders
          .map((o) => {
            const nulls =
              o.nullsFirst === undefined ? "" : o.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
            return `${ident(o.col)} ${o.asc ? "ASC" : "DESC"}${nulls}`;
          })
          .join(", ");
    }
    if (this.rangeTo != null) {
      const limit = this.rangeTo - this.offsetN + 1;
      s += ` LIMIT ${Math.max(0, limit)} OFFSET ${Math.max(0, this.offsetN)}`;
    } else {
      if (this.limitN != null) s += ` LIMIT ${this.limitN}`;
      if (this.offsetN) s += ` OFFSET ${this.offsetN}`;
    }
    return s;
  }

  private async exec(): Promise<{
    data: T | T[] | null;
    error: { message: string } | null;
    count: number | null;
  }> {
    try {
      let result: { rows: any[]; rowCount: number } = { rows: [], rowCount: 0 };
      let countVal: number | null = null;

      if (this.mode === "select") {
        // count if requested
        if (this.countMode === "exact") {
          const { sql: where, params } = this.buildWhere(1);
          const c = await query<{ c: string }>(
            `SELECT COUNT(*)::text AS c FROM ${ident(this.table)}${where}`,
            params,
          );
          countVal = Number(c.rows[0]?.c ?? 0);
        }
        if (!this.headOnly) {
          const cols = buildSelectCols(this.selectCols);
          const { sql: where, params } = this.buildWhere(1);
          const sql = `SELECT ${cols} FROM ${ident(this.table)}${where}${this.orderLimitSql()}`;
          result = await query(sql, params);
        }
      } else if (this.mode === "insert" || this.mode === "upsert") {
        if (this.insertRows.length === 0) {
          return { data: this.returning ? [] : null, error: null, count: null };
        }
        const cols = Array.from(new Set(this.insertRows.flatMap((r) => Object.keys(r))));
        const params: unknown[] = [];
        let i = 1;
        const valueRows = this.insertRows.map((r) => {
          const vals = cols.map((c) => {
            params.push(serializeValue(r[c]));
            return `$${i++}`;
          });
          return `(${vals.join(", ")})`;
        });
        let sql = `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(", ")}) VALUES ${valueRows.join(", ")}`;
        if (this.mode === "upsert") {
          const conflictCols = this.onConflict
            ? this.onConflict
                .split(",")
                .map((c) => ident(c.trim()))
                .join(", ")
            : "";
          if (this.ignoreDup || !conflictCols) {
            sql += ` ON CONFLICT ${conflictCols ? `(${conflictCols}) ` : ""}DO NOTHING`;
          } else {
            const updates = cols
              .filter(
                (c) =>
                  !this.onConflict!.split(",")
                    .map((s) => s.trim())
                    .includes(c),
              )
              .map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`)
              .join(", ");
            sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updates || `${ident(cols[0])} = EXCLUDED.${ident(cols[0])}`}`;
          }
        }
        if (this.returning) {
          sql += ` RETURNING ${buildSelectCols(this.selectCols)}`;
        }
        result = await query(sql, params);
      } else if (this.mode === "update") {
        const cols = Object.keys(this.updatePatch);
        const params: unknown[] = [];
        let i = 1;
        const sets = cols.map((c) => {
          params.push(serializeValue(this.updatePatch[c]));
          return `${ident(c)} = $${i++}`;
        });
        const { sql: where, params: wparams } = this.buildWhere(i);
        params.push(...wparams);
        let sql = `UPDATE ${ident(this.table)} SET ${sets.join(", ")}${where}`;
        if (this.returning) sql += ` RETURNING ${buildSelectCols(this.selectCols)}`;
        result = await query(sql, params);
      } else if (this.mode === "delete") {
        const { sql: where, params } = this.buildWhere(1);
        let sql = `DELETE FROM ${ident(this.table)}${where}`;
        if (this.returning) sql += ` RETURNING ${buildSelectCols(this.selectCols)}`;
        result = await query(sql, params);
      }

      let data: any = result.rows;
      if (this.singleMode === "single") {
        if (result.rows.length === 0) {
          return {
            data: null,
            error: { message: "JSON object requested, multiple (or no) rows returned" },
            count: countVal,
          };
        }
        data = result.rows[0];
      } else if (this.singleMode === "maybe") {
        data = result.rows[0] ?? null;
      } else if (this.headOnly && this.mode === "select") {
        data = null;
      }
      return { data, error: null, count: countVal };
    } catch (e: any) {
      return { data: null, error: { message: String(e?.message ?? e) }, count: null };
    }
  }

  // Thenable: makes `await builder` work.
  then<TR1 = any, TR2 = never>(
    onFulfilled?:
      ((value: { data: any; error: any; count: number | null }) => TR1 | PromiseLike<TR1>) | null,
    onRejected?: ((reason: any) => TR2 | PromiseLike<TR2>) | null,
  ): Promise<TR1 | TR2> {
    return this.exec().then(onFulfilled as any, onRejected as any);
  }
}

function serializeValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) {
    // pg can take arrays directly only for typed arrays; JSONify objects.
    if (
      v.every(
        (x) =>
          typeof x === "string" || typeof x === "number" || typeof x === "boolean" || x === null,
      )
    ) {
      return v;
    }
    return JSON.stringify(v);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

// ── top-level shim object ──────────────────────────────────────────────────
export const pgShim = {
  from<T = any>(table: string) {
    return new Builder<T>(table);
  },
  async rpc(name: string, params: Record<string, unknown> = {}) {
    try {
      if (name === "has_role") {
        const ok = await hasRole(String(params._user_id), String(params._role));
        return { data: ok, error: null };
      }
      return { data: null, error: { message: `pg-shim: unknown rpc ${name}` } };
    } catch (e: any) {
      return { data: null, error: { message: String(e?.message ?? e) } };
    }
  },
};

export type PgShim = typeof pgShim;
