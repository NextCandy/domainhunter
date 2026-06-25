import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Upload, Sparkles, Zap } from "lucide-react";
import { AppShell, PageHeader, StatCard, ScoreBadge, StatusBadge } from "@/components/app-shell";
import { overviewStatsFn, refreshDomainFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["overview-stats"],
    queryFn: () => overviewStatsFn(),
  });
  const [q, setQ] = useState("");
  const [checking, setChecking] = useState(false);

  async function quickCheck(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim().toLowerCase();
    if (!v) return;
    setChecking(true);
    try {
      const r = await refreshDomainFn({ data: { domain: v } });
      toast.success(`${r.domain} · 状态：${r.status} · 评分 ${r.score}`);
      await refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "查询失败");
    } finally {
      setChecking(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="过期域名发现平台"
        description="导入 → 自动分析 → 高级筛选 → 评分 → 观察 → 抢注"
        actions={
          <>
            <Link to="/admin/sources" className="btn-base btn-ghost"><Upload className="h-4 w-4" />导入</Link>
            <Link to="/discover" className="btn-base btn-primary"><Sparkles className="h-4 w-4" />开始发现</Link>
          </>
        }
      />

      <form onSubmit={quickCheck} className="card-elev mb-6 flex flex-wrap items-center gap-2 p-3">
        <Search className="ml-1 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="输入域名快速查询，例如 example.com / .ai / abc / ^[a-z]{4}$"
          className="field flex-1 !border-0 !bg-transparent !p-0 focus:!shadow-none"
        />
        <button type="submit" disabled={checking} className="btn-base btn-primary">
          <Zap className="h-4 w-4" />{checking ? "查询中…" : "查询"}
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="今日新增" value={isLoading ? "—" : (data?.todayNew ?? 0).toLocaleString()} hint="过去 24 小时入库" />
        <StatCard label="可注册" value={isLoading ? "—" : (data?.available ?? 0).toLocaleString()} tone="success" />
        <StatCard label="待删除" value={isLoading ? "—" : (data?.pending ?? 0).toLocaleString()} tone="warning" />
        <StatCard label="高分 (≥70)" value={isLoading ? "—" : (data?.highScore ?? 0).toLocaleString()} tone="primary" />
        <StatCard label="观察中" value={isLoading ? "—" : (data?.watching ?? 0).toLocaleString()} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">推荐高分域名</h2>
          <Link to="/discover" className="text-xs font-medium text-primary hover:underline">查看全部 →</Link>
        </div>

        {isLoading ? (
          <div className="card-elev p-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (data?.featured?.length ?? 0) === 0 ? (
          <div className="card-elev p-8 text-center text-sm text-muted-foreground">
            还没有域名数据。<Link to="/admin/sources" className="text-primary hover:underline">从这里导入 TXT/CSV</Link> 开始。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(data?.featured ?? []).map((d: any) => (
              <Link key={d.id} to="/domains/$domain" params={{ domain: d.domain }} className="card-elev block p-4 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{d.domain}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{d.length} 字符 · {d.type}</div>
                  </div>
                  <ScoreBadge score={d.score} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <StatusBadge status={d.status} />
                  {d.expiry_date && <span className="text-muted-foreground">到期 {new Date(d.expiry_date).toISOString().slice(0,10)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
