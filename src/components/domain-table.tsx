// Domain table + filter panel + mobile cards. Shared by /discover and its presets.
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Eye, ExternalLink, RefreshCw, Filter, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { ScoreBadge, StatusBadge, RiskBadge, EmptyState } from "./app-shell";
import type { DiscoverFilters } from "@/lib/discover.functions";

export type DomainRow = {
  id: number;
  domain: string;
  name: string;
  tld: string;
  length: number;
  type: string;
  status: string;
  score: number;
  risk_level: string;
  drop_date: string | null;
  expiry_date: string | null;
  metrics?: {
    backlinks: number;
    referring_domains: number;
    archive_year: number | null;
    archive_count: number;
    tld_registered_count: number;
  } | null;
};

const COMMON_TLDS = [
  // gTLD 热门
  "com", "net", "org", "info", "biz", "pro", "name", "mobi",
  // 新 gTLD 热门
  "io", "ai", "co", "app", "dev", "xyz", "site", "online", "store", "shop",
  "tech", "cloud", "club", "fun", "icu", "live", "world", "today", "blog",
  "design", "studio", "agency", "media", "news", "art", "vip", "top",
  "wiki", "link", "page", "space", "website",
  // ccTLD 常见
  "cn", "com.cn", "net.cn", "cc", "tv", "me", "us", "uk", "co.uk",
  "de", "jp", "co.jp", "kr", "tw", "hk", "sg", "in", "ru", "br",
  "fr", "it", "es", "nl", "ca", "au", "com.au", "nz", "ch", "se",
  "no", "fi", "dk", "pl", "be", "at", "cz", "ie", "mx", "ar",
  // 极客 / 短
  "to", "is", "im", "li", "la", "fm", "gg", "so", "ws",
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

export function FilterPanel({
  filters, onChange, onSearch,
}: {
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
  onSearch?: () => void;
}) {
  const [tldExpanded, setTldExpanded] = useState(false);
  const [tldQuery, setTldQuery] = useState("");
  const [customTld, setCustomTld] = useState("");

  const toggle = <K extends keyof DiscoverFilters>(key: K, value: string) => {
    const current = (filters[key] as string[] | undefined) ?? [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next, page: 1 } as DiscoverFilters);
  };
  const set = <K extends keyof DiscoverFilters>(key: K, value: DiscoverFilters[K]) =>
    onChange({ ...filters, [key]: value, page: 1 });

  // 统一去重 + 规范化 TLD 列表
  const setTlds = (list: string[] | undefined) => {
    if (!list || !list.length) { set("tlds", undefined); return; }
    const norm = list
      .map(t => t.trim().toLowerCase().replace(/^\./, ""))
      .filter(t => /^[a-z0-9.\-]+$/.test(t));
    const dedup = Array.from(new Set(norm));
    set("tlds", dedup.length ? dedup : undefined);
  };

  const visibleTlds = (tldExpanded ? COMMON_TLDS : COMMON_TLDS.slice(0, 18))
    .filter(t => !tldQuery || t.includes(tldQuery.toLowerCase()));
  const selectedExtra = (filters.tlds ?? []).filter(t => !COMMON_TLDS.includes(t));

  const addCustom = () => {
    const parts = customTld.split(/[\s,，\n]+/).map(s => s.trim().replace(/^\./, "")).filter(Boolean);
    if (!parts.length) return;
    const before = filters.tlds?.length ?? 0;
    setTlds([...(filters.tlds ?? []), ...parts]);
    const added = parts.filter(p => !(filters.tlds ?? []).includes(p.toLowerCase())).length;
    const dup = parts.length - added;
    if (typeof window !== "undefined") {
      import("sonner").then(({ toast }) => {
        toast.success(`已加入 ${added} 个后缀${dup ? `，去重 ${dup} 个` : ""}（共 ${before + added}）`);
      });
    }
    setCustomTld("");
  };

  const runBatchSearch = () => {
    const n = filters.tlds?.length ?? 0;
    if (!n) {
      import("sonner").then(({ toast }) => toast.error("请先选择至少 1 个后缀"));
      return;
    }
    const ok = typeof window === "undefined"
      ? true
      : window.confirm(`将按 ${n} 个 TLD 进行批量查询。\n预计返回最多 ${filters.pageSize ?? 50} 条/页（数据库现有匹配记录）。\n确定开始？`);
    if (ok && onSearch) onSearch();
  };

  return (
    <div className="space-y-5 text-sm">
      <Section title="关键词">
        <input
          value={filters.q ?? ""}
          onChange={e => set("q", e.target.value || undefined)}
          onKeyDown={e => { if (e.key === "Enter" && onSearch) onSearch(); }}
          placeholder="域名 / 子串"
          className="field"
        />
      </Section>

      <Section title={`后缀${filters.tlds?.length ? ` · 已选 ${filters.tlds.length}` : ""}`}>
        {/* 批量快捷操作 */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => set("tlds", Array.from(new Set([...(filters.tlds ?? []), ...COMMON_TLDS])))}
            className="rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">全选</button>
          <button type="button" onClick={() => set("tlds", Array.from(new Set([...(filters.tlds ?? []), ...["com","net","org","io","ai","co","app","dev","xyz"]])))}
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground hover:border-border-strong">+ 热门 gTLD</button>
          <button type="button" onClick={() => set("tlds", Array.from(new Set([...(filters.tlds ?? []), ...["cn","com.cn","net.cn","hk","tw","jp","kr","sg"]])))}
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground hover:border-border-strong">+ 亚洲 ccTLD</button>
          <button type="button" onClick={() => set("tlds", Array.from(new Set([...(filters.tlds ?? []), ...["de","uk","co.uk","fr","it","es","nl","ch","se","no","fi","dk","pl","be","at","ie"]])))}
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground hover:border-border-strong">+ 欧洲 ccTLD</button>
          <button type="button" onClick={() => set("tlds", Array.from(new Set([...(filters.tlds ?? []), ...["to","is","im","li","la","fm","gg","so","ws","cc","tv","me"]])))}
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground hover:border-border-strong">+ 极客短</button>
          {(filters.tlds?.length ?? 0) > 0 && (
            <button type="button" onClick={() => set("tlds", undefined)}
              className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">清空</button>
          )}
        </div>
        <input
          value={tldQuery}
          onChange={e => setTldQuery(e.target.value)}
          placeholder="搜索后缀，例如 com / cn"
          className="field mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {visibleTlds.map(t => {
            const on = filters.tlds?.includes(t);
            return (
              <button key={t} onClick={() => toggle("tlds", t)} type="button"
                className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:border-border-strong"
                }`}>.{t}</button>
            );
          })}
          {selectedExtra.map(t => (
            <button key={t} onClick={() => toggle("tlds", t)} type="button"
              className="rounded-md border border-primary bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">.{t} ×</button>
          ))}
        </div>
        {COMMON_TLDS.length > 18 && !tldQuery && (
          <button type="button" onClick={() => setTldExpanded(v => !v)}
            className="mt-2 text-xs text-primary hover:underline">
            {tldExpanded ? "收起" : `展开全部 ${COMMON_TLDS.length} 个后缀 →`}
          </button>
        )}
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-1.5">
            <input
              value={customTld}
              onChange={e => setCustomTld(e.target.value.toLowerCase().replace(/[^a-z0-9.,\s]/g, ""))}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="批量粘贴：com, net, io 或换行分隔"
              className="field flex-1 text-xs"
            />
            <button type="button" onClick={addCustom}
              className="btn-base btn-ghost !py-1 text-xs">加入</button>
          </div>
          <div className="text-[11px] text-muted-foreground">支持逗号/空格/换行分隔的批量后缀</div>
        </div>
      </Section>

      <Section title="状态">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(s => {
            const on = filters.statuses?.includes(s.v);
            return (
              <button key={s.v} onClick={() => toggle("statuses", s.v)} type="button"
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"
                }`}>{s.label}</button>
            );
          })}
        </div>
      </Section>

      <Section title="字符类型">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map(s => {
            const on = filters.types?.includes(s.v);
            return (
              <button key={s.v} onClick={() => toggle("types", s.v)} type="button"
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"
                }`}>{s.label}</button>
            );
          })}
        </div>
      </Section>

      <Section title="长度">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={1} max={63} value={filters.minLength ?? ""} onChange={e => set("minLength", e.target.value ? +e.target.value : undefined)} placeholder="最小" className="field" />
          <input type="number" min={1} max={63} value={filters.maxLength ?? ""} onChange={e => set("maxLength", e.target.value ? +e.target.value : undefined)} placeholder="最大" className="field" />
        </div>
      </Section>

      <Section title="最低评分">
        <input type="number" min={0} max={100} value={filters.minScore ?? ""} onChange={e => set("minScore", e.target.value ? +e.target.value : undefined)} placeholder="例如 60" className="field" />
      </Section>

      <Section title="开头 / 结尾 / 包含">
        <div className="space-y-2">
          <input value={filters.startsWith ?? ""} onChange={e => set("startsWith", e.target.value || undefined)} placeholder="开头" className="field" />
          <input value={filters.endsWith ?? ""} onChange={e => set("endsWith", e.target.value || undefined)} placeholder="结尾" className="field" />
          <input value={filters.contains ?? ""} onChange={e => set("contains", e.target.value || undefined)} placeholder="包含" className="field" />
        </div>
      </Section>

      <Section title="正则匹配">
        <input value={filters.regex ?? ""} onChange={e => set("regex", e.target.value || undefined)} placeholder="^[a-z]{3,5}$" className="field" />
      </Section>

      <Section title="Archive 年份 / 外链">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={1990} max={2026} value={filters.archiveYearMin ?? ""} onChange={e => set("archiveYearMin", e.target.value ? +e.target.value : undefined)} placeholder="年份 ≥" className="field" />
          <input type="number" min={0} value={filters.backlinksMin ?? ""} onChange={e => set("backlinksMin", e.target.value ? +e.target.value : undefined)} placeholder="外链 ≥" className="field" />
        </div>
      </Section>

      <Section title="风险等级">
        <div className="flex flex-wrap gap-1.5">
          {RISKS.map(s => {
            const on = filters.riskLevels?.includes(s.v);
            return (
              <button key={s.v} onClick={() => toggle("riskLevels", s.v)} type="button"
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"
                }`}>{s.label}</button>
            );
          })}
        </div>
      </Section>

      <div className="flex gap-2">
        {onSearch && (
          <button type="button" onClick={onSearch}
            className="btn-base btn-primary flex-1">查询</button>
        )}
        <button type="button" onClick={() => onChange({ page: 1, pageSize: filters.pageSize, sortBy: "score", sortDir: "desc" })}
          className="btn-base btn-ghost flex-1">清空</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export function DomainTable({
  rows, total, filters, onChange, onWatch, onRefresh, onEnrich,
}: {
  rows: DomainRow[];
  total: number;
  filters: DiscoverFilters;
  onChange: (next: DiscoverFilters) => void;
  onWatch?: (d: DomainRow) => void;
  onRefresh?: (d: DomainRow) => void;
  onEnrich?: (d: DomainRow) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const setSort = (col: DiscoverFilters["sortBy"]) => {
    if (filters.sortBy === col) onChange({ ...filters, sortDir: filters.sortDir === "asc" ? "desc" : "asc" });
    else onChange({ ...filters, sortBy: col, sortDir: "desc" });
  };
  const sortIcon = (col: string) => filters.sortBy === col ? (filters.sortDir === "asc" ? " ↑" : " ↓") : "";

  if (!rows.length) {
    return <EmptyState title="暂无域名" hint="尝试调整筛选条件，或在后台导入域名 TXT/CSV。" />;
  }

  return (
    <div className="space-y-3">
      {/* Desktop table */}
      <div className="card-elev hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="cursor-pointer px-4 py-2 text-left font-medium" onClick={() => setSort("domain")}>域名{sortIcon("domain")}</th>
                <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => setSort("score")}>评分{sortIcon("score")}</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => setSort("length")}>长度{sortIcon("length")}</th>
                <th className="px-3 py-2 text-left font-medium">类型</th>
                <th className="px-3 py-2 text-right font-medium">BL</th>
                <th className="px-3 py-2 text-right font-medium">DP</th>
                <th className="px-3 py-2 text-right font-medium">ABY</th>
                <th className="px-3 py-2 text-right font-medium">Reg</th>
                <th className="cursor-pointer px-3 py-2 text-left font-medium" onClick={() => setSort("drop_date")}>到期/删除{sortIcon("drop_date")}</th>
                <th className="px-3 py-2 text-left font-medium">风险</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <Link to="/domains/$domain" params={{ domain: r.domain }} className="font-medium text-foreground hover:text-primary">{r.domain}</Link>
                  </td>
                  <td className="px-3 py-2"><ScoreBadge score={r.score} /></td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 tabular-nums">{r.length}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.type}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.metrics?.backlinks ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.metrics?.referring_domains ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.metrics?.archive_year ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.metrics?.tld_registered_count ?? 0}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDate(r.drop_date ?? r.expiry_date)}</td>
                  <td className="px-3 py-2"><RiskBadge level={r.risk_level} /></td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {onRefresh && <button type="button" onClick={() => onRefresh(r)} title="RDAP 刷新" className="grid h-7 w-7 place-items-center rounded hover:bg-accent"><RefreshCw className="h-3.5 w-3.5" /></button>}
                      {onEnrich && <button type="button" onClick={() => onEnrich(r)} title="一键丰富 DNS/Archive/SEO" className="grid h-7 w-7 place-items-center rounded text-primary hover:bg-primary/10"><Sparkles className="h-3.5 w-3.5" /></button>}
                      {onWatch && <button type="button" onClick={() => onWatch(r)} title="观察" className="grid h-7 w-7 place-items-center rounded hover:bg-accent"><Eye className="h-3.5 w-3.5" /></button>}
                      <a href={`https://www.namecheap.com/domains/registration/results/?domain=${r.domain}`} target="_blank" rel="noreferrer" title="注册" className="grid h-7 w-7 place-items-center rounded text-primary hover:bg-accent"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map(r => (
          <div key={r.id} className="card-elev p-3">
            <div className="flex items-start justify-between gap-2">
              <Link to="/domains/$domain" params={{ domain: r.domain }} className="min-w-0 truncate text-sm font-semibold text-foreground hover:text-primary">{r.domain}</Link>
              <ScoreBadge score={r.score} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <StatusBadge status={r.status} />
              <span>·{r.length}字符</span>
              <span>·{r.type}</span>
              <RiskBadge level={r.risk_level} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground tabular-nums">
              <span>BL {r.metrics?.backlinks ?? 0}</span>
              <span>DP {r.metrics?.referring_domains ?? 0}</span>
              <span>ABY {r.metrics?.archive_year ?? "—"}</span>
              <span>{formatDate(r.drop_date ?? r.expiry_date)}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {onEnrich && <button type="button" onClick={() => onEnrich(r)} className="btn-base btn-ghost flex-1 !py-1.5 text-xs"><Sparkles className="h-3 w-3" />丰富</button>}
              {onWatch && <button type="button" onClick={() => onWatch(r)} className="btn-base btn-ghost flex-1 !py-1.5 text-xs">观察</button>}
              <Link to="/domains/$domain" params={{ domain: r.domain }} className="btn-base btn-ghost flex-1 !py-1.5 text-xs">详情</Link>
              <a href={`https://www.namecheap.com/domains/registration/results/?domain=${r.domain}`} target="_blank" rel="noreferrer" className="btn-base btn-primary flex-1 !py-1.5 text-xs">注册</a>
            </div>
          </div>
        ))}
      </div>

      {/* Pager */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>共 <span className="tabular-nums font-medium text-foreground">{total.toLocaleString()}</span> 条 · 第 {filters.page}/{pages} 页</div>
        <div className="flex items-center gap-2">
          <select
            value={filters.pageSize}
            onChange={e => onChange({ ...filters, pageSize: +e.target.value, page: 1 })}
            className="field !w-auto !py-1 text-xs"
          >
            {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}/页</option>)}
          </select>
          <button type="button" disabled={filters.page <= 1} onClick={() => onChange({ ...filters, page: filters.page - 1 })} className="btn-base btn-ghost !px-2 !py-1"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={filters.page >= pages} onClick={() => onChange({ ...filters, page: filters.page + 1 })} className="btn-base btn-ghost !px-2 !py-1"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

function formatDate(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toISOString().slice(0, 10); } catch { return "—"; }
}

export function MobileFilterToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-base btn-ghost lg:hidden">
      <Filter className="h-4 w-4" />筛选{open ? "" : ""}
    </button>
  );
}
