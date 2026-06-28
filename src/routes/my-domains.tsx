import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader, EmptyState } from "@/components/app-shell";
import { CardSkeleton } from "@/components/skeleton";
import { ImportPanel } from "@/components/import-panel";
import { ApiImportPanel } from "@/components/api-import-panel";
import { listMyDomainsFn, upsertMyDomainFn, removeMyDomainFn, importMyDomainsFn, importMyDomainsFromApiFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/my-domains")({
  component: MyDomainsPage,
});

function MyDomainsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-domains"], queryFn: () => listMyDomainsFn() });
  const [form, setForm] = useState({ domain: "", registrar: "", expiry_date: "", note: "", tags: "" });

  const addMut = useMutation({
    mutationFn: (f: typeof form) => upsertMyDomainFn({ data: {
      domain: f.domain, registrar: f.registrar || undefined,
      expiry_date: f.expiry_date || undefined, note: f.note || undefined,
      tags: f.tags ? f.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined,
    } }),
    onSuccess: () => { toast.success("已保存"); setForm({ domain: "", registrar: "", expiry_date: "", note: "", tags: "" }); qc.invalidateQueries({ queryKey: ["my-domains"] }); },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => removeMyDomainFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-domains"] }),
  });

  // ── Client-side sorting ──
  const [sort, setSort] = useState<{ by: string; dir: "asc" | "desc" }>({ by: "expiry_date", dir: "asc" });
  const toggleSort = (by: string) => setSort(s => s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "asc" });
  const sortIcon = (by: string) => sort.by === by ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
  const isDate = (by: string) => by === "registration_date" || by === "expiry_date";
  const sorted = [...(data ?? [])].sort((a: any, b: any) => {
    const av = a?.[sort.by] ?? null, bv = b?.[sort.by] ?? null;
    let r: number;
    if (av == null && bv == null) r = 0;
    else if (av == null) r = 1;
    else if (bv == null) r = -1;
    else if (isDate(sort.by)) r = new Date(av).getTime() - new Date(bv).getTime();
    else r = String(av).localeCompare(String(bv), "zh");
    return sort.dir === "asc" ? r : -r;
  });
  const fmtDate = (s?: string | null) => { if (!s) return "—"; try { return new Date(s).toISOString().slice(0, 10); } catch { return "—"; } };

  return (
    <AppShell>
      <PageHeader title="我的域名" description="管理已购买的域名，到期前可手动提醒。" />

      <div className="mb-4 flex flex-wrap items-start gap-2">
        <ImportPanel
          title="批量导入到我的域名"
          onImport={(text) => importMyDomainsFn({ data: { text } })}
          onDone={() => qc.invalidateQueries({ queryKey: ["my-domains"] })}
        />
        <ApiImportPanel
          onImport={(args) => importMyDomainsFromApiFn({ data: args })}
          onDone={() => qc.invalidateQueries({ queryKey: ["my-domains"] })}
        />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); if (!form.domain) return; addMut.mutate(form); }}
        className="card-elev mb-6 grid grid-cols-1 gap-2 p-3 sm:grid-cols-[1.5fr_1fr_1fr_2fr_1fr_auto]"
      >
        <input value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="example.com" className="field" />
        <input value={form.registrar} onChange={e => setForm({ ...form, registrar: e.target.value })} placeholder="注册商" className="field" />
        <input value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} type="date" className="field" />
        <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="备注" className="field" />
        <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="标签1,标签2" className="field" />
        <button type="submit" className="btn-base btn-primary"><Plus className="h-4 w-4" />添加</button>
      </form>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} lines={2} />)}
        </div>
      ) : !data?.length ? (
        <EmptyState title="还没有添加任何已购域名" hint="使用上方表单添加。" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card-elev hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="cursor-pointer px-4 py-2 text-left font-medium" onClick={() => toggleSort("domain")}>域名{sortIcon("domain")}</th>
                    <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => toggleSort("registrar")}>注册商{sortIcon("registrar")}</th>
                    <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => toggleSort("registration_date")}>注册日期{sortIcon("registration_date")}</th>
                    <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => toggleSort("expiry_date")}>到期日期{sortIcon("expiry_date")}</th>
                    <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => toggleSort("dns_status")}>DNS{sortIcon("dns_status")}</th>
                    <th className="px-3 py-2 text-left font-medium">标签</th>
                    <th className="px-3 py-2 text-left font-medium">备注</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d: any) => (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                      <td className="px-4 py-2 font-medium">{d.domain}</td>
                      <td className="px-3 py-2 text-muted-foreground">{d.registrar ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmtDate(d.registration_date)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{fmtDate(d.expiry_date)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{d.dns_status ?? "—"}</td>
                      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{(d.tags ?? []).map((t: string) => <span key={t} className="chip">{t}</span>)}</div></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{d.note ?? "—"}</td>
                      <td className="px-4 py-2 text-right"><button onClick={() => delMut.mutate(d.id)} className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>排序：</span>
              {[["expiry_date", "到期"], ["registration_date", "注册"], ["domain", "域名"], ["registrar", "注册商"]].map(([by, lbl]) => (
                <button key={by} onClick={() => toggleSort(by)} className={`rounded-md border px-2 py-0.5 ${sort.by === by ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{lbl}{sortIcon(by)}</button>
              ))}
            </div>
            {sorted.map((d: any) => (
              <div key={d.id} className="card-elev p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold">{d.domain}</span>
                  <button onClick={() => delMut.mutate(d.id)} className="shrink-0 grid h-6 w-6 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>注册商：{d.registrar ?? "—"}</span>
                  <span>DNS：{d.dns_status ?? "—"}</span>
                  <span>注册：{fmtDate(d.registration_date)}</span>
                  <span>到期：{fmtDate(d.expiry_date)}</span>
                </div>
                {(d.tags?.length || d.note) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {(d.tags ?? []).map((t: string) => <span key={t} className="chip">{t}</span>)}
                    {d.note && <span className="text-xs text-muted-foreground">{d.note}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
