import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, PageHeader, StatCard } from "@/components/app-shell";
import { listEnrichJobsFn, createEnrichJobFn, ENRICH_LIMITS } from "@/lib/enrich-jobs.functions";
import { toast } from "sonner";
import { Play, Plus } from "lucide-react";

export const Route = createFileRoute("/enrich")({ component: EnrichListPage });

function EnrichListPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: jobs } = useQuery({
    queryKey: ["enrich-jobs"],
    queryFn: () => listEnrichJobsFn(),
    refetchInterval: 3000,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [domainsText, setDomainsText] = useState("");
  const [kinds, setKinds] = useState<string[]>(["dns", "archive"]);
  const [qps, setQps] = useState<number>(ENRICH_LIMITS.qps.default);
  const [conc, setConc] = useState<number>(ENRICH_LIMITS.concurrency.default);
  const [ttlH, setTtlH] = useState<number>(24);

  const createMut = useMutation({
    mutationFn: () => {
      const list = domainsText.split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!name.trim()) throw new Error("请填写任务名称");
      if (list.length === 0) throw new Error("请填写至少一个域名");
      if (kinds.length === 0) throw new Error("请至少选择一种抓取类型");
      return createEnrichJobFn({ data: {
        name: name.trim(), domains: list, kinds: kinds as any, scope: "manual",
        concurrency: conc, qps, cacheTtlSeconds: ttlH * 3600,
      }});
    },
    onSuccess: (r) => {
      toast.success(`已创建任务：${r.total} 项`);
      setShowForm(false); setName(""); setDomainsText("");
      qc.invalidateQueries({ queryKey: ["enrich-jobs"] });
      nav({ to: "/enrich/$id", params: { id: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "创建失败"),
  });

  const list = jobs ?? [];
  const totalDone = list.reduce((s: number, j: any) => s + j.done + j.cached_hits, 0);
  const totalAll = list.reduce((s: number, j: any) => s + j.total, 0);
  const running = list.filter((j: any) => j.status === "running").length;

  return (
    <AppShell>
      <PageHeader title="丰富抓取任务" description="DNS / Archive / SEO 批量抓取，带缓存与断点续查"
        actions={<button onClick={() => setShowForm(v => !v)} className="btn-base btn-primary"><Plus className="h-4 w-4" />新建任务</button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="任务总数" value={list.length} />
        <StatCard label="进行中" value={running} tone={running > 0 ? "primary" : "default"} />
        <StatCard label="已处理项" value={totalDone.toLocaleString()} tone="success" />
        <StatCard label="总项数" value={totalAll.toLocaleString()} />
      </div>

      {showForm && (
        <div className="card-elev mb-6 space-y-3 p-4">
          <h3 className="text-sm font-semibold">新建丰富抓取任务</h3>
          <input className="field w-full" placeholder="任务名称" value={name} onChange={e => setName(e.target.value)} />
          <textarea className="field min-h-[120px] w-full font-mono text-xs" placeholder="域名列表，一行一个 / 用空格或逗号分隔" value={domainsText} onChange={e => setDomainsText(e.target.value)} />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">抓取类型：
              {["dns","archive","seo"].map(k => (
                <label key={k} className="flex items-center gap-1">
                  <input type="checkbox" checked={kinds.includes(k)} onChange={e => setKinds(s => e.target.checked ? [...s, k] : s.filter(x => x !== k))} />{k.toUpperCase()}
                </label>
              ))}
            </div>
            <NumField label="并发" v={conc} setV={setConc} min={ENRICH_LIMITS.concurrency.min} max={ENRICH_LIMITS.concurrency.max} />
            <NumField label="QPS" v={qps} setV={setQps} min={ENRICH_LIMITS.qps.min} max={ENRICH_LIMITS.qps.max} />
            <NumField label="缓存(小时)" v={ttlH} setV={setTtlH} min={1} max={720} />
          </div>
          <p className="text-xs text-muted-foreground">SEO 抓取需要 Semrush 连接器；未配置时该类型会被自动跳过并写入短期缓存。</p>
          <div className="flex gap-2">
            <button disabled={createMut.isPending} onClick={() => createMut.mutate()} className="btn-base btn-primary">{createMut.isPending ? "提交中…" : "创建"}</button>
            <button onClick={() => setShowForm(false)} className="btn-base btn-ghost">取消</button>
          </div>
        </div>
      )}

      <div className="card-elev overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">任务</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">进度</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">暂无任务</td></tr>
            )}
            {list.map((j: any) => {
              const processed = j.done + j.cached_hits + j.failed;
              const pct = j.total > 0 ? Math.round((processed / j.total) * 100) : 0;
              return (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link to="/enrich/$id" params={{ id: j.id }} className="font-medium text-primary hover:underline">{j.name}</Link>
                    <div className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{(j.kinds ?? []).join(", ")}</td>
                  <td className="px-3 py-2"><StatusPill s={j.status} /></td>
                  <td className="px-3 py-2 min-w-[200px]">
                    <ProgressBar pct={pct} />
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {processed.toLocaleString()} / {j.total.toLocaleString()} · ✓{j.done} · 🗄{j.cached_hits} · ✕{j.failed}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link to="/enrich/$id" params={{ id: j.id }} className="btn-base btn-ghost"><Play className="h-3.5 w-3.5" />查看</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function NumField({ label, v, setV, min, max }: { label: string; v: number; setV: (n: number) => void; min: number; max: number }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">{label}
      <input type="number" min={min} max={max} value={v}
        onChange={e => setV(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="field w-20 text-right tabular-nums" />
    </label>
  );
}

export function StatusPill({ s }: { s: string }) {
  const cls: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-primary/10 text-primary",
    completed: "bg-success/15 text-success",
    stopped: "bg-warning/15 text-warning",
    error: "bg-destructive/10 text-destructive",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls[s] ?? "bg-accent"}`}>{s}</span>;
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
