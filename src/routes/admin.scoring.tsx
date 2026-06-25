import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getScoringFn, saveScoringFn } from "@/lib/discover.functions";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "@/lib/scoring";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/scoring")({
  component: AdminScoring,
});

const FIELDS: { key: keyof ScoringWeights; label: string; hint: string }[] = [
  { key: "length", label: "简短度", hint: "长度越短分值越高" },
  { key: "semantic", label: "语义价值", hint: "英文词 / 拼音 / 缩写" },
  { key: "tld", label: "后缀价值", hint: ".com=1.0 / .io=0.78 ..." },
  { key: "archive", label: "Archive 历史", hint: "首次抓取越早分值越高" },
  { key: "backlinks", label: "外链价值", hint: "log10(BL+1) / 4" },
  { key: "related_tld", label: "相关后缀占用", hint: "其它 TLD 注册数 / 7" },
  { key: "brandable", label: "可读 / 品牌感", hint: "无数字、无连字符、元音比例 0.2-0.6" },
  { key: "risk_penalty_max", label: "风险扣分上限", hint: "high = 满扣，medium = 半扣" },
];

function AdminScoring() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["scoring"], queryFn: () => getScoringFn() });
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);

  useEffect(() => { if (data) setWeights({ ...DEFAULT_WEIGHTS, ...data }); }, [data]);

  const saveMut = useMutation({
    mutationFn: () => saveScoringFn({ data: { weights } }),
    onSuccess: () => { toast.success("已保存评分规则"); qc.invalidateQueries({ queryKey: ["scoring"] }); },
    onError: (e: any) => toast.error(e?.message ?? "保存失败"),
  });

  const total = Object.entries(weights).filter(([k]) => k !== "risk_penalty_max").reduce((s, [, v]) => s + (v as number), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">评分权重（满分 100）</h3>
        <p className="mb-4 text-xs text-muted-foreground">非扣分项之和当前 = <span className="font-semibold text-foreground tabular-nums">{total}</span> 分。建议合计 100。</p>
        <div className="space-y-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <div>
                  <label className="font-medium">{f.label}</label>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
                <span className="tabular-nums font-mono text-sm">{weights[f.key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={f.key === "risk_penalty_max" ? 40 : 40}
                value={weights[f.key]}
                onChange={e => setWeights({ ...weights, [f.key]: +e.target.value })}
                className="w-full accent-primary"
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-base btn-primary">{saveMut.isPending ? "保存中…" : "保存"}</button>
          <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="btn-base btn-ghost">恢复默认</button>
        </div>
      </section>

      <section className="card-elev p-5">
        <h3 className="mb-3 text-sm font-semibold">评分示例</h3>
        <p className="mb-3 text-xs text-muted-foreground">仅显示规则结构，重导入或刷新域名后将按新权重计算。</p>
        <div className="space-y-2 text-xs">
          {[
            { d: "ai.com", n: "S 级 · 95 · 短 + .com" },
            { d: "trade.io", n: "A 级 · 82 · 英文词 + .io" },
            { d: "shop123.net", n: "B 级 · 64 · 数字字母混合" },
            { d: "x-y-z.xyz", n: "C 级 · 38 · 含连字符 + .xyz" },
          ].map(s => (
            <div key={s.d} className="rounded-md border border-border p-2">
              <div className="font-mono text-sm">{s.d}</div>
              <div className="text-muted-foreground">{s.n}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
