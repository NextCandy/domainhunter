import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X, Search, LogOut, Moon, Sun } from "lucide-react";
import { useAuth, signOut } from "@/lib/auth-client";
import { Skeleton } from "@/components/skeleton";

const NAV = [
  { to: "/", label: "概览" },
  { to: "/ideas", label: "域名灵感" },
  { to: "/discover", label: "发现域名" },
  { to: "/pricing", label: "价格对比" },
  { to: "/deleted", label: "已删除" },
  { to: "/pending", label: "待删除" },
  { to: "/auctions", label: "拍卖" },
  { to: "/watchlist", label: "观察列表" },
  { to: "/my-domains", label: "我的域名" },
  { to: "/enrich", label: "丰富抓取" },
  { to: "/admin", label: "后台" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const auth = useAuth();
  const nav = useNavigate();
  const busyCount = useIsFetching() + useIsMutating();

  useEffect(() => {
    const saved = window.localStorage.getItem("dh.theme");
    const next = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
          <p className="mt-2 text-sm text-muted-foreground">当前账号 ({auth.email}) 没有管理员权限。请联系管理员授权，或换号登录。</p>
          <button onClick={() => signOut().then(() => nav({ to: "/auth" }))} className="btn-base btn-primary mt-4">退出登录</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className={`fixed left-0 top-0 z-50 h-0.5 bg-primary transition-all duration-300 ${busyCount ? "w-2/3 opacity-100" : "w-full opacity-0"}`}
      />
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-bold">DH</div>
            <span className="text-base font-semibold tracking-tight">DomainHunter</span>
          </Link>

          <nav className="ml-2 hidden flex-1 items-center gap-1 lg:flex">
            {NAV.map(n => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
              aria-label={theme === "dark" ? "切换到亮色" : "切换到暗色"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/discover" className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground sm:flex">
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">搜索域名…</span>
            </Link>
            <button
              type="button"
              onClick={() => signOut().then(() => nav({ to: "/auth" }))}
              title={auth.email ?? "退出"}
              className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:flex"
            >
              <LogOut className="h-3.5 w-3.5" />退出
            </button>
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-surface lg:hidden"
              aria-label="菜单"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>


        {open && (
          <div className="border-t border-border bg-surface lg:hidden">
            <nav className="mx-auto flex max-w-[1600px] flex-col gap-1 px-4 py-2">
              {NAV.map(n => {
                const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                {theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        DomainHunter · 自托管过期域名发现工具 · <Link to="/tools/batch-rdap" className="underline-offset-4 hover:underline">批量 RDAP 工具</Link>
      </footer>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "primary" | "success" | "warning" | "danger" }) {
  const toneCls = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="card-elev p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 stat-num ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 85 ? "bg-success/15 text-success ring-success/30" :
    score >= 70 ? "bg-primary/10 text-primary ring-primary/30" :
    score >= 50 ? "bg-warning/15 text-warning ring-warning/30" :
                  "bg-muted text-muted-foreground ring-border";
  return (
    <span className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${tone}`}>
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
  const labels: Record<string, string> = { low: "低", medium: "中", high: "高", unknown: "—" };
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${map[level] ?? map.unknown}`}>{labels[level] ?? level}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card-elev flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
