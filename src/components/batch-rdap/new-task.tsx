import type * as React from "react";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createJobFn, fetchTldsFn, LIMITS } from "@/lib/rdap.functions";
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
import { FieldLabel, LAST_JOB_KEY, NumField, SectionTitle } from "./common";
import type { AutoEnrichScope } from "./types";

export function NewTask() {
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
  const [autoEnrich, setAutoEnrich] = useState<boolean>(false);
  const [autoEnrichKinds, setAutoEnrichKinds] = useState<string[]>(["dns", "archive"]);
  const [autoEnrichScope, setAutoEnrichScope] = useState<AutoEnrichScope>("available");

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
        format,
        customPattern,
        filterType,
        filterValue,
        mustLetter,
        mustDigit,
        tldSource,
        customTlds,
        tldLength,
        qps,
        concurrency,
        perHostQps,
        limit,
        maxTotal,
        timeout,
        retries,
        auto_enrich: autoEnrich
          ? { enabled: true, kinds: autoEnrichKinds, scope: autoEnrichScope }
          : null,
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
                <input
                  type="checkbox"
                  checked={mustLetter}
                  onChange={(e) => setMustLetter(e.target.checked)}
                />
                必须包含字母
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mustDigit}
                  onChange={(e) => setMustDigit(e.target.checked)}
                />
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
            <NumField
              label="并发数"
              value={concurrency}
              setValue={setConcurrency}
              bounds={LIMITS.concurrency}
            />
            <NumField
              label="单主机 QPS"
              value={perHostQps}
              setValue={setPerHostQps}
              bounds={LIMITS.perHostQps}
            />
            <NumField
              label="测试 limit"
              value={limit}
              setValue={setLimit}
              bounds={LIMITS.limit}
              hint="0=全量"
            />
            <NumField
              label="安全上限 max_total"
              value={maxTotal}
              setValue={setMaxTotal}
              bounds={LIMITS.maxTotal}
              hint="0=不限制"
            />
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="超时(秒)"
                value={timeout}
                setValue={setTimeout}
                bounds={LIMITS.timeoutSec}
              />
              <NumField
                label="重试"
                value={retries}
                setValue={setRetries}
                bounds={LIMITS.retries}
              />
            </div>
            <div className="mt-3 rounded-md border border-border bg-accent/30 p-2.5">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={autoEnrich}
                  onChange={(e) => setAutoEnrich(e.target.checked)}
                />
                完成后自动丰富抓取（DNS / Archive / SEO）
              </label>
              {autoEnrich && (
                <div className="mt-2 space-y-2 text-xs">
                  <div className="flex flex-wrap gap-2">
                    {["dns", "archive", "seo"].map((k) => (
                      <label key={k} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={autoEnrichKinds.includes(k)}
                          onChange={(e) =>
                            setAutoEnrichKinds((s) =>
                              e.target.checked ? [...s, k] : s.filter((x) => x !== k),
                            )
                          }
                        />
                        {k.toUpperCase()}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    范围：
                    <select
                      value={autoEnrichScope}
                      onChange={(e) => setAutoEnrichScope(e.target.value as any)}
                      className="field text-xs"
                    >
                      <option value="available">仅可注册</option>
                      <option value="registered">仅已注册</option>
                      <option value="all">全部</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-border flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          {estimate && (
            <span className="mono text-muted-foreground">
              估算 ≈ <span className="text-foreground">{estimate.total.toLocaleString()}</span>{" "}
              个域名
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
