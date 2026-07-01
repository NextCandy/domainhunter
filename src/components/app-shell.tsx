import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Archive,
  BriefcaseBusiness,
  Command,
  Compass,
  Gauge,
  LogOut,
  Menu,
  Moon,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useAuth, signOut } from "@/lib/auth-client";
import { Skeleton } from "@/components/skeleton";

const NAV = [
  { to: "/", label: "Dashboard", cn: "仪表盘", icon: Gauge, exact: true },
  { to: "/discover", label: "Hunt", cn: "狩猎", icon: Radar },
  { to: "/watchlist", label: "Watchlist", cn: "观察", icon: Archive },
  { to: "/my-domains", label: "Portfolio", cn: "资产", icon: BriefcaseBusiness },
  { to: "/admin", label: "Admin", cn: "管理", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const auth = useAuth();
  const nav = useNavigate();
  const busyCount = useIsFetching() + useIsMutating();

  useEffect(() => {
    const saved = window.localStorage.getItem("dh.theme");
    const next = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  function runGlobalSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    setSearchOpen(false);
    nav({ to: "/discover", search: { q } as never });
  }

  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="mx-auto h-12 w-12 rounded-xl border border-primary/30 bg-primary/10 p-2">
            <LogoMark />
          </div>
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
        <div className="terminal-panel max-w-md p-6">
          <ShieldCheck className="mx-auto h-10 w-10 text-warning" />
          <h1 className="mt-4 text-xl font-semibold">未授权访问</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            当前账号 ({auth.email}) 没有管理员权限。请联系管理员授权，或换号登录。
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
      <header className="sticky top-0 z-40 border-b border-border/90 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1800px] min-w-0 items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <div className="h-10 w-10 rounded-xl border border-primary/35 bg-primary/10 p-1.5 shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_20%,transparent)]">
              <LogoMark />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="text-base font-semibold tracking-tight">DomainHunter</div>
              <div className="text-[11px] text-muted-foreground">过期域名发现 / 评分 / 观察</div>
            </div>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex">
            {NAV.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`group inline-flex min-w-[6.5rem] items-center justify-center gap-2 border-b-2 px-2 py-6 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{n.label}</span>
                  <span className="text-[10px] text-muted-foreground group-hover:text-foreground/70">
                    {n.cn}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="全局搜索"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface/80 text-muted-foreground hover:text-foreground 2xl:hidden"
              aria-label="打开全局搜索"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden h-10 min-w-[18rem] items-center justify-between gap-3 rounded-lg border border-border bg-surface/80 px-3 text-left text-sm text-muted-foreground transition hover:border-border-strong hover:text-foreground 2xl:flex"
              aria-label="打开全局搜索"
            >
              <span className="inline-flex items-center gap-2 truncate">
                <Search className="h-4 w-4" />
                全局搜索域名 / 关键词 / 快捷命令
              </span>
              <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">
                /
              </kbd>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface/80 text-muted-foreground hover:text-foreground"
              aria-label={theme === "dark" ? "切换到亮色" : "切换到暗色"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface/70 px-2 py-1.5 md:flex">
              <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="max-w-[10rem] truncate text-xs text-muted-foreground">
                {auth.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut().then(() => nav({ to: "/auth" }))}
              title="退出登录"
              className="hidden h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface/80 text-muted-foreground hover:text-foreground sm:inline-flex"
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface/80 xl:hidden"
              aria-label="菜单"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border bg-background/95 xl:hidden">
            <nav className="mx-auto grid max-w-[1800px] gap-1 px-4 py-3 sm:grid-cols-2 md:grid-cols-3">
              {NAV.map((n) => {
                const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {n.label}
                    <span className="text-xs opacity-70">{n.cn}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Search className="h-4 w-4" />
                全局搜索
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1800px] px-3 py-4 sm:px-5 lg:px-6">{children}</main>

      <footer className="border-t border-border/80 py-5 text-center text-xs text-muted-foreground">
        DomainHunter Terminal · 自托管过期域名发现工具 ·{" "}
        <Link
          to="/tools/batch-rdap"
          className="underline-offset-4 hover:text-primary hover:underline"
        >
          批量 RDAP 工具
        </Link>
      </footer>

      {searchOpen && (
        <div className="fixed inset-0 z-50 grid place-items-start px-4 pt-[12vh]">
          <button
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
            aria-label="关闭搜索"
          />
          <form
            onSubmit={runGlobalSearch}
            className="terminal-panel relative mx-auto w-full max-w-2xl p-3"
          >
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <Command className="h-5 w-5 text-primary" />
              <input
                autoFocus
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="输入域名、关键词或 TLD，例如 ai agent / .do / example.com"
                className="field !border-0 !bg-transparent !p-0 text-base focus:!shadow-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 pt-3 text-xs text-muted-foreground sm:grid-cols-3">
              <QuickSearch label="高 DA 短域名" onClick={() => setSearchValue("high-da short")} />
              <QuickSearch label=".do 品牌潜力" onClick={() => setSearchValue(".do brand")} />
              <QuickSearch label="无负面记录" onClick={() => setSearchValue("low risk archive")} />
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function QuickSearch({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-surface/70 px-3 py-2 text-left hover:border-primary/50 hover:text-foreground"
    >
      {label}
    </button>
  );
}

export function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="DomainHunter" className="h-full w-full">
      <rect width="64" height="64" rx="14" fill="currentColor" className="text-background" />
      <path
        d="M14 14h12c12 0 20 7.5 20 18s-8 18-20 18H14V14Zm9 9v18h4c6.6 0 10-3.4 10-9s-3.4-9-10-9h-4Z"
        fill="currentColor"
        className="text-primary"
      />
      <path
        d="M48 13v38M37 32h21"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        className="text-primary"
      />
      <circle
        cx="48"
        cy="32"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-foreground"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  icon?: ReactNode;
}) {
  const toneCls = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  return (
    <div className="terminal-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
        {icon && <div className="text-primary">{icon}</div>}
      </div>
      <div className={`mt-3 stat-num mono ${toneCls}`}>{value}</div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 85
      ? "border-success/40 bg-success/15 text-success"
      : score >= 70
        ? "border-primary/40 bg-primary/10 text-primary"
        : score >= 50
          ? "border-warning/40 bg-warning/15 text-warning"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex min-w-[2.8rem] items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold mono ${tone}`}
    >
      {score}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    available: { label: "可注册", cls: "border-success/35 bg-success/15 text-success" },
    registered: { label: "已注册", cls: "border-border bg-muted text-muted-foreground" },
    pending_delete: { label: "待删除", cls: "border-warning/35 bg-warning/15 text-warning" },
    deleted: { label: "已删除", cls: "border-destructive/35 bg-destructive/10 text-destructive" },
    auction: { label: "拍卖中", cls: "border-primary/35 bg-primary/10 text-primary" },
    unsupported: { label: "不支持", cls: "border-border bg-muted text-muted-foreground" },
    unknown: { label: "未检测", cls: "border-border bg-accent/70 text-muted-foreground" },
    reserved: { label: "保留", cls: "border-border bg-accent/70 text-muted-foreground" },
    error: { label: "错误", cls: "border-destructive/35 bg-destructive/10 text-destructive" },
  };
  const v = map[status] ?? { label: status, cls: "border-border bg-accent text-muted-foreground" };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    low: "border-success/35 bg-success/15 text-success",
    medium: "border-warning/35 bg-warning/15 text-warning",
    high: "border-destructive/35 bg-destructive/10 text-destructive",
    unknown: "border-border bg-accent text-muted-foreground",
  };
  const labels: Record<string, string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险",
    unknown: "—",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${map[level] ?? map.unknown}`}
    >
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
    <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase text-primary">
          <Activity className="h-3.5 w-3.5" />
          DomainHunter Terminal
        </div>
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="terminal-panel flex min-h-[18rem] flex-col items-center justify-center px-6 py-12 text-center">
      <Compass className="h-10 w-10 text-primary" />
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
