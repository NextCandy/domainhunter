// Reusable batch-import panel: paste domains or upload a .txt/.csv file.
// Used by the watchlist and my-domains pages.
import { useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileUp, X } from "lucide-react";
import { toast } from "sonner";

type ImportResult = { added: number; exists: number; invalid: number; total: number };

export function ImportPanel({
  title,
  onImport,
  onDone,
}: {
  title: string;
  onImport: (text: string) => Promise<ImportResult>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const mut = useMutation({
    mutationFn: () => onImport(text),
    onSuccess: (r) => {
      toast.success(`导入完成：新增 ${r.added} · 已存在 ${r.exists}${r.invalid ? ` · 跳过无效 ${r.invalid}` : ""}`);
      setText("");
      setOpen(false);
      onDone?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "导入失败"),
  });

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText((prev) => (prev ? prev + "\n" : "") + String(reader.result ?? ""));
    reader.readAsText(f);
    e.target.value = "";
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-base btn-ghost">
        <Upload className="h-4 w-4" />批量导入
      </button>
    );
  }

  const count = text.split(/[\s,;]+/).filter(Boolean).length;
  return (
    <div className="card-elev mb-4 w-full space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"每行一个域名，或用逗号 / 空格分隔。例如：\nexample.com\nmysite.cn"}
        className="field min-h-[140px] w-full font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".txt,.csv,.list,text/plain" onChange={pickFile} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-base btn-ghost"><FileUp className="h-4 w-4" />选择文件 (.txt / .csv)</button>
        <span className="text-xs text-muted-foreground">已识别约 {count.toLocaleString()} 个</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn-base btn-ghost">取消</button>
          <button type="button" disabled={!text.trim() || mut.isPending} onClick={() => mut.mutate()} className="btn-base btn-primary">{mut.isPending ? "导入中…" : "开始导入"}</button>
        </div>
      </div>
    </div>
  );
}
