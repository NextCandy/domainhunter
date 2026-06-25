// Shared Discover view used by /discover, /deleted, /pending.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Filter, RefreshCw, Search, Sparkles, X, Download, RotateCw, SkipForward, Zap } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { FilterPanel, DomainTable, type DomainRow } from "@/components/domain-table";
import { discoverFn, toggleWatchFn, refreshDomainFn, liveScanFn, type DiscoverFilters } from "@/lib/discover.functions";
import { createEnrichJobFn } from "@/lib/enrich-jobs.functions";
import { lookupDomainFn, runJobBatchFn, requeueErrorsFn, jobProgressFn } from "@/lib/rdap.functions";
import { toast } from "sonner";

const BASE: DiscoverFilters = { page: 1, pageSize: 50, sortBy: "score", sortDir: "desc" };

type ProgressState = {
  jobId: string;
  total: number;
  done: number;
  available: number;
  registered: number;
  errors: number;
  status: string;
  errorSamples: { domain: string; error: string }[];
  startedAt: number;
  paused: boolean;
};

export function DiscoverView({
  title,
  description,
  presetStatuses,
}: {
  title: string;
  description?: string;
  presetStatuses?: string[];
}) {
  const [filters, setFilters] = useState<DiscoverFilters>({
    ...BASE,
    statuses: presetStatuses,
  });
  const [mobileFilters, setMobileFilters] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const pausedRef = useRef(false);

  // ── 可配置扫描策略（实时生效） ──
  const [strategy, setStrategy] = useState({ batchSize: 10, pauseMs: 600, maxRetries: 2, timeoutMs: 30000 });
  const strategyRef = useRef(strategy);
  useEffect(() => { strategyRef.current = strategy; }, [strategy]);

  // ── Single-domain quick lookup ──
  const [quickDomain, setQuickDomain] = useState("");
  const [quickResult, setQuickResult] = useState<any | null>(null);
  const quickLookup = useMutation({
    mutationFn: (d: string) => lookupDomainFn({ data: { domain: d } }),
    onSuccess: (r) => {
      setQuickResult(r);
      const tag = (r as any).status === "available" ? "可注册" :
                  (r as any).status === "registered" ? "已注册" :
                  (r as any).status === "error" ? "查询失败" : (r as any).status;
      toast.success(`${(r as any).domain} · ${tag}`);
    },
    onError: (e: any) => { setQuickResult({ status: "error", error: e?.message }); toast.error(e?.message ?? "查询失败"); },
  });

  // ── RDAP 连通性 / 限流测试 ──
  const [pingDomain, setPingDomain] = useState("example.com");
  const [pingResult, setPingResult] = useState<{
    ok: boolean; status: string; latencyMs: number; rateLimited: boolean; source?: string; error?: string;
  } | null>(null);
  const pingTest = useMutation({
    mutationFn: async (d: string) => {
      const t0 = performance.now();
      try {
        const r: any = await lookupDomainFn({ data: { domain: d } });
        const latencyMs = Math.round(performance.now() - t0);
        const err = (r.error ?? "").toString().toLowerCase();
        const rateLimited = /429|rate.?limit|too many/.test(err);
        return {
          ok: r.status !== "error",
          status: r.status, latencyMs, rateLimited,
          source: r.source, error: r.error,
        };
      } catch (e: any) {
        const latencyMs = Math.round(performance.now() - t0);
        const msg = e?.message ?? "网络错误";
        return { ok: false, status: "error", latencyMs, rateLimited: /429|rate.?limit/i.test(msg), error: msg };
      }
    },
    onSuccess: (r) => {
      setPingResult(r);
      if (r.rateLimited) toast.error(`已被限流（${r.latencyMs}ms），建议调高批间隔`);
      else if (r.ok) toast.success(`RDAP 正常 · ${r.latencyMs}ms · ${r.source ?? ""}`);
      else toast.error(`RDAP 异常：${r.error ?? r.status}`);
    },
  });

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["discover", filters],
    queryFn: () => discoverFn({ data: filters }),
    placeholderData: (prev) => prev,
  });

  const watchMut = useMutation({
    mutationFn: (d: DomainRow) => toggleWatchFn({ data: { domain: d.domain } }),
    onSuccess: (r) => toast.success(r.watching ? "已加入观察列表" : "已从观察列表移除"),
    onError: (e: any) => toast.error(e?.message ?? "操作失败"),
  });

  const refreshMut = useMutation({
    mutationFn: (d: DomainRow) => refreshDomainFn({ data: { domain: d.domain } }),
    onSuccess: (r) => { toast.success(`${r.domain} · ${r.status} · 评分 ${r.score}`); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "刷新失败"),
  });

  const nav = useNavigate();

  const enrichOne = useMutation({
    mutationFn: (d: DomainRow) =>
      createEnrichJobFn({
        data: { name: `Enrich ${d.domain}`, domains: [d.domain], kinds: ["dns", "archive", "seo"], scope: "single" },
      }),
    onSuccess: (r) => { toast.success("已创建丰富任务，跳转中…"); nav({ to: "/enrich/$id", params: { id: r.id } }); },
    onError: (e: any) => toast.error(e?.message ?? "创建丰富任务失败"),
  });

  const enrichBulk = useMutation({
    mutationFn: () => {
      const domains = (data?.rows ?? []).map((r: any) => r.domain).slice(0, 500);
      if (!domains.length) throw new Error("当前结果为空");
      return createEnrichJobFn({
        data: { name: `Enrich 当前结果 ${domains.length} 个`, domains, kinds: ["dns", "archive", "seo"], scope: "discover" },
      });
    },
    onSuccess: (r) => { toast.success(`已创建丰富任务（${r.total} 子任务），跳转中…`); nav({ to: "/enrich/$id", params: { id: r.id } }); },
    onError: (e: any) => toast.error(e?.message ?? "创建丰富任务失败"),
  });

  // ── Live RDAP scan with progress + queue (drives runJobBatchFn) ──
  const liveScan = useMutation({
    mutationFn: () => liveScanFn({
      data: {
        tlds: filters.tlds ?? [],
        q: filters.q, startsWith: filters.startsWith, endsWith: filters.endsWith, contains: filters.contains,
        limit: 200,
      },
    }),
    onSuccess: ({ jobId, total }) => {
      pausedRef.current = false;
      setProgress({
        jobId, total, done: 0, available: 0, registered: 0, errors: 0,
        status: "running", errorSamples: [], startedAt: Date.now(), paused: false,
      });
      toast.success(`已创建任务 · ${total} 个域名，开始 RDAP 扫描`);
      runQueue(jobId);
    },
    onError: (e: any) => toast.error(e?.message ?? "创建实时任务失败"),
  });

  // 队列驱动：分批调用 runJobBatchFn，限速 + 进度（使用 strategyRef 的实时值）
  async function runQueue(jobId: string) {
    let consecutiveErrors = 0;
    let waitMs = strategyRef.current.pauseMs;
    while (!pausedRef.current) {
      const s = strategyRef.current;
      try {
        const res: any = await runJobBatchFn({ data: { jobId, batchSize: s.batchSize, retries: s.maxRetries, timeoutMs: s.timeoutMs } });
        const p: any = await jobProgressFn({ data: { jobId } });
        const job = p.job;
        setProgress((prev) => prev && {
          ...prev,
          done: job.checked ?? 0, available: job.available ?? 0,
          registered: job.registered ?? 0, errors: job.errors ?? 0,
          status: job.status, errorSamples: p.errors,
        });
        if (res?.remaining === 0 || res?.processed === 0 || job.status === "completed" || job.status === "stopped") {
          setProgress((prev) => prev && { ...prev, status: job.status === "stopped" ? "stopped" : "completed" });
          refetch();
          break;
        }
        consecutiveErrors = 0;
        waitMs = s.pauseMs;
        await sleep(waitMs);
      } catch (e: any) {
        consecutiveErrors++;
        waitMs = Math.min(8000, Math.max(waitMs, s.pauseMs) * 2);
        toast.error(`批次失败（${consecutiveErrors}）：${e?.message ?? "未知错误"}`);
        if (consecutiveErrors >= 5) {
          setProgress((prev) => prev && { ...prev, status: "error" });
          break;
        }
        await sleep(waitMs);
      }
    }
  }


  const retryErrors = useMutation({
    mutationFn: () => requeueErrorsFn({ data: { jobId: progress!.jobId } }),
    onSuccess: (r) => {
      toast.success(`重新排队 ${r.requeued} 个错误项`);
      if (progress) {
        pausedRef.current = false;
        setProgress({ ...progress, done: Math.max(0, progress.done - r.requeued), errors: 0, status: "running", paused: false });
        runQueue(progress.jobId);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "重试失败"),
  });

  const closeProgress = () => { pausedRef.current = true; setProgress(null); refetch(); };

  return (
    <AppShell>
      <PageHeader
        title={title}
        description={description ?? `命中 ${(data?.total ?? 0).toLocaleString()} 个域名${isFetching ? " · 加载中…" : ""}`}
        actions={
          <>
            <button type="button" onClick={() => enrichBulk.mutate()}
              disabled={enrichBulk.isPending || !(data?.rows ?? []).length}
              className="btn-base btn-ghost"
              title="为当前结果批量创建 DNS/Archive/SEO 丰富任务（最多 500 个）">
              <Sparkles className="h-4 w-4" />
              {enrichBulk.isPending ? "创建中…" : "一键丰富当前结果"}
            </button>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn-base btn-ghost" title="重新查询">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              刷新
            </button>
            <button type="button" onClick={() => refetch()} className="btn-base btn-primary">
              <Search className="h-4 w-4" />
              查询
            </button>
            <button type="button" onClick={() => setMobileFilters(true)} className="btn-base btn-ghost lg:hidden">
              <Filter className="h-4 w-4" />
              筛选
            </button>
          </>
        }
      />

      {/* 单域名实时检测 */}
      <div className="card-elev mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">单域名 RDAP 实时检测</span>
          <input
            value={quickDomain}
            onChange={(e) => setQuickDomain(e.target.value.trim().toLowerCase())}
            onKeyDown={(e) => { if (e.key === "Enter" && quickDomain) quickLookup.mutate(quickDomain); }}
            placeholder="例如 example.com"
            className="field flex-1 min-w-[200px]"
          />
          <button type="button" disabled={!quickDomain || quickLookup.isPending}
            onClick={() => quickLookup.mutate(quickDomain)}
            className="btn-base btn-primary">
            {quickLookup.isPending ? "查询中…" : "查询"}
          </button>
          {quickResult && (
            <div className="w-full text-xs text-muted-foreground font-mono mt-2 break-all">
              <span className={`mr-2 rounded px-1.5 py-0.5 font-semibold ${
                quickResult.status === "available" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" :
                quickResult.status === "registered" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
                "bg-rose-500/15 text-rose-700 dark:text-rose-300"
              }`}>{quickResult.status}</span>
              {quickResult.registrar && <>注册商: {quickResult.registrar} · </>}
              {quickResult.expiresDate && <>到期: {quickResult.expiresDate} · </>}
              {quickResult.source && <>来源: {quickResult.source}</>}
              {quickResult.error && <span className="text-rose-600">错误: {quickResult.error}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="card-elev hidden h-fit p-4 lg:block">
          <FilterPanel filters={filters} onChange={setFilters} onSearch={() => refetch()}
            onBatchScan={() => liveScan.mutate()} batchScanning={liveScan.isPending || !!progress} />
        </aside>

        <div className="min-w-0">
          <DomainTable
            rows={(data?.rows ?? []) as DomainRow[]}
            total={data?.total ?? 0}
            filters={filters}
            onChange={setFilters}
            onWatch={(d) => watchMut.mutate(d)}
            onRefresh={(d) => refreshMut.mutate(d)}
            onEnrich={(d) => enrichOne.mutate(d)}
          />
        </div>
      </div>

      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl bg-surface p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">筛选</h3>
              <button onClick={() => setMobileFilters(false)} className="grid h-8 w-8 place-items-center rounded hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <FilterPanel filters={filters} onChange={setFilters}
              onSearch={() => { refetch(); setMobileFilters(false); }}
              onBatchScan={() => { liveScan.mutate(); setMobileFilters(false); }}
              batchScanning={liveScan.isPending || !!progress} />
            <button onClick={() => setMobileFilters(false)} className="btn-base btn-primary mt-4 w-full">应用</button>
          </div>
        </div>
      )}

      {/* 实时进度模态 */}
      {progress && <ProgressModal p={progress} onClose={closeProgress}
        onRetry={() => retryErrors.mutate()} retryPending={retryErrors.isPending}
        onSkip={closeProgress} />}
    </AppShell>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function ProgressModal({
  p, onClose, onRetry, onSkip, retryPending,
}: {
  p: ProgressState;
  onClose: () => void;
  onRetry: () => void;
  onSkip: () => void;
  retryPending: boolean;
}) {
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const remaining = Math.max(0, p.total - p.done);
  const elapsed = Math.max(1, Math.round((Date.now() - p.startedAt) / 1000));
  const speed = (p.done / elapsed).toFixed(1);
  const dl = (kind: string) => `/api/public/jobs/${p.jobId}/download?kind=${kind}`;
  const finished = p.status === "completed" || p.status === "stopped" || p.status === "error";

  // tick to refresh elapsed/speed
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(t); }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            RDAP 实时扫描
            <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
              finished ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-primary/15 text-primary"
            }`}>{p.status}</span>
          </h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded hover:bg-accent" title="关闭"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="已完成" value={`${p.done}/${p.total}`} />
          <Stat label="可注册" value={p.available} accent="emerald" />
          <Stat label="已注册" value={p.registered} accent="amber" />
          <Stat label="错误" value={p.errors} accent="rose" />
        </div>
        <div className="mb-3 text-xs text-muted-foreground">
          剩余 {remaining} · 已用 {elapsed}s · 速率 ~{speed}/s · 进度 {pct}%
        </div>

        {p.errorSamples.length > 0 && (
          <div className="mb-3 max-h-40 overflow-y-auto rounded border border-border bg-background/50 p-2 text-xs font-mono">
            <div className="mb-1 text-muted-foreground">最近失败 ({p.errors})</div>
            {p.errorSamples.map((e, i) => (
              <div key={i} className="truncate"><span className="text-rose-600">{e.domain}</span> · {e.error}</div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <a href={dl("csv")} download className="btn-base btn-ghost text-xs"><Download className="h-3.5 w-3.5" />CSV</a>
          <a href={dl("available")} download className="btn-base btn-ghost text-xs"><Download className="h-3.5 w-3.5" />可注册</a>
          <a href={dl("errors")} download className="btn-base btn-ghost text-xs"><Download className="h-3.5 w-3.5" />错误清单</a>
          {p.errors > 0 && (
            <button onClick={onRetry} disabled={retryPending} className="btn-base btn-primary text-xs">
              <RotateCw className={`h-3.5 w-3.5 ${retryPending ? "animate-spin" : ""}`} />
              一键重试错误
            </button>
          )}
          <button onClick={onSkip} className="btn-base btn-ghost text-xs ml-auto">
            <SkipForward className="h-3.5 w-3.5" />跳过/关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: "emerald" | "amber" | "rose" }) {
  const cls = accent === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : accent === "rose" ? "text-rose-600 dark:text-rose-400"
    : "text-foreground";
  return (
    <div className="rounded border border-border bg-background/50 p-2">
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
