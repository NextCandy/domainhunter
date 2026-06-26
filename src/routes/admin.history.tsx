import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listAdminHistoryFn } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/history")({ component: AdminHistory });

type Kind = "rdap" | "enrich";
const STATUSES = ["all", "pending", "running", "completed", "failed", "stopped"] as const;

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function AdminHistory() {
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [from, setFrom] = useState<string>(todayISO(-30));
  const [to, setTo] = useState<string>(todayISO(1));
  const [q, setQ] = useState("");

  const range = useMemo(() => ({
    fromIso: from ? new Date(from + "T00:00:00Z").toISOString() : null,
    toIso: to ? new Date(to + "T00:00:00Z").toISOString() : null,
  }), [from, to]);

  const rdapQ = useQuery({
    queryKey: ["admin-history-rdap", status, range.fromIso, range.toIso],
    queryFn: async () => {
      const rows = await listAdminHistoryFn({ data: { kind: "jobs", status, fromIso: range.fromIso, toIso: range.toIso } });
      return (rows ?? []).map((j: any) => ({ ...j, _kind: "rdap" as const }));
    },
    refetchInterval: 8000,
  });

  const enrichQ = useQuery({
    queryKey: ["admin-history-enrich", status, range.fromIso, range.toIso],
    queryFn: async () => {
      const rows = await listAdminHistoryFn({ data: { kind: "enrich_jobs", status, fromIso: range.fromIso, toIso: range.toIso } });
      return (rows ?? []).map((j: any) => ({ ...j, _kind: "enrich" as const }));
    },
    refetchInterval: 8000,
  });

  const rows = useMemo(() => {
    const a = kind === "enrich" ? [] : (rdapQ.data ?? []);
    const b = kind === "rdap" ? [] : (enrichQ.data ?? []);
    const merged = [...a, ...b].sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
    const needle = q.trim().toLowerCase();
    return needle ? merged.filter(r => (r.name ?? "").toLowerCase().includes(needle) || r.id?.includes(needle)) : merged;
  }, [rdapQ.data, enrichQ.data, kind, q]);

  const loading = rdapQ.isLoading || enrichQ.isLoading;

  return (
    <div className="space-y-4">
      <section className="card-elev p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="任务类型">
            <select className="field" value={kind} onChange={e => setKind(e.target.value as any)}>
              <option value="all">全部</option>
              <option value="rdap">RDAP 批量</option>
              <option value="enrich">Enrich (DNS/Archive/SEO)</option>
            </select>
          </Field>
          <Field label="状态">
            <select className="field" value={status} onChange={e => setStatus(e.target.value as any)}>
              {STATUSES.map(s => <option key={s} value={s}>{s === "all" ? "全部状态" : s}</option>)}
            </select>
          </Field>
          <Field label="开始日期">
            <input type="date" className="field" value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="结束日期">
            <input type="date" className="field" value={to} onChange={e => setTo(e.target.value)} />
          </Field>
          <Field label="名称 / ID 搜索">
            <input className="field" value={q} onChange={e => setQ(e.target.value)} placeholder="任务名 或 UUID 片段" />
          </Field>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>共 {rows.length} 条 · 每 8s 自动刷新</span>
          <button className="btn-base btn-ghost text-xs" onClick={() => { setKind("all"); setStatus("all"); setFrom(todayISO(-30)); setTo(todayISO(1)); setQ(""); }}>重置筛选</button>
        </div>
      </section>

      <div className="card-elev overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">类型</th>
                <th className="px-3 py-2 text-left font-medium">名称</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">进度</th>
                <th className="px-3 py-2 text-right font-medium">命中/可注册</th>
                <th className="px-3 py-2 text-right font-medium">错误</th>
                <th className="px-3 py-2 text-left font-medium">创建时间</th>
                <th className="px-3 py-2 text-right font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">加载中…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">无匹配记录</td></tr>}
              {rows.map((j: any) => {
                const total = j.total ?? 0;
                const done = j._kind === "rdap" ? (j.checked ?? 0) : (j.done ?? 0) + (j.cached_hits ?? 0);
                const errors = j._kind === "rdap" ? (j.errors ?? 0) : (j.failed ?? 0);
                const hit = j._kind === "rdap" ? (j.available ?? 0) : (j.cached_hits ?? 0);
                const href = j._kind === "rdap" ? `/tools/batch-rdap?jobId=${j.id}` : `/enrich/${j.id}`;
                return (
                  <tr key={j._kind + j.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2"><span className={`chip ${j._kind === "rdap" ? "" : "bg-primary/15 text-primary"}`}>{j._kind === "rdap" ? "RDAP" : "Enrich"}</span></td>
                    <td className="px-3 py-2 font-medium">{j.name ?? "—"}{j._kind === "enrich" && j.kinds?.length ? <span className="ml-1.5 text-[10px] text-muted-foreground">[{j.kinds.join("/")}]</span> : null}</td>
                    <td className="px-3 py-2"><span className={`chip ${statusClass(j.status)}`}>{j.status}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{done}/{total}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{hit}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{errors}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to={href} className="text-primary hover:underline">查看 →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function statusClass(s: string) {
  switch (s) {
    case "completed": return "bg-success/15 text-success";
    case "running": return "bg-primary/15 text-primary";
    case "failed": return "bg-destructive/15 text-destructive";
    case "stopped": return "bg-warning/15 text-warning";
    default: return "";
  }
}
