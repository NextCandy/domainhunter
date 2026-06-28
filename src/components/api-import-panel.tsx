// Import owned domains from a registrar API into my-domains.
// Credentials are used only for the request and are NOT stored.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, X } from "lucide-react";
import { toast } from "sonner";

type ApiImportResult = { added: number; exists: number; total: number };

export function ApiImportPanel({
  onImport,
  onDone,
}: {
  onImport: (args: { registrar: "spaceship"; apiKey: string; apiSecret: string }) => Promise<ApiImportResult>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [registrar, setRegistrar] = useState<"spaceship">("spaceship");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  const mut = useMutation({
    mutationFn: () => onImport({ registrar, apiKey, apiSecret }),
    onSuccess: (r) => {
      toast.success(`API 导入完成：新增 ${r.added} · 已存在 ${r.exists} · 共 ${r.total}`);
      setApiKey("");
      setApiSecret("");
      setOpen(false);
      onDone?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "导入失败"),
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-base btn-ghost">
        <KeyRound className="h-4 w-4" />从注册商 API 导入
      </button>
    );
  }

  return (
    <div className="card-elev mb-4 w-full space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">从注册商 API 导入已购域名</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
        <select value={registrar} onChange={(e) => setRegistrar(e.target.value as "spaceship")} className="field">
          <option value="spaceship">Spaceship</option>
        </select>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="field" autoComplete="off" spellCheck={false} />
        <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} type="password" placeholder="API Secret" className="field" autoComplete="off" />
        <button type="button" disabled={!apiKey || !apiSecret || mut.isPending} onClick={() => mut.mutate()} className="btn-base btn-primary">{mut.isPending ? "导入中…" : "导入"}</button>
      </div>
      <p className="text-xs text-muted-foreground">在 Spaceship 控制台 → API Manager 创建 API Key / Secret，拉取你账户下的全部域名。凭证仅用于本次请求，不会保存。</p>
    </div>
  );
}
