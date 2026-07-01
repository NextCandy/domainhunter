// Enrich jobs: DNS / Archive / SEO bulk fetching with cache + resume.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function getDb() {
  const { pgShim } = await import("@/lib/pg-shim.server");
  return pgShim;
}

async function ensureAdmin() {
  const [{ getRequest }, { hasRole, verifyToken }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/lib/auth.server"),
  ]);
  const authHeader = getRequest()?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("未登录或登录已过期");
  let claims: { sub?: string };
  try {
    claims = verifyToken(authHeader.replace("Bearer ", "").trim());
  } catch {
    throw new Error("未登录或登录已过期");
  }
  if (!claims.sub || !(await hasRole(claims.sub, "admin"))) {
    throw new Error("仅管理员可访问该操作");
  }
}

export const ENRICH_LIMITS = {
  concurrency: { min: 1, max: 20, default: 5 },
  qps: { min: 1, max: 50, default: 5 },
  cacheTtl: { min: 3600, max: 30 * 86400, default: 86400 },
  batchSize: { min: 1, max: 50, default: 10 },
} as const;

const KINDS = ["dns", "archive", "seo"] as const;
type Kind = (typeof KINDS)[number];

const createSchema = z.object({
  name: z.string().min(1).max(200),
  domains: z.array(z.string().min(1).max(253)).min(1).max(200_000),
  kinds: z.array(z.enum(KINDS)).min(1),
  scope: z.string().default("manual"),
  sourceJobId: z.string().uuid().optional(),
  concurrency: z
    .number()
    .int()
    .min(ENRICH_LIMITS.concurrency.min)
    .max(ENRICH_LIMITS.concurrency.max)
    .default(ENRICH_LIMITS.concurrency.default),
  qps: z
    .number()
    .int()
    .min(ENRICH_LIMITS.qps.min)
    .max(ENRICH_LIMITS.qps.max)
    .default(ENRICH_LIMITS.qps.default),
  cacheTtlSeconds: z
    .number()
    .int()
    .min(ENRICH_LIMITS.cacheTtl.min)
    .max(ENRICH_LIMITS.cacheTtl.max)
    .default(ENRICH_LIMITS.cacheTtl.default),
});

export const createEnrichJobFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = await getDb();

    const uniqDomains = Array.from(
      new Set(data.domains.map((d) => d.toLowerCase().trim()).filter(Boolean)),
    );

    const { data: job, error } = await db
      .from("enrich_jobs")
      .insert({
        name: data.name,
        kinds: data.kinds,
        scope: data.scope,
        source_job_id: data.sourceJobId ?? null,
        total: uniqDomains.length * data.kinds.length,
        concurrency: data.concurrency,
        qps: data.qps,
        cache_ttl_seconds: data.cacheTtlSeconds,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(error?.message ?? "创建任务失败");

    // Insert items in chunks (one row per domain × kind).
    const rows: { enrich_job_id: string; domain: string; kind: Kind; status: string }[] = [];
    for (const d of uniqDomains) {
      for (const k of data.kinds) {
        rows.push({ enrich_job_id: job.id, domain: d, kind: k, status: "pending" });
      }
    }
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: ie } = await db.from("enrich_items").insert(rows.slice(i, i + CHUNK));
      if (ie) throw new Error(ie.message);
    }
    return { id: job.id, total: rows.length };
  });

const jobIdSchema = z.object({ jobId: z.string().uuid() });

export const listEnrichJobsFn = createServerFn({ method: "POST" }).handler(async () => {
  await ensureAdmin();
  const db = await getDb();
  const { data } = await db
    .from("enrich_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
});

export const getEnrichJobFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = await getDb();
    const { data: job } = await db
      .from("enrich_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("任务不存在");
    const { data: recent } = await db
      .from("enrich_items")
      .select("id, domain, kind, status, error, attempted_at")
      .eq("enrich_job_id", data.jobId)
      .order("attempted_at", { ascending: false, nullsFirst: false })
      .limit(50);
    const { data: errs } = await db
      .from("enrich_items")
      .select("id, domain, kind, error, attempted_at")
      .eq("enrich_job_id", data.jobId)
      .eq("status", "error")
      .order("attempted_at", { ascending: false })
      .limit(50);
    return { job, recent: recent ?? [], errors: errs ?? [] };
  });

export const stopEnrichJobFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = await getDb();
    await db
      .from("enrich_jobs")
      .update({ status: "stopped", finished_at: new Date().toISOString() })
      .eq("id", data.jobId);
    return { ok: true };
  });

export const resumeEnrichJobFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => jobIdSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = await getDb();
    // Reset any 'running' items back to pending (interrupted) and re-open job
    await db
      .from("enrich_items")
      .update({ status: "pending" })
      .eq("enrich_job_id", data.jobId)
      .eq("status", "running");
    await db
      .from("enrich_jobs")
      .update({ status: "pending", finished_at: null })
      .eq("id", data.jobId);
    return { ok: true };
  });

const advanceSchema = z.object({
  jobId: z.string().uuid(),
  batchSize: z.number().int().min(1).max(50).default(10),
});

export const advanceEnrichJobFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => advanceSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = await getDb();

    const { data: job } = await db
      .from("enrich_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("任务不存在");
    if ((job as any).status === "stopped") return { processed: 0, remaining: 0, stopped: true };

    if ((job as any).status === "pending") {
      await db
        .from("enrich_jobs")
        .update({
          status: "running",
          started_at: (job as any).started_at ?? new Date().toISOString(),
        })
        .eq("id", data.jobId);
    }

    const { data: items } = await db
      .from("enrich_items")
      .select("id, domain, kind")
      .eq("enrich_job_id", data.jobId)
      .eq("status", "pending")
      .limit(data.batchSize);

    const pending = (items ?? []) as { id: number; domain: string; kind: Kind }[];
    if (pending.length === 0) {
      await finalizeIfDone(data.jobId);
      return { processed: 0, remaining: 0, stopped: false };
    }

    // Mark batch running
    await db
      .from("enrich_items")
      .update({ status: "running" })
      .in(
        "id",
        pending.map((p) => p.id),
      );

    const ttl = (job as any).cache_ttl_seconds as number;

    const results = await Promise.allSettled(pending.map((it) => processOne(it, ttl)));

    let done = 0,
      failed = 0,
      cached = 0;
    const updates: PromiseLike<unknown>[] = [];
    for (let i = 0; i < pending.length; i++) {
      const it = pending[i];
      const r = results[i];
      let status: string,
        result: any = null,
        error: string | null = null;
      if (r.status === "fulfilled") {
        const v = r.value;
        status = v.cached ? "cached" : v.skipped ? "skipped" : "done";
        result = v.payload;
        if (v.cached) cached++;
        else done++;
      } else {
        status = "error";
        error = String(r.reason?.message ?? r.reason ?? "error");
        failed++;
      }
      updates.push(
        db
          .from("enrich_items")
          .update({
            status,
            result,
            error,
            attempted_at: new Date().toISOString(),
          })
          .eq("id", it.id)
          .then((x: any) => x),
      );
    }
    await Promise.allSettled(updates);

    // Aggregate
    const { data: cur } = await db
      .from("enrich_jobs")
      .select("done, failed, cached_hits")
      .eq("id", data.jobId)
      .single();
    if (cur) {
      const c = cur as any;
      await db
        .from("enrich_jobs")
        .update({
          done: c.done + done,
          failed: c.failed + failed,
          cached_hits: c.cached_hits + cached,
          last_progress_at: new Date().toISOString(),
        })
        .eq("id", data.jobId);
    }

    const { count } = await db
      .from("enrich_items")
      .select("id", { count: "exact", head: true })
      .eq("enrich_job_id", data.jobId)
      .eq("status", "pending");
    const remaining = count ?? 0;
    if (remaining === 0) await finalizeIfDone(data.jobId);
    return { processed: pending.length, remaining, stopped: false };
  });

async function finalizeIfDone(jobId: string) {
  const db = await getDb();
  const { count: stillPending } = await db
    .from("enrich_items")
    .select("id", { count: "exact", head: true })
    .eq("enrich_job_id", jobId)
    .in("status", ["pending", "running"]);
  if ((stillPending ?? 0) === 0) {
    await db
      .from("enrich_jobs")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

async function processOne(
  it: { domain: string; kind: Kind },
  ttl: number,
): Promise<{ cached?: boolean; skipped?: boolean; payload: any }> {
  const db = await getDb();
  // Cache check
  const { data: cache } = await db
    .from("enrich_cache")
    .select("payload, fetched_at, ttl_seconds")
    .eq("domain", it.domain)
    .eq("kind", it.kind)
    .maybeSingle();
  if (cache) {
    const ageMs = Date.now() - new Date((cache as any).fetched_at).getTime();
    if (ageMs < (cache as any).ttl_seconds * 1000) {
      return { cached: true, payload: (cache as any).payload };
    }
  }
  // Live fetch
  let payload: any = null;
  let skipped = false;
  if (it.kind === "dns") {
    const { fetchDns } = await import("./enrich.server");
    payload = await fetchDns(it.domain);
  } else if (it.kind === "archive") {
    const { fetchArchive } = await import("./enrich.server");
    payload = await fetchArchive(it.domain);
  } else if (it.kind === "seo") {
    const { fetchSeo } = await import("./seo.server");
    const r = await fetchSeo(it.domain);
    if (r == null) {
      skipped = true;
      payload = { skipped: "semrush_unavailable" };
    } else payload = r;
  }
  // Upsert cache (even skipped, with short ttl to avoid storms)
  await db.from("enrich_cache").upsert({
    domain: it.domain,
    kind: it.kind,
    payload,
    fetched_at: new Date().toISOString(),
    ttl_seconds: skipped ? Math.min(ttl, 3600) : ttl,
  });
  return { skipped, payload };
}

// Called by rdap job completion hook
export async function maybeAutoEnrich(sourceJobId: string) {
  const db = await getDb();
  const { data: job } = await db
    .from("jobs")
    .select("name, params")
    .eq("id", sourceJobId)
    .maybeSingle();
  if (!job) return;
  const ae = ((job as any).params ?? {}).auto_enrich as
    { enabled?: boolean; kinds?: string[]; scope?: "available" | "registered" | "all" } | undefined;
  if (!ae?.enabled) return;
  const kinds = (ae.kinds ?? ["dns", "archive"]).filter((k) =>
    ["dns", "archive", "seo"].includes(k),
  );
  if (kinds.length === 0) return;
  const scope = ae.scope ?? "available";
  let q = db.from("job_items").select("domain").eq("job_id", sourceJobId);
  if (scope === "available") q = q.eq("status", "available");
  else if (scope === "registered") q = q.in("status", ["registered", "reserved"]);
  const { data: items } = await q.limit(200_000);
  const domains = Array.from(
    new Set((items ?? []).map((x: any) => String(x.domain).toLowerCase())),
  );
  if (domains.length === 0) return;

  const { data: ej } = await db
    .from("enrich_jobs")
    .insert({
      name: `自动丰富 · ${(job as any).name}`,
      kinds,
      scope,
      source_job_id: sourceJobId,
      total: domains.length * kinds.length,
      status: "pending",
    })
    .select("id")
    .single();
  if (!ej) return;
  const rows = domains.flatMap((d) =>
    kinds.map((k) => ({
      enrich_job_id: (ej as any).id,
      domain: d,
      kind: k,
      status: "pending",
    })),
  );
  for (let i = 0; i < rows.length; i += 1000) {
    await db.from("enrich_items").insert(rows.slice(i, i + 1000));
  }
}
