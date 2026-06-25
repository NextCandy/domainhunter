// Pure domain scoring engine. 100-point scale.
// Weights are configurable via /admin/scoring (persisted in `scoring_rules.weights`).

export type ScoringWeights = {
  length: number;
  semantic: number;
  tld: number;
  archive: number;
  backlinks: number;
  related_tld: number;
  brandable: number;
  risk_penalty_max: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  length: 20,
  semantic: 20,
  tld: 15,
  archive: 15,
  backlinks: 15,
  related_tld: 10,
  brandable: 5,
  risk_penalty_max: 20,
};

const TLD_VALUE: Record<string, number> = {
  com: 1.0, net: 0.85, org: 0.8, io: 0.78, ai: 0.75,
  co: 0.7, cn: 0.65, cc: 0.6, xyz: 0.4, app: 0.55, dev: 0.55,
};

// short common english words (cheap heuristic)
const COMMON_WORDS = new Set([
  "app","art","ace","bay","bit","box","buy","cap","car","cat","city","club","code","coin","cool",
  "data","day","dev","dog","dot","easy","eco","edge","eye","fan","fit","fly","fun","game","gear",
  "gift","go","good","green","group","hat","help","home","hub","idea","inn","jet","job","key",
  "kid","king","lab","leaf","life","link","list","live","love","map","max","mind","mint","money",
  "moon","new","note","one","page","park","pay","pet","pic","pin","play","plus","pro","red",
  "ride","run","sale","save","ship","shop","site","sky","smart","social","soft","star","store",
  "sun","sure","tax","tech","time","tip","top","trade","trip","truck","try","up","vibe","view",
  "wave","way","web","win","work","world","yes","zoo","zen","ai","biz","ml","io",
]);

const VOWELS = new Set(["a","e","i","o","u","y"]);

function vowelRatio(s: string) {
  let v = 0;
  for (const c of s.toLowerCase()) if (VOWELS.has(c)) v++;
  return s.length ? v / s.length : 0;
}

export type ScoreInputs = {
  name: string;        // sld (without tld)
  tld: string;         // without leading dot
  archive_year?: number | null;
  backlinks?: number | null;
  tld_registered_count?: number | null;  // 0..7 typical
  risk_level?: "low" | "medium" | "high" | "unknown" | string | null;
};

export type ScoreResult = {
  total: number;       // 0..100
  brandLevel: "S" | "A" | "B" | "C" | "D";
  parts: Record<keyof ScoringWeights, number>;
};

export function scoreDomain(input: ScoreInputs, weights: ScoringWeights = DEFAULT_WEIGHTS): ScoreResult {
  const name = (input.name ?? "").toLowerCase();
  const tld = (input.tld ?? "").toLowerCase().replace(/^\./, "");
  const len = name.length;

  // Length: 1-3 → full, 12+ → 0
  const lengthScore = weights.length * Math.max(0, Math.min(1, (12 - Math.max(3, len)) / 9));

  // Semantic value: known english word OR pure alpha 3-7 chars
  const isAlpha = /^[a-z]+$/.test(name);
  const isWord = COMMON_WORDS.has(name);
  let semanticBase = 0;
  if (isWord) semanticBase = 1;
  else if (isAlpha && len >= 3 && len <= 7) semanticBase = 0.55;
  else if (isAlpha) semanticBase = 0.35;
  else if (/^[a-z0-9]+$/.test(name)) semanticBase = 0.15;
  const semanticScore = weights.semantic * semanticBase;

  // TLD value
  const tldScore = weights.tld * (TLD_VALUE[tld] ?? 0.3);

  // Archive: older = better. age=current_year - archive_year, full at 15+ years
  const cy = new Date().getFullYear();
  const age = input.archive_year ? Math.max(0, cy - input.archive_year) : 0;
  const archiveScore = weights.archive * Math.min(1, age / 15);

  // Backlinks: log-scale, full at 10k
  const bl = Math.max(0, input.backlinks ?? 0);
  const blScore = weights.backlinks * Math.min(1, Math.log10(bl + 1) / 4);

  // Related-TLD occupancy (proxy for desirability)
  const reg = Math.max(0, Math.min(7, input.tld_registered_count ?? 0));
  const relScore = weights.related_tld * (reg / 7);

  // Brandable: alpha-only, no digits/hyphens, vowel ratio 0.25-0.55
  const vr = vowelRatio(name);
  const brandable = isAlpha && !name.includes("-") && vr >= 0.2 && vr <= 0.6;
  const brandScore = weights.brandable * (brandable ? 1 : 0.4);

  // Risk penalty
  let penalty = 0;
  if (input.risk_level === "high") penalty = weights.risk_penalty_max;
  else if (input.risk_level === "medium") penalty = weights.risk_penalty_max / 2;

  const totalRaw = lengthScore + semanticScore + tldScore + archiveScore + blScore + relScore + brandScore - penalty;
  const total = Math.max(0, Math.min(100, Math.round(totalRaw)));

  const brandLevel: ScoreResult["brandLevel"] =
    total >= 85 ? "S" : total >= 70 ? "A" : total >= 55 ? "B" : total >= 35 ? "C" : "D";

  return {
    total,
    brandLevel,
    parts: {
      length: Math.round(lengthScore),
      semantic: Math.round(semanticScore),
      tld: Math.round(tldScore),
      archive: Math.round(archiveScore),
      backlinks: Math.round(blScore),
      related_tld: Math.round(relScore),
      brandable: Math.round(brandScore),
      risk_penalty_max: -Math.round(penalty),
    },
  };
}

export function classifyDomain(name: string): "alpha" | "numeric" | "alphanumeric" | "hyphen" {
  if (name.includes("-")) return "hyphen";
  if (/^\d+$/.test(name)) return "numeric";
  if (/^[a-z]+$/i.test(name)) return "alpha";
  return "alphanumeric";
}
