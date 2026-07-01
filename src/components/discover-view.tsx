import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Database,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader, StatCard } from "@/components/app-shell";
import { FilterPanel, DomainTable, type DomainRow } from "@/components/domain-table";
import {
  applyTerminalFilters,
  enrichTerminalRow,
  formatCompactCurrency,
  formatCurrency,
  generateMockDomains,
  pageRows,
  type TerminalFilters,
} from "@/lib/domain-terminal";
import {
  discoverFn,
  toggleWatchFn,
  refreshDomainFn,
  liveScanFn,
  getTldListFn,
  type DiscoverFilters,
} from "@/lib/discover.functions";
import { createEnrichJobFn } from "@/lib/enrich-jobs.functions";
import { runJobBatchFn, jobProgressFn, requeueErrorsFn, recentItemsFn } from "@/lib/rdap.functions";
import { toast } from "sonner";

const BASE: TerminalFilters = {
  page: 1,
  pageSize: 50,
  sortBy: "score",
  sortDir: "desc",
  view: "cards",
  minLength: 4,
  maxLength: 20,
};

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
};

type BatchResult = { remaining?: number; processed?: number };
type JobProgressResult = {
  job: {
    checked?: number;
    available?: number;
    registered?: number;
    errors?: number;
    status: string;
  };
  errors: { domain: string; error: string }[];
};

export function DiscoverView({
  title,
  description,
  presetStatuses,
  initialQuery,
}: {
  title: string;
  description?: string;
  presetStatuses?: string[];
  initialQuery?: string;
}) {
  const [filters, setFilters] = useState<TerminalFilters>({
    ...BASE,
    q: initialQuery,
    statuses: presetStatuses,
  });
  const debouncedFilters = useDebouncedValue(filters, 220);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [quickDomain, setQuickDomain] = useState("");
  const nav = useNavigate();

  const mockRows = useMemo(() => generateMockDomains(5000), []);
  const serverFilters = useMemo(() => toServerFilters(debouncedFilters), [debouncedFilters]);

  const query = useQuery({
    queryKey: ["discover", serverFilters],
    queryFn: () => discoverFn({ data: serverFilters }),
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: tldData } = useQuery({
    queryKey: ["tld-list"],
    queryFn: () => getTldListFn(),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const dbRows = useMemo(
    () =>
      ((query.data?.rows ?? []) as Array<Partial<DomainRow> & { domain: string }>).map((r, i) =>
        enrichTerminalRow(r, i),
      ),
    [query.data?.rows],
  );
  const useMock = query.isError || dbRows.length === 0;
  const sourceRows = useMock ? mockRows : dbRows;
  const filteredRows = useMemo(
    () => applyTerminalFilters(sourceRows, debouncedFilters),
    [sourceRows, debouncedFilters],
  );
  const visibleRows = useMemo(
    () => pageRows(filteredRows, filters.page, filters.pageSize),
    [filteredRows, filters.page, filters.pageSize],
  );
  const totals = useMemo(() => summarize(filteredRows), [filteredRows]);

  useEffect(() => {
    if (query.isError) toast.error("真实数据接口暂不可用，已切换到本地 mock 数据");
  }, [query.isError]);

  const watchMut = useMutation({
    mutationFn: async (d: DomainRow) => {
      try {
        return await toggleWatchFn({ data: { domain: d.domain } });
      } catch {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: d.domain, tags: ["hunt"], note: "Mock fallback watch" }),
        });
        if (!res.ok) throw new Error("加入观察失败");
        return { watching: true, mode: "mock" };
      }
    },
    onSuccess: (r) =>
      toast.success(
        r.watching ? `已加入观察列表${"mode" in r ? "（mock fallback）" : ""}` : "已从观察列表移除",
      ),
    onError: (e: unknown) => toast.error(messageOf(e, "操作失败")),
  });

  const refreshMut = useMutation({
    mutationFn: (d: DomainRow) => refreshDomainFn({ data: { domain: d.domain } }),
    onSuccess: (r) => {
      toast.success(`${r.domain} · ${r.status} · 评分 ${r.score}`);
      query.refetch();
    },
    onError: (e: unknown) => toast.error(messageOf(e, "刷新失败")),
  });

  const enrichOne = useMutation({
    mutationFn: (d: DomainRow) =>
      createEnrichJobFn({
        data: {
          name: `Enrich ${d.domain}`,
          domains: [d.domain],
          kinds: ["dns", "archive", "seo"],
          scope: "hunt",
        },
      }),
    onSuccess: (r) => {
      toast.success("已创建丰富任务，跳转中");
      nav({ to: "/enrich/$id", params: { id: r.id } });
    },
    onError: (e: unknown) => toast.error(messageOf(e, "创建丰富任务失败")),
  });

  const enrichBulk = useMutation({
    mutationFn: () => {
      const domains = filteredRows.slice(0, 500).map((r) => r.domain);
      if (!domains.length) throw new Error("当前结果为空");
      return createEnrichJobFn({
        data: {
          name: `Enrich 当前 Hunt 结果 ${domains.length} 个`,
          domains,
          kinds: ["dns", "archive", "seo"],
          scope: "hunt",
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`已创建丰富任务（${r.total} 子任务）`);
      nav({ to: "/enrich/$id", params: { id: r.id } });
    },
    onError: (e: unknown) => toast.error(messageOf(e, "创建丰富任务失败")),
  });

  const liveScan = useMutation({
    mutationFn: () =>
      liveScanFn({
        data: {
          tlds: filters.tlds?.length ? filters.tlds : ["com", "net", "org", "io", "ai", "do"],
          q: quickDomain || filters.q,
          startsWith: filters.startsWith,
          endsWith: filters.endsWith,
          contains: filters.contains,
          limit: 200,
        },
      }),
    onSuccess: ({ jobId, total }) => {
      setProgress({
        jobId,
        total,
        done: 0,
        available: 0,
        registered: 0,
        errors: 0,
        status: "running",
        errorSamples: [],
        startedAt: Date.now(),
      });
      toast.success(`已创建实时扫描任务：${total} 个候选`);
      runQueue(jobId);
    },
    onError: (e: unknown) => toast.error(messageOf(e, "创建实时任务失败")),
  });

  async function runQueue(jobId: string) {
    let consecutiveErrors = 0;
    while (true) {
      try {
        const res = (await runJobBatchFn({
          data: { jobId, batchSize: 10, retries: 2, timeoutMs: 30000 },
        })) as BatchResult;
        const p = (await jobProgressFn({ data: { jobId } })) as JobProgressResult;
        const job = p.job;
        setProgress(
          (prev) =>
            prev && {
              ...prev,
              done: job.checked ?? 0,
              available: job.available ?? 0,
              registered: job.registered ?? 0,
              errors: job.errors ?? 0,
              status: job.status,
              errorSamples: p.errors,
            },
        );
        if (
          res?.remaining === 0 ||
          res?.processed === 0 ||
          job.status === "completed" ||
          job.status === "stopped"
        ) {
          setProgress(
            (prev) =>
              prev && { ...prev, status: job.status === "stopped" ? "stopped" : "completed" },
          );
          query.refetch();
          break;
        }
        await sleep(650);
      } catch (e: unknown) {
        consecutiveErrors++;
        toast.error(`扫描批次失败：${messageOf(e, "未知错误")}`);
        if (consecutiveErrors >= 5) {
          setProgress((prev) => prev && { ...prev, status: "error" });
          break;
        }
        await sleep(1600);
      }
    }
  }

  const retryErrors = useMutation({
    mutationFn: () => requeueErrorsFn({ data: { jobId: progress!.jobId } }),
    onSuccess: (r) => {
      toast.success(`重新排队 ${r.requeued} 个错误项`);
      if (progress) runQueue(progress.jobId);
    },
    onError: (e: unknown) => toast.error(messageOf(e, "重试失败")),
  });

  function updateFilters(next: TerminalFilters) {
    setFilters({ ...next, pageSize: next.pageSize ?? filters.pageSize ?? 50 });
  }

  return (
    <AppShell>
      <PageHeader
        title={title}
        description={
          description ??
          `命中 ${filteredRows.length.toLocaleString()} 个域名 · ${useMock ? "本地 5000 条 mock 演示数据" : "数据库实时数据"}`
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => enrichBulk.mutate()}
              disabled={enrichBulk.isPending || !filteredRows.length}
              className="btn-base btn-ghost"
            >
              {enrichBulk.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              批量 enrich
            </button>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="btn-base btn-ghost"
            >
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={() => setMobileFilters(true)}
              className="btn-base btn-primary lg:hidden"
            >
              <Filter className="h-4 w-4" />
              筛选
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard
          label="结果总数"
          value={filteredRows.length.toLocaleString()}
          hint={useMock ? "mock fallback" : "database"}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="高潜力"
          value={totals.high.toLocaleString()}
          tone="success"
          hint="Score >= 82"
        />
        <StatCard
          label="AI 推荐"
          value={totals.ai.toLocaleString()}
          tone="primary"
          hint="可替换 LLM"
        />
        <StatCard label="平均评分" value={totals.avgScore} hint="当前筛选" />
        <StatCard
          label="低风险"
          value={totals.lowRisk.toLocaleString()}
          tone="success"
          hint="排除灰产"
        />
        <StatCard
          label="总估值"
          value={
            <>
              <span className="sm:hidden">{formatCompactCurrency(totals.value)}</span>
              <span className="hidden sm:inline">{formatCurrency(totals.value)}</span>
            </>
          }
          tone="warning"
          hint="估算区间"
        />
      </div>

      <div className="terminal-panel mb-4 p-3">
        <div className="grid gap-2 xl:grid-cols-[1.2fr_1fr_auto] xl:items-center">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">实时候选扫描</span>
            <span className="text-xs text-muted-foreground">
              输入主体词后按当前 TLD 发起 RDAP 队列
            </span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={quickDomain}
              onChange={(e) =>
                setQuickDomain(e.target.value.trim().toLowerCase().replace(/\..*$/, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") liveScan.mutate();
              }}
              placeholder="例如 aiagent / fintech / dog"
              className="field pl-8"
            />
          </div>
          <button
            type="button"
            onClick={() => liveScan.mutate()}
            disabled={liveScan.isPending || !!progress}
            className="btn-base btn-primary"
          >
            {liveScan.isPending || progress ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            开始扫描
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="terminal-panel hidden h-fit max-h-[calc(100vh-6rem)] overflow-y-auto p-4 lg:sticky lg:top-24 lg:block">
          <FilterPanel
            filters={filters}
            onChange={updateFilters}
            onSearch={() => query.refetch()}
            onBatchScan={() => liveScan.mutate()}
            batchScanning={liveScan.isPending || !!progress}
            tldOptions={tldData?.tlds}
          />
        </aside>

        <div className="min-w-0">
          <DomainTable
            rows={visibleRows}
            total={filteredRows.length}
            filters={filters}
            onChange={updateFilters}
            onWatch={(d) => watchMut.mutate(d)}
            onRefresh={(d) => refreshMut.mutate(d)}
            onEnrich={(d) => enrichOne.mutate(d)}
            isLoading={query.isFetching}
            sourceLabel={useMock ? "Mock 5000" : "Database"}
          />
        </div>
      </div>

      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setMobileFilters(false)}
            aria-label="关闭筛选"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border border-border bg-background p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">筛选</h3>
              <button
                onClick={() => setMobileFilters(false)}
                className="grid h-8 w-8 place-items-center rounded hover:bg-accent"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <FilterPanel
              filters={filters}
              onChange={updateFilters}
              onSearch={() => {
                query.refetch();
                setMobileFilters(false);
              }}
              onBatchScan={() => {
                liveScan.mutate();
                setMobileFilters(false);
              }}
              batchScanning={liveScan.isPending || !!progress}
              tldOptions={tldData?.tlds}
            />
          </div>
        </div>
      )}

      {progress && (
        <ProgressModal
          p={progress}
          onClose={() => {
            setProgress(null);
            query.refetch();
          }}
          onRetry={() => retryErrors.mutate()}
          retryPending={retryErrors.isPending}
        />
      )}
    </AppShell>
  );
}

function toServerFilters(filters: TerminalFilters): DiscoverFilters {
  const allowedSort = ["score", "domain", "length", "drop_date", "created_at"].includes(
    String(filters.sortBy),
  )
    ? (filters.sortBy as DiscoverFilters["sortBy"])
    : "score";
  return {
    q: filters.q,
    tlds: filters.tlds,
    statuses: filters.statuses,
    types: filters.types,
    minLength: filters.minLength,
    maxLength: filters.maxLength,
    minScore: filters.minScore,
    startsWith: filters.startsWith,
    endsWith: filters.endsWith,
    contains: filters.contains,
    regex: filters.regex,
    archiveYearMin: filters.archiveYearMin,
    backlinksMin: filters.backlinksMin,
    riskLevels: filters.riskLevels,
    dropBefore: filters.dropTo,
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: allowedSort,
    sortDir: filters.sortDir,
  };
}

function summarize(rows: DomainRow[]) {
  if (!rows.length) return { high: 0, ai: 0, avgScore: 0, lowRisk: 0, value: 0 };
  const score = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);
  return {
    high: rows.filter((r) => r.highPotential).length,
    ai: rows.filter((r) => r.aiRecommended).length,
    avgScore: score,
    lowRisk: rows.filter((r) => r.risk_level === "low").length,
    value: Math.round(rows.reduce((s, r) => s + r.estimatedValue, 0)),
  };
}

function ProgressModal({
  p,
  onClose,
  onRetry,
  retryPending,
}: {
  p: ProgressState;
  onClose: () => void;
  onRetry: () => void;
  retryPending: boolean;
}) {
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  const elapsed = Math.max(1, Math.round((Date.now() - p.startedAt) / 1000));
  const finished = p.status === "completed" || p.status === "stopped" || p.status === "error";

  const { data: errAll } = useQuery({
    queryKey: ["job-errors-all", p.jobId, finished],
    queryFn: () => recentItemsFn({ data: { jobId: p.jobId, kind: "error", limit: 500 } }),
    enabled: finished && p.errors > 0,
    staleTime: 30_000,
  });
  const errorGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of errAll ?? []) {
      const key = normalizeErr(it.error ?? "未知错误");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [errAll]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭扫描进度"
      />
      <div className="terminal-panel relative w-full max-w-lg p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Zap className="h-4 w-4 text-primary" />
            {finished ? "扫描摘要" : "RDAP 实时扫描"}
            <span className="glass-chip">{p.status}</span>
          </h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded hover:bg-accent"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <ProgressStat label="已完成" value={`${p.done}/${p.total}`} />
          <ProgressStat label="可注册" value={p.available} tone="success" />
          <ProgressStat label="已注册" value={p.registered} tone="warning" />
          <ProgressStat label="错误" value={p.errors} tone="danger" />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          已用 {elapsed}s · 进度 {pct}%
        </div>
        {errorGroups.length > 0 && (
          <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs">
            {errorGroups.map(([reason, n]) => (
              <div key={reason} className="flex justify-between gap-2">
                <span>{reason}</span>
                <span>×{n}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/api/public/jobs/${p.jobId}/download?kind=csv`}
            download
            className="btn-base btn-ghost text-xs"
          >
            <Upload className="h-3.5 w-3.5" />
            CSV
          </a>
          {p.errors > 0 && (
            <button
              onClick={onRetry}
              disabled={retryPending}
              className="btn-base btn-primary text-xs"
            >
              {retryPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              重试错误
            </button>
          )}
          <button onClick={onClose} className="btn-base btn-ghost ml-auto text-xs">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "danger";
}) {
  const cls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface/70 p-2">
      <div className={`text-base font-semibold mono ${cls}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function normalizeErr(raw: string): string {
  const s = raw.toLowerCase();
  if (/429|rate.?limit|too many/.test(s)) return "限流 (429)";
  if (/timeout|timed.?out|etimedout/.test(s)) return "请求超时";
  if (/network|fetch failed|enotfound|econnreset|socket/.test(s)) return "网络错误";
  if (/404|not.?found/.test(s)) return "RDAP 未找到";
  if (/unsupported|no rdap/.test(s)) return "TLD 不支持 RDAP";
  return raw.length > 60 ? raw.slice(0, 60) + "..." : raw;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
