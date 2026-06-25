import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader, EmptyState } from "@/components/app-shell";
import { listAuctionsFn } from "@/lib/discover.functions";

export const Route = createFileRoute("/auctions")({
  component: AuctionsPage,
});

function AuctionsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["auctions"], queryFn: () => listAuctionsFn() });

  return (
    <AppShell>
      <PageHeader title="拍卖域名" description="第三方拍卖 / 一口价聚合。GoDaddy · Namecheap · Dynadot · Gname · Sedo · Catched · Efty（API 待接入）" />
      {isLoading ? (
        <div className="card-elev p-8 text-center text-sm text-muted-foreground">加载中…</div>
      ) : !data?.length ? (
        <EmptyState
          title="尚未接入任何拍卖平台"
          hint="可在 后台 → 注册商管理 / 数据源 中配置 GoDaddy、Namecheap、Dynadot、Sedo 等平台凭证（本版本仅预留字段）。"
          action={<Link to="/admin/registrars" className="btn-base btn-primary">前往配置</Link>}
        />
      ) : (
        <div className="card-elev overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">域名</th>
                  <th className="px-3 py-2 text-left font-medium">平台</th>
                  <th className="px-3 py-2 text-right font-medium">当前价</th>
                  <th className="px-3 py-2 text-right font-medium">出价</th>
                  <th className="px-3 py-2 text-left font-medium">结束时间</th>
                  <th className="px-4 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a: any) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2 font-medium">{a.domain}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.platform}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.current_price ?? "—"} {a.currency ?? ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.bid_count ?? 0}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.end_time ? new Date(a.end_time).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <a href={a.buy_url ?? "#"} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">前往</a>
                    </td>
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
