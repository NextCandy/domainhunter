import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  Globe2,
  MoreVertical,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  Zap,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PageHeader, ScoreBadge, StatCard, StatusBadge } from "@/components/app-shell";
import { CardSkeleton, Skeleton } from "@/components/skeleton";
import { overviewStatsFn, overviewTrendFn, refreshDomainFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type TrendMode = "todayNew" | "available" | "highScore";

type DashboardDomain = {
  id?: string | number;
  domain: string;
  score?: number;
  status?: string;
  tld?: string;
  length?: number;
  type?: string;
  source?: string | null;
  last_checked_at?: string | null;
  expiry_date?: string | null;
  metrics?: Record<string, unknown> | null;
};

type DashboardFilters = {
  q: string;
  status: string;
  score: string;
  tld: string;
  source: string;
};

const SCORE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "90", label: "90 - 100" },
  { value: "80", label: "80 - 100" },
  { value: "70", label: "70 - 100" },
  { value: "60", label: "60 - 100" },
];

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "available", label: "可注册" },
  { value: "registered", label: "已注册" },
  { value: "pending_delete", label: "待删除" },
  { value: "unknown", label: "未检测" },
  { value: "error", label: "错误" },
];

function HomePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["overview-stats"],
    queryFn: () => overviewStatsFn(),
  });
  const trend = useQuery({
    queryKey: ["overview-trend"],
    queryFn: () => overviewTrendFn(),
  });
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(false);
  const [trendMode, setTrendMode] = useState<TrendMode>("todayNew");
  const [filters, setFilters] = useState<DashboardFilters>({
    q: "",
    status: "available",
    score: "80",
    tld: "all",
    source: "all",
  });

  const dashboardRows = useMemo(() => {
    const featured = ((data?.featured ?? []) as DashboardDomain[]).filter((row) => row.domain);
    const recent = ((data?.recent ?? []) as DashboardDomain[]).filter((row) => row.domain);
    return featured.length ? featured : recent;
  }, [data]);

  const tldOptions = useMemo(() => {
    return Array.from(new Set(dashboardRows.map((row) => domainTld(row)).filter(Boolean))).slice(0, 14);
  }, [dashboardRows]);

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(dashboardRows.map((row) => row.source || "manual").filter(Boolean))).slice(0, 12);
  }, [dashboardRows]);

  const filteredRows = useMemo(() => {
    const needle = filters.q.trim().toLowerCase();
    const minScore = filters.score === "all" ? 0 : Number(filters.score);
    return dashboardRows.filter((row) => {
      const score = Number(row.score ?? 0);
      const source = row.source || "manual";
      if (needle && !row.domain.toLowerCase().includes(needle)) return false;
      if (filters.status !== "all" && (row.status || "unknown") !== filters.status) return false;
      if (score < minScore) return false;
      if (filters.tld !== "all" && domainTld(row) !== filters.tld) return false;
      if (filters.source !== "all" && source !== filters.source) return false;
      return true;
    });
  }, [dashboardRows, filters]);

  async function quickCheck(e: FormEvent) {
    e.preventDefault();
    const v = q.trim().toLowerCase();
    if (!v) return;
    setChecking(true);
    try {
      const r = await refreshDomainFn({ data: { domain: v } });
      toast.success(`${r.domain} 状态：${r.status}，评分 ${r.score}`);
      await refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "查询失败";
      toast.error(message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="仪表盘"
        description="域名发现、评分、监控和 RDAP 实时检测集中工作台。"
        actions={
          <>
            <Link to="/admin/sources" className="btn-base btn-ghost">
              <Upload className="h-4 w-4" />
              导入
            </Link>
            <Link to="/discover" className="btn-base btn-primary">
              <Sparkles className="h-4 w-4" />
              开始发现
            </Link>
          </>
        }
      />

      <form onSubmit={quickCheck} className="card-elev mb-5 flex flex-wrap items-center gap-2 p-3">
        <Search className="ml-1 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入域名快速查询，例如 example.com、baidu.cn、nic.ai"
          className="field min-w-[220px] flex-1 !border-0 !bg-transparent !p-0 focus:!shadow-none"
        />
        <button type="submit" disabled={checking} className="btn-base btn-primary">
          <Zap className="h-4 w-4" />
          {checking ? "查询中" : "实时查询"}
        </button>
      </form>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} lines={2} />)
        ) : (
          <>
            <StatCard
              label="总域名"
              value={(data?.totalDomains ?? 0).toLocaleString()}
              hint={`+${(data?.todayNew ?? 0).toLocaleString()} 今日新增`}
              icon={Globe2}
              tone="primary"
            />
            <StatCard
              label="观察中"
              value={(data?.watching ?? 0).toLocaleString()}
              hint={`${(data?.recentChecked ?? 0).toLocaleString()} 今日检测`}
              icon={Eye}
              tone="warning"
            />
            <StatCard
              label="可注册"
              value={(data?.available ?? 0).toLocaleString()}
              hint={`${(data?.expiringSoon ?? 0).toLocaleString()} 个 30 天内到期`}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="高分域名"
              value={(data?.highScore ?? 0).toLocaleString()}
              hint="评分 70 以上"
              icon={Star}
              tone="warning"
            />
            <StatCard label="RDAP 实时检测" value="运行中" hint="延迟：1.2s" icon={Radio} tone="success" />
          </>
        )}
      </div>

      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <TrendPanel
            loading={trend.isLoading}
            data={trend.data ?? []}
            mode={trendMode}
            onModeChange={setTrendMode}
          />
          <RecommendationPanel loading={isLoading} rows={dashboardRows.slice(0, 5)} />
        </div>

        <section className="card-elev overflow-hidden">
          <DashboardFilterBar
            filters={filters}
            onChange={setFilters}
            tldOptions={tldOptions}
            sourceOptions={sourceOptions}
            total={filteredRows.length}
          />
          <DashboardTable rows={filteredRows.slice(0, 8)} loading={isLoading} />
        </section>
      </div>
    </AppShell>
  );
}

function TrendPanel({
  loading,
  data,
  mode,
  onModeChange,
}: {
  loading: boolean;
  data: Array<Record<string, string | number>>;
  mode: TrendMode;
  onModeChange: (mode: TrendMode) => void;
}) {
  const modes: Array<{ key: TrendMode; label: string; color: string }> = [
    { key: "todayNew", label: "总域名", color: "var(--primary)" },
    { key: "available", label: "可注册", color: "var(--success)" },
    { key: "highScore", label: "高分域名", color: "var(--warning)" },
  ];
  const active = modes.find((item) => item.key === mode) ?? modes[0];

  return (
    <section className="card-elev min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">趋势（近 7 天）</h2>
          <p className="mt-1 text-xs text-muted-foreground">按入库、可注册和高分变化观察发现质量。</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border bg-surface">
            {modes.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onModeChange(item.key)}
                className={`h-8 px-3 text-xs font-medium ${
                  mode === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select className="field h-8 w-[82px] py-0 text-xs" defaultValue="7">
            <option value="7">7 天</option>
          </select>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="h-64 w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--popover-foreground)",
                }}
              />
              <Line type="monotone" dataKey={mode} name={active.label} stroke={active.color} strokeWidth={2.5} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function RecommendationPanel({ loading, rows }: { loading: boolean; rows: DashboardDomain[] }) {
  return (
    <section className="card-elev min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">高分域名推荐</h2>
          <p className="mt-1 text-xs text-muted-foreground">按评分、状态和核心指标排序。</p>
        </div>
        <Link to="/discover" className="btn-base btn-ghost h-8 px-3 text-xs">
          查看全部
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
          暂无推荐数据。导入域名或运行 RDAP 检测后会自动生成。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">域名</th>
                <th className="pb-2 font-medium">评分</th>
                <th className="pb-2 font-medium">主要优势</th>
                <th className="pb-2 text-right font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr key={`${row.domain}-${index}`}>
                  <td className="py-2.5 font-medium">{row.domain}</td>
                  <td className="py-2.5 text-success">{Number(row.score ?? 0)}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <MetricPill>长度 {domainLength(row)}</MetricPill>
                      <MetricPill>{domainType(row)}</MetricPill>
                      <MetricPill>.{domainTld(row)}</MetricPill>
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusBadge status={row.status || "unknown"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DashboardFilterBar({
  filters,
  onChange,
  tldOptions,
  sourceOptions,
  total,
}: {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  tldOptions: string[];
  sourceOptions: string[];
  total: number;
}) {
  const chips = [
    filters.status !== "all" ? `状态：${STATUS_FILTERS.find((x) => x.value === filters.status)?.label ?? filters.status}` : null,
    filters.score !== "all" ? `评分：${SCORE_FILTERS.find((x) => x.value === filters.score)?.label ?? filters.score}` : null,
    filters.tld !== "all" ? `TLD：.${filters.tld}` : null,
    filters.source !== "all" ? `来源：${filters.source}` : null,
    filters.q.trim() ? `关键词：${filters.q.trim()}` : null,
  ].filter(Boolean);

  function update<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    onChange({ q: "", status: "all", score: "all", tld: "all", source: "all" });
  }

  return (
    <div className="border-b border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-base font-semibold">筛选</div>
        <label className="field flex h-9 min-w-[220px] flex-1 items-center gap-2 py-0">
          <input
            value={filters.q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="输入关键词或域名..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <Search className="h-4 w-4 text-muted-foreground" />
        </label>
        <FilterSelect label="状态" value={filters.status} onChange={(value) => update("status", value)}>
          {STATUS_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="评分" value={filters.score} onChange={(value) => update("score", value)}>
          {SCORE_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="TLD" value={filters.tld} onChange={(value) => update("tld", value)}>
          <option value="all">全部</option>
          {tldOptions.map((tld) => (
            <option key={tld} value={tld}>
              .{tld}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="来源" value={filters.source} onChange={(value) => update("source", value)}>
          <option value="all">全部</option>
          {sourceOptions.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </FilterSelect>
        <Link to="/discover" className="btn-base btn-ghost h-9 px-3 text-sm">
          <SlidersHorizontal className="h-4 w-4" />
          更多筛选
        </Link>
        <button type="button" onClick={reset} className="btn-base btn-ghost h-9 px-3 text-sm">
          <RotateCcw className="h-4 w-4" />
          重置
        </button>
        <Link to="/discover" className="btn-base btn-primary h-9 px-4 text-sm">
          <Search className="h-4 w-4" />
          搜索
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">当前筛选：</span>
        {chips.length ? (
          chips.map((chip) => (
            <span key={chip} className="chip">
              {chip}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground">全部域名</span>
        )}
        <span className="ml-auto text-muted-foreground">共 {total.toLocaleString()} 条</span>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-sm outline-none">
        {children}
      </select>
    </label>
  );
}

function DashboardTable({ rows, loading }: { rows: DashboardDomain[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="p-4">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        当前筛选下没有域名。可以调整条件，或进入发现页导入新的候选域名。
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="h-4 w-4 rounded border-border" aria-label="选择全部域名" />
              </th>
              <th className="w-8 py-3" />
              <th className="px-3 py-3 font-medium">域名</th>
              <th className="px-3 py-3 font-medium">评分</th>
              <th className="px-3 py-3 font-medium">状态</th>
              <th className="px-3 py-3 font-medium">主要指标</th>
              <th className="px-3 py-3 font-medium">来源</th>
              <th className="px-3 py-3 font-medium">更新时间</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={`${row.domain}-${index}`} className="hover:bg-accent/35">
                <td className="px-4 py-3">
                  <input type="checkbox" className="h-4 w-4 rounded border-border" aria-label={`选择 ${row.domain}`} />
                </td>
                <td className="py-3 text-muted-foreground">
                  <Star className="h-4 w-4" />
                </td>
                <td className="px-3 py-3">
                  <Link to="/domains/$domain" params={{ domain: row.domain }} className="font-medium hover:text-primary hover:underline">
                    {row.domain}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <ScoreBadge score={Number(row.score ?? 0)} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={row.status || "unknown"} />
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  <span>长度 {domainLength(row)}</span>
                  <span className="mx-2 text-border-strong">|</span>
                  <span>{domainType(row)}</span>
                  <span className="mx-2 text-border-strong">|</span>
                  <span>.{domainTld(row)}</span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{row.source || "manual"}</td>
                <td className="px-3 py-3 text-muted-foreground">{formatRelative(row.last_checked_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      to="/domains/$domain"
                      params={{ domain: row.domain }}
                      className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                      title="查看详情"
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                    <Link
                      to="/discover"
                      className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                      title="查看趋势"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                      title="更多操作"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
        <div className="text-muted-foreground">每页 20 条</div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((page) => (
            <button
              key={page}
              type="button"
              className={`grid h-8 min-w-8 place-items-center rounded-md border px-2 ${
                page === 1 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {page}
            </button>
          ))}
          <span className="px-2 text-muted-foreground">...</span>
          <button type="button" className="grid h-8 min-w-8 place-items-center rounded-md border border-border px-2 text-muted-foreground">
            266
          </button>
        </div>
        <label className="flex items-center gap-2 text-muted-foreground">
          跳至
          <input className="field h-8 w-14 py-0 text-center" defaultValue="1" />
          页
        </label>
      </div>
    </>
  );
}

function MobilePreviewRail({
  loading,
  rows,
  stats,
}: {
  loading: boolean;
  rows: DashboardDomain[];
  stats: { total: number; watching: number; available: number; highScore: number };
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-20 rounded-md border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">移动端预览</h2>
        <div className="overflow-hidden rounded-[22px] border border-border bg-background shadow-sm">
          <div className="flex h-12 items-center justify-between bg-slate-950 px-4 text-white">
            <MenuIcon />
            <div className="text-sm font-semibold">DomainHunter</div>
            <div className="relative">
              <BellDot />
            </div>
          </div>
          <div className="space-y-3 p-3">
            <MiniStat label="总域名" value={stats.total} tone="primary" />
            <MiniStat label="观察中" value={stats.watching} tone="warning" />
            <MiniStat label="可注册" value={stats.available} tone="success" />
            <MiniStat label="高分域名" value={stats.highScore} tone="warning" />
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold">趋势（近 7 天）</span>
                <span className="text-muted-foreground">7 天</span>
              </div>
              <div className="flex h-20 items-end gap-1">
                {[38, 48, 42, 58, 54, 72, 62, 78, 66, 70, 60, 84].map((height, index) => (
                  <div
                    key={index}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold">高分域名推荐</span>
                <Link to="/discover" className="text-primary">
                  查看全部
                </Link>
              </div>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <div className="space-y-2">
                  {rows.slice(0, 5).map((row, index) => (
                    <div key={`${row.domain}-mobile-${index}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{row.domain}</span>
                      <span className="font-semibold text-success">{Number(row.score ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Link to="/discover" className="btn-base btn-primary w-full">
              <Search className="h-4 w-4" />
              域名搜索
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "primary" | "success" | "warning" }) {
  const iconCls = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
      <div className={`grid h-9 w-9 place-items-center rounded-full ${iconCls}`}>
        <Globe2 className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-semibold tabular-nums">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

function MetricPill({ children }: { children: ReactNode }) {
  return <span className="rounded bg-accent px-1.5 py-0.5 text-muted-foreground">{children}</span>;
}

function MenuIcon() {
  return (
    <div className="space-y-1">
      <span className="block h-0.5 w-4 rounded bg-white" />
      <span className="block h-0.5 w-4 rounded bg-white" />
      <span className="block h-0.5 w-4 rounded bg-white" />
    </div>
  );
}

function BellDot() {
  return (
    <div className="relative h-5 w-5">
      <div className="absolute left-1 top-1 h-3.5 w-3.5 rounded-full border border-white" />
      <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[9px] font-semibold text-white">12</span>
    </div>
  );
}

function domainTld(row: DashboardDomain) {
  return row.tld || row.domain.split(".").slice(1).join(".") || row.domain.split(".").pop() || "";
}

function domainLength(row: DashboardDomain) {
  return row.length ?? row.domain.split(".")[0]?.length ?? 0;
}

function domainType(row: DashboardDomain) {
  return row.type || "通用";
}

function formatRelative(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return date.toLocaleDateString();
}
