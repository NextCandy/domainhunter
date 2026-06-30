import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileClock,
  Globe2,
  Heart,
  History,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth, signOut } from "@/lib/auth-client";
import { Skeleton } from "@/components/skeleton";

const TOP_NAV = [
  { to: "/", label: "仪表盘", icon: BarChart3 },
  { to: "/discover", label: "域名搜索", icon: Search },
  { to: "/watchlist", label: "监控列表", icon: Heart },
  { to: "/tools/batch-rdap", label: "RDAP 实时检测", icon: Radar },
  { to: "/enrich", label: "批量工具", icon: Boxes },
  { to: "/admin/settings", label: "设置", icon: Settings },
] as const;

const SIDE_NAV = [
  {
    title: "总览",
    items: [{ to: "/", label: "总览", icon: BarChart3 }],
  },
  {
    title: "发现",
    items: [
      { to: "/discover", label: "域名搜索", icon: Search },
      { to: "/discover", label: "高分域名", icon: Star },
      { to: "/pending", label: "即将删除", icon: CalendarClock },
      { to: "/discover", label: "可注册域名", icon: CheckCircle2 },
      { to: "/admin/history", label: "历史查询", icon: History },
    ],
  },
  {
    title: "监控",
    items: [
      { to: "/watchlist", label: "监控列表", icon: ListChecks },
      { to: "/tools/batch-rdap", label: "RDAP 实时检测", icon: Radar, chip: "实时" },
    ],
  },
  {
    title: "工具",
    items: [
      { to: "/tools/batch-rdap", label: "批量查询", icon: Boxes },
      { to: "/enrich", label: "批量监控", icon: Activity },
      { to: "/admin/sources", label: "导入 / 导出", icon: UploadCloud },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/admin/jobs", label: "任务队列", icon: FileClock, badge: "3" },
      { to: "/admin/history", label: "日志", icon: History },
      { to: "/admin/settings", label: "设置", icon: Settings },
    ],
  },
] as const;

const NOTIFICATIONS = [
  { to: "/discover", label: "可注册域名", desc: "查看当前可注册的优质域名", icon: CheckCircle2 },
  { to: "/pending", label: "即将删除", desc: "临近删除（pending delete）的域名提醒", icon: CalendarClock },
  { to: "/watchlist", label: "观察列表提醒", desc: "你监控的域名状态变化与删除前提醒", icon: ListChecks },
] as const;

function isActivePath(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const auth = useAuth();
  const nav = useNavigate();
  const busyCount = useIsFetching() + useIsMutating();

  useEffect(() => {
    const saved = window.localStorage.getItem("dh.theme");
    const next =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("dh.theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  useEffect(() => {
    if (!notifOpen) return;
    function onDocClick(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [notifOpen]);

  useEffect(() => {
    if (!auth.loading && !auth.userId) nav({ to: "/auth" });
  }, [auth.loading, auth.userId, nav]);

  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="mx-auto h-10 w-10" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mx-auto h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!auth.userId) return null;

  if (!auth.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-semibold">未授权访问</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            当前账号 {auth.email ? `(${auth.email}) ` : ""}没有管理员权限。请联系管理员授权，或换号登录。
          </p>
          <button
            onClick={() => signOut().then(() => nav({ to: "/auth" }))}
            className="btn-base btn-primary mt-4"
          >
            退出登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className={`fixed left-0 top-0 z-50 h-0.5 bg-primary transition-all duration-300 ${
          busyCount ? "w-2/3 opacity-100" : "w-full opacity-0"
        }`}
      />

      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1760px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              <Globe2 className="h-4 w-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">DomainHunter</span>
          </Link>

          <nav className="ml-3 hidden min-w-0 flex-1 items-center gap-1 xl:flex">
            {TOP_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.to);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-sky-300 ring-1 ring-primary/40"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white"
              aria-label={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/discover"
              className="hidden h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10 hover:text-white lg:flex"
            >
              <Search className="h-4 w-4" />
              <span>搜索域名</span>
            </Link>
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative grid h-9 w-9 place-items-center rounded-md border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white"
                aria-label="通知"
                title="通知"
                aria-expanded={notifOpen}
              >
                <Bell className="h-4 w-4" />
                {NOTIFICATIONS.length > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {NOTIFICATIONS.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 z-50 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-border bg-surface text-foreground shadow-lg">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-sm font-semibold">消息</span>
                    <span className="text-xs text-muted-foreground">{NOTIFICATIONS.length} 条提醒</span>
                  </div>
                  <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
                    {NOTIFICATIONS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.label}
                          to={item.to}
                          onClick={() => setNotifOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-accent"
                        >
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{item.label}</span>
                            <span className="block text-xs text-muted-foreground">{item.desc}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  <Link
                    to="/admin/settings"
                    onClick={() => setNotifOpen(false)}
                    className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-accent"
                  >
                    通知设置
                  </Link>
                </div>
              )}
            </div>
            <div className="hidden items-center gap-2 rounded-md px-2 py-1.5 text-right md:flex">
              <div>
                <div className="text-sm font-semibold leading-4">{auth.email?.split("@")[0] || "admin"}</div>
                <div className="text-[11px] font-medium text-emerald-400">Self-Hosted</div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
            <button
              type="button"
              onClick={() => signOut().then(() => nav({ to: "/auth" }))}
              title={auth.email ?? "退出"}
              className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-md border border-white/10 xl:hidden"
              aria-label="菜单"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-slate-800 bg-slate-950 xl:hidden">
            <nav className="mx-auto grid max-w-[1760px] gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
              {SIDE_NAV.map((group) => (
                <div key={group.title}>
                  <div className="mb-2 px-2 text-xs font-semibold text-slate-400">{group.title}</div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <MobileNavItem
                        key={`${group.title}-${item.label}`}
                        item={item}
                        active={isActivePath(pathname, item.to)}
                        onClick={() => setOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        )}
      </header>

      <div className="mx-auto grid max-w-[1760px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-57px)] border-r border-border bg-surface px-3 py-5 lg:flex lg:flex-col">
          <nav className="space-y-5">
            {SIDE_NAV.map((group) => (
              <div key={group.title}>
                <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">{group.title}</div>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SideNavItem
                      key={`${group.title}-${item.label}`}
                      item={item}
                      active={isActivePath(pathname, item.to)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto space-y-3 pt-6">
            <div className="rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">系统状态</span>
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  正常
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-muted-foreground">
                <span>RDAP 连接</span>
                <span className="text-success">正常</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                <span>最后检测</span>
                <span>2 分钟前</span>
              </div>
            </div>
            <div className="px-2 text-xs text-muted-foreground">v1.8.2</div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

type ShellNavItem = {
  readonly to: (typeof TOP_NAV)[number]["to"] | (typeof SIDE_NAV)[number]["items"][number]["to"];
  readonly label: string;
  readonly icon: LucideIcon;
  readonly badge?: string;
  readonly chip?: string;
};

function SideNavItem({ item, active }: { item: ShellNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.chip && (
        <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">{item.chip}</span>
      )}
      {item.badge && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function MobileNavItem({
  item,
  active,
  onClick,
}: {
  item: ShellNavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-primary/15 text-sky-300" : "text-slate-200 hover:bg-white/10"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.chip && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">{item.chip}</span>}
      {item.badge && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">{item.badge}</span>}
    </Link>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  icon?: LucideIcon;
}) {
  const toneCls = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  const iconCls = {
    default: "bg-primary/10 text-primary",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-destructive",
  }[tone];

  return (
    <div className="card-elev flex min-h-[104px] items-center gap-4 p-4 sm:p-5">
      {Icon && (
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${iconCls}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={`mt-1 stat-num ${toneCls}`}>{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 85
      ? "bg-success/15 text-success ring-success/30"
      : score >= 70
        ? "bg-primary/10 text-primary ring-primary/30"
        : score >= 50
          ? "bg-warning/15 text-warning ring-warning/30"
          : "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${tone}`}
    >
      {score}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    available: { label: "可注册", cls: "bg-success/15 text-success" },
    registered: { label: "已注册", cls: "bg-muted text-muted-foreground" },
    pending_delete: { label: "待删除", cls: "bg-warning/15 text-warning" },
    grace: { label: "宽限期", cls: "bg-warning/10 text-warning" },
    redemption: { label: "赎回期", cls: "bg-warning/20 text-warning" },
    deleted: { label: "已删除", cls: "bg-destructive/10 text-destructive" },
    auction: { label: "拍卖中", cls: "bg-primary/10 text-primary" },
    unsupported: { label: "不支持", cls: "bg-muted text-muted-foreground" },
    unknown: { label: "未检测", cls: "bg-accent text-muted-foreground" },
    reserved: { label: "保留", cls: "bg-accent text-muted-foreground" },
    error: { label: "错误", cls: "bg-destructive/10 text-destructive" },
  };
  const v = map[status] ?? { label: status, cls: "bg-accent text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
}

export function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    low: "bg-success/15 text-success",
    medium: "bg-warning/15 text-warning",
    high: "bg-destructive/10 text-destructive",
    unknown: "bg-accent text-muted-foreground",
  };
  const labels: Record<string, string> = { low: "低", medium: "中", high: "高", unknown: "-" };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map[level] ?? map.unknown}`}>
      {labels[level] ?? level}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:flex sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card-elev flex flex-col items-center justify-center px-6 py-12 text-center">
      <ShieldCheck className="mb-3 h-6 w-6 text-primary" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
