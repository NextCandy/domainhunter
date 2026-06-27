import type * as React from "react";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { DomainInfo } from "@/lib/rdap.server";
import type { RecentJob } from "./types";

export const LAST_JOB_KEY = "ym_clone_last_job_id";

export function Header() {
  return (
    <header className="border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md grid place-items-center bg-primary/15 border border-primary/40">
            <span className="mono text-primary text-sm font-bold">·</span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              域名查询 <span className="text-muted-foreground font-normal">/ Domain Hunter</span>
            </h1>
            <p className="text-[11px] text-muted-foreground mono">
              IANA RDAP · WHOIS fallback · 批量 QPS 控制
            </p>
          </div>
        </div>
        <a
          href="https://ym.aiplay.im/"
          target="_blank"
          rel="noreferrer"
          className="chip hover:text-foreground transition-colors"
        >
          原站参考
        </a>
      </div>
    </header>
  );
}


export function StatusBadge({ status }: { status: DomainInfo["status"] }) {
  const map: Record<string, { c: string; t: string }> = {
    available: { c: "text-success border-success/40 bg-success/10", t: "未注册" },
    registered: { c: "text-warning border-warning/40 bg-warning/10", t: "已注册" },
    reserved: { c: "text-warning border-warning/40 bg-warning/10", t: "注册局保留" },
    unsupported: { c: "text-muted-foreground border-border bg-surface-2", t: "不支持查询" },
    error: { c: "text-destructive border-destructive/40 bg-destructive/10", t: "错误" },
  };
  const m = map[status] || map.error;
  return (
    <span className={`chip ${m.c}`} style={{ borderColor: undefined }}>
      {m.t}
    </span>
  );
}

export function LookupResultCard({ domain, info }: { domain: string; info: DomainInfo }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="mono text-lg font-semibold">{domain}</span>
        <StatusBadge status={info.status} />
        <span className="chip">{info.source}</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <InfoRow label="注册商" value={info.registrar} />
        <InfoRow label="注册日" value={info.createdDate} />
        <InfoRow label="到期日" value={info.expiresDate} />
        <InfoRow label="更新日" value={info.updatedDate} />
        <InfoRow label="DNSSEC" value={info.dnssec ? "是" : info.dnssec === false ? "否" : undefined} />
        <InfoRow label="状态" value={info.statuses?.join(", ")} />
      </div>
      {info.nameservers?.length ? (
        <div className="text-sm">
          <div className="text-xs text-muted-foreground mb-1">DNS</div>
          <div className="mono text-[12px] break-all space-y-0.5">
            {info.nameservers.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
        </div>
      ) : null}
      {info.error && <div className="text-destructive text-xs">错误：{info.error}</div>}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground text-xs w-16 shrink-0 pt-0.5">{label}</span>
      <span className="mono text-[12.5px] break-all">{value}</span>
    </div>
  );
}


export function NumField({
  label,
  value,
  setValue,
  hint,
  bounds,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  hint?: string;
  bounds?: { readonly min: number; readonly max: number };
}) {
  const oob =
    bounds != null && (value < bounds.min || value > bounds.max);
  return (
    <label className="block">
      <div className="text-[11px] text-muted-foreground mb-1 flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {bounds && (
          <span className="mono text-[10px] text-muted-foreground/70">
            {bounds.min}–{bounds.max.toLocaleString()}
          </span>
        )}
      </div>
      <input
        className="field"
        type="number"
        min={bounds?.min}
        max={bounds?.max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value) || 0)}
        onBlur={(e) => {
          if (!bounds) return;
          const n = Number(e.target.value) || 0;
          const clamped = Math.min(bounds.max, Math.max(bounds.min, n));
          if (clamped !== n) setValue(clamped);
        }}
        style={oob ? { borderColor: "var(--destructive)" } : undefined}
      />
      {oob && bounds ? (
        <div className="text-[10px] text-destructive mt-0.5">
          需在 {bounds.min}–{bounds.max.toLocaleString()} 之间
        </div>
      ) : hint ? (
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      ) : null}
    </label>
  );
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <div className="text-xs font-medium text-foreground/90">{children}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4 flex-wrap">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <span className="text-[11px] text-muted-foreground mono">{subtitle}</span>}
    </div>
  );
}

/* ============================== CURRENT TASK ============================== */

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger" | "muted";
}) {
  const colorMap: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  };
  const c = tone ? colorMap[tone] : "text-foreground";
  return (
    <div className="panel-inset p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mono mb-1.5">
        {label}
      </div>
      <div className={`stat-num ${c}`}>{value.toLocaleString()}</div>
    </div>
  );
}

export function RecentList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = items.join("\n");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button className="btn-base btn-ghost" style={{ padding: "0.25rem 0.625rem", fontSize: "0.7rem" }} onClick={copy}>
          {copied ? "已复制" : "复制列表"}
        </button>
      </div>
      <pre className="panel-inset p-3 mono text-[12px] max-h-64 overflow-auto whitespace-pre-wrap break-all">
        {items.length ? text : emptyText}
      </pre>
    </section>
  );
}

export function RecentJobsList({
  jobs,
  onPick,
  activeId,
  onDelete,
}: {
  jobs: RecentJob[];
  onPick: (id: string) => void;
  activeId?: string;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {jobs.map((j) => (
        <div
          key={j.id}
          className={`flex items-center w-full rounded-md border transition-colors ${
            activeId === j.id
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-border-strong hover:bg-accent"
          }`}
        >
          <button
            onClick={() => {
              localStorage.setItem(LAST_JOB_KEY, j.id);
              onPick(j.id);
            }}
            className="flex-1 min-w-0 text-left p-2"
          >
            <div className="flex items-center justify-between gap-3 mono text-xs">
              <span className="text-foreground truncate">{j.name}</span>
              <span className="text-muted-foreground shrink-0">
                {j.checked}/{j.total} · {j.available} 未注册 · {j.status}
              </span>
            </div>
          </button>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(j.id); }}
              title="删除任务（含全部查询结果）"
              className="shrink-0 mr-1.5 grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}


export function ReferenceTable() {
  const rows = [
    ["三数字 NNN", "1,000", "000-999"],
    ["四数字 NNNN", "10,000", "0000-9999"],
    ["三字母 LLL", "17,576", "26³"],
    ["三杂 mixed3", "28,080", "36³ − 26³ − 10³"],
    ["四字母 LLLL", "456,976", "26⁴"],
  ];
  return (
    <section className="panel p-5 sm:p-6">
      <SectionTitle title="数量参考" subtitle="单个后缀的候选总量" />
      <div className="overflow-hidden border border-border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted-foreground">
            <tr>
              <th className="text-left p-2.5 text-xs font-medium">格式</th>
              <th className="text-right p-2.5 text-xs font-medium mono">单个后缀数量</th>
              <th className="text-left p-2.5 text-xs font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, b, c]) => (
              <tr key={a} className="border-t border-border">
                <td className="p-2.5 mono text-foreground">{a}</td>
                <td className="p-2.5 text-right mono">{b}</td>
                <td className="p-2.5 text-muted-foreground mono text-xs">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="text-center text-[11px] text-muted-foreground pt-4">
      <p className="mono">
        powered by IANA RDAP bootstrap · WHOIS fallback ·{" "}
        <a href="https://ym.aiplay.im/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          原站
        </a>
      </p>
    </footer>
  );
}
