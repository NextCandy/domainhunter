import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { listPricesFn, upsertPriceFn, deletePriceFn, listCouponsFn, upsertCouponFn, deleteCouponFn, syncRegistrarPricesFn } from "@/lib/pricing.functions";
import { listRegistrarsFn } from "@/lib/discover.functions";

export const Route = createFileRoute("/admin/pricing")({
  component: AdminPricing,
});

function AdminPricing() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"prices" | "coupons">("prices");
  const [tldFilter, setTldFilter] = useState("");

  const registrars = useQuery({ queryKey: ["registrars"], queryFn: () => listRegistrarsFn() });
  const prices = useQuery({ queryKey: ["prices", tldFilter], queryFn: () => listPricesFn({ data: { tld: tldFilter || undefined } }) });
  const coupons = useQuery({ queryKey: ["coupons-admin"], queryFn: () => listCouponsFn() });

  const regOpts = (registrars.data ?? []) as Array<{ id: number; name: string }>;

  const [pf, setPf] = useState({ registrar_id: 0, tld: "", register_price: "", renew_price: "", transfer_price: "", currency: "USD", privacy_free: false, api_supported: false, notes: "" });
  const savePrice = useMutation({
    mutationFn: () => upsertPriceFn({ data: {
      registrar_id: Number(pf.registrar_id),
      tld: pf.tld,
      register_price: pf.register_price ? Number(pf.register_price) : null,
      renew_price: pf.renew_price ? Number(pf.renew_price) : null,
      transfer_price: pf.transfer_price ? Number(pf.transfer_price) : null,
      currency: pf.currency || "USD",
      privacy_free: pf.privacy_free,
      api_supported: pf.api_supported,
      notes: pf.notes || undefined,
    } }),
    onSuccess: () => { toast.success("价格已保存"); qc.invalidateQueries({ queryKey: ["prices"] }); setPf({ ...pf, tld: "", register_price: "", renew_price: "", transfer_price: "", notes: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });
  const delPrice = useMutation({
    mutationFn: (id: number) => deletePriceFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prices"] }),
  });

  const [cf, setCf] = useState({ registrar_id: 0, code: "", title: "", description: "", tlds: "", discount_type: "percent" as "percent"|"fixed"|"price", discount_value: "", valid_until: "", verified: true, status: "active" as "active"|"expired"|"disabled" });
  const saveCoupon = useMutation({
    mutationFn: () => upsertCouponFn({ data: {
      registrar_id: Number(cf.registrar_id),
      code: cf.code,
      title: cf.title || undefined,
      description: cf.description || undefined,
      tlds: cf.tlds ? cf.tlds.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean) : undefined,
      discount_type: cf.discount_type,
      discount_value: Number(cf.discount_value || 0),
      valid_until: cf.valid_until || null,
      verified: cf.verified,
      status: cf.status,
    } }),
    onSuccess: () => { toast.success("优惠码已保存"); qc.invalidateQueries({ queryKey: ["coupons-admin"] }); setCf({ ...cf, code: "", title: "", description: "", tlds: "", discount_value: "", valid_until: "" }); },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });
  const delCoupon = useMutation({
    mutationFn: (id: number) => deleteCouponFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coupons-admin"] }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncRegistrarPricesFn({ data: {} }),
    onSuccess: (r: any) => {
      toast.success(`同步完成：新增 ${r.totalInserted} · 更新 ${r.totalUpdated}`);
      qc.invalidateQueries({ queryKey: ["prices"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "同步失败"),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => setTab("prices")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "prices" ? "bg-primary text-primary-foreground" : "bg-surface ring-1 ring-border"}`}>价格表</button>
        <button onClick={() => setTab("coupons")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "coupons" ? "bg-primary text-primary-foreground" : "bg-surface ring-1 ring-border"}`}>优惠码</button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending} className="btn-base btn-primary text-xs">
            {syncMut.isPending ? "同步中…" : "立即同步注册商 API"}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">提示：在注册商管理中给启用的注册商配置 <code>config_json.prices_url</code>（可选 <code>auth_header</code>/<code>auth_value</code>），定时任务每小时自动同步。</p>


      {tab === "prices" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
          <section className="card-elev p-5">
            <h3 className="mb-3 text-sm font-semibold">新增 / 更新价格</h3>
            <div className="space-y-2 text-sm">
              <select value={pf.registrar_id} onChange={e => setPf({ ...pf, registrar_id: Number(e.target.value) })} className="field">
                <option value={0}>选择注册商…</option>
                {regOpts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="TLD (com)" value={pf.tld} onChange={e => setPf({ ...pf, tld: e.target.value })} className="field" />
                <input placeholder="货币 USD" value={pf.currency} onChange={e => setPf({ ...pf, currency: e.target.value })} className="field" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="注册价" value={pf.register_price} onChange={e => setPf({ ...pf, register_price: e.target.value })} className="field" />
                <input placeholder="续费价" value={pf.renew_price} onChange={e => setPf({ ...pf, renew_price: e.target.value })} className="field" />
                <input placeholder="转入价" value={pf.transfer_price} onChange={e => setPf({ ...pf, transfer_price: e.target.value })} className="field" />
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={pf.privacy_free} onChange={e => setPf({ ...pf, privacy_free: e.target.checked })} />免费隐私</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={pf.api_supported} onChange={e => setPf({ ...pf, api_supported: e.target.checked })} />API 可用</label>
              </div>
              <input placeholder="备注" value={pf.notes} onChange={e => setPf({ ...pf, notes: e.target.value })} className="field" />
              <button disabled={!pf.registrar_id || !pf.tld || savePrice.isPending} onClick={() => savePrice.mutate()} className="btn-base btn-primary w-full"><Save className="h-4 w-4" />保存</button>
            </div>
          </section>

          <section className="card-elev overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h3 className="text-sm font-semibold">现有价格</h3>
              <input placeholder="筛选 TLD" value={tldFilter} onChange={e => setTldFilter(e.target.value)} className="field h-7 w-32 text-xs" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">注册商</th><th className="px-3 py-2">TLD</th><th className="px-3 py-2 text-right">注册</th><th className="px-3 py-2 text-right">续费</th><th className="px-3 py-2">货币</th><th></th></tr>
                </thead>
                <tbody>
                  {(prices.data ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t border-border/50">
                      <td className="px-3 py-1.5">{p.registrar_name ?? `#${p.registrar_id}`}</td>
                      <td className="px-3 py-1.5 text-center">.{p.tld}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{p.register_price ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{p.renew_price ?? "—"}</td>
                      <td className="px-3 py-1.5 text-center">{p.currency}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => delPrice.mutate(p.id)} className="text-destructive hover:underline"><Trash2 className="inline h-3 w-3" /></button>
                      </td>
                    </tr>
                  ))}
                  {(prices.data ?? []).length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">暂无数据</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "coupons" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
          <section className="card-elev p-5">
            <h3 className="mb-3 text-sm font-semibold">新增优惠码</h3>
            <div className="space-y-2 text-sm">
              <select value={cf.registrar_id} onChange={e => setCf({ ...cf, registrar_id: Number(e.target.value) })} className="field">
                <option value={0}>选择注册商…</option>
                {regOpts.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input placeholder="优惠码 (CODE)" value={cf.code} onChange={e => setCf({ ...cf, code: e.target.value })} className="field font-mono" />
              <input placeholder="标题" value={cf.title} onChange={e => setCf({ ...cf, title: e.target.value })} className="field" />
              <textarea placeholder="描述" value={cf.description} onChange={e => setCf({ ...cf, description: e.target.value })} className="field min-h-[60px]" />
              <input placeholder="适用 TLD (逗号分隔, 留空=全部)" value={cf.tlds} onChange={e => setCf({ ...cf, tlds: e.target.value })} className="field" />
              <div className="grid grid-cols-2 gap-2">
                <select value={cf.discount_type} onChange={e => setCf({ ...cf, discount_type: e.target.value as any })} className="field">
                  <option value="percent">百分比 -%</option>
                  <option value="fixed">固定减额</option>
                  <option value="price">直接定价</option>
                </select>
                <input placeholder="数值" value={cf.discount_value} onChange={e => setCf({ ...cf, discount_value: e.target.value })} className="field" />
              </div>
              <input type="date" value={cf.valid_until} onChange={e => setCf({ ...cf, valid_until: e.target.value })} className="field" />
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={cf.verified} onChange={e => setCf({ ...cf, verified: e.target.checked })} />已验证</label>
                <select value={cf.status} onChange={e => setCf({ ...cf, status: e.target.value as any })} className="field h-7 w-auto text-xs">
                  <option value="active">启用</option>
                  <option value="disabled">禁用</option>
                  <option value="expired">已过期</option>
                </select>
              </div>
              <button disabled={!cf.registrar_id || !cf.code || saveCoupon.isPending} onClick={() => saveCoupon.mutate()} className="btn-base btn-primary w-full"><Plus className="h-4 w-4" />保存</button>
            </div>
          </section>

          <section className="card-elev overflow-hidden">
            <header className="border-b border-border px-4 py-2 text-sm font-semibold">现有优惠码</header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">注册商</th><th className="px-3 py-2">码</th><th className="px-3 py-2">类型</th><th className="px-3 py-2 text-right">值</th><th className="px-3 py-2">TLD</th><th className="px-3 py-2">截止</th><th className="px-3 py-2">状态</th><th></th></tr>
                </thead>
                <tbody>
                  {(coupons.data ?? []).map((c: any) => (
                    <tr key={c.id} className="border-t border-border/50">
                      <td className="px-3 py-1.5">{c.registrar_name ?? `#${c.registrar_id}`}</td>
                      <td className="px-3 py-1.5 font-mono">{c.code}</td>
                      <td className="px-3 py-1.5">{c.discount_type}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{c.discount_value}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{(c.tlds ?? []).join(",") || "*"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{c.valid_until ? new Date(c.valid_until).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-1.5">{c.status}</td>
                      <td className="px-3 py-1.5 text-right"><button onClick={() => delCoupon.mutate(c.id)} className="text-destructive"><Trash2 className="inline h-3 w-3" /></button></td>
                    </tr>
                  ))}
                  {(coupons.data ?? []).length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">暂无数据</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
