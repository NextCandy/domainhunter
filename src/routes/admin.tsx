import { createFileRoute, Link, useRouterState, Outlet } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "概览", exact: true },
  { to: "/admin/sources", label: "数据源" },
  { to: "/admin/scoring", label: "评分规则" },
  { to: "/admin/registrars", label: "注册商" },
  { to: "/admin/jobs", label: "任务队列" },
  { to: "/admin/history", label: "任务历史" },
  { to: "/admin/tlds", label: "后缀管理" },
  { to: "/admin/users", label: "用户" },
  { to: "/admin/settings", label: "系统设置" },
];

function AdminLayout() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return (
    <AppShell>
      <PageHeader title="后台" description="数据源、评分规则、注册商配置、任务队列与系统设置" />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map(t => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</Link>
          );
        })}
      </div>
      <Outlet />
    </AppShell>
  );
}
