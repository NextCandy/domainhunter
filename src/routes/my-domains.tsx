import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BriefcaseBusiness, Download, Plus, Search, Trash2 } from "lucide-react";
import { AppShell, PageHeader, EmptyState, StatCard } from "@/components/app-shell";
import { CardSkeleton } from "@/components/skeleton";
import {
  enrichTerminalRow,
  exportDomainsCsv,
  formatCompactCurrency,
  formatCurrency,
  type TerminalDomainRow,
} from "@/lib/domain-terminal";
import { listMyDomainsFn, upsertMyDomainFn, removeMyDomainFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/my-domains")({
  component: MyDomainsPage,
});

type PortfolioRecord = {
  id: number;
  domain: string;
  registrar?: string | null;
  expiry_date?: string | null;
  note?: string | null;
  tags?: string[];
};

type PortfolioRow = PortfolioRecord & { terminal: TerminalDomainRow };

function MyDomainsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-domains"],
    queryFn: loadPortfolio,
  });
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    domain: "",
    registrar: "",
    expiry_date: "",
    note: "",
    tags: "",
  });

  const addMut = useMutation({
    mutationFn: async (f: typeof form) => {
      const payload = portfolioPayload(f);
      try {
        return await upsertMyDomainFn({ data: payload });
      } catch {
        const res = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("保存失败");
        return res.json();
      }
    },
    onSuccess: () => {
      toast.success("已保存资产");
      setForm({ domain: "", registrar: "", expiry_date: "", note: "", tags: "" });
      qc.invalidateQueries({ queryKey: ["my-domains"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => {
      try {
        return await removeMyDomainFn({ data: { id } });
      } catch {
        const res = await fetch(`/api/portfolio?id=${encodeURIComponent(String(id))}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("删除失败");
        return res.json();
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-domains"] }),
  });

  const rows = useMemo(
    () =>
      ((data ?? []) as PortfolioRecord[])
        .map((d, i): PortfolioRow => ({
          ...d,
          terminal: enrichTerminalRow(
            {
              domain: d.domain,
              expiry_date: d.expiry_date,
              status: "registered",
              source: "database",
            },
            i,
          ),
        }))
        .filter((d) => {
          const needle = q.toLowerCase();
          return (
            !needle ||
            d.domain.includes(needle) ||
            (d.registrar ?? "").toLowerCase().includes(needle) ||
            (d.note ?? "").toLowerCase().includes(needle)
          );
        }),
    [data, q],
  );

  const stats = useMemo(() => {
    const domains = rows.map((r) => r.terminal);
    const soon = rows.filter(
      (r) => r.expiry_date && new Date(r.expiry_date).getTime() < Date.now() + 45 * 86400000,
    ).length;
    return {
      total: rows.length,
      value: Math.round(
        domains.reduce((s: number, d: TerminalDomainRow) => s + d.estimatedValue, 0),
      ),
      soon,
      registrars: new Set(rows.map((r) => r.registrar).filter(Boolean)).size,
    };
  }, [rows]);

  function exportPortfolio() {
    const domains = rows.map((r) => r.terminal);
    const blob = new Blob([exportDomainsCsv(domains)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domainhunter-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <PageHeader
        title="Portfolio 资产组合"
        description="管理已购买或重点跟踪的域名资产，记录注册商、到期时间、标签与估值"
        actions={
          <button onClick={exportPortfolio} disabled={!rows.length} className="btn-base btn-ghost">
            <Download className="h-4 w-4" />
            导出 CSV
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="资产数量"
          value={stats.total.toLocaleString()}
          icon={<BriefcaseBusiness className="h-4 w-4" />}
        />
        <StatCard
          label="组合估值"
          value={
            <>
              <span className="sm:hidden">{formatCompactCurrency(stats.value)}</span>
              <span className="hidden sm:inline">{formatCurrency(stats.value)}</span>
            </>
          }
          tone="warning"
        />
        <StatCard
          label="45 天内到期"
          value={stats.soon.toLocaleString()}
          tone={stats.soon ? "danger" : "success"}
        />
        <StatCard label="注册商" value={stats.registrars.toLocaleString()} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.domain) return;
          addMut.mutate(form);
        }}
        className="terminal-panel mb-4 grid grid-cols-1 gap-2 p-3 lg:grid-cols-[1.3fr_1fr_1fr_1.6fr_1fr_auto]"
      >
        <input
          value={form.domain}
          onChange={(e) => setForm({ ...form, domain: e.target.value })}
          placeholder="example.com"
          className="field"
        />
        <input
          value={form.registrar}
          onChange={(e) => setForm({ ...form, registrar: e.target.value })}
          placeholder="注册商"
          className="field"
        />
        <input
          value={form.expiry_date}
          onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
          type="date"
          className="field"
        />
        <input
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="备注 / 购买价 / 用途"
          className="field"
        />
        <input
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          placeholder="标签1,标签2"
          className="field"
        />
        <button type="submit" className="btn-base btn-primary">
          <Plus className="h-4 w-4" />
          添加
        </button>
      </form>

      <div className="terminal-panel mb-4 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索资产域名、注册商或备注"
            className="field pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      ) : !rows.length ? (
        <EmptyState
          title="还没有添加任何资产域名"
          hint="使用上方表单添加，或后续从 Hunt 结果一键加入。"
        />
      ) : (
        <div className="terminal-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border bg-surface/70 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">域名</th>
                  <th className="px-3 py-2 text-left font-medium">注册商</th>
                  <th className="px-3 py-2 text-left font-medium">到期时间</th>
                  <th className="px-3 py-2 text-right font-medium">估值</th>
                  <th className="px-3 py-2 text-left font-medium">标签</th>
                  <th className="px-3 py-2 text-left font-medium">备注</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const term = d.terminal;
                  const soon =
                    d.expiry_date && new Date(d.expiry_date).getTime() < Date.now() + 45 * 86400000;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-border last:border-0 hover:bg-accent/40"
                    >
                      <td className="px-4 py-2">
                        <div className="font-mono font-semibold text-primary">{d.domain}</div>
                        <div className="text-xs text-muted-foreground">
                          DA {term.da} / PA {term.pa}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{d.registrar ?? "—"}</td>
                      <td
                        className={`px-3 py-2 text-xs ${soon ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {d.expiry_date ? new Date(d.expiry_date).toISOString().slice(0, 10) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-warning">
                        {term.estimatedRange}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(d.tags ?? []).map((t: string) => (
                            <span key={t} className="glass-chip">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{d.note ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => delMut.mutate(d.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10"
                          aria-label="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

async function loadPortfolio(): Promise<PortfolioRecord[]> {
  try {
    return (await listMyDomainsFn()) as PortfolioRecord[];
  } catch {
    const res = await fetch("/api/portfolio");
    if (!res.ok) throw new Error("资产组合加载失败");
    const data = await res.json();
    return (data.rows ?? []) as PortfolioRecord[];
  }
}

function portfolioPayload(form: {
  domain: string;
  registrar: string;
  expiry_date: string;
  note: string;
  tags: string;
}) {
  return {
    domain: form.domain,
    registrar: form.registrar || undefined,
    expiry_date: form.expiry_date || undefined,
    note: form.note || undefined,
    tags: form.tags
      ? form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
  };
}
