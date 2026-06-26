import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { listRegistrarsFn, upsertRegistrarFn, deleteRegistrarFn } from "@/lib/discover.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/registrars")({
  component: AdminRegistrars,
});

const PRESETS = ["Spaceship", "Namecheap", "Dynadot", "Gname", "GoDaddy", "Name.com"];
type RegistrarForm = { id?: number; name: string; api_key: string; api_secret: string; enabled: boolean; buy_url_template: string };
const EMPTY_FORM: RegistrarForm = { name: "", api_key: "", api_secret: "", enabled: false, buy_url_template: "" };

function AdminRegistrars() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["registrars"], queryFn: () => listRegistrarsFn() });
  const [form, setForm] = useState<RegistrarForm>(EMPTY_FORM);

  const upsert = useMutation({
    mutationFn: (f: RegistrarForm) => upsertRegistrarFn({ data: f }),
    onSuccess: () => { toast.success("已保存"); setForm(EMPTY_FORM); qc.invalidateQueries({ queryKey: ["registrars"] }); },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });
  const del = useMutation({
    mutationFn: (id: number) => deleteRegistrarFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registrars"] }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
      <section className="card-elev p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{form.id ? `编辑 ${form.name}` : "添加 / 编辑注册商"}</h3>
          {form.id && (
            <button type="button" title="取消编辑" onClick={() => setForm(EMPTY_FORM)} className="grid h-7 w-7 place-items-center rounded hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">名称</label>
            <input list="presets" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Namecheap" className="field" />
            <datalist id="presets">{PRESETS.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API Key</label>
            <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder="加密保存" className="field font-mono" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API Secret</label>
            <input type="password" value={form.api_secret} onChange={e => setForm({ ...form, api_secret: e.target.value })} className="field font-mono" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">购买链接模板</label>
            <input value={form.buy_url_template} onChange={e => setForm({ ...form, buy_url_template: e.target.value })} placeholder="https://example.com/?domain={domain}" className="field" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />启用
          </label>
          <button onClick={() => { if (!form.name) return; upsert.mutate(form); }} disabled={!form.name || upsert.isPending} className="btn-base btn-primary w-full">
            {form.id ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}保存
          </button>
          <p className="text-[11px] text-muted-foreground">提示：本版本使用占位加密（base64）保存密钥。生产环境请接入 KMS / Vault。</p>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">已配置</h3>
        <div className="space-y-2">
          {(data ?? []).map((r: any) => (
            <div key={r.id} className="card-elev flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.enabled ? "已启用" : "已停用"} · {r.buy_url_template ?? "—"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="编辑"
                  onClick={() => setForm({
                    id: r.id,
                    name: r.name ?? "",
                    api_key: "",
                    api_secret: "",
                    enabled: !!r.enabled,
                    buy_url_template: r.buy_url_template ?? "",
                  })}
                  className="grid h-7 w-7 place-items-center rounded hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => del.mutate(r.id)} className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {!data?.length && <div className="card-elev p-6 text-center text-sm text-muted-foreground">还没有配置任何注册商。</div>}
        </div>
      </section>
    </div>
  );
}
