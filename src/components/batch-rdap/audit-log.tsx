import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listJobEventsFn, type JobEvent } from "@/lib/rdap.functions";

export function AuditLogPanel({ jobId }: { jobId: string }) {
  const listEvents = useServerFn(listJobEventsFn);
  const [level, setLevel] = useState<"all" | "info" | "warning" | "error">("all");
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = (await listEvents({
          data: { jobId, level, limit: 100 },
        })) as JobEvent[];
        if (!cancelled) {
          setEvents(rows || []);
          setLoadErr(null);
        }
      } catch (e: any) {
        if (!cancelled) setLoadErr(e?.message || "加载审计日志失败");
      }
    }
    load();
    const id = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobId, level, listEvents]);

  const levelTone: Record<string, string> = {
    info: "text-muted-foreground border-border",
    warning: "text-warning border-warning/40 bg-warning/10",
    error: "text-destructive border-destructive/40 bg-destructive/10",
  };

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">审计日志 / Audit Log</h3>
          <p className="text-[11px] text-muted-foreground mono mt-0.5">
            状态变更与错误原因归档 · 每 3 秒自动刷新
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["all", "info", "warning", "error"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setLevel(k)}
              className={`btn-base ${level === k ? "btn-primary" : "btn-ghost"}`}
              style={{ padding: "0.25rem 0.625rem", fontSize: "0.7rem" }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      {loadErr && (
        <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded px-2 py-1 mb-3">
          ⚠ {loadErr}
        </div>
      )}
      <div className="panel-inset max-h-72 overflow-auto divide-y divide-border">
        {events.length === 0 && !loadErr && (
          <div className="text-xs text-muted-foreground p-3">暂无事件</div>
        )}
        {events.map((ev) => (
          <div key={ev.id} className="p-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-[11px] text-muted-foreground shrink-0">
                {new Date(ev.created_at).toLocaleTimeString()}
              </span>
              <span className={`chip ${levelTone[ev.level] || ""}`}>{ev.level}</span>
              <span className="mono text-foreground">{ev.event}</span>
              {ev.message && (
                <span className="text-muted-foreground truncate">{ev.message}</span>
              )}
              {ev.meta && (
                <button
                  type="button"
                  className="ml-auto text-[10px] text-primary hover:underline"
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                >
                  {expanded === ev.id ? "收起" : "详情"}
                </button>
              )}
            </div>
            {expanded === ev.id && ev.meta && (
              <pre className="mt-2 mono text-[11px] p-2 bg-surface-2 rounded border border-border overflow-auto max-h-48">
                {JSON.stringify(ev.meta, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

