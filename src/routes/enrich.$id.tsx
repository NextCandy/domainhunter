import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { CardSkeleton } from "@/components/skeleton";
import { getEnrichJobFn, advanceEnrichJobFn, stopEnrichJobFn, resumeEnrichJobFn } from "@/lib/enrich-jobs.functions";
import { StatusPill, ProgressBar } from "./enrich";
import { toast } from "sonner";
import { Pause, Play, Download, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/enrich/$id")({ component: EnrichDetailPage });

function EnrichDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["enrich-job", id],
    queryFn: () => getEnrichJobFn({ data: { jobId: id } }),
    // Only poll while the job is still working. A terminal job (completed /
    // stopped / error) must NOT keep refetching every 2s — that churns the page
    // forever (pegs the renderer) once the detail view is reachable.
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.job?.status;
      return s === "running" || s === "pending" ? 2000 : false;
    },
  });

  const advance = useMutation({
    mutationFn: () => advanceEnrichJobFn({ data: { jobId: id, batchSize: 10 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enrich-job", id] }),
  });
  const stopMut = useMutation({
    mutationFn: () => stopEnrichJobFn({ data: { jobId: id } }),
    onSuccess: () => { toast.success("已停止"); qc.invalidateQueries({ queryKey: ["enrich-job", id] }); },
  });
  const resumeMut = useMutation({
    mutationFn: () => resumeEnrichJobFn({ data: { jobId: id } }),
    onSuccess: () => { toast.success("已恢复"); qc.invalidateQueries({ queryKey: ["enrich-job", id] }); },
  });

  const [autoRun, setAutoRun] = useState(true);

  useEffect(() => {
    if (!autoRun) return;
    const j: any = data?.job;
    if (!j || (j.status !== "running" && j.status !== "pending")) return;
    // Serialize: never fire a new advance while one is in flight. Depending on
    // `advance.isPending` (not the whole mutation object, whose identity changes
    // every render) is what keeps this from firing dozens of concurrent advances
    // — that race froze the renderer and double-counted done/cached_hits.
    if (advance.isPending) return;
    const interval = Math.max(300, 1000 / Math.max(1, j.qps ?? 5));
    const t = setTimeout(() => advance.mutate(), interval);
    return () => clearTimeout(t);
  }, [data, autoRun, advance.isPending]);

  if (!data) return <AppShell><CardSkeleton lines={5} /></AppShell>;
  const j: any = data.job;
  const processed = j.done + j.cached_hits + j.failed;
  const pct = j.total > 0 ? (processed / j.total) * 100 : 0;
  const isRunning = j.status === "running" || j.status === "pending";

  return (
    <AppShell>
      <PageHeader
        title={j.name}
        description={`类型：${(j.kinds ?? []).join(", ")} · 范围：${j.scope}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/enrich" className="btn-base btn-ghost"><ArrowLeft className="h-4 w-4" />返回</Link>
            {isRunning ? (
              <button onClick={() => stopMut.mutate()} className="btn-base btn-ghost"><Pause className="h-4 w-4" />停止</button>
            ) : (
              <button onClick={() => resumeMut.mutate()} className="btn-base btn-primary"><Play className="h-4 w-4" />继续</button>
            )}
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)} />自动执行
            </label>
            <a href={`/api/public/enrich/${id}/download?kind=enriched_csv`} className="btn-base btn-ghost"><Download className="h-4 w-4" />CSV</a>
            <a href={`/api/public/enrich/${id}/download?kind=enriched_json`} className="btn-base btn-ghost"><Download className="h-4 w-4" />JSON</a>
            <a href={`/api/public/enrich/${id}/download?kind=available_enriched_csv`} className="btn-base btn-ghost"><Download className="h-4 w-4" />可用域名 CSV</a>
          </div>
        }
      />

      <div className="card-elev mb-6 space-y-3 p-5">
        <div className="flex items-center justify-between text-sm">
          <div>状态 <StatusPill s={j.status} /></div>
          <div className="tabular-nums text-muted-foreground">{processed.toLocaleString()} / {j.total.toLocaleString()} ({pct.toFixed(1)}%)</div>
        </div>
        <ProgressBar pct={pct} />
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="完成" v={j.done} tone="success" />
          <Stat label="命中缓存" v={j.cached_hits} tone="primary" />
          <Stat label="失败" v={j.failed} tone="destructive" />
          <Stat label="剩余" v={j.total - processed} />
        </div>
        {j.error && <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{j.error}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="最近完成">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>域名</th><th>类型</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {data.recent.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1 font-mono">{r.domain}</td>
                  <td className="py-1">{r.kind}</td>
                  <td className="py-1"><StatusPill s={r.status} /></td>
                  <td className="py-1 text-muted-foreground">{r.attempted_at ? new Date(r.attempted_at).toLocaleTimeString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="错误明细">
          {data.errors.length === 0 ? <p className="text-xs text-muted-foreground">暂无错误</p> : (
            <ul className="space-y-1 text-xs">
              {data.errors.map((e: any) => (
                <li key={e.id} className="rounded border border-destructive/20 bg-destructive/5 p-2">
                  <div className="font-mono">{e.domain} <span className="text-muted-foreground">/ {e.kind}</span></div>
                  <div className="mt-0.5 text-destructive">{e.error}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: string }) {
  const cls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{v.toLocaleString()}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-elev p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
