// Shared Discover view used by /discover, /deleted, /pending.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Filter, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { FilterPanel, DomainTable, type DomainRow } from "@/components/domain-table";
import { discoverFn, toggleWatchFn, refreshDomainFn, liveScanFn, type DiscoverFilters } from "@/lib/discover.functions";
import { createEnrichJobFn } from "@/lib/enrich-jobs.functions";
import { toast } from "sonner";

const BASE: DiscoverFilters = { page: 1, pageSize: 50, sortBy: "score", sortDir: "desc" };

export function DiscoverView({
  title,
  description,
  presetStatuses,
}: {
  title: string;
  description?: string;
  presetStatuses?: string[];
}) {
  const [filters, setFilters] = useState<DiscoverFilters>({
    ...BASE,
    statuses: presetStatuses,
  });
  const [mobileFilters, setMobileFilters] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["discover", filters],
    queryFn: () => discoverFn({ data: filters }),
    placeholderData: (prev) => prev,
  });

  const watchMut = useMutation({
    mutationFn: (d: DomainRow) => toggleWatchFn({ data: { domain: d.domain } }),
    onSuccess: (r) => toast.success(r.watching ? "已加入观察列表" : "已从观察列表移除"),
    onError: (e: any) => toast.error(e?.message ?? "操作失败"),
  });

  const refreshMut = useMutation({
    mutationFn: (d: DomainRow) => refreshDomainFn({ data: { domain: d.domain } }),
    onSuccess: (r) => {
      toast.success(`${r.domain} · ${r.status} · 评分 ${r.score}`);
      refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "刷新失败"),
  });

  const nav = useNavigate();

  const enrichOne = useMutation({
    mutationFn: (d: DomainRow) =>
      createEnrichJobFn({
        data: {
          name: `Enrich ${d.domain}`,
          domains: [d.domain],
          kinds: ["dns", "archive", "seo"],
          scope: "single",
        },
      }),
    onSuccess: (r) => {
      toast.success("已创建丰富任务，跳转中…");
      nav({ to: "/enrich/$id", params: { id: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "创建丰富任务失败"),
  });

  const enrichBulk = useMutation({
    mutationFn: () => {
      const domains = (data?.rows ?? []).map((r: any) => r.domain).slice(0, 500);
      if (!domains.length) throw new Error("当前结果为空");
      return createEnrichJobFn({
        data: {
          name: `Enrich 当前结果 ${domains.length} 个`,
          domains,
          kinds: ["dns", "archive", "seo"],
          scope: "discover",
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`已创建丰富任务（${r.total} 子任务），跳转中…`);
      nav({ to: "/enrich/$id", params: { id: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "创建丰富任务失败"),
  });

  const liveScan = useMutation({
    mutationFn: () => liveScanFn({
      data: {
        tlds: filters.tlds ?? [],
        q: filters.q,
        startsWith: filters.startsWith,
        endsWith: filters.endsWith,
        contains: filters.contains,
        limit: 200,
      },
    }),
    onSuccess: (r) => {
      toast.success(`实时查询完成：扫描 ${r.scanned} 个 · 可注册 ${r.available} · 已注册 ${r.registered} · 错误 ${r.errors}`);
      refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "实时查询失败"),
  });

  return (
    <AppShell>
      <PageHeader
        title={title}
        description={description ?? `命中 ${(data?.total ?? 0).toLocaleString()} 个域名${isFetching ? " · 加载中…" : ""}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => enrichBulk.mutate()}
              disabled={enrichBulk.isPending || !(data?.rows ?? []).length}
              className="btn-base btn-ghost"
              title="为当前结果批量创建 DNS/Archive/SEO 丰富任务（最多 500 个）"
            >
              <Sparkles className="h-4 w-4" />
              {enrichBulk.isPending ? "创建中…" : "一键丰富当前结果"}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="btn-base btn-ghost"
              title="重新查询"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="btn-base btn-primary"
            >
              <Search className="h-4 w-4" />
              查询
            </button>
            <button type="button" onClick={() => setMobileFilters(true)} className="btn-base btn-ghost lg:hidden">
              <Filter className="h-4 w-4" />
              筛选
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="card-elev hidden h-fit p-4 lg:block">
          <FilterPanel filters={filters} onChange={setFilters} onSearch={() => refetch()}
            onBatchScan={() => liveScan.mutate()} batchScanning={liveScan.isPending} />

        </aside>

        <div className="min-w-0">
          <DomainTable
            rows={(data?.rows ?? []) as DomainRow[]}
            total={data?.total ?? 0}
            filters={filters}
            onChange={setFilters}
            onWatch={(d) => watchMut.mutate(d)}
            onRefresh={(d) => refreshMut.mutate(d)}
            onEnrich={(d) => enrichOne.mutate(d)}
          />
        </div>
      </div>

      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl bg-surface p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">筛选</h3>
              <button onClick={() => setMobileFilters(false)} className="grid h-8 w-8 place-items-center rounded hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onSearch={() => {
                refetch();
                setMobileFilters(false);
              }}
            />
            <button onClick={() => setMobileFilters(false)} className="btn-base btn-primary mt-4 w-full">
              应用
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
