// Pricing comparison + coupons + purchase recommendations.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./admin-guard.server";

function sb() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tld: string; domain?: string }) =>
    z.object({ tld: z.string().min(1).max(40), domain: z.string().max(253).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const tld = normTld(data.tld);
    const s = sb();
    const [pricesRes, couponsRes] = await Promise.all([
      s.from("registrar_prices")
        .select("id,registrar_id,tld,register_price,renew_price,transfer_price,currency,privacy_free,api_supported,notes, registrars!inner(id,name,slug,enabled,buy_url_template,status)")
        .eq("tld", tld),
      s.from("coupons")
        .select("id,registrar_id,code,title,description,tlds,discount_type,discount_value,valid_from,valid_until,source_url,verified,status")
        .eq("status", "active"),
    ]);
    if (pricesRes.error) throw pricesRes.error;
    const now = Date.now();
    const coupons = (couponsRes.data ?? []).filter(c => {
      if (c.valid_from && new Date(c.valid_from).getTime() > now) return false;
      if (c.valid_until && new Date(c.valid_until).getTime() < now) return false;
      if (c.tlds && Array.isArray(c.tlds) && c.tlds.length > 0 && !c.tlds.includes(tld)) return false;
      return true;
    });

    const rows: PricingRow[] = (pricesRes.data ?? []).map((row: any) => {
      const r = row.registrars ?? {};
      // Match best coupon by registrar
      const cands = coupons.filter(c => c.registrar_id === row.registrar_id);
      let best: typeof cands[number] | null = null;
      let bestPrice = row.register_price ?? null;
      for (const c of cands) {
        if (row.register_price == null) break;
        let p = row.register_price;
        if (c.discount_type === "percent" && c.discount_value) p = p * (1 - Number(c.discount_value) / 100);
        else if (c.discount_type === "fixed" && c.discount_value) p = Math.max(0, p - Number(c.discount_value));
        else if (c.discount_type === "price" && c.discount_value) p = Number(c.discount_value);
        if (bestPrice == null || p < bestPrice) { bestPrice = p; best = c; }
      }
      const buy_url = (r.buy_url_template as string | null)?.replace("{domain}", data.domain ?? `example.${tld}`) ?? null;
      return {
        id: row.id,
        registrar_id: row.registrar_id,
        registrar_name: r.name ?? `#${row.registrar_id}`,
        registrar_slug: r.slug ?? null,
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
    const effPrices = rows.map(r => r.discounted_price ?? r.register_price ?? Infinity);
    const minP = Math.min(...effPrices, Infinity);
    for (const r of rows) {
      const eff = r.discounted_price ?? r.register_price ?? Infinity;
      let score = 0;
      if (Number.isFinite(eff) && minP > 0) score += 60 * (minP / eff);
      if (r.renew_price != null && r.register_price != null && r.renew_price <= r.register_price * 1.5) score += 15;
      if (r.privacy_free) score += 15;
      if (r.api_supported) score += 10;
      r.recommend_score = Math.round(Math.min(100, score));
    }
    rows.sort((a, b) => (b.recommend_score ?? 0) - (a.recommend_score ?? 0));

    return { tld, rows, coupons };
  });

// ───────── Admin: bulk upsert prices ─────────
export const upsertPriceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
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
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const s = sb();
    const payload = { ...data, tld: normTld(data.tld) };
    const { error } = data.id
      ? await s.from("registrar_prices").update(payload).eq("id", data.id)
      : await s.from("registrar_prices").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const deletePriceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await sb().from("registrar_prices").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listPricesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tld?: string } = {}) => z.object({ tld: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    let q = sb().from("registrar_prices")
      .select("id,registrar_id,tld,register_price,renew_price,transfer_price,currency,privacy_free,api_supported,notes,registrars(name)")
      .order("tld").order("register_price", { ascending: true, nullsFirst: false });
    if (data.tld) q = q.eq("tld", normTld(data.tld));
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;
    return rows ?? [];
  });

// ───────── Coupons CRUD ─────────
export const listCouponsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await sb().from("coupons")
      .select("id,registrar_id,code,title,description,tlds,discount_type,discount_value,valid_from,valid_until,source_url,verified,status,registrars(name)")
      .order("status").order("valid_until", { ascending: true, nullsFirst: false }).limit(500);
    if (error) throw error;
    return data ?? [];
  });

export const upsertCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
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
  }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = { ...data, tlds: data.tlds?.map(normTld) };
    const { error } = data.id
      ? await sb().from("coupons").update(payload).eq("id", data.id)
      : await sb().from("coupons").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCouponFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => z.object({ id: z.number() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await sb().from("coupons").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
