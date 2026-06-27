import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Eye, ExternalLink, ArrowLeft, Sparkles } from "lucide-react";
import { AppShell, ScoreBadge, StatusBadge, RiskBadge, EmptyState } from "@/components/app-shell";
import { CardSkeleton, Skeleton } from "@/components/skeleton";
import { domainDetailFn, refreshDomainFn, toggleWatchFn, checkRelatedTldsFn, enrichDomainFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/domains/$domain")({
  component: DomainDetailPage,
});

function DomainDetailPage() {
  const { domain } = Route.useParams();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["domain-detail", domain],
    queryFn: () => domainDetailFn({ data: { domain } }),
  });
  const related = useQuery({
    queryKey: ["related-tlds", domain],
    queryFn: () => checkRelatedTldsFn({ data: { name: domain.split(".")[0] } }),
    enabled: !!domain,
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshDomainFn({ data: { domain } }),
    onSuccess: r => { toast.success(`${r.domain} · ${r.status} · 评分 ${r.score}`); refetch(); qc.invalidateQueries({ queryKey: ["domain-detail", domain] }); },
    onError: (e: any) => toast.error(e?.message ?? "刷新失败"),
  });
  const watchMut = useMutation({
    mutationFn: () => toggleWatchFn({ data: { domain } }),
    onSuccess: r => { toast.success(r.watching ? "已加入观察列表" : "已从观察移除"); refetch(); },
  });
  const enrichMut = useMutation({
    mutationFn: () => enrichDomainFn({ data: { domain } }),
    onSuccess: r => { toast.success(`已抓取 DNS · A=${r.dns.a_records.length} NS=${r.dns.ns_records.length}${r.archive.archive_year ? ` · Archive ${r.archive.archive_year}` : ""}`); refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "抓取失败"),
  });

  if (isLoading) return <AppShell><CardSkeleton lines={5} /></AppShell>;

  if (!data?.domain) {
    return (
      <AppShell>
        <EmptyState
          title={`暂无 ${domain} 的数据`}
          hint="点击「立即检测」从 RDAP 获取域名状态并写入数据库。"
          action={<button onClick={() => refreshMut.mutate()} className="btn-base btn-primary"><RefreshCw className="h-4 w-4" />立即检测</button>}
        />
      </AppShell>
    );
  }

  const d = data.domain;
  const w = data.whois;
  const dns = data.dns;
  const m = data.metrics;
  const watching = !!data.watch;

  return (
    <AppShell>
      <Link to="/discover" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />返回发现</Link>

      <div className="card-elev mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{d.domain}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={d.status} />
              <ScoreBadge score={d.score} />
              <RiskBadge level={d.risk_level} />
              <span className="text-muted-foreground">{d.length} 字符 · {d.type}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} className="btn-base btn-ghost"><RefreshCw className={`h-4 w-4 ${refreshMut.isPending ? "animate-spin" : ""}`} />刷新</button>
            <button onClick={() => enrichMut.mutate()} disabled={enrichMut.isPending} className="btn-base btn-ghost"><Sparkles className={`h-4 w-4 ${enrichMut.isPending ? "animate-pulse" : ""}`} />{enrichMut.isPending ? "抓取中…" : "丰富 DNS/Archive"}</button>
            <button onClick={() => watchMut.mutate()} className={`btn-base ${watching ? "btn-ghost" : "btn-primary"}`}><Eye className="h-4 w-4" />{watching ? "已观察" : "加入观察"}</button>
            <a href={`https://www.namecheap.com/domains/registration/results/?domain=${d.domain}`} target="_blank" rel="noreferrer" className="btn-base btn-primary"><ExternalLink className="h-4 w-4" />注册</a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="基础信息">
          <KV k="后缀" v={`.${d.tld}`} />
          <KV k="主体长度" v={String(d.length)} />
          <KV k="字符类型" v={d.type} />
          <KV k="含数字" v={/\d/.test(d.name) ? "是" : "否"} />
          <KV k="含连字符" v={d.name.includes("-") ? "是" : "否"} />
          <KV k="首次入库" v={d.first_seen_at ? new Date(d.first_seen_at).toLocaleString() : "—"} />
          <KV k="上次检测" v={d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : "—"} />
        </Card>

        <Card title="WHOIS / RDAP">
          {w ? (
            <>
              <KV k="注册商" v={w.registrar ?? "—"} />
              <KV k="创建时间" v={w.created_date ? new Date(w.created_date).toLocaleString() : "—"} />
              <KV k="到期时间" v={w.expiry_date ? new Date(w.expiry_date).toLocaleString() : "—"} />
              <KV k="更新时间" v={w.updated_date ? new Date(w.updated_date).toLocaleString() : "—"} />
              <KV k="Nameservers" v={(w.nameservers ?? []).join(", ") || "—"} />
              <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">查看原始数据</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-3 text-[11px]">{JSON.stringify(w.raw_data, null, 2)}</pre>
              </details>
            </>
          ) : <p className="text-sm text-muted-foreground">暂无 WHOIS 数据，点击「刷新」获取。</p>}
        </Card>

        <Card title="DNS 记录">
          {dns ? (
            <>
              <KV k="A" v={(dns.a_records ?? []).join(", ") || "—"} />
              <KV k="NS" v={(dns.ns_records ?? []).join(", ") || "—"} />
              <KV k="MX" v={(dns.mx_records ?? []).join(", ") || "—"} />
              <KV k="TXT" v={(dns.txt_records ?? []).join(", ") || "—"} />
            </>
          ) : <p className="text-sm text-muted-foreground">暂未抓取 DNS 记录。</p>}
        </Card>

        <Card title="历史 / SEO">
          <KV k="Archive 首次" v={m?.archive_year ? String(m.archive_year) : "—"} />
          <KV k="Archive 抓取" v={String(m?.archive_count ?? 0)} />
          <KV k="外链 BL" v={String(m?.backlinks ?? 0)} />
          <KV k="引用域名 DP" v={String(m?.referring_domains ?? 0)} />
          <p className="mt-3 text-xs text-muted-foreground">Archive 数据来自 Wayback Machine 公共 API。Ahrefs / Majestic 等外链数据需付费接入。</p>
        </Card>

        <Card title="相关后缀注册情况">
          {related.isLoading ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {(related.data ?? []).map(r => (
                <div key={r.tld} className="rounded-md border border-border p-2 text-center">
                  <div className="text-xs font-mono text-muted-foreground">.{r.tld}</div>
                  <div className="mt-1"><StatusBadge status={r.status} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-elev p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
      <dd className="text-right text-sm tabular-nums">{v}</dd>
    </div>
  );
}
