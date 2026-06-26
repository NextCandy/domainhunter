// Server functions for the DomainHunter app: discover (paginated), import, watchlist,
// my-domains, admin (scoring + settings + sources + registrars), single-domain refresh.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pgShim } from "./pg-shim.server";
import type { Database } from "@/integrations/supabase/types";
import { scoreDomain, classifyDomain, DEFAULT_WEIGHTS, type ScoringWeights } from "./scoring";
import { lookupDomain } from "./rdap.server";
import { fetchDns, fetchArchive, sendNotification } from "./enrich.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-guard.server";

function sbAdmin() {
  return pgShim;
}

const TLD_SAFE = /^[a-z0-9-]+$/i;

export function parseDomain(input: string): { domain: string; name: string; tld: string } | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!d || d.length > 253) return null;
  const idx = d.indexOf(".");
  if (idx <= 0 || idx === d.length - 1) return null;
  const name = d.slice(0, idx);
  const tld = d.slice(idx + 1);
  if (!/^[a-z0-9-]+$/.test(name) || !TLD_SAFE.test(tld)) return null;
  return { domain: d, name, tld };
}

async function getWeights(): Promise<ScoringWeights> {
  const sb = sbAdmin();
  const { data } = await sb.from("scoring_rules").select("weights").eq("id", 1).maybeSingle();
  return { ...DEFAULT_WEIGHTS, ...((data?.weights as Partial<ScoringWeights>) ?? {}) };
}

// ───────── Stats / overview ─────────
export const overviewStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const since = today.toISOString();
  const [todayNew, available, pending, highScore, watching] = await Promise.all([
    sb.from("domains").select("*", { count: "exact", head: true }).gte("created_at", since),
    sb.from("domains").select("*", { count: "exact", head: true }).eq("status", "available"),
    sb.from("domains").select("*", { count: "exact", head: true }).eq("status", "pending_delete"),
    sb.from("domains").select("*", { count: "exact", head: true }).gte("score", 70),
    sb.from("watchlist").select("*", { count: "exact", head: true }).eq("status", "watching"),
  ]);
  const featured = await sb
    .from("domains").select("*").gte("score", 60).order("score", { ascending: false }).limit(12);
  return {
    todayNew: todayNew.count ?? 0,
    available: available.count ?? 0,
    pending: pending.count ?? 0,
    highScore: highScore.count ?? 0,
    watching: watching.count ?? 0,
    featured: featured.data ?? [],
  };
});

// ───────── Discover (paginated, filterable) ─────────
const DiscoverFilters = z.object({
  q: z.string().trim().max(200).optional(),
  tlds: z.array(z.string().regex(/^[a-z0-9.\-]+$/i).max(20)).max(300).optional(),
  statuses: z.array(z.string().max(30)).max(8).optional(),
  types: z.array(z.string().max(20)).max(6).optional(),
  minLength: z.number().int().min(1).max(63).optional(),
  maxLength: z.number().int().min(1).max(63).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  startsWith: z.string().max(40).optional(),
  endsWith: z.string().max(40).optional(),
  contains: z.string().max(40).optional(),
  regex: z.string().max(120).optional(),
  archiveYearMin: z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  backlinksMin: z.number().int().min(0).optional(),
  riskLevels: z.array(z.string().max(20)).max(4).optional(),
  dropBefore: z.string().optional(),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
  sortBy: z.enum(["score", "domain", "length", "drop_date", "created_at"]).default("score"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type DiscoverFilters = z.infer<typeof DiscoverFilters>;

export const discoverFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DiscoverFilters.parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = sb.from("domains").select("*", { count: "exact" });
    if (data.q) q = q.ilike("domain", `%${data.q}%`);
    if (data.tlds?.length) q = q.in("tld", data.tlds);
    if (data.statuses?.length) q = q.in("status", data.statuses);
    if (data.types?.length) q = q.in("type", data.types);
    if (data.riskLevels?.length) q = q.in("risk_level", data.riskLevels);
    if (data.minLength != null) q = q.gte("length", data.minLength);
    if (data.maxLength != null) q = q.lte("length", data.maxLength);
    if (data.minScore != null) q = q.gte("score", data.minScore);
    if (data.startsWith) q = q.ilike("name", `${data.startsWith}%`);
    if (data.endsWith) q = q.ilike("name", `%${data.endsWith}`);
    if (data.contains) q = q.ilike("name", `%${data.contains}%`);
    if (data.dropBefore) q = q.lte("drop_date", data.dropBefore);
    q = q.order(data.sortBy, { ascending: data.sortDir === "asc" }).range(from, to);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    // Manual join: fetch metrics for the visible rows.
    const ids = (rows ?? []).map((r: any) => r.id).filter(Boolean);
    let metricsByDomain = new Map<string, any>();
    if (ids.length) {
      const { data: metrics } = await sb.from("domain_metrics").select("*").in("domain_id", ids);
      for (const m of (metrics as any[]) ?? []) metricsByDomain.set(m.domain_id, m);
    }
    let filtered = (rows ?? []).map((r: any) => ({ ...r, metrics: metricsByDomain.get(r.id) ?? null }));
    if (data.regex) {
      try { const re = new RegExp(data.regex, "i"); filtered = filtered.filter((r: any) => re.test(r.name)); }
      catch {}
    }
    if (data.archiveYearMin != null) filtered = filtered.filter((r: any) => (r.metrics?.archive_year ?? 0) >= data.archiveYearMin!);
    if (data.backlinksMin != null) filtered = filtered.filter((r: any) => (r.metrics?.backlinks ?? 0) >= data.backlinksMin!);
    return { rows: filtered, total: count ?? 0 };
  });

// ───────── Import (TXT / CSV) ─────────
const ImportSchema = z.object({
  source: z.string().trim().max(80).default("manual"),
  text: z.string().min(1).max(2_000_000),
  autoCheck: z.boolean().default(true),
  status: z.string().max(30).default("unknown"),
});

export const importDomainsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ImportSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const lines = data.text.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    const weights = await getWeights();
    const seen = new Set<string>();
    const rows: Database["public"]["Tables"]["domains"]["Insert"][] = [];
    for (const raw of lines.slice(0, 50_000)) {
      const first = raw.split(/[,;\t]/)[0];
      const parsed = parseDomain(first ?? "");
      if (!parsed || seen.has(parsed.domain)) continue;
      seen.add(parsed.domain);
      const sc = scoreDomain({ name: parsed.name, tld: parsed.tld }, weights);
      rows.push({
        domain: parsed.domain, name: parsed.name, tld: parsed.tld,
        length: parsed.name.length, type: classifyDomain(parsed.name),
        status: data.status, score: sc.total, risk_level: "low", source: data.source,
      });
    }
    if (!rows.length) return { inserted: 0, parsed: 0 };
    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await sb.from("domains").upsert(slice, { onConflict: "domain" });
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }
    if (data.autoCheck) {
      // Fire-and-forget: queue background checks for new rows (capped)
      void refreshDomainsBulk(rows.slice(0, 200).map(r => r.domain!));
    }
    return { inserted, parsed: rows.length };
  });

// ───────── Single-domain refresh (RDAP) ─────────
async function refreshOneInternal(domain: string) {
  const sb = sbAdmin();
  const parsed = parseDomain(domain);
  if (!parsed) throw new Error("Invalid domain");
  const weights = await getWeights();
  const lookup = await lookupDomain(parsed.domain);
  const status =
    lookup.status === "available" ? "available" :
    lookup.status === "registered" ? "registered" :
    lookup.status === "unsupported" ? "unsupported" : "unknown";
  const info: any = lookup;
  const sc = scoreDomain({
    name: parsed.name, tld: parsed.tld,
    risk_level: "low",
  }, weights);
  const { data: domRow, error: upErr } = await sb.from("domains").upsert({
    domain: parsed.domain, name: parsed.name, tld: parsed.tld,
    length: parsed.name.length, type: classifyDomain(parsed.name),
    status, score: sc.total, risk_level: "low",
    last_checked_at: new Date().toISOString(),
    expiry_date: info?.expiresDate ?? null,
  }, { onConflict: "domain" }).select("id").maybeSingle();
  if (upErr) throw new Error(upErr.message);
  if (domRow && status === "registered") {
    await sb.from("domain_whois").upsert({
      domain_id: domRow.id,
      registrar: info?.registrar ?? null,
      created_date: info?.createdDate ?? null,
      expiry_date: info?.expiresDate ?? null,
      updated_date: info?.updatedDate ?? null,
      nameservers: info?.nameservers ?? null,
      raw_data: info,
      checked_at: new Date().toISOString(),
    });
  }
  return { domain: parsed.domain, status, score: sc.total, domainId: domRow?.id ?? null };
}

async function refreshDomainsBulk(domains: string[]) {
  const CONC = 6;
  let i = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < domains.length) {
        const idx = i++;
        try { await refreshOneInternal(domains[idx]); } catch { /* swallow */ }
      }
    }),
  );
}

export const refreshDomainFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ domain: z.string().min(3).max(253) }).parse(d))
  .handler(async ({ data }) => refreshOneInternal(data.domain));

export const refreshBulkFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ domains: z.array(z.string()).max(500) }).parse(d))
  .handler(async ({ data }) => { void refreshDomainsBulk(data.domains); return { queued: data.domains.length }; });

// ───────── Domain detail ─────────
export const domainDetailFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ domain: z.string().min(3).max(253) }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const norm = data.domain.trim().toLowerCase();
    const { data: dom } = await sb.from("domains").select("*").eq("domain", norm).maybeSingle();
    if (!dom) return { domain: null };
    const [whois, dns, metrics, watch] = await Promise.all([
      sb.from("domain_whois").select("*").eq("domain_id", dom.id).maybeSingle(),
      sb.from("domain_dns").select("*").eq("domain_id", dom.id).maybeSingle(),
      sb.from("domain_metrics").select("*").eq("domain_id", dom.id).maybeSingle(),
      sb.from("watchlist").select("*").eq("domain_id", dom.id).maybeSingle(),
    ]);
    return {
      domain: dom,
      whois: whois.data,
      dns: dns.data,
      metrics: metrics.data,
      watch: watch.data,
    };
  });

// ───────── Related TLD check ─────────
export const checkRelatedTldsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(63) }).parse(d))
  .handler(async ({ data }) => {
    const tlds = ["com", "net", "org", "io", "ai", "co", "cc", "cn"];
    const results = await Promise.all(tlds.map(async tld => {
      try {
        const r = await lookupDomain(`${data.name}.${tld}`);
        return { tld, status: r.status };
      } catch { return { tld, status: "unknown" as const }; }
    }));
    return results;
  });

// ───────── Watchlist ─────────
export const listWatchlistFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data, error } = await sb.from("watchlist")
    .select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const rows = (data as any[]) ?? [];
  const ids = rows.map((r) => r.domain_id).filter(Boolean);
  let byId = new Map<string, any>();
  if (ids.length) {
    const { data: doms } = await sb.from("domains").select("*").in("id", ids);
    for (const d of (doms as any[]) ?? []) byId.set(d.id, d);
  }
  return rows.map((r) => ({ ...r, domain: byId.get(r.domain_id) ?? null }));
});

export const toggleWatchFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ domain: z.string().min(3).max(253) }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const parsed = parseDomain(data.domain);
    if (!parsed) throw new Error("Invalid domain");
    // Ensure domain row exists
    const weights = await getWeights();
    const sc = scoreDomain({ name: parsed.name, tld: parsed.tld }, weights);
    const { data: dom } = await sb.from("domains").upsert({
      domain: parsed.domain, name: parsed.name, tld: parsed.tld,
      length: parsed.name.length, type: classifyDomain(parsed.name),
      score: sc.total,
    }, { onConflict: "domain" }).select("id").maybeSingle();
    if (!dom) throw new Error("upsert failed");
    const { data: exists } = await sb.from("watchlist").select("id").eq("domain_id", dom.id).maybeSingle();
    if (exists) {
      await sb.from("watchlist").delete().eq("id", exists.id);
      return { watching: false };
    }
    await sb.from("watchlist").insert({ domain_id: dom.id });
    return { watching: true };
  });

export const updateWatchlistFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.number().int(),
    patch: z.object({
      status: z.string().max(30).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      note: z.string().max(1000).optional(),
      notify_before_drop: z.boolean().optional(),
      notify_on_available: z.boolean().optional(),
      notify_on_price_change: z.boolean().optional(),
    }),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const { error } = await sb.from("watchlist").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeWatchFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    await sb.from("watchlist").delete().eq("id", data.id);
    return { ok: true };
  });

// ───────── My domains ─────────
export const listMyDomainsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data } = await sb.from("my_domains").select("*").order("expiry_date", { ascending: true });
  return data ?? [];
});

export const upsertMyDomainFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    domain: z.string().min(3).max(253),
    registrar: z.string().max(80).optional(),
    expiry_date: z.string().optional(),
    note: z.string().max(500).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const parsed = parseDomain(data.domain);
    if (!parsed) throw new Error("Invalid domain");
    const { error } = await sb.from("my_domains").upsert({
      domain: parsed.domain,
      registrar: data.registrar ?? null,
      expiry_date: data.expiry_date ?? null,
      note: data.note ?? null,
      tags: data.tags ?? [],
    }, { onConflict: "domain" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMyDomainFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    await sb.from("my_domains").delete().eq("id", data.id);
    return { ok: true };
  });

// ───────── Auctions ─────────
export const listAuctionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data } = await sb.from("auctions").select("*").order("end_time", { ascending: true }).limit(200);
  return data ?? [];
});

// ───────── Admin ─────────
export const getScoringFn = createServerFn({ method: "GET" }).handler(async () => {
  return await getWeights();
});

export const saveScoringFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    weights: z.object({
      length: z.number().min(0).max(40),
      semantic: z.number().min(0).max(40),
      tld: z.number().min(0).max(40),
      archive: z.number().min(0).max(40),
      backlinks: z.number().min(0).max(40),
      related_tld: z.number().min(0).max(40),
      brandable: z.number().min(0).max(40),
      risk_penalty_max: z.number().min(0).max(40),
    }),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const { error } = await sb.from("scoring_rules").upsert({ id: 1, weights: data.weights, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSourcesFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data } = await sb.from("data_sources").select("*").order("created_at", { ascending: false });
  return data ?? [];
});

export const upsertSourceFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.coerce.number().int().optional(),
    name: z.string().min(1).max(80),
    type: z.string().max(30).default("manual"),
    url: z.string().max(500).optional(),
    enabled: z.boolean().default(true),
    sync_interval_min: z.number().int().min(0).max(43200).default(1440),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    if (data.id) {
      const { error } = await sb.from("data_sources").update({
        name: data.name, type: data.type, url: data.url, enabled: data.enabled, sync_interval_min: data.sync_interval_min,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("data_sources").insert({
        name: data.name, type: data.type, url: data.url ?? null, enabled: data.enabled, sync_interval_min: data.sync_interval_min,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteSourceFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    await sb.from("data_sources").delete().eq("id", data.id);
    return { ok: true };
  });

export const listRegistrarsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data } = await sb.from("registrars").select("id,name,enabled,buy_url_template,config_json,created_at,updated_at").order("name");
  return data ?? [];
});

function pseudoEncrypt(plain: string) {
  // Server-side opaque storage (NOT real crypto — placeholder until KMS wired up).
  return plain ? Buffer.from(plain, "utf8").toString("base64") : null;
}

export const upsertRegistrarFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.coerce.number().int().optional(),
    name: z.string().min(1).max(80),
    api_key: z.string().max(500).optional(),
    api_secret: z.string().max(500).optional(),
    enabled: z.boolean().default(false),
    buy_url_template: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const name = data.name.trim();
    const patch: any = {
      name, enabled: data.enabled,
      buy_url_template: data.buy_url_template ?? null,
    };
    if (data.api_key) patch.api_key_encrypted = pseudoEncrypt(data.api_key);
    if (data.api_secret) patch.api_secret_encrypted = pseudoEncrypt(data.api_secret);
    if (data.id) {
      const { error } = await sb.from("registrars").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: existing, error: findError } = await sb
        .from("registrars")
        .select("id,name")
        .ilike("name", name)
        .maybeSingle();
      if (findError) throw new Error(findError.message);

      if (existing?.id) {
        const { error } = await sb
          .from("registrars")
          .update({ ...patch, name: existing.name ?? name })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb.from("registrars").insert(patch);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const deleteRegistrarFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.coerce.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    await sb.from("registrars").delete().eq("id", data.id);
    return { ok: true };
  });

export const getSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data } = await sb.from("app_settings").select("*");
  const obj: Record<string, any> = {};
  for (const r of data ?? []) obj[r.key] = r.value;
  return obj;
});

export const saveSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    settings: z.record(z.string(), z.any()),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const rows = Object.entries(data.settings).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    if (rows.length) {
      const { error } = await sb.from("app_settings").upsert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ───────── Stage 4: DNS + Wayback enrichment ─────────
export const enrichDomainFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ domain: z.string().min(3).max(253) }).parse(d))
  .handler(async ({ data }) => {
    const sb = sbAdmin();
    const parsed = parseDomain(data.domain);
    if (!parsed) throw new Error("Invalid domain");
    const { data: dom } = await sb.from("domains").select("id").eq("domain", parsed.domain).maybeSingle();
    if (!dom) throw new Error("先在数据库中创建该域名（点击「立即检测」）");
    const [dns, arc] = await Promise.all([fetchDns(parsed.domain), fetchArchive(parsed.domain)]);
    await sb.from("domain_dns").upsert({
      domain_id: dom.id,
      a_records: dns.a_records,
      ns_records: dns.ns_records,
      mx_records: dns.mx_records,
      txt_records: dns.txt_records,
      checked_at: new Date().toISOString(),
    });
    await sb.from("domain_metrics").upsert({
      domain_id: dom.id,
      archive_year: arc.archive_year,
      archive_count: arc.archive_count,
      updated_at: new Date().toISOString(),
    });
    return { dns, archive: arc };
  });

// ───────── Stage 4: notification test ─────────
export const sendTestNotificationFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    bark: z.string().url().optional().or(z.literal("")),
    webhook: z.string().url().optional().or(z.literal("")),
    title: z.string().max(200).default("DomainHunter 测试通知"),
    body: z.string().max(1000).default("如果你收到这条消息，说明通道配置正确。"),
  }).parse(d))
  .handler(async ({ data }) => {
    const res = await sendNotification(
      { bark: data.bark || undefined, webhook: data.webhook || undefined },
      data.title, data.body,
    );
    if (!res.length) throw new Error("请先填写 Bark 或 Webhook URL");
    return { results: res };
  });

// ───────── Live batch scan (Discover 页「批量查询」实际触发) ─────────
const LiveScanSchema = z.object({
  tlds: z.array(z.string().regex(/^[a-z0-9.\-]+$/i).max(20)).min(1).max(300),
  names: z.array(z.string().min(1).max(40)).max(200).optional(),
  q: z.string().max(40).optional(),
  startsWith: z.string().max(20).optional(),
  endsWith: z.string().max(20).optional(),
  contains: z.string().max(20).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const liveScanFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LiveScanSchema.parse(d))
  .handler(async ({ data }) => {
    // 1) 决定要查询的「名字」候选集
    let names: string[] = (data.names ?? [])
      .map(n => n.trim().toLowerCase())
      .filter(n => /^[a-z0-9-]+$/.test(n));
    if (!names.length) {
      const seed = (data.q || data.contains || data.startsWith || data.endsWith || "").trim().toLowerCase();
      if (!seed || !/^[a-z0-9-]+$/.test(seed)) {
        throw new Error("请填写关键词/开头/结尾/包含 任一，或在「关键词」中提供候选名");
      }
      names = [seed];
    }
    // 2) 生成 name × tld 候选 (full cartesian)
    const tlds = Array.from(new Set(data.tlds.map(t => t.toLowerCase().replace(/^\./, ""))));
    const candidates: string[] = [];
    outer: for (const n of names) {
      for (const t of tlds) {
        candidates.push(`${n}.${t}`);
        if (candidates.length >= data.limit) break outer;
      }
    }
    const list = Array.from(new Set(candidates)).slice(0, data.limit);
    if (!list.length) throw new Error("生成的候选域名为空");

    // 3) 落库为标准 job，UI 通过 runJobBatchFn 驱动 + 轮询进度
    const sb = sbAdmin();
    const seedName = names[0];
    const { data: job, error } = await sb
      .from("jobs")
      .insert({
        name: `Live · ${seedName} × ${tlds.length} TLDs`,
        params: { kind: "live-scan", seed: seedName, names, tlds, source: "discover" } as any,
        total: list.length,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !job) throw new Error(error?.message ?? "创建任务失败");
    const jobId = (job as any).id as string;

    const items = list.map(d => ({
      job_id: jobId,
      domain: d,
      tld: d.split(".").slice(1).join("."),
      status: "pending",
    }));
    // 分片插入避免单次过大
    for (let i = 0; i < items.length; i += 500) {
      await sb.from("job_items").insert(items.slice(i, i + 500));
    }
    return { jobId, total: list.length };
  });

// ───────── 管理员可编辑的 TLD 列表（前端筛选区使用） ─────────
const DEFAULT_TLD_LIST = [
  "com","net","org","info","biz","pro","name","mobi",
  "io","ai","co","app","dev","xyz","site","online","store","shop",
  "tech","cloud","club","fun","icu","live","world","today","blog",
  "design","studio","agency","media","news","art","vip","top",
  "wiki","link","page","space","website",
  "cn","com.cn","net.cn","cc","tv","me","us","uk","co.uk",
  "de","jp","co.jp","kr","tw","hk","sg","in","ru","br",
  "fr","it","es","nl","ca","au","com.au","nz","ch","se",
  "no","fi","dk","pl","be","at","cz","ie","mx","ar",
  "to","is","im","li","la","fm","gg","so","ws",
];

export const getTldListFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = sbAdmin();
  const { data } = await sb.from("app_settings").select("value").eq("key", "tld_list").maybeSingle();
  const v = data?.value as unknown;
  const list = Array.isArray(v)
    ? (v as unknown[]).map(x => String(x).trim().toLowerCase().replace(/^\./, "")).filter(x => /^[a-z0-9.\-]+$/.test(x))
    : DEFAULT_TLD_LIST;
  return { tlds: Array.from(new Set(list)) };
});

export const saveTldListFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tlds: z.array(z.string().regex(/^[a-z0-9.\-]+$/i).max(20)).max(1000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = sbAdmin();
    const dedup = Array.from(new Set(
      data.tlds.map(t => t.trim().toLowerCase().replace(/^\./, "")).filter(Boolean),
    ));
    const { error } = await sb.from("app_settings").upsert({
      key: "tld_list", value: dedup as any, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true, count: dedup.length };
  });

