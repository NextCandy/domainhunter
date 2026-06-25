import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Sparkles, Search, Bookmark, Trash2, Loader2 } from "lucide-react";
import { AppShell, PageHeader, EmptyState } from "@/components/app-shell";
import { generateIdeasFn, listIdeasFn, deleteIdeaFn } from "@/lib/ideas.functions";
import { toggleWatchFn } from "@/lib/discover.functions";
import type { DomainIdea } from "@/lib/services/types";

export const Route = createFileRoute("/ideas")({
  head: () => ({
    meta: [
      { title: "域名灵感 — DomainHunter" },
      { name: "description", content: "AI 驱动的域名灵感生成器：关键词、行业、用途 → 候选域名 + 推荐理由 + 评分。" },
    ],
  }),
  component: IdeasPage,
});

const TLD_PRESETS = ["com", "net", "io", "ai", "app", "co", "cc", "xyz", "dev", "tech"];

function IdeasPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const gen = useServerFn(generateIdeasFn);
  const del = useServerFn(deleteIdeaFn);
  const toggle = useServerFn(toggleWatchFn);

  const [keywords, setKeywords] = useState("");
  const [industry, setIndustry] = useState("");
  const [useCase, setUseCase] = useState("SaaS / 工具站");
  const [language, setLanguage] = useState<"en" | "zh" | "pinyin" | "mixed">("mixed");
  const [minLen, setMinLen] = useState(3);
  const [maxLen, setMaxLen] = useState(12);
  const [count, setCount] = useState(15);
  const [tlds, setTlds] = useState<string[]>(["com", "io", "ai", "app"]);
  const [results, setResults] = useState<DomainIdea[]>([]);

  const history = useQuery({ queryKey: ["idea-history"], queryFn: () => listIdeasFn() });

  const mutGen = useMutation({
    mutationFn: () => gen({ data: { keywords, industry, useCase, language, minLen, maxLen, count, tlds } }),
    onSuccess: (res) => {
      setResults(res.ideas);
      qc.invalidateQueries({ queryKey: ["idea-history"] });
      toast.success(`生成 ${res.ideas.length} 个候选域名`);
    },
    onError: (e: Error) => toast.error("生成失败：" + e.message),
  });

  const mutDel = useMutation({
    mutationFn: (id: number) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idea-history"] }),
  });

  function toggleTld(t: string) {
    setTlds(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function copy(d: string) {
    navigator.clipboard.writeText(d).then(() => toast.success(`已复制 ${d}`)).catch(() => toast.error("复制失败"));
  }
  function check(d: string) {
    nav({ to: "/discover", search: { q: d.split(".")[0] } as never }).catch(() => nav({ to: "/discover" }));
  }
  async function watch(d: string) {
    try { await toggle({ data: { domain: d } }); toast.success(`已加入观察列表：${d}`); }
    catch (e) { toast.error("加入失败：" + (e as Error).message); }
  }

  return (
    <AppShell>
      <PageHeader title="域名灵感" description="输入关键词与方向，生成可选域名候选，附带理由与评分。" />

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Form */}
        <div className="card-elev space-y-4 p-4 sm:p-5">
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground">关键词 *</label>
            <input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="如：cloud, ai, 数据 / brand"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">行业</label>
              <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="SaaS / 电商" className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">用途</label>
              <input value={useCase} onChange={e => setUseCase(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">语言</label>
              <select value={language} onChange={e => setLanguage(e.target.value as "en" | "zh" | "pinyin" | "mixed")} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm">
                <option value="mixed">混合</option>
                <option value="en">英文</option>
                <option value="pinyin">拼音</option>
                <option value="zh">中文相关</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">最短</label>
              <input type="number" min={2} max={30} value={minLen} onChange={e => setMinLen(Number(e.target.value))} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-muted-foreground">最长</label>
              <input type="number" min={2} max={30} value={maxLen} onChange={e => setMaxLen(Number(e.target.value))} className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground">数量 ({count})</label>
            <input type="range" min={5} max={30} value={count} onChange={e => setCount(Number(e.target.value))} className="mt-1 w-full" />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-muted-foreground">后缀</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TLD_PRESETS.map(t => {
                const on = tlds.includes(t);
                return (
                  <button key={t} type="button" onClick={() => toggleTld(t)}
                    className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition ${on ? "bg-primary/15 text-primary ring-primary/30" : "bg-surface text-muted-foreground ring-border hover:text-foreground"}`}>
                    .{t}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={() => mutGen.mutate()}
            disabled={!keywords.trim() || mutGen.isPending}
            className="btn-base btn-primary w-full justify-center"
          >
            {mutGen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            生成候选域名
          </button>

          {/* History */}
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium uppercase text-muted-foreground mb-2">最近生成</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {(history.data?.items ?? []).map((h: { id: number; keywords: string; results: unknown; created_at: string }) => (
                <div key={h.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => { setKeywords(h.keywords); setResults((h.results as DomainIdea[]) ?? []); }}
                    className="flex-1 truncate text-left text-foreground hover:text-primary"
                  >
                    {h.keywords} <span className="text-muted-foreground">· {Array.isArray(h.results) ? h.results.length : 0}</span>
                  </button>
                  <button type="button" onClick={() => mutDel.mutate(h.id)} className="ml-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {!history.isLoading && (history.data?.items?.length ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground">暂无历史</div>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {results.length === 0 ? (
            <EmptyState
              title="还没有候选域名"
              hint="在左侧输入关键词与方向，点击「生成候选域名」开始。生成结果默认按记忆度 + 品牌感综合排序。"
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((d) => <IdeaCard key={d.domain} d={d} onCopy={copy} onCheck={check} onWatch={watch} />)}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function IdeaCard({ d, onCopy, onCheck, onWatch }: { d: DomainIdea; onCopy: (s: string) => void; onCheck: (s: string) => void; onWatch: (s: string) => Promise<void> }) {
  return (
    <div className="card-elev flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-base font-semibold text-foreground">{d.domain}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{d.strategy} · {d.length} 字符 · .{d.tld}</div>
        </div>
        {d.recommend && (
          <span className="rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success ring-1 ring-inset ring-success/30">推荐</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ScoreBar label="记忆度" v={d.memorability} />
        <ScoreBar label="品牌感" v={d.brandability} />
      </div>

      <div className="rounded-md bg-accent/40 p-2 text-xs text-muted-foreground">
        <div><span className="text-foreground font-medium">理由：</span>{d.reason}</div>
        <div className="mt-0.5"><span className="text-foreground font-medium">用途：</span>{d.useCase}</div>
      </div>

      <div className="mt-auto flex gap-1.5 pt-1">
        <button onClick={() => onCopy(d.domain)} className="btn-base flex-1 justify-center text-xs" title="复制">
          <Copy className="mr-1 h-3.5 w-3.5" />复制
        </button>
        <button onClick={() => onCheck(d.domain)} className="btn-base flex-1 justify-center text-xs" title="检测可用性">
          <Search className="mr-1 h-3.5 w-3.5" />检测
        </button>
        <button onClick={() => onWatch(d.domain)} className="btn-base flex-1 justify-center text-xs" title="加入观察列表">
          <Bookmark className="mr-1 h-3.5 w-3.5" />关注
        </button>
      </div>
    </div>
  );
}

function ScoreBar({ label, v }: { label: string; v: number }) {
  const tone = v >= 80 ? "bg-success" : v >= 60 ? "bg-primary" : v >= 40 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="tabular-nums text-foreground">{v}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
