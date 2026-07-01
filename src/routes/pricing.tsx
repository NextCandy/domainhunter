import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Search, ExternalLink, Tag, Sparkles, ShieldCheck, Zap, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader, EmptyState } from "@/components/app-shell";
import { TableSkeleton } from "@/components/skeleton";
import { compareTldFn, recordPurchaseFn } from "@/lib/pricing.functions";

const searchSchema = z.object({
  tld: z.string().optional(),
  domain: z.string().optional(),
});

export const Route = createFileRoute("/pricing")({
  validateSearch: (s) => searchSchema.parse(s),
  component: () => (
    <AppShell>
      <PricingPage />
    </AppShell>
  ),
});

const QUICK_TLDS = ["com", "net", "org", "io", "ai", "app", "dev", "co", "xyz", "me"];

function fmtPrice(p: number | null | undefined, ccy: string | null | undefined) {
  if (p == null) return "—";
  return `${ccy ?? "USD"} ${Number(p).toFixed(2)}`;
}

function PricingPage() {
  const search = Route.useSearch();
  const initTld = (search.tld ?? "com").replace(/^\./, "");
  const initDomain = search.domain ?? "";
  const [tld, setTld] = useState(initTld);
  const [domain, setDomain] = useState(initDomain);
  const [submitted, setSubmitted] = useState<{ tld: string; domain?: string }>({
    tld: initTld,
    domain: initDomain || undefined,
  });

  // Re-sync when query string changes (e.g. from /ideas)
  useEffect(() => {
    const t = (search.tld ?? "com").replace(/^\./, "");
    const d = search.domain ?? "";
    setTld(t);
    setDomain(d);
    setSubmitted({ tld: t, domain: d || undefined });
  }, [search.tld, search.domain]);

  const q = useQuery({
    queryKey: ["compare", submitted.tld, submitted.domain],
    queryFn: () => compareTldFn({ data: submitted }),
  });

  const buyMut = useMutation({
    mutationFn: (v: { domain: string; registrar: string }) => recordPurchaseFn({ data: v }),
    onSuccess: (r) => toast.success(`已记录购买：${r.domain}（已加入"我的域名"并触发丰富抓取）`),
    onError: (e: any) => toast.error(e?.message ?? "记录失败"),
  });

  const rows = q.data?.rows ?? [];
  const coupons = q.data?.coupons ?? [];
  const best = rows[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="价格对比与购买建议"
        description="按 TLD 对比各注册商的注册/续费价格，自动应用可用优惠码并给出推荐评分。"
      />

      <section className="card-elev p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">TLD 后缀</label>
            <input
              value={tld}
              onChange={(e) => setTld(e.target.value.replace(/^\./, ""))}
              placeholder="com"
              className="field"
            />
          </div>
          <div className="self-end pb-1 text-xs text-muted-foreground">·</div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              要查询的完整域名（可选，用于生成购买链接）
            </label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              className="field"
            />
          </div>
          <div className="self-end">
            <button
              onClick={() =>
                setSubmitted({ tld: tld.trim() || "com", domain: domain.trim() || undefined })
              }
              className="btn-base btn-primary w-full"
              disabled={q.isFetching}
            >
              <Search className="h-4 w-4" />
              对比价格
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">快速选择：</span>
          {QUICK_TLDS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTld(t);
                setSubmitted({ tld: t, domain: domain.trim() || undefined });
              }}
              className={`rounded px-2 py-0.5 text-xs ring-1 ring-inset ${submitted.tld === t ? "bg-primary/10 text-primary ring-primary/30" : "bg-surface text-muted-foreground ring-border hover:text-foreground"}`}
            >
              .{t}
            </button>
          ))}
        </div>
      </section>

      {best && (
        <section className="card-elev border-success/30 bg-success/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Sparkles className="h-5 w-5 text-success" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium uppercase text-success">推荐购买</div>
              <div className="mt-0.5 text-lg font-semibold">
                {best.registrar_name} ·{" "}
                {fmtPrice(best.discounted_price ?? best.register_price, best.currency)}
                {best.coupon_code && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    优惠码{" "}
                    <code className="rounded bg-surface px-1.5 py-0.5 text-xs">
                      {best.coupon_code}
                    </code>
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                续费 {fmtPrice(best.renew_price, best.currency)} · 评分 {best.recommend_score}/100
                {best.privacy_free && (
                  <span className="ml-2 inline-flex items-center gap-1 text-success">
                    <ShieldCheck className="h-3 w-3" />
                    免费隐私保护
                  </span>
                )}
                {best.api_supported && (
                  <span className="ml-2 inline-flex items-center gap-1 text-primary">
                    <Zap className="h-3 w-3" />
                    API 可用
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {best.buy_url_template && (
                <a
                  href={best.buy_url_template}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-base btn-primary"
                >
                  前往购买
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {submitted.domain && (
                <button
                  onClick={() =>
                    buyMut.mutate({ domain: submitted.domain!, registrar: best.registrar_name })
                  }
                  disabled={buyMut.isPending}
                  className="btn-base"
                  title="标记已购买 → 加入我的域名"
                >
                  <ShoppingCart className="h-4 w-4" />
                  标记已购
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="card-elev overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">所有注册商 · .{submitted.tld}</h3>
          <span className="text-xs text-muted-foreground">{rows.length} 个</span>
        </header>
        {q.isLoading ? (
          <table className="w-full text-sm">
            <tbody>
              <TableSkeleton rows={5} cols={8} />
            </tbody>
          </table>
        ) : rows.length === 0 ? (
          <EmptyState
            title="暂无该 TLD 的价格数据"
            hint="可前往 后台 → 价格管理 添加各注册商的价格。"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">注册商</th>
                  <th className="px-4 py-2 text-right">注册价</th>
                  <th className="px-4 py-2 text-right">续费价</th>
                  <th className="px-4 py-2 text-right">转入价</th>
                  <th className="px-4 py-2 text-left">优惠</th>
                  <th className="px-4 py-2 text-left">特性</th>
                  <th className="px-4 py-2 text-right">推荐分</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-accent/40">
                    <td className="px-4 py-2 font-medium">{r.registrar_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.discounted_price != null &&
                      r.register_price != null &&
                      r.discounted_price < r.register_price ? (
                        <>
                          <span className="text-success font-semibold">
                            {fmtPrice(r.discounted_price, r.currency)}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground line-through">
                            {fmtPrice(r.register_price, r.currency)}
                          </span>
                        </>
                      ) : (
                        <span>{fmtPrice(r.register_price, r.currency)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtPrice(r.renew_price, r.currency)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtPrice(r.transfer_price, r.currency)}
                    </td>
                    <td className="px-4 py-2">
                      {r.coupon_code ? (
                        <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
                          <Tag className="h-3 w-3" />
                          {r.coupon_code}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.privacy_free && (
                        <span className="mr-2 inline-flex items-center gap-1 text-success">
                          <ShieldCheck className="h-3 w-3" />
                          隐私
                        </span>
                      )}
                      {r.api_supported && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Zap className="h-3 w-3" />
                          API
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      {r.recommend_score}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.buy_url_template && (
                          <a
                            href={r.buy_url_template}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            购买
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {submitted.domain && (
                          <button
                            onClick={() =>
                              buyMut.mutate({
                                domain: submitted.domain!,
                                registrar: r.registrar_name,
                              })
                            }
                            disabled={buyMut.isPending}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground ring-1 ring-inset ring-border hover:text-foreground"
                            title="记录购买并加入我的域名"
                          >
                            <ShoppingCart className="h-3 w-3" />
                            标记已购
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-elev p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Tag className="h-4 w-4" />
          当前可用优惠码
        </h3>
        {coupons.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无该 TLD 的可用优惠。</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {coupons.map((c: any) => (
              <li key={c.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <code className="rounded bg-accent px-1.5 py-0.5 text-xs font-semibold">
                    {c.code}
                  </code>
                  <span className="text-xs text-muted-foreground">
                    {c.discount_type === "percent"
                      ? `-${c.discount_value}%`
                      : c.discount_type === "fixed"
                        ? `-${c.discount_value}`
                        : `=${c.discount_value}`}
                  </span>
                </div>
                {c.title && <div className="mt-1 text-xs font-medium">{c.title}</div>}
                {c.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{c.description}</div>
                )}
                {c.valid_until && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    有效期至 {new Date(c.valid_until).toLocaleDateString()}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
