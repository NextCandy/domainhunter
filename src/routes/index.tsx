import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Activity,
  Archive,
  Bell,
  BriefcaseBusiness,
  Database,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AppShell,
  PageHeader,
  StatCard,
  ScoreBadge,
  StatusBadge,
  RiskBadge,
} from "@/components/app-shell";
import { CardSkeleton, Skeleton } from "@/components/skeleton";
import {
  generateMockDomains,
  enrichTerminalRow,
  formatCompactCurrency,
  formatCurrency,
  type TerminalDomainRow,
} from "@/lib/domain-terminal";
import { overviewStatsFn, overviewTrendFn } from "@/lib/discover.functions";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const stats = useQuery({
    queryKey: ["overview-stats"],
    queryFn: () => overviewStatsFn(),
    retry: 1,
  });
  const trend = useQuery({
    queryKey: ["overview-trend"],
    queryFn: () => overviewTrendFn(),
    retry: 1,
  });

  const mockRows = useMemo(() => generateMockDomains(5000), []);
  const featured = useMemo(() => {
    const rows = (
      stats.data?.featured?.length ? stats.data.featured : mockRows.slice(0, 18)
    ) as Array<Partial<TerminalDomainRow> & { domain: string; source?: string }>;
    return rows
      .map((r, i) => (r.source === "mock" ? (r as TerminalDomainRow) : enrichTerminalRow(r, i)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [stats.data?.featured, mockRows]);
  const dashboard = useMemo(
    () => makeDashboard(stats.data, featured, mockRows),
    [stats.data, featured, mockRows],
  );
  const trendData = trend.data?.length ? trend.data : makeTrend(mockRows);
  const tldData = useMemo(
    () => makeTldData(featured.concat(mockRows.slice(0, 180))),
    [featured, mockRows],
  );
  const scoreDist = useMemo(() => makeScoreDist(mockRows), [mockRows]);

  return (
    <AppShell>
      <PageHeader
        title="Dashboard 仪表盘"
        description="过期域名发现、评分、观察与 enrich 队列的运营驾驶舱"
        actions={
          <>
            <Link to="/admin/sources" className="btn-base btn-ghost">
              <Upload className="h-4 w-4" />
              导入域名
            </Link>
            <Link to="/discover" search={{} as never} className="btn-base btn-primary">
              <Radar className="h-4 w-4" />
              开始狩猎
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {stats.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} lines={2} />)
        ) : (
          <>
            <StatCard
              label="今日新掉"
              value={dashboard.todayNew.toLocaleString()}
              hint="过去 24 小时"
              icon={<Database className="h-4 w-4" />}
            />
            <StatCard
              label="狩猎成功率"
              value={`${dashboard.successRate}%`}
              tone="success"
              hint="可注册 / 总检测"
              icon={<Target className="h-4 w-4" />}
            />
            <StatCard
              label="观察活跃"
              value={dashboard.watching.toLocaleString()}
              hint="watchlist"
              icon={<Archive className="h-4 w-4" />}
            />
            <StatCard
              label="组合估值"
              value={
                <>
                  <span className="sm:hidden">
                    {formatCompactCurrency(dashboard.portfolioValue)}
                  </span>
                  <span className="hidden sm:inline">
                    {formatCurrency(dashboard.portfolioValue)}
                  </span>
                </>
              }
              tone="warning"
              hint="mock + 资产"
              icon={<BriefcaseBusiness className="h-4 w-4" />}
            />
            <StatCard
              label="高潜力域名"
              value={dashboard.highScore.toLocaleString()}
              tone="primary"
              hint="Score >= 70"
              icon={<Sparkles className="h-4 w-4" />}
            />
            <StatCard
              label="近期告警"
              value={dashboard.alerts.toLocaleString()}
              tone="danger"
              hint="状态/价格变化"
              icon={<Bell className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <section className="terminal-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">掉落趋势</h2>
              <p className="mt-1 text-xs text-muted-foreground">新增、可注册与高分域名 7 日走势</p>
            </div>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          {trend.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="day"
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="todayNew"
                    name="新增"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="available"
                    name="可注册"
                    stroke="var(--success)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="highScore"
                    name="高分"
                    stroke="var(--warning)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="terminal-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">TLD 分布</h2>
              <p className="mt-1 text-xs text-muted-foreground">当前候选池后缀占比</p>
            </div>
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tldData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={96}
                  paddingAngle={3}
                >
                  {tldData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        ["#34d399", "#2dd4bf", "#60a5fa", "#f59e0b", "#f87171", "#94a3b8"][i % 6]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    color: "var(--popover-foreground)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="terminal-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">评分分布</h2>
              <p className="mt-1 text-xs text-muted-foreground">mock/真实候选池综合分区间</p>
            </div>
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDist} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="range"
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="terminal-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">近期高潜力域名</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                点击进入 Hunt 可批量观察、enrich 或导出
              </p>
            </div>
            <Link
              to="/discover"
              search={{} as never}
              className="text-xs font-medium text-primary hover:underline"
            >
              查看全部
            </Link>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {featured.map((d) => (
              <Link
                key={d.domain}
                to="/discover"
                search={{ q: d.name } as never}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-surface/45 px-3 py-2 hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-semibold text-primary">
                    {d.domain}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{d.aiSummary}</div>
                </div>
                <ScoreBadge score={d.score} />
                <div className="hidden text-right text-xs mono text-muted-foreground md:block">
                  DA {d.da} / PA {d.pa}
                </div>
                <RiskBadge level={d.risk_level} />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <QueueCard
          title="Enrichment 队列"
          value="running"
          detail="DNS / Archive / SEO 可断点续查"
        />
        <QueueCard title="观察列表变化" value="+12" detail="过去 24 小时新增关注" />
        <QueueCard title="反向狩猎入口" value="Ready" detail="输入竞品域名分析外链候选" />
        <QueueCard title="AI 生成 / Spinning" value="Mock" detail="后端 LLM 环境变量接入后启用" />
      </div>
    </AppShell>
  );
}

function QueueCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="terminal-panel p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-2 font-mono text-lg font-semibold text-primary">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function makeDashboard(
  data: Awaited<ReturnType<typeof overviewStatsFn>> | undefined,
  featured: TerminalDomainRow[],
  mock: TerminalDomainRow[],
) {
  const pool = featured.length ? featured : mock;
  const total = mock.length || 1;
  const available = data?.available ?? pool.filter((r) => r.status === "available").length;
  return {
    todayNew: data?.todayNew ?? 3842,
    successRate: Math.round((available / total) * 100),
    watching: data?.watching ?? 86,
    portfolioValue: Math.round(pool.slice(0, 24).reduce((s, r) => s + r.estimatedValue, 0)),
    highScore: data?.highScore ?? pool.filter((r) => r.score >= 70).length,
    alerts: 7,
  };
}

function makeTrend(rows: TerminalDomainRow[]) {
  return Array.from({ length: 7 }, (_, i) => {
    const slice = rows.slice(i * 80, i * 80 + 360);
    return {
      day: `${String(new Date(Date.now() - (6 - i) * 86400000).getMonth() + 1).padStart(2, "0")}-${String(new Date(Date.now() - (6 - i) * 86400000).getDate()).padStart(2, "0")}`,
      todayNew: slice.length,
      available: slice.filter((r) => r.status === "available").length,
      highScore: slice.filter((r) => r.score >= 70).length,
    };
  });
}

function makeTldData(rows: TerminalDomainRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(`.${r.tld}`, (map.get(`.${r.tld}`) ?? 0) + 1);
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));
}

function makeScoreDist(rows: TerminalDomainRow[]) {
  const buckets = [
    ["0-49", 0, 49],
    ["50-59", 50, 59],
    ["60-69", 60, 69],
    ["70-79", 70, 79],
    ["80-89", 80, 89],
    ["90+", 90, 100],
  ] as const;
  return buckets.map(([range, min, max]) => ({
    range,
    count: rows.filter((r) => r.score >= min && r.score <= max).length,
  }));
}
