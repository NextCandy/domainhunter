import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { EmptyState } from "@/components/app-shell";

export const Route = createFileRoute("/admin/jobs")({
  component: AdminJobs,
});

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY);

function AdminJobs() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: async () => {
      const { data } = await sb.from("jobs").select("*").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">查询任务来自批量 RDAP 工具。可以在<Link to="/tools/batch-rdap" className="text-primary hover:underline">/tools/batch-rdap</Link> 创建任务。</p>
      {isLoading ? (
        <div className="card-elev p-8 text-center text-sm text-muted-foreground">加载中…</div>
      ) : !data?.length ? (
        <EmptyState title="暂无任务" hint="到批量 RDAP 工具创建查询任务。" action={<Link to="/tools/batch-rdap" className="btn-base btn-primary">前往</Link>} />
      ) : (
        <div className="card-elev overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">名称</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-right font-medium">进度</th>
                  <th className="px-3 py-2 text-right font-medium">可注册</th>
                  <th className="px-3 py-2 text-right font-medium">错误</th>
                  <th className="px-3 py-2 text-left font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {data.map((j: any) => (
                  <tr key={j.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{j.name}</td>
                    <td className="px-3 py-2"><span className="chip">{j.status}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{j.checked}/{j.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{j.available}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{j.errors}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
