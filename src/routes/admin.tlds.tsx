import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getTldListFn, saveTldListFn } from "@/lib/discover.functions";

export const Route = createFileRoute("/admin/tlds")({
  component: AdminTldsPage,
});

function AdminTldsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["tld-list"], queryFn: () => getTldListFn() });
  const [text, setText] = useState("");

  useEffect(() => {
    if (data?.tlds) setText(data.tlds.join("\n"));
  }, [data]);

  const parsed = useMemo(() => {
    const list = text
      .split(/[\s,，\n]+/)
      .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean);
    const dedup = Array.from(new Set(list));
    const invalid = dedup.filter((t) => !/^[a-z0-9.-]+$/.test(t) || t.length > 20);
    return { dedup, invalid };
  }, [text]);

  const save = useMutation({
    mutationFn: () => saveTldListFn({ data: { tlds: parsed.dedup } }),
    onSuccess: (r) => {
      toast.success(`已保存 ${r.count} 个后缀`);
      qc.invalidateQueries({ queryKey: ["tld-list"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });

  return (
    <div className="space-y-4">
      <div className="card-elev p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">域名后缀（TLD）管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              每行或逗号分隔一个后缀；支持二级后缀（如 com.cn /
              co.uk）。修改后会立刻应用到「过期域名发现」筛选区。
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            共 {parsed.dedup.length} 个
            {parsed.invalid.length > 0 && (
              <span className="ml-2 text-rose-600">· 非法 {parsed.invalid.length} 个</span>
            )}
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isLoading}
          rows={20}
          spellCheck={false}
          className="field w-full font-mono text-sm"
          placeholder="com&#10;net&#10;org&#10;io&#10;ai&#10;com.cn"
        />

        {parsed.invalid.length > 0 && (
          <div className="mt-2 text-xs text-rose-600">
            非法后缀：{parsed.invalid.slice(0, 10).join(", ")}
            {parsed.invalid.length > 10 ? "…" : ""}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || parsed.invalid.length > 0 || parsed.dedup.length === 0}
            className="btn-base btn-primary"
          >
            <Save className="h-4 w-4" />
            {save.isPending ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={() => data?.tlds && setText(data.tlds.join("\n"))}
            className="btn-base btn-ghost"
          >
            <RotateCcw className="h-4 w-4" />
            恢复已保存
          </button>
        </div>
      </div>

      <div className="card-elev p-4 text-xs text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">提示</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>仅管理员可保存（受 has_role 校验保护）。</li>
          <li>保存后，所有发现页的「后缀」筛选区会拉取最新列表。</li>
          <li>单个后缀长度不超过 20 字符；只允许字母、数字、点和短横线。</li>
        </ul>
      </div>
    </div>
  );
}
