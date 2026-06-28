import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AppShell, PageHeader, EmptyState, ScoreBadge, StatusBadge } from "@/components/app-shell";
import { CardSkeleton } from "@/components/skeleton";
import { ImportPanel } from "@/components/import-panel";
import { listWatchlistFn, updateWatchlistFn, removeWatchFn, importWatchlistFn } from "@/lib/discover.functions";
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

function WatchlistPage() {
  const qc = useQueryClient();
  const [tagFilter, setTagFilter] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["watchlist"], queryFn: () => listWatchlistFn() });
  const updateMut = useMutation({
    mutationFn: (args: { id: number; patch: any }) => updateWatchlistFn({ data: args }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["watchlist"] }); },
  });
  const removeMut = useMutation({
    mutationFn: (id: number) => removeWatchFn({ data: { id } }),
    onSuccess: () => { toast.success("已移除"); qc.invalidateQueries({ queryKey: ["watchlist"] }); },
  });

  const rows = (data ?? []).filter((w: any) => !tagFilter || (w.tags ?? []).includes(tagFilter));
  const allTags = Array.from(new Set((data ?? []).flatMap((w: any) => w.tags ?? []))) as string[];

  return (
    <AppShell>
      <PageHeader
        title="观察列表"
        description={`共 ${(data?.length ?? 0).toLocaleString()} 个域名`}
      />

      <div className="mb-4">
        <ImportPanel
          title="批量导入到观察列表"
          onImport={(text) => importWatchlistFn({ data: { text } })}
          onDone={() => qc.invalidateQueries({ queryKey: ["watchlist"] })}
        />
      </div>

      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">标签：</span>
          <button onClick={() => setTagFilter("")} className={`rounded-md border px-2 py-0.5 ${!tagFilter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>全部</button>
          {allTags.map(t => (
            <button key={t} onClick={() => setTagFilter(t)} className={`rounded-md border px-2 py-0.5 ${tagFilter === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} lines={2} />)}
        </div>
      ) : !rows.length ? (
        <EmptyState title="观察列表为空" hint="在发现页或域名详情页点击「观察」按钮加入。" action={<Link to="/discover" className="btn-base btn-primary">去发现域名</Link>} />
      ) : (
        <div className="space-y-2">
          {rows.map((w: any) => (
            <div key={w.id} className="card-elev grid grid-cols-1 gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center">
              <div className="min-w-0">
                <Link to="/domains/$domain" params={{ domain: w.domain?.domain ?? "" }} className="block truncate font-semibold hover:text-primary">{w.domain?.domain}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {w.domain && <StatusBadge status={w.domain.status} />}
                  {w.domain && <ScoreBadge score={w.domain.score} />}
                  {(w.tags ?? []).map((t: string) => <span key={t} className="chip">{t}</span>)}
                </div>
              </div>
              <select
                value={w.status}
                onChange={e => updateMut.mutate({ id: w.id, patch: { status: e.target.value } })}
                className="field !py-1.5 text-xs"
              >
                {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
              <input
                defaultValue={w.note ?? ""}
                onBlur={e => { if (e.target.value !== (w.note ?? "")) updateMut.mutate({ id: w.id, patch: { note: e.target.value } }); }}
                placeholder="备注…"
                className="field !py-1.5 text-xs"
              />
              <div className="flex items-center justify-end gap-2">
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <input type="checkbox" defaultChecked={w.notify_before_drop} onChange={e => updateMut.mutate({ id: w.id, patch: { notify_before_drop: e.target.checked } })} />删除提醒
                </label>
                <button onClick={() => removeMut.mutate(w.id)} className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
