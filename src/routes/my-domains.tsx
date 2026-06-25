import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader, EmptyState } from "@/components/app-shell";
import { listMyDomainsFn, upsertMyDomainFn, removeMyDomainFn } from "@/lib/discover.functions";
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

  return (
    <AppShell>
      <PageHeader title="我的域名" description="管理已购买的域名，到期前可手动提醒。" />

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
        <div className="card-elev p-8 text-center text-sm text-muted-foreground">加载中…</div>
      ) : !data?.length ? (
        <EmptyState title="还没有添加任何已购域名" hint="使用上方表单添加。" />
      ) : (
        <div className="card-elev overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">域名</th>
                  <th className="px-3 py-2 text-left font-medium">注册商</th>
                  <th className="px-3 py-2 text-left font-medium">到期时间</th>
                  <th className="px-3 py-2 text-left font-medium">标签</th>
                  <th className="px-3 py-2 text-left font-medium">备注</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((d: any) => (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2 font-medium">{d.domain}</td>
                    <td className="px-3 py-2 text-muted-foreground">{d.registrar ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.expiry_date ? new Date(d.expiry_date).toISOString().slice(0,10) : "—"}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{(d.tags ?? []).map((t: string) => <span key={t} className="chip">{t}</span>)}</div></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.note ?? "—"}</td>
                    <td className="px-4 py-2 text-right"><button onClick={() => delMut.mutate(d.id)} className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
