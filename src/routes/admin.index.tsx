import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { overviewStatsFn } from "@/lib/discover.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminIndex,
});

function AdminIndex() {
  const { data } = useQuery({ queryKey: ["admin-overview"], queryFn: () => overviewStatsFn() });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section
        title="快速开始"
        links={[
          { to: "/admin/sources", label: "导入域名 TXT / CSV", hint: "从文件批量导入待分析域名" },
          { to: "/admin/scoring", label: "调整评分权重", hint: "自定义 100 分制规则" },
          { to: "/admin/registrars", label: "配置注册商 API", hint: "API Key 加密保存" },
          { to: "/admin/jobs", label: "查看任务队列", hint: "RDAP / DNS / Archive 查询" },
          { to: "/admin/settings", label: "系统设置", hint: "通知 / 主题 / 备份" },
        ]}
      />
      <div className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          数据库统计
        </h3>
        <dl className="space-y-2 text-sm">
          <Row k="今日新增" v={data?.todayNew ?? 0} />
          <Row k="可注册" v={data?.available ?? 0} />
          <Row k="待删除" v={data?.pending ?? 0} />
          <Row k="高分域名 (≥70)" v={data?.highScore ?? 0} />
          <Row k="观察中" v={data?.watching ?? 0} />
        </dl>
      </div>
    </div>
  );
}

function Section({
  title,
  links,
}: {
  title: string;
  links: { to: string; label: string; hint: string }[];
}) {
  return (
    <div className="card-elev p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="block rounded-md border border-border p-3 transition-colors hover:border-primary hover:bg-accent"
            >
              <div className="text-sm font-medium">{l.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{l.hint}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="tabular-nums font-semibold">{v.toLocaleString()}</dd>
    </div>
  );
}
