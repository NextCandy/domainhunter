import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowDownUp,
  BarChart3,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Grid2X2,
  History,
  List,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Table2,
  X,
  Zap,
} from "lucide-react";
import { ScoreBadge, StatusBadge, RiskBadge, EmptyState } from "./app-shell";
import { cn } from "@/lib/utils";
import type { TerminalDomainRow, TerminalFilters } from "@/lib/domain-terminal";
import { exportDomainsCsv, formatDate } from "@/lib/domain-terminal";

export type DomainRow = TerminalDomainRow;

const COMMON_TLDS = [
  "com",
  "cn",
  "net",
  "org",
  "do",
  "io",
  "ai",
  "co",
  "app",
  "dev",
  "xyz",
  "shop",
  "site",
  "online",
  "store",
  "tech",
  "cloud",
  "club",
  "top",
  "cc",
  "tv",
  "me",
  "us",
  "uk",
  "de",
  "jp",
  "kr",
  "hk",
  "sg",
  "in",
  "to",
  "is",
  "fm",
  "gg",
];
const STATUSES = [
  { v: "available", label: "可注册" },
  { v: "registered", label: "已注册" },
  { v: "pending_delete", label: "待删除" },
  { v: "deleted", label: "已删除" },
  { v: "auction", label: "拍卖中" },
  { v: "unknown", label: "未检测" },
];
const TYPES = [
  { v: "alpha", label: "纯字母" },
  { v: "numeric", label: "纯数字" },
  { v: "alphanumeric", label: "字母数字" },
  { v: "hyphen", label: "含连字符" },
];
const RISKS = [
  { v: "low", label: "低" },
  { v: "medium", label: "中" },
  { v: "high", label: "高" },
];
const PRESETS = [
  {
    label: "今日新掉",
    patch: {
      statuses: ["available"],
      dropTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      minScore: 50,
    },
  },
  { label: "高 DA 短域名", patch: { minDa: 45, maxLength: 8, minScore: 70, excludeRisk: true } },
  { label: ".do 品牌潜力", patch: { tlds: ["do"], minScore: 60, aiRecommendedOnly: true } },
  { label: "无负面记录", patch: { excludeRisk: true, archiveOnly: true, minScore: 55 } },
];

export function FilterPanel({
  filters,
  onChange,
  onSearch,
  onBatchScan,
  batchScanning,
  tldOptions,
}: {
  filters: TerminalFilters;
  onChange: (next: TerminalFilters) => void;
  onSearch?: () => void;
  onBatchScan?: () => void;
  batchScanning?: boolean;
  tldOptions?: string[];
}) {
  const tldList = tldOptions && tldOptions.length ? tldOptions : COMMON_TLDS;
  const [tldExpanded, setTldExpanded] = useState(false);
  const [tldQuery, setTldQuery] = useState("");
  const [customTld, setCustomTld] = useState("");
  const applied = countFilters(filters);

  const toggle = <K extends keyof TerminalFilters>(key: K, value: string) => {
    const current = (filters[key] as string[] | undefined) ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next.length ? next : undefined, page: 1 } as TerminalFilters);
  };
  const set = <K extends keyof TerminalFilters>(key: K, value: TerminalFilters[K]) =>
    onChange({ ...filters, [key]: value, page: 1 });
  const setTlds = (list: string[] | undefined) => {
    const norm = (list ?? [])
      .map((t) => t.trim().toLowerCase().replace(/^\./, ""))
      .filter((t) => /^[a-z0-9.-]+$/.test(t));
    set("tlds", norm.length ? Array.from(new Set(norm)) : undefined);
  };
  const visibleTlds = (tldExpanded ? tldList : tldList.slice(0, 18)).filter(
    (t) => !tldQuery || t.includes(tldQuery.toLowerCase().replace(/^\./, "")),
  );
  const selectedExtra = (filters.tlds ?? []).filter((t) => !tldList.includes(t));

  function addCustom() {
    const parts = customTld
      .split(/[\s,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setTlds([...(filters.tlds ?? []), ...parts]);
    setCustomTld("");
  }

  function applyPreset(patch: Partial<TerminalFilters>) {
    onChange({ ...filters, ...patch, page: 1 });
  }

  function reset() {
    onChange({
      page: 1,
      pageSize: filters.pageSize,
      sortBy: "score",
      sortDir: "desc",
      view: filters.view,
    });
  }

  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          高级筛选
        </div>
        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {applied} 已应用
        </span>
      </div>

      <Section title="关键词 / 语义搜索">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={filters.q ?? ""}
            onChange={(e) => set("q", e.target.value || undefined)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onSearch) onSearch();
            }}
            placeholder="AI agent / crypto / example.com"
            className="field pl-8"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          TODO: 接入向量/LLM 后替换当前本地语义占位。
        </p>
      </Section>

      <Section title="保存的预设">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.patch)}
              className="rounded-md border border-border bg-surface/70 px-2 py-1.5 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title={`TLD 后缀${filters.tlds?.length ? ` · ${filters.tlds.length}` : ""}`}>
        <input
          value={tldQuery}
          onChange={(e) => setTldQuery(e.target.value)}
          placeholder="搜索后缀"
          className="field mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {visibleTlds.map((t) => {
            const on = filters.tlds?.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggle("tlds", t)}
                type="button"
                className={chipClass(on)}
              >
                .{t}
              </button>
            );
          })}
          {selectedExtra.map((t) => (
            <button
              key={t}
              onClick={() => toggle("tlds", t)}
              type="button"
              className={chipClass(true)}
            >
              .{t} ×
            </button>
          ))}
        </div>
        {tldList.length > 18 && !tldQuery && (
          <button
            type="button"
            onClick={() => setTldExpanded((v) => !v)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            {tldExpanded ? "收起" : `展开全部 ${tldList.length} 个后缀`}
          </button>
        )}
        <div className="mt-2 flex gap-1.5">
          <input
            value={customTld}
            onChange={(e) =>
              setCustomTld(e.target.value.toLowerCase().replace(/[^a-z0-9.,\s]/g, ""))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="自定义：do, io, cn"
            className="field text-xs"
          />
          <button type="button" onClick={addCustom} className="btn-base btn-ghost !py-1 text-xs">
            加入
          </button>
        </div>
      </Section>

      <RangeSection
        title="长度范围"
        left={filters.minLength}
        right={filters.maxLength}
        leftPlaceholder="4"
        rightPlaceholder="20"
        min={1}
        max={63}
        onLeft={(v) => set("minLength", v)}
        onRight={(v) => set("maxLength", v)}
      />
      <RangeSection
        title="DA 权重"
        left={filters.minDa}
        right={filters.maxDa}
        leftPlaceholder="0"
        rightPlaceholder="100"
        min={0}
        max={100}
        onLeft={(v) => set("minDa", v)}
        onRight={(v) => set("maxDa", v)}
      />
      <RangeSection
        title="PA 权重"
        left={filters.minPa}
        right={filters.maxPa}
        leftPlaceholder="0"
        rightPlaceholder="100"
        min={0}
        max={100}
        onLeft={(v) => set("minPa", v)}
        onRight={(v) => set("maxPa", v)}
      />
      <RangeSection
        title="综合评分"
        left={filters.minScore}
        right={filters.scoreMax}
        leftPlaceholder="20"
        rightPlaceholder="100"
        min={0}
        max={100}
        onLeft={(v) => set("minScore", v)}
        onRight={(v) => set("scoreMax", v)}
      />
      <RangeSection
        title="预计价格 (USD)"
        left={filters.priceMin}
        right={filters.priceMax}
        leftPlaceholder="0"
        rightPlaceholder="50000"
        min={0}
        onLeft={(v) => set("priceMin", v)}
        onRight={(v) => set("priceMax", v)}
      />

      <Section title="掉落日期">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input
            type="date"
            value={filters.dropFrom ?? ""}
            onChange={(e) => set("dropFrom", e.target.value || undefined)}
            className="field"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="date"
            value={filters.dropTo ?? ""}
            onChange={(e) => set("dropTo", e.target.value || undefined)}
            className="field"
          />
        </div>
      </Section>

      <RangeSection
        title="反向链接数量"
        left={filters.backlinksMin}
        right={undefined}
        leftPlaceholder="0"
        rightPlaceholder=""
        min={0}
        onLeft={(v) => set("backlinksMin", v)}
        onRight={() => undefined}
        single
      />

      <Section title="状态 / 类型 / 风险">
        <ChipGroup
          items={STATUSES}
          active={filters.statuses}
          onToggle={(v) => toggle("statuses", v)}
        />
        <div className="mt-2">
          <ChipGroup items={TYPES} active={filters.types} onToggle={(v) => toggle("types", v)} />
        </div>
        <div className="mt-2">
          <ChipGroup
            items={RISKS}
            active={filters.riskLevels}
            onToggle={(v) => toggle("riskLevels", v)}
          />
        </div>
      </Section>

      <Section title="命名规则">
        <div className="space-y-2">
          <input
            value={filters.startsWith ?? ""}
            onChange={(e) => set("startsWith", e.target.value || undefined)}
            placeholder="开头"
            className="field"
          />
          <input
            value={filters.endsWith ?? ""}
            onChange={(e) => set("endsWith", e.target.value || undefined)}
            placeholder="结尾"
            className="field"
          />
          <input
            value={filters.contains ?? ""}
            onChange={(e) => set("contains", e.target.value || undefined)}
            placeholder="包含"
            className="field"
          />
          <input
            value={filters.regex ?? ""}
            onChange={(e) => set("regex", e.target.value || undefined)}
            placeholder="正则 ^[a-z]{3,5}$"
            className="field font-mono text-xs"
          />
        </div>
      </Section>

      <Section title="智能条件">
        <ToggleField
          label="仅显示高潜力域名"
          checked={!!filters.highPotentialOnly}
          onChange={(v) => set("highPotentialOnly", v || undefined)}
        />
        <ToggleField
          label="仅显示 AI 推荐域名"
          checked={!!filters.aiRecommendedOnly}
          onChange={(v) => set("aiRecommendedOnly", v || undefined)}
        />
        <ToggleField
          label="仅显示有 Archive.org 历史"
          checked={!!filters.archiveOnly}
          onChange={(v) => set("archiveOnly", v || undefined)}
        />
        <ToggleField
          label="排除负面记录 / 灰产风险"
          checked={!!filters.excludeRisk}
          onChange={(v) => set("excludeRisk", v || undefined)}
        />
      </Section>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        {onSearch && (
          <button type="button" onClick={onSearch} className="btn-base btn-primary">
            应用筛选
          </button>
        )}
        <button type="button" onClick={reset} className="btn-base btn-ghost" aria-label="重置筛选">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      {onBatchScan && (
        <button
          type="button"
          onClick={onBatchScan}
          disabled={batchScanning}
          className="btn-base btn-ghost w-full"
        >
          {batchScanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          批量 enrich / 实时扫描
        </button>
      )}
    </div>
  );
}

export function DomainTable({
  rows,
  total,
  filters,
  onChange,
  onWatch,
  onRefresh,
  onEnrich,
  isLoading,
  sourceLabel,
}: {
  rows: DomainRow[];
  total: number;
  filters: TerminalFilters;
  onChange: (next: TerminalFilters) => void;
  onWatch?: (d: DomainRow) => void;
  onRefresh?: (d: DomainRow) => void;
  onEnrich?: (d: DomainRow) => void;
  isLoading?: boolean;
  sourceLabel?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DomainRow | null>(null);
  const view = filters.view ?? "cards";
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.domain));
  const selectedRows = rows.filter((r) => selected.has(r.domain));

  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((d) => rows.some((r) => r.domain === d))));
  }, [rows]);

  const setSort = (col: TerminalFilters["sortBy"]) => {
    if (filters.sortBy === col)
      onChange({ ...filters, sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
    else onChange({ ...filters, sortBy: col, sortDir: "desc", page: 1 });
  };

  function toggleOne(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.domain)));
  }

  function exportCsv(list = selectedRows.length ? selectedRows : rows) {
    const blob = new Blob([exportDomainsCsv(list)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domainhunter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!rows.length && !isLoading) {
    return (
      <EmptyState
        title="暂无域名"
        hint="放宽 TLD 条件、降低 DA/评分阈值，或关闭仅 AI 推荐/仅 Archive 条件。"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="terminal-panel p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">结果 {total.toLocaleString()} 条</span>
              {sourceLabel && <span className="glass-chip">{sourceLabel}</span>}
              {selected.size > 0 && <span className="glass-chip">{selected.size} 已选择</span>}
              {isLoading && (
                <span className="glass-chip">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  同步中
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              支持卡片、虚拟表格与紧凑列表；导出会使用当前可见结果或已选择项。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => selectedRows.forEach((r) => onWatch?.(r))}
              disabled={!selectedRows.length || !onWatch}
              className="btn-base btn-ghost text-xs"
            >
              <Bookmark className="h-4 w-4" />
              加入观察
            </button>
            <button
              type="button"
              onClick={() => selectedRows.forEach((r) => onEnrich?.(r))}
              disabled={!selectedRows.length || !onEnrich}
              className="btn-base btn-ghost text-xs"
            >
              <Sparkles className="h-4 w-4" />
              批量 enrich
            </button>
            <button
              type="button"
              onClick={() => exportCsv()}
              className="btn-base btn-ghost text-xs"
            >
              <Download className="h-4 w-4" />
              导出
            </button>
            <select
              value={filters.sortBy ?? "score"}
              onChange={(e) => setSort(e.target.value as TerminalFilters["sortBy"])}
              className="field !w-auto !py-2 text-xs"
            >
              <option value="score">综合评分</option>
              <option value="drop_date">掉落时间</option>
              <option value="created_at">新增时间</option>
              <option value="da">DA</option>
              <option value="pa">PA</option>
              <option value="backlinks">反向链接</option>
              <option value="value">预计价格</option>
            </select>
            <ViewButton
              active={view === "cards"}
              label="卡片"
              onClick={() => onChange({ ...filters, view: "cards" })}
            >
              <Grid2X2 className="h-4 w-4" />
            </ViewButton>
            <ViewButton
              active={view === "table"}
              label="表格"
              onClick={() => onChange({ ...filters, view: "table" })}
            >
              <Table2 className="h-4 w-4" />
            </ViewButton>
            <ViewButton
              active={view === "compact"}
              label="紧凑"
              onClick={() => onChange({ ...filters, view: "compact" })}
            >
              <List className="h-4 w-4" />
            </ViewButton>
          </div>
        </div>
      </div>

      {view === "cards" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <DomainCard
              key={r.domain}
              row={r}
              checked={selected.has(r.domain)}
              onCheck={() => toggleOne(r.domain)}
              onDetail={() => setDetail(r)}
              onWatch={() => onWatch?.(r)}
              onRefresh={() => onRefresh?.(r)}
              onEnrich={() => onEnrich?.(r)}
            />
          ))}
        </div>
      )}

      {view === "table" && (
        <VirtualDomainTable
          rows={rows}
          selected={selected}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onToggle={toggleOne}
          onDetail={setDetail}
          onSort={setSort}
          filters={filters}
          onWatch={onWatch}
          onRefresh={onRefresh}
          onEnrich={onEnrich}
        />
      )}

      {view === "compact" && (
        <div className="terminal-panel divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <button
              key={r.domain}
              type="button"
              onClick={() => setDetail(r)}
              className="grid w-full grid-cols-[auto_minmax(0,1.6fr)_auto] items-center gap-3 px-3 py-2 text-left hover:bg-accent/40 md:grid-cols-[auto_minmax(0,1.8fr)_repeat(5,minmax(5rem,auto))_auto]"
            >
              <input
                type="checkbox"
                checked={selected.has(r.domain)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleOne(r.domain);
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-semibold text-primary">
                  {r.domain}
                </div>
                <div className="truncate text-xs text-muted-foreground">{r.aiSummary}</div>
              </div>
              <ScoreBadge score={r.score} />
              <div className="hidden text-xs mono md:block">DA {r.da}</div>
              <div className="hidden text-xs mono md:block">PA {r.pa}</div>
              <div className="hidden text-xs mono md:block">
                {(r.metrics?.backlinks ?? 0).toLocaleString()} BL
              </div>
              <div className="hidden text-xs mono md:block">{r.estimatedRange}</div>
              <RiskBadge level={r.risk_level} />
            </button>
          ))}
        </div>
      )}

      <div className="terminal-panel flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
        <div>
          共 <span className="mono font-medium text-foreground">{total.toLocaleString()}</span> 条 ·
          第 {filters.page}/{pages} 页
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filters.pageSize}
            onChange={(e) => onChange({ ...filters, pageSize: +e.target.value, page: 1 })}
            className="field !w-auto !py-1 text-xs"
          >
            {[20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}/页
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() => onChange({ ...filters, page: filters.page - 1 })}
            className="btn-base btn-ghost !px-2 !py-1"
            aria-label="上一页"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={filters.page >= pages}
            onClick={() => onChange({ ...filters, page: filters.page + 1 })}
            className="btn-base btn-ghost !px-2 !py-1"
            aria-label="下一页"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {detail && (
        <DomainDetailDrawer
          row={detail}
          onClose={() => setDetail(null)}
          onWatch={() => onWatch?.(detail)}
          onRefresh={() => onRefresh?.(detail)}
          onEnrich={() => onEnrich?.(detail)}
        />
      )}
    </div>
  );
}

function DomainCard({
  row,
  checked,
  onCheck,
  onDetail,
  onWatch,
  onRefresh,
  onEnrich,
}: {
  row: DomainRow;
  checked: boolean;
  onCheck: () => void;
  onDetail: () => void;
  onWatch?: () => void;
  onRefresh?: () => void;
  onEnrich?: () => void;
}) {
  return (
    <article
      className={cn(
        "terminal-panel domain-card-hover p-4",
        row.highPotential &&
          "border-primary/45 shadow-[0_0_32px_color-mix(in_oklab,var(--primary)_14%,transparent)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            className="mt-1"
            aria-label={`选择 ${row.domain}`}
          />
          <div className="min-w-0">
            <button
              type="button"
              onClick={onDetail}
              className="block max-w-full truncate font-mono text-base font-semibold text-primary hover:underline"
            >
              {row.domain}
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="glass-chip">.{row.tld}</span>
              <span className="glass-chip">{row.length} 字符</span>
              {row.highPotential && <span className="glass-chip text-success">高潜力</span>}
              {row.aiRecommended && <span className="glass-chip text-primary">AI 推荐</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-primary"
          aria-label="标记收藏"
        >
          <Star className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Score" value={<ScoreBadge score={row.score} />} />
        <Metric label="DA / PA" value={`${row.da} / ${row.pa}`} mono />
        <Metric label="Backlinks" value={(row.metrics?.backlinks ?? 0).toLocaleString()} mono />
        <Metric label="预计价值" value={row.estimatedRange} mono />
      </div>

      <p className="mt-4 min-h-[2.5rem] text-xs leading-5 text-muted-foreground">{row.aiSummary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={row.status} />
        <RiskBadge level={row.risk_level} />
        <span className="text-xs text-muted-foreground">
          掉落 {formatDate(row.drop_date ?? row.expiry_date)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <IconButton label="加入观察" onClick={onWatch}>
          <Bookmark className="h-4 w-4" />
        </IconButton>
        <IconButton label="详情分析" onClick={onDetail}>
          <Eye className="h-4 w-4" />
        </IconButton>
        <IconButton label="检查可注册状态" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </IconButton>
        <IconButton label="导出" onClick={() => downloadOne(row)}>
          <Download className="h-4 w-4" />
        </IconButton>
      </div>
      {onEnrich && (
        <button type="button" onClick={onEnrich} className="btn-base btn-ghost mt-2 w-full text-xs">
          <Sparkles className="h-4 w-4" /> Enrich DNS / Archive / SEO
        </button>
      )}
    </article>
  );
}

function VirtualDomainTable({
  rows,
  selected,
  allSelected,
  onToggleAll,
  onToggle,
  onDetail,
  onSort,
  filters,
  onWatch,
  onRefresh,
  onEnrich,
}: {
  rows: DomainRow[];
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggle: (domain: string) => void;
  onDetail: (row: DomainRow) => void;
  onSort: (col: TerminalFilters["sortBy"]) => void;
  filters: TerminalFilters;
  onWatch?: (d: DomainRow) => void;
  onRefresh?: (d: DomainRow) => void;
  onEnrich?: (d: DomainRow) => void;
}) {
  const rowHeight = 44;
  const viewportHeight = 572;
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 12;
  const visible = rows.slice(start, start + visibleCount);
  const topPad = start * rowHeight;
  const bottomPad = Math.max(0, (rows.length - start - visible.length) * rowHeight);
  const sortIcon = (col: string) =>
    filters.sortBy === col ? (filters.sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="terminal-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface/95 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="选择当前页"
                />
              </th>
              <Sortable col="domain" label="域名" onSort={onSort} suffix={sortIcon("domain")} />
              <Sortable col="length" label="长度" onSort={onSort} suffix={sortIcon("length")} />
              <th className="px-3 py-2 text-left font-medium">TLD</th>
              <Sortable
                col="drop_date"
                label="掉落日期"
                onSort={onSort}
                suffix={sortIcon("drop_date")}
              />
              <Sortable col="da" label="DA" onSort={onSort} suffix={sortIcon("da")} right />
              <Sortable col="pa" label="PA" onSort={onSort} suffix={sortIcon("pa")} right />
              <Sortable
                col="backlinks"
                label="反向链接"
                onSort={onSort}
                suffix={sortIcon("backlinks")}
                right
              />
              <Sortable col="score" label="综合评分" onSort={onSort} suffix={sortIcon("score")} />
              <Sortable
                col="value"
                label="预计价值"
                onSort={onSort}
                suffix={sortIcon("value")}
                right
              />
              <th className="px-3 py-2 text-left font-medium">风险</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
        </table>
        <div
          className="max-h-[572px] overflow-auto"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <table className="w-full min-w-[1080px] text-sm">
            <tbody>
              {topPad > 0 && (
                <tr style={{ height: topPad }}>
                  <td colSpan={12} />
                </tr>
              )}
              {visible.map((r) => (
                <tr
                  key={r.domain}
                  className="border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.domain)}
                      onChange={() => onToggle(r.domain)}
                      aria-label={`选择 ${r.domain}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onDetail(r)}
                      className="font-mono font-medium text-primary hover:underline"
                    >
                      {r.domain}
                    </button>
                    <div className="truncate text-[11px] text-muted-foreground">{r.aiSummary}</div>
                  </td>
                  <td className="px-3 py-2 mono">{r.length}</td>
                  <td className="px-3 py-2">.{r.tld}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(r.drop_date ?? r.expiry_date)}
                  </td>
                  <td className="px-3 py-2 text-right mono">{r.da}</td>
                  <td className="px-3 py-2 text-right mono">{r.pa}</td>
                  <td className="px-3 py-2 text-right mono">
                    {(r.metrics?.backlinks ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreBadge score={r.score} />
                  </td>
                  <td className="px-3 py-2 text-right mono">{r.estimatedRange}</td>
                  <td className="px-3 py-2">
                    <RiskBadge level={r.risk_level} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {onRefresh && (
                        <button
                          type="button"
                          onClick={() => onRefresh(r)}
                          title="RDAP 刷新"
                          className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onEnrich && (
                        <button
                          type="button"
                          onClick={() => onEnrich(r)}
                          title="一键丰富"
                          className="grid h-7 w-7 place-items-center rounded text-primary hover:bg-primary/10"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onWatch && (
                        <button
                          type="button"
                          onClick={() => onWatch(r)}
                          title="观察"
                          className="grid h-7 w-7 place-items-center rounded hover:bg-accent"
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <a
                        href={registrarUrl(r.domain)}
                        target="_blank"
                        rel="noreferrer"
                        title="注册"
                        className="grid h-7 w-7 place-items-center rounded text-primary hover:bg-accent"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {bottomPad > 0 && (
                <tr style={{ height: bottomPad }}>
                  <td colSpan={12} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DomainDetailDrawer({
  row,
  onClose,
  onWatch,
  onRefresh,
  onEnrich,
}: {
  row: DomainRow;
  onClose: () => void;
  onWatch?: () => void;
  onRefresh?: () => void;
  onEnrich?: () => void;
}) {
  const [tab, setTab] = useState("Overview");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭详情"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${row.domain} 详情`}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl sm:max-w-2xl"
      >
        <div className="border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-mono text-xl font-semibold text-primary">
                  {row.domain}
                </h2>
                <a
                  href={registrarUrl(row.domain)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary"
                  aria-label="打开注册商"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="glass-chip">.{row.tld}</span>
                <span className="glass-chip">{row.length} 字符</span>
                <StatusBadge status={row.status} />
                <RiskBadge level={row.risk_level} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface hover:bg-accent"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto">
            {["Overview", "History", "Metrics", "AI Insights", "Actions"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "Overview" && <Overview row={row} />}
          {tab === "History" && <HistoryTab row={row} />}
          {tab === "Metrics" && <MetricsTab row={row} />}
          {tab === "AI Insights" && <AIInsights row={row} />}
          {tab === "Actions" && (
            <ActionsTab row={row} onWatch={onWatch} onRefresh={onRefresh} onEnrich={onEnrich} />
          )}
        </div>
      </aside>
    </div>
  );
}

function Overview({ row }: { row: DomainRow }) {
  const total =
    row.scoreParts.seo + row.scoreParts.brand + row.scoreParts.scarcity + row.scoreParts.risk;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoTile label="综合评分" value={`${row.score}/100`} tone="primary" />
        <InfoTile label="DA / PA" value={`${row.da}/${row.pa}`} />
        <InfoTile label="预计价值" value={row.estimatedRange} />
        <InfoTile label="掉落日期" value={formatDate(row.drop_date ?? row.expiry_date)} />
      </div>
      <section className="terminal-panel p-4">
        <h3 className="mb-3 text-sm font-semibold">评分构成</h3>
        <ScoreBar label="SEO 潜力" value={row.scoreParts.seo} max={40} />
        <ScoreBar label="品牌可记忆性" value={row.scoreParts.brand} max={30} />
        <ScoreBar label="市场稀缺度" value={row.scoreParts.scarcity} max={20} />
        <ScoreBar label="风险安全性" value={row.scoreParts.risk} max={10} />
        <div className="mt-3 text-xs text-muted-foreground">
          当前模型：SEO 40% / 品牌 30% / 稀缺 20% / 风险 10%。总分构成参考值 {total}/100。
        </div>
      </section>
      <section className="terminal-panel p-4">
        <h3 className="mb-2 text-sm font-semibold">AI 一句话总结</h3>
        <p className="text-sm leading-6 text-muted-foreground">{row.aiSummary}</p>
      </section>
    </div>
  );
}

function HistoryTab({ row }: { row: DomainRow }) {
  const years = Array.from({ length: 13 }, (_, i) => 2013 + i);
  return (
    <div className="space-y-4">
      <section className="terminal-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" />
            归档历史 (Wayback)
          </h3>
          <span className="text-xs text-muted-foreground">
            快照数 {row.metrics?.archive_count ?? 0}
          </span>
        </div>
        <div className="flex h-28 items-end gap-2">
          {years.map((y, i) => {
            const h = row.hasArchive ? 20 + ((row.trend[i % row.trend.length] + i * 7) % 78) : 8;
            return (
              <div key={y} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t bg-primary/80" style={{ height: `${h}%` }} />
                <span className="text-[10px] text-muted-foreground">{String(y).slice(2)}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="terminal-panel p-4">
        <h3 className="mb-3 text-sm font-semibold">状态时间线</h3>
        <Timeline
          items={[
            ["首次入库", row.created_at ? formatDate(row.created_at) : "模拟数据"],
            ["Archive 检测", row.hasArchive ? `最早 ${row.metrics?.archive_year}` : "无历史快照"],
            ["风险核查", row.riskNote],
            ["可注册状态", statusText(row.status)],
          ]}
        />
      </section>
    </div>
  );
}

function MetricsTab({ row }: { row: DomainRow }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MiniChart label="DA" value={row.da} data={row.trend} />
        <MiniChart label="PA" value={row.pa} data={row.trend.map((v) => Math.max(4, v - 8))} />
        <MiniChart
          label="外链数"
          value={`${(row.metrics?.backlinks ?? 0).toLocaleString()}`}
          data={row.trend.map((v) => v * 1.4)}
        />
        <MiniChart
          label="引用域"
          value={`${(row.metrics?.referring_domains ?? 0).toLocaleString()}`}
          data={row.trend.map((v) => v * 0.75)}
        />
      </div>
      <section className="terminal-panel p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" />
          TLD 竞品占用
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {["com", "net", "org", "io", "ai", "co", "do", "cn"].map((t, i) => (
            <div key={t} className="rounded-lg border border-border bg-surface/70 p-2 text-center">
              <div className="font-mono text-xs text-muted-foreground">.{t}</div>
              <div
                className={cn(
                  "mt-1 text-xs",
                  i < (row.metrics?.tld_registered_count ?? 0) ? "text-warning" : "text-success",
                )}
              >
                {i < (row.metrics?.tld_registered_count ?? 0) ? "已占用" : "可查"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AIInsights({ row }: { row: DomainRow }) {
  return (
    <div className="space-y-4">
      <section className="terminal-panel p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          AI 洞察
        </h3>
        <p className="text-sm leading-7 text-muted-foreground">
          {row.domain} 的主体词为 {row.name}，长度 {row.length}，输入成本较低。语义上适合
          {row.score >= 80
            ? " AI 工具、开发者平台、SaaS 产品或数据型社区"
            : "垂直内容站、轻量工具或品牌保护型观察"}
          。 当前 DA {row.da}、PA {row.pa}，外链规模{" "}
          {(row.metrics?.backlinks ?? 0).toLocaleString()}，SEO 潜力
          {row.scoreParts.seo >= 25 ? "较强" : "中等"}。品牌记忆性{" "}
          {row.scoreParts.brand >= 20 ? "较好" : "一般"}， 市场稀缺度{" "}
          {row.scoreParts.scarcity >= 15 ? "偏高" : "仍需观察"}。风险侧：{row.riskNote}。
          类似方向可继续关注 {row.name}.io、{row.name}.ai、get{row.name}.com。
        </p>
        <p className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-xs text-warning">
          TODO: 真实 LLM 接入应走后端环境变量；前端仅展示 fallback 内容，调用失败不得导致页面崩溃。
        </p>
      </section>
    </div>
  );
}

function ActionsTab({
  row,
  onWatch,
  onRefresh,
  onEnrich,
}: {
  row: DomainRow;
  onWatch?: () => void;
  onRefresh?: () => void;
  onEnrich?: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="terminal-panel grid gap-2 p-4 sm:grid-cols-2">
        <ActionButton
          onClick={onWatch}
          label="加入观察列表"
          icon={<Bookmark className="h-4 w-4" />}
        />
        <ActionButton
          onClick={onRefresh}
          label="检查可注册状态"
          icon={<RefreshCw className="h-4 w-4" />}
        />
        <ActionButton
          onClick={onEnrich}
          label="批量 enrich"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <ActionButton
          onClick={() => downloadOne(row)}
          label="导出评估报告"
          icon={<FileText className="h-4 w-4" />}
        />
      </section>
      <section className="terminal-panel p-4">
        <h3 className="mb-3 text-sm font-semibold">注册商跳转</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            [
              "Namecheap",
              `https://www.namecheap.com/domains/registration/results/?domain=${row.domain}`,
            ],
            ["GoDaddy", `https://www.godaddy.com/domainsearch/find?domainToCheck=${row.domain}`],
            [
              "阿里云",
              `https://wanwang.aliyun.com/domain/searchresult/?keyword=${row.name}&suffix=.${row.tld}`,
            ],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="btn-base btn-ghost text-xs"
            >
              <ExternalLink className="h-4 w-4" />
              {label}
            </a>
          ))}
        </div>
      </section>
      <section className="terminal-panel p-4">
        <h3 className="mb-2 text-sm font-semibold">告警渠道</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {["邮件", "Telegram", "Discord", "Webhook"].map((item) => (
            <label
              key={item}
              className="flex items-center justify-between rounded-lg border border-border bg-surface/70 px-3 py-2 text-sm"
            >
              {item}
              <input type="checkbox" />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function RangeSection({
  title,
  left,
  right,
  leftPlaceholder,
  rightPlaceholder,
  min,
  max,
  onLeft,
  onRight,
  single,
}: {
  title: string;
  left?: number;
  right?: number;
  leftPlaceholder: string;
  rightPlaceholder: string;
  min: number;
  max?: number;
  onLeft: (v: number | undefined) => void;
  onRight: (v: number | undefined) => void;
  single?: boolean;
}) {
  const input = (
    value: number | undefined,
    placeholder: string,
    cb: (v: number | undefined) => void,
  ) => (
    <input
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => cb(e.target.value ? +e.target.value : undefined)}
      placeholder={placeholder}
      className="field"
    />
  );
  return (
    <Section title={title}>
      {single ? (
        input(left, leftPlaceholder, onLeft)
      ) : (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {input(left, leftPlaceholder, onLeft)}
          <span className="text-muted-foreground">-</span>
          {input(right, rightPlaceholder, onRight)}
        </div>
      )}
    </Section>
  );
}

function ChipGroup({
  items,
  active,
  onToggle,
}: {
  items: { v: string; label: string }[];
  active?: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <button
          key={s.v}
          onClick={() => onToggle(s.v)}
          type="button"
          className={chipClass(active?.includes(s.v))}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-400"
      />
    </label>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg border",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-surface/80 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={label}
      aria-label={label}
      className="grid h-9 place-items-center rounded-lg border border-border bg-surface/70 text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Metric({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-medium", mono && "mono")}>{value}</div>
    </div>
  );
}

function Sortable({
  col,
  label,
  suffix,
  onSort,
  right,
}: {
  col: TerminalFilters["sortBy"];
  label: string;
  suffix: string;
  onSort: (col: TerminalFilters["sortBy"]) => void;
  right?: boolean;
}) {
  return (
    <th
      className={cn("cursor-pointer px-3 py-2 font-medium", right ? "text-right" : "text-left")}
      onClick={() => onSort(col)}
    >
      <span className={cn("inline-flex items-center gap-1", right && "justify-end")}>
        {label}
        {suffix || <ArrowDownUp className="h-3 w-3 opacity-35" />}
      </span>
    </th>
  );
}

function InfoTile({ label, value, tone }: { label: string; value: ReactNode; tone?: "primary" }) {
  return (
    <div className="terminal-panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold mono", tone === "primary" && "text-primary")}>
        {value}
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="mono">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Timeline({ items }: { items: [string, string][] }) {
  return (
    <ol className="space-y-3">
      {items.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[auto_1fr] gap-3">
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
          <div>
            <div className="text-sm font-medium">{k}</div>
            <div className="text-xs text-muted-foreground">{v}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function MiniChart({ label, value, data }: { label: string; value: ReactNode; data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="terminal-panel p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mono text-lg font-semibold">{value}</div>
      </div>
      <div className="mt-3 flex h-16 items-end gap-1">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-primary/75"
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="btn-base btn-ghost justify-start text-xs"
    >
      {icon}
      {label}
    </button>
  );
}

function downloadOne(row: DomainRow) {
  const blob = new Blob([exportDomainsCsv([row])], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${row.domain}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function registrarUrl(domain: string) {
  return `https://www.namecheap.com/domains/registration/results/?domain=${domain}`;
}

function statusText(status: string) {
  return (
    {
      available: "可注册",
      registered: "已注册",
      pending_delete: "待删除",
      auction: "拍卖中",
      unknown: "未检测",
    }[status] ?? status
  );
}

function chipClass(on?: boolean) {
  return cn(
    "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
    on
      ? "border-primary bg-primary/10 text-primary"
      : "border-border bg-surface/70 text-muted-foreground hover:border-border-strong hover:text-foreground",
  );
}

function countFilters(filters: TerminalFilters) {
  const keys: Array<keyof TerminalFilters> = [
    "q",
    "tlds",
    "statuses",
    "types",
    "minLength",
    "maxLength",
    "minScore",
    "scoreMax",
    "startsWith",
    "endsWith",
    "contains",
    "regex",
    "archiveYearMin",
    "backlinksMin",
    "riskLevels",
    "minDa",
    "maxDa",
    "minPa",
    "maxPa",
    "priceMin",
    "priceMax",
    "dropFrom",
    "dropTo",
    "highPotentialOnly",
    "aiRecommendedOnly",
    "archiveOnly",
    "excludeRisk",
  ];
  return keys.reduce((n, key) => {
    const value = filters[key];
    if (Array.isArray(value)) return n + (value.length ? 1 : 0);
    return n + (value == null || value === false || value === "" ? 0 : 1);
  }, 0);
}
