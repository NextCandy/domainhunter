import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, Trash2, Plus } from "lucide-react";
import { listSourcesFn, upsertSourceFn, deleteSourceFn, importDomainsFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sources")({
  component: AdminSources,
});

function AdminSources() {
  const qc = useQueryClient();
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: () => listSourcesFn() });

  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("manual");
  const [importStatus, setImportStatus] = useState("unknown");
  const [autoCheck, setAutoCheck] = useState(true);

  const importMut = useMutation({
    mutationFn: () => importDomainsFn({ data: { source: sourceName, text, autoCheck, status: importStatus } }),
    onSuccess: r => { toast.success(`已导入 ${r.inserted} 个域名（解析 ${r.parsed}）`); setText(""); },
    onError: (e: any) => toast.error(e?.message ?? "导入失败"),
  });

  const upsertSrc = useMutation({
    mutationFn: (f: { name: string; type: string; url?: string }) => upsertSourceFn({ data: { ...f, enabled: true, sync_interval_min: 1440 } }),
    onSuccess: () => { toast.success("已保存数据源"); qc.invalidateQueries({ queryKey: ["sources"] }); },
  });
  const deleteSrc = useMutation({
    mutationFn: (id: number) => deleteSourceFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const [srcName, setSrcName] = useState("");
  const [srcUrl, setSrcUrl] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10_000_000) { toast.error("文件过大（>10MB）"); return; }
    f.text().then(t => setText(t));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">导入 TXT / CSV</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="数据源名称" className="field" />
          <select value={importStatus} onChange={e => setImportStatus(e.target.value)} className="field">
            <option value="unknown">未检测</option>
            <option value="pending_delete">待删除</option>
            <option value="deleted">已删除</option>
            <option value="auction">拍卖中</option>
          </select>
          <label className="btn-base btn-ghost cursor-pointer">
            <Upload className="h-4 w-4" />选择文件
            <input type="file" accept=".txt,.csv,text/plain" hidden onChange={onFile} />
          </label>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="每行一个域名（CSV 取第一列）。例如：example.com&#10;foo.io&#10;bar.ai"
          className="field mt-3 h-56 font-mono text-xs"
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={autoCheck} onChange={e => setAutoCheck(e.target.checked)} />
          导入后自动 RDAP 检查（最多前 200 个）
        </label>
        <button onClick={() => importMut.mutate()} disabled={!text.trim() || importMut.isPending} className="btn-base btn-primary mt-3">
          <Upload className="h-4 w-4" />{importMut.isPending ? "导入中…" : "开始导入"}
        </button>
      </section>

      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">数据源管理</h3>
        <div className="flex gap-2">
          <input value={srcName} onChange={e => setSrcName(e.target.value)} placeholder="名称" className="field" />
          <input value={srcUrl} onChange={e => setSrcUrl(e.target.value)} placeholder="URL（可选）" className="field" />
          <button onClick={() => { if (!srcName) return; upsertSrc.mutate({ name: srcName, type: "url", url: srcUrl || undefined }); setSrcName(""); setSrcUrl(""); }} className="btn-base btn-primary"><Plus className="h-4 w-4" /></button>
        </div>
        <ul className="mt-3 space-y-2">
          {(sources ?? []).map((s: any) => (
            <li key={s.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.type} · {s.url ?? "—"} · 同步 {s.sync_interval_min}m</div>
              </div>
              <button onClick={() => deleteSrc.mutate(s.id)} className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          {!sources?.length && <li className="text-xs text-muted-foreground">暂未配置数据源。</li>}
        </ul>
      </section>
    </div>
  );
}
