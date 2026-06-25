// All app UI lives on the index. Mirrors the original site's single-page layout
// with: header / single-domain lookup / new task / current task / recent lists / reference.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  lookupDomainFn,
  fetchTldsFn,
  createJobFn,
  runJobBatchFn,
  stopJobFn,
  requeueErrorsFn,
  recentItemsFn,
  getJobFn,
  listRecentJobsFn,
  listJobEventsFn,
  LIMITS,
  type JobEvent,
} from "@/lib/rdap.functions";
import type { DomainInfo } from "@/lib/rdap.server";
import {
  parseFormat,
  presetToPattern,
  isMixed3,
  generateCandidates,
  makeFilter,
  estimateCombined,
  normalizeTlds,
  parseList,
  COMMON_TLDS,
  type FormatPreset,
} from "@/lib/domain-formats";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "域名查询 — 批量 RDAP/WHOIS 查询工具" },
      {
        name: "description",
        content:
          "支持多个后缀、自定义格式、QPS/并发控制的批量域名可注册性查询工具，基于 IANA RDAP/WHOIS。",
      },
      { property: "og:title", content: "域名查询 — 批量 RDAP/WHOIS 查询工具" },
      {
        property: "og:description",
        content:
          "支持多个后缀、自定义格式、QPS/并发控制的批量域名可注册性查询工具，基于 IANA RDAP/WHOIS。",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: Index,
});

const LAST_JOB_KEY = "ym_clone_last_job_id";

function Index() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-8 pb-24">
        <SingleLookup />
        <NewTask />
        <CurrentTask />
        <ReferenceTable />
        <Footer />
      </main>
    </div>
  );
}

function Header() {
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

/* ============================== SINGLE LOOKUP ============================== */

function SingleLookup() {
  const lookup = useServerFn(lookupDomainFn);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    const v = value.trim().toLowerCase();
    if (!v || !v.includes(".")) {
      setErr("请输入完整域名（含点号），例如 baidu.com");
      return;
    }
    setLoading(true);
    try {
      const r = await lookup({ data: { domain: v } });
      setResult(r as DomainInfo);
    } catch (e: any) {
      setErr(e?.message || "查询失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <SectionTitle title="域名查询信息" subtitle="单域名 RDAP/WHOIS 实时查询" />
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-5">
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <div className="text-xs text-muted-foreground mb-1.5">输入完整域名</div>
            <div className="flex gap-2">
              <input
                className="field"
                placeholder="例如 baidu.com"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button className="btn-base btn-primary" type="submit" disabled={loading}>
                {loading ? "查询中…" : "查询"}
              </button>
            </div>
          </label>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            横向显示注册信息，例如注册商、注册日、到期日、更新日、DNS、DNSSEC、注册局来源等。
          </p>
        </form>
        <div className="panel-inset min-h-[160px] p-4">
          {err && <div className="text-destructive text-sm">{err}</div>}
          {!err && !result && (
            <div className="text-sm text-muted-foreground">输入域名后，结果会显示在这里。</div>
          )}
          {result && <LookupResultCard domain={value} info={result} />}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: DomainInfo["status"] }) {
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

function LookupResultCard({ domain, info }: { domain: string; info: DomainInfo }) {
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

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground text-xs w-16 shrink-0 pt-0.5">{label}</span>
      <span className="mono text-[12.5px] break-all">{value}</span>
    </div>
  );
}

/* ============================== NEW TASK ============================== */

function NewTask() {
  const create = useServerFn(createJobFn);
  const fetchTlds = useServerFn(fetchTldsFn);

  const [format, setFormat] = useState<FormatPreset>("LLLL");
  const [customPattern, setCustomPattern] = useState("LLN");
  const [filterType, setFilterType] = useState<"none" | "prefix" | "suffix" | "contains" | "regex">(
    "none",
  );
  const [filterValue, setFilterValue] = useState("");
  const [mustLetter, setMustLetter] = useState(false);
  const [mustDigit, setMustDigit] = useState(false);

  const [tldSource, setTldSource] = useState<"custom" | "common" | "rdap" | "root" | "byLength">(
    "custom",
  );
  const [customTlds, setCustomTlds] = useState("com cn net cc");
  const [tldLength, setTldLength] = useState(3);
  const [listInput, setListInput] = useState("");

  const [taskName, setTaskName] = useState(() => defaultTaskName());
  const [qps, setQps] = useState<number>(LIMITS.qps.default);
  const [concurrency, setConcurrency] = useState<number>(LIMITS.concurrency.default);
  const [perHostQps, setPerHostQps] = useState<number>(LIMITS.perHostQps.default);
  const [limit, setLimit] = useState<number>(LIMITS.limit.default);
  const [maxTotal, setMaxTotal] = useState<number>(LIMITS.maxTotal.default);
  const [timeout, setTimeout] = useState<number>(LIMITS.timeoutSec.default);
  const [retries, setRetries] = useState<number>(LIMITS.retries.default);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{ total: number; capped: boolean } | null>(null);

  function defaultTaskName() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
  }

  async function resolveTlds(): Promise<string[]> {
    if (tldSource === "custom") {
      const t = normalizeTlds(customTlds);
      return t.length ? t : COMMON_TLDS.slice(0, 4);
    }
    const r = (await fetchTlds({
      data: { source: tldSource, length: tldLength },
    })) as string[];
    return r;
  }

  const parsedFormat = useMemo(() => {
    if (format === "list") return null;
    const pattern = format === "custom" ? customPattern.trim() : presetToPattern(format);
    return parseFormat(pattern);
  }, [format, customPattern]);

  const filterFn = useMemo(
    () =>
      makeFilter({
        filterType,
        filterValue: filterValue.trim(),
        mustHaveLetter: mustLetter,
        mustHaveDigit: mustDigit,
        excludePureForMixed: isMixed3(format),
      }),
    [filterType, filterValue, mustLetter, mustDigit, format],
  );

  async function doEstimate() {
    setError(null);
    try {
      let candidateCount = 0;
      let tldCount = 0;
      if (format === "list") {
        const { candidates, fullDomains } = parseList(listInput);
        const tlds = await resolveTlds();
        tldCount = tlds.length;
        candidateCount = candidates.length * tldCount + fullDomains.length;
        setEstimate({ total: candidateCount, capped: false });
        return;
      }
      if (!parsedFormat) {
        setError("无效的格式");
        return;
      }
      const tlds = await resolveTlds();
      tldCount = tlds.length;
      const est = estimateCombined(parsedFormat, tldCount, filterFn);
      setEstimate({ total: est.total, capped: est.capped });
    } catch (e: any) {
      setError(e?.message || "估算失败");
    }
  }

  function validateParams(): string | null {
    const checks: Array<[string, number, { min: number; max: number }]> = [
      ["总 QPS", qps, LIMITS.qps],
      ["并发数", concurrency, LIMITS.concurrency],
      ["单主机 QPS", perHostQps, LIMITS.perHostQps],
      ["超时(秒)", timeout, LIMITS.timeoutSec],
      ["重试", retries, LIMITS.retries],
    ];
    for (const [label, v, b] of checks) {
      if (!Number.isFinite(v) || v < b.min || v > b.max) {
        return `${label} 需在 ${b.min}–${b.max} 之间（当前 ${v}）`;
      }
    }
    if (limit < LIMITS.limit.min || limit > LIMITS.limit.max) {
      return `测试 limit 需在 ${LIMITS.limit.min}–${LIMITS.limit.max.toLocaleString()} 之间`;
    }
    if (maxTotal < LIMITS.maxTotal.min || maxTotal > LIMITS.maxTotal.max) {
      return `安全上限 max_total 需在 ${LIMITS.maxTotal.min}–${LIMITS.maxTotal.max.toLocaleString()} 之间`;
    }
    if (!taskName.trim()) return "任务名不能为空";
    if (taskName.length > LIMITS.jobNameMax) return `任务名最长 ${LIMITS.jobNameMax} 字符`;
    return null;
  }

  async function startTask() {
    setError(null);
    const paramErr = validateParams();
    if (paramErr) {
      setError(paramErr);
      toast.error("参数校验未通过", { description: paramErr });
      return;
    }
    setCreating(true);
    try {
      const tlds = await resolveTlds();
      if (!tlds.length) throw new Error("未指定有效的后缀");

      const all = new Set<string>();

      if (format === "list") {
        const { candidates, fullDomains } = parseList(listInput);
        for (const f of fullDomains) all.add(f.toLowerCase());
        for (const c of candidates) {
          if (!filterFn(c)) continue;
          for (const t of tlds) all.add(`${c}.${t}`);
          if (limit > 0 && all.size >= limit) break;
        }
      } else {
        if (!parsedFormat) throw new Error("无效的格式");
        outer: for (const c of generateCandidates(parsedFormat)) {
          if (!filterFn(c)) continue;
          for (const t of tlds) {
            all.add(`${c}.${t}`);
            if (limit > 0 && all.size >= limit) break outer;
            if (maxTotal > 0 && all.size >= maxTotal) {
              throw new Error(`生成数量已达安全上限 ${maxTotal}，请收紧条件或调高 max_total`);
            }
          }
        }
      }

      if (all.size === 0) throw new Error("没有可用候选");
      if (all.size > LIMITS.domainsPerJob.max) {
        throw new Error(
          `候选数量 ${all.size.toLocaleString()} 超过单任务上限 ${LIMITS.domainsPerJob.max.toLocaleString()}，请调整过滤或减少后缀`,
        );
      }
      if (maxTotal > 0 && all.size > maxTotal) {
        throw new Error(`数量 ${all.size} 超过安全上限 ${maxTotal}`);
      }

      const params = {
        format, customPattern, filterType, filterValue, mustLetter, mustDigit,
        tldSource, customTlds, tldLength,
        qps, concurrency, perHostQps, limit, maxTotal, timeout, retries,
      };
      const res = (await create({
        data: { name: taskName.trim() || defaultTaskName(), params, domains: [...all] },
      })) as { jobId: string };

      localStorage.setItem(LAST_JOB_KEY, res.jobId);
      window.dispatchEvent(new CustomEvent("ym:new-job", { detail: { jobId: res.jobId } }));
      setEstimate(null);
      toast.success("任务已创建", { description: `共 ${all.size.toLocaleString()} 个候选域名` });
    } catch (e: any) {
      const msg = e?.message || "创建失败";
      setError(msg);
      toast.error("创建任务失败", { description: msg });
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel p-5 sm:p-6">
      <SectionTitle title="新建任务" subtitle="批量候选生成 + RDAP 持久化任务" />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* LEFT: format + filter */}
        <div className="space-y-4">
          <div>
            <FieldLabel>域名格式</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["LLLL", "四字母 LLLL"],
                  ["LLL", "三字母 LLL"],
                  ["NNNN", "四数字 NNNN"],
                  ["NNN", "三数字 NNN"],
                  ["mixed3", "三杂"],
                  ["custom", "自定义格式"],
                  ["list", "候选词列表"],
                ] as [FormatPreset, string][]
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFormat(k)}
                  className={`btn-base ${format === k ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem" }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {format === "custom" && (
            <div>
              <FieldLabel hint="L=字母 N=数字 A=字母或数字；小写字母/数字代表固定字符">
                自定义格式
              </FieldLabel>
              <input
                className="field"
                value={customPattern}
                onChange={(e) => setCustomPattern(e.target.value)}
                placeholder="例如 NLLN 或 abNN"
              />
            </div>
          )}

          {format === "list" && (
            <div>
              <FieldLabel hint="没有点号的候选词会与后缀组合；带点号的完整域名会直接查询">
                候选词/完整域名列表
              </FieldLabel>
              <textarea
                className="field"
                rows={5}
                value={listInput}
                onChange={(e) => setListInput(e.target.value)}
                placeholder={`abc\nbest\nfoo.bar\nexample.de`}
              />
            </div>
          )}

          <div>
            <FieldLabel hint='例：开头 "ab"、末尾 "ab"、包含 "ab"；选自定义正则可写 ^ab、ab$、.*ab.*'>
              前缀 / 包含 / 自定义过滤
            </FieldLabel>
            <div className="flex gap-2">
              <select
                className="field"
                style={{ width: "auto", minWidth: "9rem" }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
              >
                <option value="none">无</option>
                <option value="prefix">开头</option>
                <option value="suffix">末尾</option>
                <option value="contains">包含</option>
                <option value="regex">自定义正则</option>
              </select>
              <input
                className="field"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="可筛选开头 ab、末尾 ab、包含 ab"
                disabled={filterType === "none"}
              />
            </div>
            <div className="flex gap-4 mt-2 text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={mustLetter} onChange={(e) => setMustLetter(e.target.checked)} />
                必须包含字母
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={mustDigit} onChange={(e) => setMustDigit(e.target.checked)} />
                必须包含数字
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT: tlds + name + params */}
        <div className="space-y-4">
          <div>
            <FieldLabel>后缀来源</FieldLabel>
            <select
              className="field"
              value={tldSource}
              onChange={(e) => setTldSource(e.target.value as any)}
            >
              <option value="custom">自定义后缀</option>
              <option value="common">常用后缀</option>
              <option value="rdap">全部 RDAP 支持后缀</option>
              <option value="root">全部 IANA 根区后缀</option>
              <option value="byLength">按后缀长度筛选</option>
            </select>
          </div>

          {tldSource === "custom" && (
            <div>
              <FieldLabel hint="仅支持常规后缀（不含中文）。支持逗号/空格/换行。留空默认 com cn net cc">
                自定义后缀
              </FieldLabel>
              <textarea
                className="field"
                rows={2}
                value={customTlds}
                onChange={(e) => setCustomTlds(e.target.value)}
                placeholder="例如 com cn net cc"
              />
            </div>
          )}

          {tldSource === "byLength" && (
            <div>
              <FieldLabel hint="按后缀字符长度筛选，例如 2=cc，3=com，4=chat">后缀长度</FieldLabel>
              <input
                className="field"
                type="number"
                min={2}
                max={20}
                value={tldLength}
                onChange={(e) => setTldLength(Number(e.target.value) || 3)}
              />
            </div>
          )}

          <div>
            <FieldLabel hint="留空使用当前时间戳；同名会复用任务">任务名（可选）</FieldLabel>
            <input
              className="field"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="总 QPS" value={qps} setValue={setQps} bounds={LIMITS.qps} />
            <NumField label="并发数" value={concurrency} setValue={setConcurrency} bounds={LIMITS.concurrency} />
            <NumField label="单主机 QPS" value={perHostQps} setValue={setPerHostQps} bounds={LIMITS.perHostQps} />
            <NumField label="测试 limit" value={limit} setValue={setLimit} bounds={LIMITS.limit} hint="0=全量" />
            <NumField
              label="安全上限 max_total"
              value={maxTotal}
              setValue={setMaxTotal}
              bounds={LIMITS.maxTotal}
              hint="0=不限制"
            />
            <div className="grid grid-cols-2 gap-2">
              <NumField label="超时(秒)" value={timeout} setValue={setTimeout} bounds={LIMITS.timeoutSec} />
              <NumField label="重试" value={retries} setValue={setRetries} bounds={LIMITS.retries} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-border flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          {estimate && (
            <span className="mono text-muted-foreground">
              估算 ≈ <span className="text-foreground">{estimate.total.toLocaleString()}</span> 个域名
              {estimate.capped ? " (估算)" : ""}
            </span>
          )}
          {error && (
            <div className="mt-1.5 text-destructive border border-destructive/40 bg-destructive/10 rounded px-2 py-1 inline-block">
              ⚠ {error}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={doEstimate} className="btn-base btn-ghost" type="button">
            估算数量
          </button>
          <button
            onClick={startTask}
            disabled={creating}
            className="btn-base btn-primary"
            type="button"
          >
            {creating ? "创建中…" : "开始查询"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        说明：任务状态完整持久化在数据库。关闭浏览器后任务暂停；重新打开本页面会自动恢复并继续推进。
      </p>
    </section>
  );
}

function NumField({
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

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <div className="text-xs font-medium text-foreground/90">{children}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4 flex-wrap">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle && <span className="text-[11px] text-muted-foreground mono">{subtitle}</span>}
    </div>
  );
}

/* ============================== CURRENT TASK ============================== */

function CurrentTask() {
  const [jobId, setJobId] = useState<string | null>(null);
  const getJob = useServerFn(getJobFn);
  const runBatch = useServerFn(runJobBatchFn);
  const stopJob = useServerFn(stopJobFn);
  const requeueErrors = useServerFn(requeueErrorsFn);
  const listRecent = useServerFn(listRecentJobsFn);
  const recentItems = useServerFn(recentItemsFn);

  const [job, setJob] = useState<any | null>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [availList, setAvailList] = useState<{ domain: string }[]>([]);
  const [errorList, setErrorList] = useState<{ domain: string; error: string | null }[]>([]);
  const [autoRun, setAutoRun] = useState(true);

  const lastCheckedRef = useRef<{ checked: number; t: number } | null>(null);
  const [speed, setSpeed] = useState(0);

  // Initialize from localStorage + listen for new jobs
  useEffect(() => {
    const stored = localStorage.getItem(LAST_JOB_KEY);
    if (stored) setJobId(stored);
    const handler = (e: any) => setJobId(e.detail.jobId);
    window.addEventListener("ym:new-job", handler as any);
    return () => window.removeEventListener("ym:new-job", handler as any);
  }, []);

  // Refresh recent jobs once
  useEffect(() => {
    listRecent().then((d: any) => setRecentJobs(d || []));
  }, [listRecent, jobId]);

  // Poll job + drive batches
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let running = false;

    async function tick() {
      if (cancelled) return;
      try {
        const j = (await getJob({ data: { jobId: jobId! } })) as any;
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
          recentItems({ data: { jobId: jobId!, kind: "available", limit: 50 } }) as Promise<any[]>,
          recentItems({ data: { jobId: jobId!, kind: "error", limit: 50 } }) as Promise<any[]>,
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
            const batchSize = Math.min(50, Math.max(1, params.concurrency || 20));
            await runBatch({
              data: {
                jobId: jobId!,
                batchSize,
                timeoutMs: Math.max(2000, (params.timeout || 30) * 1000),
                retries: Math.max(0, params.retries ?? 1),
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
                  const r = (await requeueErrors({ data: { jobId: job.id } })) as { requeued: number };
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
            速度{" "}
            <span className="mono text-foreground">{speed.toFixed(1)}</span> /s
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

      {recentJobs.length > 1 && (
        <section className="panel p-5 sm:p-6">
          <SectionTitle title="切换任务" />
          <RecentJobsList jobs={recentJobs} onPick={(id) => setJobId(id)} activeId={job.id} />
        </section>
      )}
    </>
  );
}

function Stat({
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

function RecentList({
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

function RecentJobsList({
  jobs,
  onPick,
  activeId,
}: {
  jobs: any[];
  onPick: (id: string) => void;
  activeId?: string;
}) {
  return (
    <div className="space-y-1">
      {jobs.map((j) => (
        <button
          key={j.id}
          onClick={() => {
            localStorage.setItem(LAST_JOB_KEY, j.id);
            onPick(j.id);
          }}
          className={`w-full text-left p-2 rounded-md border transition-colors ${
            activeId === j.id
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-border-strong hover:bg-accent"
          }`}
        >
          <div className="flex items-center justify-between gap-3 mono text-xs">
            <span className="text-foreground truncate">{j.name}</span>
            <span className="text-muted-foreground shrink-0">
              {j.checked}/{j.total} · {j.available} 未注册 · {j.status}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ============================== REFERENCE ============================== */

function ReferenceTable() {
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

function Footer() {
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
