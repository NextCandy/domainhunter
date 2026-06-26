// Client-callable server functions for RDAP and job management.
// Thin handlers - heavy logic lives in *.server.ts modules.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* ============================== LIMITS / VALIDATION ============================== */
// Centralised bounds — also mirrored on the client (src/lib/limits.ts) so the
// UI surfaces the same error messages before a network round-trip.

export const LIMITS = {
  qps: { min: 1, max: 200, default: 5 },
  concurrency: { min: 1, max: 100, default: 20 },
  perHostQps: { min: 1, max: 100, default: 10 },
  timeoutSec: { min: 2, max: 120, default: 30 },
  retries: { min: 0, max: 5, default: 2 },
  batchSize: { min: 1, max: 50, default: 20 },
  maxTotal: { min: 0, max: 2_000_000, default: 1_000_000 },
  limit: { min: 0, max: 2_000_000, default: 0 },
  domainsPerJob: { max: 200_000 },
  jobNameMax: 200,
} as const;

const lookupSchema = z.object({
  domain: z
    .string()
    .min(3, "域名过短")
    .max(253, "域名过长")
    .regex(/^[a-z0-9.-]+\.[a-z0-9-]+$/i, "无效的域名格式，例如 baidu.com")
    .transform((s) => s.toLowerCase()),
  timeoutMs: z
    .number()
    .int()
    .min(LIMITS.timeoutSec.min * 1000, `超时不得低于 ${LIMITS.timeoutSec.min} 秒`)
    .max(LIMITS.timeoutSec.max * 1000, `超时不得超过 ${LIMITS.timeoutSec.max} 秒`)
    .optional(),
});

export const lookupDomainFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => lookupSchema.parse(data))
  .handler(async ({ data }) => {
    const { lookupDomain } = await import("./rdap.server");
    return lookupDomain(data.domain, { timeoutMs: data.timeoutMs });
  });

const tldsSchema = z.object({
  source: z.enum(["common", "rdap", "root", "byLength"]),
  length: z.number().int().min(2).max(20).optional(),
});

export const fetchTldsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tldsSchema.parse(data))
  .handler(async ({ data }) => {
    const rdapMod = await import("./rdap.server");
    if (data.source === "common") {
      const { COMMON_TLDS } = await import("./domain-formats");
      return COMMON_TLDS;
    }
    if (data.source === "rdap") return rdapMod.getRdapSupportedTlds();
    if (data.source === "root") return rdapMod.getRootZoneTlds();
    if (data.source === "byLength") {
      const all = await rdapMod.getRootZoneTlds();
      return all.filter((t) => t.length === (data.length ?? 3));
    }
    return [];
  });

/* ============================== AUDIT LOG HELPER ============================== */

async function logEvent(
  jobId: string,
  event: string,
  opts: {
    level?: "info" | "warning" | "error";
    message?: string;
    meta?: Record<string, unknown>;
  } = {},
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("job_events").insert({
      job_id: jobId,
      event,
      level: opts.level || "info",
      message: opts.message || null,
      meta: (opts.meta as any) || null,
    });
  } catch (e) {
    // Audit logging must never block job progress.
    console.error("logEvent failed", e);
  }
}

/* ============================== JOB MANAGEMENT ============================== */

const createJobSchema = z.object({
  name: z
    .string()
    .min(1, "任务名不能为空")
    .max(LIMITS.jobNameMax, `任务名最长 ${LIMITS.jobNameMax} 字符`),
  params: z.record(z.any()),
  domains: z
    .array(z.string().min(3, "域名过短").max(253, "域名过长"))
    .min(1, "候选域名为空")
    .max(LIMITS.domainsPerJob.max, `单任务最多 ${LIMITS.domainsPerJob.max.toLocaleString()} 个域名`),
});

export const createJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createJobSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error } = await supabaseAdmin
      .from("jobs")
      .insert({
        name: data.name,
        params: data.params as any,
        total: data.domains.length,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(error?.message || "创建任务失败");
    const jobId = (job as any).id as string;

    const items = data.domains.map((d) => ({
      job_id: jobId,
      domain: d.toLowerCase(),
      tld: d.split(".").pop()!.toLowerCase(),
      status: "pending",
    }));
    const batchSize = 1000;
    let inserted = 0;
    for (let i = 0; i < items.length; i += batchSize) {
      const slice = items.slice(i, i + batchSize);
      const { error: err } = await supabaseAdmin.from("job_items").insert(slice);
      if (err && !err.message.includes("duplicate")) {
        console.error("Insert items error:", err.message);
        await logEvent(jobId, "items_insert_error", {
          level: "warning",
          message: err.message,
          meta: { batchStart: i, batchSize: slice.length },
        });
      } else {
        inserted += slice.length;
      }
    }
    await logEvent(jobId, "created", {
      message: `任务已创建（${inserted.toLocaleString()} 个候选域名）`,
      meta: { total: data.domains.length, inserted, params: data.params },
    });
    return { jobId };
  });

const runBatchSchema = z.object({
  jobId: z.string().uuid("无效的 jobId"),
  batchSize: z
    .number()
    .int()
    .min(LIMITS.batchSize.min, `批量大小至少 ${LIMITS.batchSize.min}`)
    .max(LIMITS.batchSize.max, `批量大小最多 ${LIMITS.batchSize.max}`)
    .default(LIMITS.batchSize.default),
  timeoutMs: z
    .number()
    .int()
    .min(LIMITS.timeoutSec.min * 1000, `超时不得低于 ${LIMITS.timeoutSec.min} 秒`)
    .max(LIMITS.timeoutSec.max * 1000, `超时不得超过 ${LIMITS.timeoutSec.max} 秒`)
    .default(LIMITS.timeoutSec.default * 1000),
  retries: z
    .number()
    .int()
    .min(LIMITS.retries.min, `重试不能为负`)
    .max(LIMITS.retries.max, `重试最多 ${LIMITS.retries.max} 次`)
    .default(LIMITS.retries.default),
});

export const runJobBatchFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => runBatchSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lookupDomain } = await import("./rdap.server");

    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("status, started_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("任务不存在");
    if ((job as any).status === "stopped") {
      return { processed: 0, remaining: 0, stopped: true };
    }

    const wasRunning = (job as any).status === "running";
    const startedAt = (job as any).started_at ?? new Date().toISOString();
    await supabaseAdmin
      .from("jobs")
      .update({ status: "running", started_at: startedAt })
      .eq("id", data.jobId);
    if (!wasRunning) {
      await logEvent(data.jobId, "started", { message: "任务开始执行" });
    }

    const { data: items } = await supabaseAdmin
      .from("job_items")
      .select("id, domain")
      .eq("job_id", data.jobId)
      .eq("status", "pending")
      .limit(data.batchSize);

    const pendingItems = (items || []) as { id: number; domain: string }[];
    if (pendingItems.length === 0) {
      await supabaseAdmin
        .from("jobs")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", data.jobId);
      await logEvent(data.jobId, "completed", { message: "任务已完成" });
      try {
        const { maybeAutoEnrich } = await import("./enrich-jobs.functions");
        await maybeAutoEnrich(data.jobId);
      } catch (e: any) {
        await logEvent(data.jobId, "auto_enrich_failed", { level: "warning", message: String(e?.message ?? e) });
      }
      return { processed: 0, remaining: 0, stopped: false };
    }

    const batchStart = Date.now();
    const results = await Promise.allSettled(
      pendingItems.map((it) =>
        lookupDomain(it.domain, { timeoutMs: data.timeoutMs, retries: data.retries }),
      ),
    );

    let avail = 0,
      reg = 0,
      unsup = 0,
      err = 0;
    const errorSamples: { domain: string; error: string }[] = [];
    const updatesArr: PromiseLike<unknown>[] = [];
    for (let i = 0; i < pendingItems.length; i++) {
      const it = pendingItems[i];
      const r = results[i];
      let info: any, status: string, errMsg: string | null = null;
      if (r.status === "fulfilled") {
        info = r.value;
        status = info.status;
        if (status === "available") avail++;
        else if (status === "registered" || status === "reserved") reg++;
        else if (status === "unsupported") unsup++;
        else if (status === "error") {
          err++;
          errMsg = info.error || "error";
        }
      } else {
        status = "error";
        err++;
        errMsg = String(r.reason?.message || r.reason || "error");
        info = { error: errMsg };
      }
      if (errMsg && errorSamples.length < 5) {
        errorSamples.push({ domain: it.domain, error: errMsg });
      }
      const p = supabaseAdmin
        .from("job_items")
        .update({
          status,
          info,
          error: errMsg,
          checked_at: new Date().toISOString(),
        })
        .eq("id", it.id)
        .then((x: any) => x);
      updatesArr.push(p);
    }
    await Promise.allSettled(updatesArr);

    // ── Mirror results into the `domains` table so the Discover view can show them ──
    try {
      const { parseDomain } = await import("./discover.functions");
      const { scoreDomain, classifyDomain, DEFAULT_WEIGHTS } = await import("./scoring");
      const nowIso = new Date().toISOString();
      const upserts: any[] = [];
      for (let i = 0; i < pendingItems.length; i++) {
        const it = pendingItems[i];
        const r = results[i];
        const parsed = parseDomain(it.domain);
        if (!parsed) continue;
        let st: string;
        let info: any = null;
        if (r.status === "fulfilled") {
          info = r.value;
          st = info.status === "available" ? "available"
             : info.status === "registered" ? "registered"
             : info.status === "reserved" ? "registered"
             : info.status === "unsupported" ? "unsupported"
             : info.status === "error" ? "error" : "unknown";
        } else {
          st = "error";
        }
        const sc = scoreDomain({ name: parsed.name, tld: parsed.tld, risk_level: "low" }, DEFAULT_WEIGHTS);
        upserts.push({
          domain: parsed.domain, name: parsed.name, tld: parsed.tld,
          length: parsed.name.length, type: classifyDomain(parsed.name),
          status: st, score: sc.total, risk_level: "low",
          source: "rdap-scan",
          last_checked_at: nowIso,
          expiry_date: info?.expiresDate ?? null,
        });
      }
      if (upserts.length) {
        await supabaseAdmin.from("domains").upsert(upserts, { onConflict: "domain" });
      }
    } catch (e: any) {
      await logEvent(data.jobId, "domains_upsert_failed", { level: "warning", message: String(e?.message ?? e) });
    }

    const { data: cur } = await supabaseAdmin
      .from("jobs")
      .select("checked, available, registered, unsupported, errors, total")
      .eq("id", data.jobId)
      .single();
    if (cur) {
      const c = cur as any;
      await supabaseAdmin
        .from("jobs")
        .update({
          checked: c.checked + pendingItems.length,
          available: c.available + avail,
          registered: c.registered + reg,
          unsupported: c.unsupported + unsup,
          errors: c.errors + err,
          last_progress_at: new Date().toISOString(),
        })
        .eq("id", data.jobId);
    }

    const elapsedMs = Date.now() - batchStart;
    await logEvent(data.jobId, "batch_done", {
      level: err > 0 && err === pendingItems.length ? "warning" : "info",
      message: `批量 ${pendingItems.length}：未注册 ${avail} / 已注册 ${reg} / 不支持 ${unsup} / 错误 ${err}（${elapsedMs}ms）`,
      meta: {
        size: pendingItems.length,
        available: avail,
        registered: reg,
        unsupported: unsup,
        errors: err,
        elapsedMs,
        errorSamples,
      },
    });

    const { count } = await supabaseAdmin
      .from("job_items")
      .select("id", { count: "exact", head: true })
      .eq("job_id", data.jobId)
      .eq("status", "pending");
    const remaining = count || 0;

    if (remaining === 0) {
      await supabaseAdmin
        .from("jobs")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", data.jobId);
      await logEvent(data.jobId, "completed", { message: "任务已完成" });
      try {
        const { maybeAutoEnrich } = await import("./enrich-jobs.functions");
        await maybeAutoEnrich(data.jobId);
      } catch (e: any) {
        await logEvent(data.jobId, "auto_enrich_failed", { level: "warning", message: String(e?.message ?? e) });
      }
    }

    return { processed: pendingItems.length, remaining, stopped: false };
  });

const jobIdSchema = z.object({ jobId: z.string().uuid("无效的 jobId") });

export const stopJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("jobs")
      .update({ status: "stopped", finished_at: new Date().toISOString() })
      .eq("id", data.jobId);
    await logEvent(data.jobId, "stopped", { level: "warning", message: "任务被手动停止" });
    return { ok: true };
  });

export const requeueErrorsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: errCount } = await supabaseAdmin
      .from("job_items")
      .select("id", { count: "exact", head: true })
      .eq("job_id", data.jobId)
      .eq("status", "error");
    await supabaseAdmin
      .from("job_items")
      .update({ status: "pending", error: null, info: null })
      .eq("job_id", data.jobId)
      .eq("status", "error");
    const { data: cur } = await supabaseAdmin
      .from("jobs")
      .select("checked, errors")
      .eq("id", data.jobId)
      .single();
    if (cur) {
      const c = cur as any;
      const n = errCount || 0;
      await supabaseAdmin
        .from("jobs")
        .update({
          checked: Math.max(0, c.checked - n),
          errors: Math.max(0, c.errors - n),
          status: "pending",
          finished_at: null,
        })
        .eq("id", data.jobId);
    }
    await logEvent(data.jobId, "requeued_errors", {
      message: `重新排队 ${errCount || 0} 个错误项`,
      meta: { count: errCount || 0 },
    });
    return { requeued: errCount || 0 };
  });

const progressSchema = z.object({ jobId: z.string().uuid("无效的 jobId") });
export const jobProgressFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => progressSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id,name,status,total,checked,available,registered,errors,unsupported,started_at,finished_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("任务不存在");
    const { data: errs } = await supabaseAdmin
      .from("job_items")
      .select("domain,error,checked_at")
      .eq("job_id", data.jobId)
      .eq("status", "error")
      .order("checked_at", { ascending: false })
      .limit(20);
    return { job, errors: (errs ?? []) as { domain: string; error: string; checked_at: string }[] };
  });



const recentSchema = z.object({
  jobId: z.string().uuid("无效的 jobId"),
  kind: z.enum(["available", "error"]),
  limit: z.number().int().min(1).max(500).default(100),
});

export const recentItemsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => recentSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("job_items")
      .select("domain, error, checked_at")
      .eq("job_id", data.jobId)
      .eq("status", data.kind === "available" ? "available" : "error")
      .order("checked_at", { ascending: false })
      .limit(data.limit);
    return (rows || []) as { domain: string; error: string | null; checked_at: string | null }[];
  });

export const listRecentJobsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("jobs")
    .select("id, name, status, total, checked, available, registered, unsupported, errors, created_at")
    .order("created_at", { ascending: false })
    .limit(15);
  return (data || []) as any[];
});

export const getJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    return job as any;
  });

/* ============================== AUDIT LOG QUERIES ============================== */

const listEventsSchema = z.object({
  jobId: z.string().uuid("无效的 jobId"),
  level: z.enum(["all", "info", "warning", "error"]).default("all"),
  limit: z.number().int().min(1).max(500).default(100),
});

export interface JobEvent {
  id: number;
  job_id: string;
  level: "info" | "warning" | "error";
  event: string;
  message: string | null;
  meta: any;
  created_at: string;
}

export const listJobEventsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listEventsSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("job_events")
      .select("id, job_id, level, event, message, meta, created_at")
      .eq("job_id", data.jobId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.level !== "all") q = q.eq("level", data.level);
    const { data: rows } = await q;
    return (rows || []) as unknown as JobEvent[];
  });

const errorReportSchema = z.object({
  jobId: z.string().uuid("无效的 jobId"),
  limit: z.number().int().min(1).max(5000).default(1000),
});

export const jobErrorReportFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => errorReportSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("job_items")
      .select("domain, tld, error, checked_at")
      .eq("job_id", data.jobId)
      .eq("status", "error")
      .order("checked_at", { ascending: false })
      .limit(data.limit);
    // Group by error reason
    const buckets = new Map<string, { count: number; sampleDomains: string[] }>();
    for (const r of (rows || []) as any[]) {
      const key = (r.error || "unknown").slice(0, 200);
      const b = buckets.get(key) || { count: 0, sampleDomains: [] };
      b.count++;
      if (b.sampleDomains.length < 5) b.sampleDomains.push(r.domain);
      buckets.set(key, b);
    }
    const grouped = [...buckets.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.count - a.count);
    return {
      total: rows?.length || 0,
      grouped,
      items: rows as any[],
    };
  });
