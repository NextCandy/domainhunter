// Server-only domain idea generator. Uses Lovable AI Gateway when LOVABLE_API_KEY
// is configured; otherwise falls back to a deterministic rule-based generator.

import type { DomainIdea, IdeaGenParams } from "./types";

const PREFIXES = ["get", "try", "use", "go", "my", "the", "hi", "open", "smart", "neo", "zen", "pro", "co", "in", "up"];
const SUFFIXES = ["ly", "io", "hq", "ify", "hub", "lab", "kit", "box", "now", "go", "x", "ai", "pro", "app"];
const TLD_DEFAULT = ["com", "net", "io", "ai", "app", "co", "cc", "xyz"];

function clean(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function scoreMem(name: string) {
  const len = name.length;
  let s = 100 - Math.max(0, len - 6) * 6;
  if (/^[aeiou]/.test(name)) s += 2;
  if (/[-_]/.test(name)) s -= 30;
  return Math.max(20, Math.min(100, s));
}

function scoreBrand(name: string, strategy: string) {
  let s = 60;
  if (strategy.includes("brand")) s += 20;
  if (name.length <= 6) s += 15;
  if (/\d/.test(name)) s -= 10;
  return Math.max(20, Math.min(100, s));
}

function ruleBased(params: IdeaGenParams): DomainIdea[] {
  const kws = params.keywords.split(/[\s,，、]+/).map(clean).filter(Boolean).slice(0, 5);
  const base = kws[0] || "brand";
  const tlds = (params.tlds && params.tlds.length ? params.tlds : TLD_DEFAULT).map(t => t.replace(/^\./, "").toLowerCase());
  const min = params.minLen ?? 3;
  const max = params.maxLen ?? 14;
  const count = Math.min(30, Math.max(5, params.count ?? 12));
  const out: DomainIdea[] = [];
  const seen = new Set<string>();

  const candidates: Array<{ name: string; strategy: string; reason: string; useCase: string }> = [];

  for (const k of kws) candidates.push({ name: k, strategy: "exact", reason: "完全匹配关键词", useCase: "品牌主站" });
  for (const p of PREFIXES) candidates.push({ name: p + base, strategy: "prefix", reason: `前缀 ${p}+ 关键词`, useCase: "SaaS / 工具站" });
  for (const s of SUFFIXES) candidates.push({ name: base + s, strategy: "suffix", reason: `关键词 + 后缀 ${s}`, useCase: "工具 / 应用" });
  if (kws.length >= 2) {
    candidates.push({ name: kws[0] + kws[1], strategy: "compose", reason: "关键词组合", useCase: "品牌站" });
    candidates.push({ name: kws[1] + kws[0], strategy: "compose", reason: "关键词反向组合", useCase: "品牌站" });
  }
  for (const k of kws) candidates.push({ name: k + "hq", strategy: "brand", reason: "品牌化短名", useCase: "公司主站" });

  for (const c of candidates) {
    if (c.name.length < min || c.name.length > max) continue;
    for (const tld of tlds) {
      const domain = `${c.name}.${tld}`;
      if (seen.has(domain)) continue;
      seen.add(domain);
      const mem = scoreMem(c.name);
      const brand = scoreBrand(c.name, c.strategy);
      out.push({
        domain,
        name: c.name,
        tld,
        length: c.name.length,
        reason: c.reason,
        useCase: c.useCase,
        memorability: mem,
        brandability: brand,
        recommend: mem + brand >= 150 && c.name.length <= 9,
        strategy: c.strategy,
      });
      if (out.length >= count) break;
    }
    if (out.length >= count) break;
  }
  return out.sort((a, b) => (b.memorability + b.brandability) - (a.memorability + a.brandability));
}

async function aiGenerate(params: IdeaGenParams, apiKey: string): Promise<DomainIdea[] | null> {
  const tlds = (params.tlds?.length ? params.tlds : TLD_DEFAULT).map(t => t.replace(/^\./, ""));
  const sys = `你是域名命名专家。根据用户需求生成域名候选。只输出 JSON 数组，不要额外文字。每项 schema:
{"domain":string,"name":string,"tld":string,"length":number,"reason":string,"useCase":string,"memorability":number,"brandability":number,"recommend":boolean,"strategy":string}
规则: 名称尽量短(${params.minLen ?? 3}-${params.maxLen ?? 14}字符)、好记、避免连字符、避免已知大品牌近似、memorability/brandability 在 0-100。`;
  const user = `关键词: ${params.keywords}
行业: ${params.industry ?? "通用"}
用途: ${params.useCase ?? "未指定"}
语言: ${params.language ?? "mixed"}
后缀候选: ${tlds.join(", ")}
数量: ${Math.min(30, Math.max(5, params.count ?? 12))}`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";
    // Try to extract a JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    const raw = match ? match[0] : content;
    const parsed = JSON.parse(raw) as DomainIdea[] | { ideas: DomainIdea[] };
    const arr = Array.isArray(parsed) ? parsed : (parsed.ideas ?? []);
    return arr
      .filter(x => x && typeof x.domain === "string")
      .map(x => ({
        domain: x.domain.toLowerCase(),
        name: x.name?.toLowerCase() ?? x.domain.split(".")[0],
        tld: x.tld?.toLowerCase() ?? x.domain.split(".").slice(1).join("."),
        length: x.length ?? (x.name?.length ?? 0),
        reason: x.reason ?? "",
        useCase: x.useCase ?? "",
        memorability: Math.max(0, Math.min(100, Number(x.memorability) || 60)),
        brandability: Math.max(0, Math.min(100, Number(x.brandability) || 60)),
        recommend: Boolean(x.recommend),
        strategy: x.strategy ?? "ai",
      }));
  } catch {
    return null;
  }
}

export async function generateIdeas(params: IdeaGenParams): Promise<DomainIdea[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (key) {
    const ai = await aiGenerate(params, key);
    if (ai && ai.length > 0) return ai;
  }
  return ruleBased(params);
}
