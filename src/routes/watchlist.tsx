import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Bell, Download, Eye, Radar, Search, Trash2 } from "lucide-react";
import {
  AppShell,
  PageHeader,
  EmptyState,
  ScoreBadge,
  StatusBadge,
  StatCard,
} from "@/components/app-shell";
import { CardSkeleton } from "@/components/skeleton";
import { enrichTerminalRow, exportDomainsCsv, type TerminalDomainRow } from "@/lib/domain-terminal";
import { listWatchlistFn, updateWatchlistFn, removeWatchFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/watchlist")({
  component: WatchlistPage,
});

const STATUS_OPTIONS = [
  { v: "watching", label: "观察中" },
  { v: "target", label: "抢注目标" },
  { v: "bought", label: "已购买" },
  { v: "excluded", label: "已排除" },
  { v: "missed", label: "已错过" },
  { v: "risky", label: "高风险" },
];

type WatchDomain = Partial<TerminalDomainRow> & { domain: string };
type WatchRecord = {
  id: number;
  status: string;
  tags?: string[];
  note?: string | null;
  notify_before_drop?: boolean;
  notify_on_available?: boolean;
  notify_on_price_change?: boolean;
  domain?: WatchDomain | string | null;
  domain_detail?: WatchDomain | null;
};
type WatchRow = WatchRecord & { terminal: TerminalDomainRow | null };
type WatchPatch = {
  status?: string;
  note?: string;
  notify_before_drop?: boolean;
  notify_on_available?: boolean;
  notify_on_price_change?: boolean;
};

function WatchlistPage() {
  const qc = useQueryClient();
  const [tagFilter, setTagFilter] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: loadWatchlist,
  });
  const updateMut = useMutation({
    mutationFn: async (args: { id: number; patch: WatchPatch }) => {
      try {
        return await updateWatchlistFn({ data: args });
      } catch {
        return { ok: true, mode: "mock" };
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });
  const removeMut = useMutation({
    mutationFn: async (id: number) => {
      try {
        return await removeWatchFn({ data: { id } });
      } catch {
        const res = await fetch(`/api/watchlist?id=${encodeURIComponent(String(id))}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("删除失败");
        return res.json();
      }
    },
    onSuccess: () => {
      toast.success("已移除");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const rows = useMemo(() => {
    const list: WatchRow[] = ((data ?? []) as WatchRecord[]).map((w, i) => ({
      ...w,
      terminal: watchDomainOf(w) ? enrichTerminalRow(watchDomainOf(w)!, i) : null,
    }));
    return list.filter((w) => {
      const d = w.terminal;
      const matchTag = !tagFilter || (w.tags ?? []).includes(tagFilter);
      const matchQ =
        !q ||
        d?.domain.includes(q.toLowerCase()) ||
        (w.note ?? "").toLowerCase().includes(q.toLowerCase());
      return matchTag && matchQ;
    });
  }, [data, tagFilter, q]);
  const allTags = Array.from(new Set(((data ?? []) as WatchRecord[]).flatMap((w) => w.tags ?? [])));
  const stats = useMemo(
    () => ({
      total: data?.length ?? 0,
      target: ((data ?? []) as WatchRecord[]).filter((w) => w.status === "target").length,
      alert: (data ?? []).filter(
        (w: WatchRecord) =>
          w.notify_before_drop || w.notify_on_available || w.notify_on_price_change,
      ).length,
      high: rows.filter((w) => (w.terminal?.score ?? 0) >= 80).length,
    }),
    [data, rows],
  );

  function exportWatchlist() {
    const domains = rows.map((w) => w.terminal).filter((d): d is TerminalDomainRow => Boolean(d));
    const blob = new Blob([exportDomainsCsv(domains)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domainhunter-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <PageHeader
        title="Watchlist 观察列表"
        description="跟踪掉落状态、可注册状态、价格变化与风险备注"
        actions={
          <>
            <button
              onClick={exportWatchlist}
              disabled={!rows.length}
              className="btn-base btn-ghost"
            >
              <Download className="h-4 w-4" />
              导出 CSV
            </button>
            <Link to="/discover" search={{} as never} className="btn-base btn-primary">
              <Radar className="h-4 w-4" />
              继续狩猎
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="观察总数" value={stats.total.toLocaleString()} />
        <StatCard label="抢注目标" value={stats.target.toLocaleString()} tone="primary" />
        <StatCard label="告警开启" value={stats.alert.toLocaleString()} tone="warning" />
        <StatCard label="高分观察" value={stats.high.toLocaleString()} tone="success" />
      </div>

      <div className="terminal-panel mb-4 p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索观察域名 / 备注"
              className="field pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setTagFilter("")}
              className={`rounded-md border px-2 py-1 ${!tagFilter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              全部标签
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`rounded-md border px-2 py-1 ${tagFilter === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState
          title="观察列表为空"
          hint="在 Hunt 页面或域名详情 Drawer 中点击加入观察。"
          action={
            <Link to="/discover" search={{} as never} className="btn-base btn-primary">
              去发现域名
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((w) => {
            const d = w.terminal;
            return (
              <div
                key={w.id}
                className="terminal-panel grid grid-cols-1 gap-3 p-3 xl:grid-cols-[minmax(0,1.5fr)_10rem_minmax(12rem,1fr)_20rem_auto] xl:items-center"
              >
                <div className="min-w-0">
                  <Link
                    to="/discover"
                    search={{ q: d?.name ?? "" } as never}
                    className="block truncate font-mono font-semibold text-primary hover:underline"
                  >
                    {d?.domain ?? "未知域名"}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {d && <StatusBadge status={d.status} />}
                    {d && <ScoreBadge score={d.score} />}
                    {(w.tags ?? []).map((t: string) => (
                      <span key={t} className="glass-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <select
                  value={w.status}
                  onChange={(e) =>
                    updateMut.mutate({ id: w.id, patch: { status: e.target.value } })
                  }
                  className="field !py-1.5 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  defaultValue={w.note ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (w.note ?? ""))
                      updateMut.mutate({ id: w.id, patch: { note: e.target.value } });
                  }}
                  placeholder="备注、预算、注册商或风险说明"
                  className="field !py-1.5 text-xs"
                />
                <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                  <Toggle
                    label="删除提醒"
                    checked={!!w.notify_before_drop}
                    onChange={(v) =>
                      updateMut.mutate({ id: w.id, patch: { notify_before_drop: v } })
                    }
                  />
                  <Toggle
                    label="可注册"
                    checked={!!w.notify_on_available}
                    onChange={(v) =>
                      updateMut.mutate({ id: w.id, patch: { notify_on_available: v } })
                    }
                  />
                  <Toggle
                    label="价格变化"
                    checked={!!w.notify_on_price_change}
                    onChange={(v) =>
                      updateMut.mutate({ id: w.id, patch: { notify_on_price_change: v } })
                    }
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Link
                    to="/discover"
                    search={{ q: d?.name ?? "" } as never}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-accent"
                    aria-label="查看"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => removeMut.mutate(w.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10"
                    aria-label="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

async function loadWatchlist(): Promise<WatchRecord[]> {
  try {
    return (await listWatchlistFn()) as WatchRecord[];
  } catch {
    const res = await fetch("/api/watchlist");
    if (!res.ok) throw new Error("观察列表加载失败");
    const data = await res.json();
    return (data.rows ?? []) as WatchRecord[];
  }
}

function watchDomainOf(row: WatchRecord): WatchDomain | null {
  if (row.domain_detail) return row.domain_detail;
  if (typeof row.domain === "string") return { domain: row.domain };
  return row.domain ?? null;
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/60 px-2 py-1">
      <span className="inline-flex items-center gap-1">
        <Bell className="h-3 w-3" />
        {label}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
