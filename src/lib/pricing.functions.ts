// Pricing comparison + coupons + purchase recommendations.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function sb() {
  const { pgShim } = await import("./pg-shim.server");
  return pgShim;
}

async function queryDb(sql: string, params?: unknown[]) {
  const { query } = await import("@/lib/db.server");
  return query(sql, params);
}

async function ensureAuth() {
  const [{ getRequest }, { verifyToken }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/lib/auth.server"),
  ]);
  const authHeader = getRequest()?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("未登录或登录已过期");
  const claims = verifyToken(authHeader.replace("Bearer ", "").trim());
  if (!claims.sub) throw new Error("未登录或登录已过期");
  return { userId: claims.sub };
}

async function ensureAdmin() {
  const [{ getRequest }, { hasRole, verifyToken }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/lib/auth.server"),
  ]);
  const authHeader = getRequest()?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("未登录或登录已过期");
  const claims = verifyToken(authHeader.replace("Bearer ", "").trim());
  if (!claims.sub || !(await hasRole(claims.sub, "admin"))) {
    throw new Error("仅管理员可访问该操作");
  }
  return { userId: claims.sub };
}

export type PricingRow = {
  id: number;
  registrar_id: number;
  registrar_name: string;
  registrar_slug: string | null;
  buy_url_template: string | null;
  tld: string;
  register_price: number | null;
  renew_price: number | null;
  transfer_price: number | null;
  currency: string | null;
  privacy_free: boolean | null;
  api_supported: boolean | null;
  notes: string | null;
  // Applied coupon
  coupon_code?: string | null;
  coupon_title?: string | null;
  discounted_price?: number | null;
  recommend_score?: number;
};

function normTld(t: string) {
  return t.trim().toLowerCase().replace(/^\./, "");
}

// ───────── Public-ish listing for the comparison page ─────────
export const compareTldFn = createServerFn({ method: "GET" })
  .validator((d: { tld: string; domain?: string }) =>
    z.object({ tld: z.string().min(1).max(40), domain: z.string().max(253).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    await ensureAuth();
    const tld = normTld(data.tld);
    const [pricesRes, couponsRes] = await Promise.all([
      queryDb(
        `
        SELECT
          p.id,
          p.registrar_id,
          p.tld,
          p.register_price,
          p.renew_price,
          p.transfer_price,
          p.currency,
          p.privacy_free,
          p.api_supported,
          p.notes,
          r.name AS registrar_name,
          r.slug AS registrar_slug,
          r.buy_url_template
        FROM public.registrar_prices p
        JOIN public.registrars r ON r.id = p.registrar_id
        WHERE p.tld = $1 AND r.enabled = true AND r.status = 'active'
        ORDER BY p.register_price NULLS LAST, r.name
      `,
        [tld],
      ),
      queryDb(`
        SELECT id, registrar_id, code, title, description, tlds, discount_type,
               discount_value, valid_from, valid_until, source_url, verified, status
        FROM public.coupons
        WHERE status = 'active'
      `),
    ]);
    const now = Date.now();
    const coupons = ((couponsRes.rows ?? []) as any[]).filter((c: any) => {
      if (c.valid_from && new Date(c.valid_from).getTime() > now) return false;
      if (c.valid_until && new Date(c.valid_until).getTime() < now) return false;
      if (c.tlds && Array.isArray(c.tlds) && c.tlds.length > 0 && !c.tlds.includes(tld))
        return false;
      return true;
    });

    const rows: PricingRow[] = (pricesRes.rows ?? []).map((row: any) => {
      // Match best coupon by registrar
      const cands = coupons.filter((c: any) => c.registrar_id === row.registrar_id);
      let best: (typeof cands)[number] | null = null;
      let bestPrice = row.register_price ?? null;
      for (const c of cands) {
        if (row.register_price == null) break;
        let p = row.register_price;
        if (c.discount_type === "percent" && c.discount_value)
          p = p * (1 - Number(c.discount_value) / 100);
        else if (c.discount_type === "fixed" && c.discount_value)
          p = Math.max(0, p - Number(c.discount_value));
        else if (c.discount_type === "price" && c.discount_value) p = Number(c.discount_value);
        if (bestPrice == null || p < bestPrice) {
          bestPrice = p;
          best = c;
        }
      }
      const buy_url =
        (row.buy_url_template as string | null)?.replace(
          "{domain}",
          data.domain ?? `example.${tld}`,
        ) ?? null;
      return {
        id: row.id,
        registrar_id: row.registrar_id,
        registrar_name: row.registrar_name ?? `#${row.registrar_id}`,
        registrar_slug: row.registrar_slug ?? null,
        buy_url_template: buy_url,
        tld: row.tld,
        register_price: row.register_price,
        renew_price: row.renew_price,
        transfer_price: row.transfer_price,
        currency: row.currency,
        privacy_free: row.privacy_free,
        api_supported: row.api_supported,
        notes: row.notes,
        coupon_code: best?.code ?? null,
        coupon_title: best?.title ?? null,
        discounted_price: bestPrice,
      };
    });

    // Recommend score: lower effective register + low renew + privacy_free + api
    const effPrices = rows.map((r) => r.discounted_price ?? r.register_price ?? Infinity);
    const minP = Math.min(...effPrices, Infinity);
    for (const r of rows) {
      const eff = r.discounted_price ?? r.register_price ?? Infinity;
      let score = 0;
      if (Number.isFinite(eff) && minP > 0) score += 60 * (minP / eff);
      if (
        r.renew_price != null &&
        r.register_price != null &&
        r.renew_price <= r.register_price * 1.5
      )
        score += 15;
      if (r.privacy_free) score += 15;
      if (r.api_supported) score += 10;
      r.recommend_score = Math.round(Math.min(100, score));
    }
    rows.sort((a, b) => (b.recommend_score ?? 0) - (a.recommend_score ?? 0));

    return { tld, rows, coupons };
  });

// ───────── Admin: bulk upsert prices ─────────
export const upsertPriceFn = createServerFn({ method: "POST" })
  .validator((d: any) =>
    z
      .object({
        id: z.number().optional(),
        registrar_id: z.number(),
        tld: z.string().min(1).max(40),
        register_price: z.number().nonnegative().nullable().optional(),
        renew_price: z.number().nonnegative().nullable().optional(),
        transfer_price: z.number().nonnegative().nullable().optional(),
        currency: z.string().max(8).default("USD"),
        privacy_free: z.boolean().optional(),
        api_supported: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureAdmin();
    const s = await sb();
    const payload = { ...data, tld: normTld(data.tld) };
    const { error } = data.id
      ? await s.from("registrar_prices").update(payload).eq("id", data.id)
      : await s.from("registrar_prices").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const deletePriceFn = createServerFn({ method: "POST" })
  .validator((d: { id: number }) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const { error } = await (await sb()).from("registrar_prices").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listPricesFn = createServerFn({ method: "GET" })
  .validator((d: { tld?: string } = {}) => z.object({ tld: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    await ensureAuth();
    const params: unknown[] = [];
    const where = data.tld ? "WHERE p.tld = $1" : "";
    if (data.tld) params.push(normTld(data.tld));
    const { rows } = await queryDb(
      `
      SELECT p.id, p.registrar_id, p.tld, p.register_price, p.renew_price,
             p.transfer_price, p.currency, p.privacy_free, p.api_supported,
             p.notes, r.name AS registrar_name
      FROM public.registrar_prices p
      LEFT JOIN public.registrars r ON r.id = p.registrar_id
      ${where}
      ORDER BY p.tld, p.register_price NULLS LAST
      LIMIT 500
    `,
      params,
    );
    return rows;
  });

// ───────── Coupons CRUD ─────────
export const listCouponsFn = createServerFn({ method: "GET" }).handler(async () => {
  await ensureAuth();
  const { rows } = await queryDb(`
      SELECT c.id, c.registrar_id, c.code, c.title, c.description, c.tlds,
             c.discount_type, c.discount_value, c.valid_from, c.valid_until,
             c.source_url, c.verified, c.status, r.name AS registrar_name
      FROM public.coupons c
      LEFT JOIN public.registrars r ON r.id = c.registrar_id
      ORDER BY c.status, c.valid_until NULLS LAST
      LIMIT 500
    `);
  return rows;
});

export const upsertCouponFn = createServerFn({ method: "POST" })
  .validator((d: any) =>
    z
      .object({
        id: z.number().optional(),
        registrar_id: z.number(),
        code: z.string().min(1).max(80),
        title: z.string().max(200).optional(),
        description: z.string().max(1000).optional(),
        tlds: z.array(z.string().max(40)).optional(),
        discount_type: z.enum(["percent", "fixed", "price"]),
        discount_value: z.number().nonnegative(),
        valid_from: z.string().optional().nullable(),
        valid_until: z.string().optional().nullable(),
        source_url: z.string().max(500).optional(),
        verified: z.boolean().optional(),
        status: z.enum(["active", "expired", "disabled"]).default("active"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureAdmin();
    const payload = { ...data, tlds: data.tlds?.map(normTld) };
    const { error } = data.id
      ? await (await sb()).from("coupons").update(payload).eq("id", data.id)
      : await (await sb()).from("coupons").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCouponFn = createServerFn({ method: "POST" })
  .validator((d: { id: number }) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const { error } = await (await sb()).from("coupons").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ───────── Registrar price sync (real-time API) ─────────
// Reads registrars where api_enabled=true and config_json.prices_url is set,
// fetches a JSON array `[{tld, register, renew?, transfer?, currency?}]`
// and upserts into registrar_prices.
type SyncResult = {
  registrar_id: number;
  registrar: string;
  ok: boolean;
  inserted: number;
  updated: number;
  error?: string;
};

async function syncOne(registrar: any): Promise<SyncResult> {
  const cfg = (registrar.config_json ?? {}) as Record<string, any>;
  const url: string | undefined = cfg.prices_url;
  const out: SyncResult = {
    registrar_id: registrar.id,
    registrar: registrar.name,
    ok: false,
    inserted: 0,
    updated: 0,
  };
  if (!url) {
    out.error = "缺少 config_json.prices_url";
    return out;
  }
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cfg.auth_header && cfg.auth_value) headers[cfg.auth_header] = cfg.auth_value;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const items: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw?.prices)
          ? raw.prices
          : [];
    const s = await sb();
    for (const it of items) {
      const tld = normTld(String(it.tld ?? it.extension ?? ""));
      if (!tld) continue;
      const payload = {
        registrar_id: registrar.id,
        tld,
        register_price:
          it.register != null
            ? Number(it.register)
            : it.register_price != null
              ? Number(it.register_price)
              : null,
        renew_price:
          it.renew != null
            ? Number(it.renew)
            : it.renew_price != null
              ? Number(it.renew_price)
              : null,
        transfer_price: it.transfer != null ? Number(it.transfer) : null,
        currency: it.currency ?? "USD",
      };
      const existing = await s
        .from("registrar_prices")
        .select("id")
        .eq("registrar_id", registrar.id)
        .eq("tld", tld)
        .maybeSingle();
      if (existing.data?.id) {
        await s.from("registrar_prices").update(payload).eq("id", existing.data.id);
        out.updated++;
      } else {
        await s.from("registrar_prices").insert(payload);
        out.inserted++;
      }
    }
    out.ok = true;
    return out;
  } catch (e: any) {
    out.error = e?.message ?? String(e);
    return out;
  }
}

export const syncRegistrarPricesFn = createServerFn({ method: "POST" })
  .validator((d: { registrarId?: number } = {}) =>
    z.object({ registrarId: z.number().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    await ensureAdmin();
    const s = await sb();
    let q = s
      .from("registrars")
      .select("id,name,enabled,config_json,api_enabled")
      .eq("enabled", true);
    if (data.registrarId) q = q.eq("id", data.registrarId);
    const { data: regs, error } = await q;
    if (error) throw error;
    const results: SyncResult[] = [];
    for (const r of regs ?? []) results.push(await syncOne(r));
    return {
      results,
      totalInserted: results.reduce((a, b) => a + b.inserted, 0),
      totalUpdated: results.reduce((a, b) => a + b.updated, 0),
    };
  });

// Internal helper used by the cron hook (no middleware).
export async function syncAllRegistrarPricesInternal() {
  const s = await sb();
  const { data: regs } = await s
    .from("registrars")
    .select("id,name,enabled,config_json,api_enabled")
    .eq("enabled", true);
  const results: SyncResult[] = [];
  for (const r of regs ?? []) results.push(await syncOne(r));
  return results;
}

// ───────── Purchase writeback → my_domains ─────────
export const recordPurchaseFn = createServerFn({ method: "POST" })
  .validator((d: any) =>
    z
      .object({
        domain: z.string().min(3).max(253),
        registrar: z.string().max(80).optional(),
        note: z.string().max(500).optional(),
        expiry_date: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await ensureAuth();
    const s = await sb();
    const domain = data.domain.trim().toLowerCase();
    const existing = await s.from("my_domains").select("id").eq("domain", domain).maybeSingle();
    if (existing.data?.id) {
      await s
        .from("my_domains")
        .update({
          registrar: data.registrar ?? null,
          note: data.note ?? null,
          expiry_date: data.expiry_date ?? null,
        })
        .eq("id", existing.data.id);
    } else {
      await s.from("my_domains").insert({
        domain,
        registrar: data.registrar ?? null,
        note: data.note ?? "通过价格对比页购买",
        expiry_date: data.expiry_date ?? null,
        tags: ["purchased"],
        renew_reminder: true,
      });
    }
    // Best-effort: queue an enrich job. Schema for enrich_jobs varies; failure is non-fatal.
    try {
      await s.from("enrich_jobs").insert({
        status: "queued",
        scope: "purchase",
        kinds: ["dns", "archive", "seo"],
        total: 1,
        name: `purchase:${domain}`,
      } as any);
      await s.from("enrich_items").insert({ domain, status: "queued" } as any);
    } catch {
      /* non-fatal */
    }
    return { ok: true, domain };
  });
