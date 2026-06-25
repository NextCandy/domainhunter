// Client-callable server functions for RDAP and job management.
// Thin handlers - heavy logic lives in *.server.ts modules.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const lookupSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z0-9-]+$/i, "Invalid domain")
    .transform((s) => s.toLowerCase()),
  timeoutMs: z.number().int().min(2000).max(60000).optional(),
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

// ===== Job management =====

const createJobSchema = z.object({
  name: z.string().min(1).max(200),
  params: z.record(z.any()),
  domains: z.array(z.string().min(3).max(253)).min(1).max(200_000),
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
    if (error || !job) throw new Error(error?.message || "Failed to create job");
    const jobId = (job as any).id as string;

    // Insert items in batches of 1000
    const items = data.domains.map((d) => ({
      job_id: jobId,
      domain: d.toLowerCase(),
      tld: d.split(".").pop()!.toLowerCase(),
      status: "pending",
    }));
    const batchSize = 1000;
    for (let i = 0; i < items.length; i += batchSize) {
      const slice = items.slice(i, i + batchSize);
      const { error: err } = await supabaseAdmin.from("job_items").insert(slice);
      if (err && !err.message.includes("duplicate")) {
        // Still continue; duplicates are deduped at DB by unique index
        console.error("Insert items error:", err.message);
      }
    }
    return { jobId };
  });

const runBatchSchema = z.object({
  jobId: z.string().uuid(),
  batchSize: z.number().int().min(1).max(50).default(20),
  timeoutMs: z.number().int().min(2000).max(60000).default(20000),
  retries: z.number().int().min(0).max(5).default(1),
});

export const runJobBatchFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => runBatchSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lookupDomain } = await import("./rdap.server");

    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("Job not found");
    if ((job as any).status === "stopped") {
      return { processed: 0, remaining: 0, stopped: true };
    }

    // Mark running
    await supabaseAdmin
      .from("jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", data.jobId);

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
      return { processed: 0, remaining: 0, stopped: false };
    }

    // Concurrent lookups
    const results = await Promise.allSettled(
      pendingItems.map((it) =>
        lookupDomain(it.domain, { timeoutMs: data.timeoutMs, retries: data.retries }),
      ),
    );

    let avail = 0,
      reg = 0,
      unsup = 0,
      err = 0;
    const updates: Promise<unknown>[] = [];
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
      updates.push(
        supabaseAdmin
          .from("job_items")
          .update({
            status,
            info,
            error: errMsg,
            checked_at: new Date().toISOString(),
          })
          .eq("id", it.id),
      );
    }
    await Promise.allSettled(updates);

    // Bump aggregates
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

    // Count remaining
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
    }

    return { processed: pendingItems.length, remaining, stopped: false };
  });

const jobIdSchema = z.object({ jobId: z.string().uuid() });

export const stopJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => jobIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("jobs")
      .update({ status: "stopped", finished_at: new Date().toISOString() })
      .eq("id", data.jobId);
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
    return { requeued: errCount || 0 };
  });

const recentSchema = z.object({
  jobId: z.string().uuid(),
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
