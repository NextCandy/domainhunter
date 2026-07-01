import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getJobFn,
  listRecentJobsFn,
  recentItemsFn,
  requeueErrorsFn,
  runJobBatchFn,
  stopJobFn,
} from "@/lib/rdap.functions";
import { LAST_JOB_KEY, RecentJobsList, RecentList, SectionTitle, Stat } from "./common";
import { AuditLogPanel } from "./audit-log";
import type { BatchJob, RecentJob, RecentJobItem } from "./types";

export function CurrentTask() {
  const [jobId, setJobId] = useState<string | null>(null);
  const getJob = useServerFn(getJobFn);
  const runBatch = useServerFn(runJobBatchFn);
  const stopJob = useServerFn(stopJobFn);
  const requeueErrors = useServerFn(requeueErrorsFn);
  const listRecent = useServerFn(listRecentJobsFn);
  const recentItems = useServerFn(recentItemsFn);

  const [job, setJob] = useState<BatchJob | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [availList, setAvailList] = useState<RecentJobItem[]>([]);
  const [errorList, setErrorList] = useState<RecentJobItem[]>([]);
  const [autoRun, setAutoRun] = useState(true);

  const lastCheckedRef = useRef<{ checked: number; t: number } | null>(null);
  const [speed, setSpeed] = useState(0);

  // Initialize from localStorage + listen for new jobs
  useEffect(() => {
    const stored = localStorage.getItem(LAST_JOB_KEY);
    if (stored) setJobId(stored);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string }>).detail;
      if (detail?.jobId) setJobId(detail.jobId);
    };
    window.addEventListener("ym:new-job", handler);
    return () => window.removeEventListener("ym:new-job", handler);
  }, []);

  // Refresh recent jobs once
  useEffect(() => {
    listRecent().then((d) => setRecentJobs((d as RecentJob[]) || []));
  }, [listRecent, jobId]);

  // Poll job + drive batches
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let running = false;

    async function tick() {
      if (cancelled) return;
      try {
        const j = (await getJob({ data: { jobId: jobId! } })) as BatchJob | null;
        if (!j) {
          setJob(null);
          return;
        }
        setJob(j);

        // Track speed
        const now = Date.now();
        const prev = lastCheckedRef.current;
        if (prev) {
          const dt = (now - prev.t) / 1000;
          const dn = j.checked - prev.checked;
          if (dt > 0.3) {
            setSpeed(Math.max(0, dn / dt));
            lastCheckedRef.current = { checked: j.checked, t: now };
          }
        } else {
          lastCheckedRef.current = { checked: j.checked, t: now };
        }

        // Recent lists (cheap, paged)
        const [a, e] = await Promise.all([
          recentItems({ data: { jobId: jobId!, kind: "available", limit: 50 } }) as Promise<
            RecentJobItem[]
          >,
          recentItems({ data: { jobId: jobId!, kind: "error", limit: 50 } }) as Promise<
            RecentJobItem[]
          >,
        ]);
        if (!cancelled) {
          setAvailList(a || []);
          setErrorList(e || []);
        }

        // Drive next batch if pending and not stopped
        if (
          autoRun &&
          !running &&
          (j.status === "pending" || j.status === "running") &&
          j.checked < j.total
        ) {
          running = true;
          try {
            const params = j.params || {};
            const concurrency = Number(params.concurrency || 20);
            const timeout = Number(params.timeout || 30);
            const retries = Number(params.retries ?? 1);
            const batchSize = Math.min(50, Math.max(1, concurrency));
            await runBatch({
              data: {
                jobId: jobId!,
                batchSize,
                timeoutMs: Math.max(2000, timeout * 1000),
                retries: Math.max(0, retries),
              },
            });
          } catch (err: any) {
            const msg = err?.message || String(err) || "批次执行失败";
            console.error("batch error", err);
            toast.error("批次执行失败", { description: msg, id: "batch-err" });
            await new Promise((r) => setTimeout(r, 1500));
          } finally {
            running = false;
          }
        }
      } catch (err: any) {
        console.error("poll error", err);
      }
    }

    tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jobId, autoRun, getJob, runBatch, recentItems]);

  if (!jobId || !job) {
    return (
      <section className="panel p-5 sm:p-6">
        <SectionTitle title="当前任务" subtitle="—" />
        <p className="text-sm text-muted-foreground">尚未创建任务。在上方"新建任务"开始查询。</p>
        {recentJobs.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-muted-foreground mb-2">最近任务</div>
            <RecentJobsList jobs={recentJobs} onPick={(id) => setJobId(id)} />
          </div>
        )}
      </section>
    );
  }

  const progress = job.total > 0 ? (job.checked / job.total) * 100 : 0;
  const baseUrl = `/api/public/jobs/${job.id}/download`;

  return (
    <>
      <section className="panel p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              当前任务 <span className="text-muted-foreground font-normal">·</span>{" "}
              <span className="mono text-primary">{job.name}</span>
            </h2>
            <div className="text-[11px] text-muted-foreground mono mt-0.5">
              {job.status}
              {job.created_at && (
                <>
                  {" · "}
                  {new Date(job.created_at).toLocaleString()}
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => setAutoRun(e.target.checked)}
              />
              自动推进
            </label>
            <a className="btn-base btn-ghost" href={`${baseUrl}?kind=available`}>
              available.txt
            </a>
            <a className="btn-base btn-ghost" href={`${baseUrl}?kind=all`}>
              all_results.tsv
            </a>
            <a className="btn-base btn-ghost" href={`${baseUrl}?kind=errors`}>
              errors.txt
            </a>
            <a className="btn-base btn-ghost" href={`${baseUrl}?kind=events`}>
              audit_log.tsv
            </a>
            <a className="btn-base btn-ghost" href={`${baseUrl}?kind=error-report`}>
              error_report.json
            </a>
            <button
              className="btn-base btn-ghost"
              onClick={async () => {
                try {
                  const r = (await requeueErrors({ data: { jobId: job.id } })) as {
                    requeued: number;
                  };
                  toast.success(`已重新排队 ${r.requeued} 个错误项`);
                } catch (e: any) {
                  toast.error("补扫错误项失败", { description: e?.message });
                }
              }}
            >
              补扫错误项
            </button>
            <button
              className="btn-base btn-danger"
              onClick={async () => {
                try {
                  await stopJob({ data: { jobId: job.id } });
                  toast.warning("已请求停止任务");
                } catch (e: any) {
                  toast.error("停止任务失败", { description: e?.message });
                }
              }}
            >
              停止任务
            </button>
          </div>
        </div>

        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mb-5 border border-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="总数" value={job.total} />
          <Stat label="已查询" value={job.checked} />
          <Stat label="未注册" value={job.available} tone="success" />
          <Stat label="已注册" value={job.registered} tone="warning" />
          <Stat label="不支持" value={job.unsupported} tone="muted" />
          <Stat label="错误" value={job.errors} tone="danger" />
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            速度 <span className="mono text-foreground">{speed.toFixed(1)}</span> /s
          </span>
          <span className="mono">job id: {job.id.slice(0, 8)}…</span>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          关闭网页后任务暂停（无服务器常驻进程）；重新打开本页面会自动恢复任务并继续推进。
        </p>
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <RecentList
          title={`最近发现的未注册域名 ${availList.length} 个`}
          items={availList.map((x) => x.domain)}
          emptyText="暂无"
        />
        <RecentList
          title={`最近错误/异常 ${errorList.length} 个`}
          items={errorList.map((x) => `${x.domain}\t${x.error || ""}`)}
          emptyText="暂无"
        />
      </div>

      <AuditLogPanel jobId={job.id} />

      {recentJobs.length > 1 && (
        <section className="panel p-5 sm:p-6">
          <SectionTitle title="切换任务" />
          <RecentJobsList jobs={recentJobs} onPick={(id) => setJobId(id)} activeId={job.id} />
        </section>
      )}
    </>
  );
}
