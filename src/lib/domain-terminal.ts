import type { DiscoverFilters } from "@/lib/discover.functions";

export type ScoreParts = {
  seo: number;
  brand: number;
  scarcity: number;
  risk: number;
};

export type TerminalDomainRow = {
  id: number;
  domain: string;
  name: string;
  tld: string;
  length: number;
  type: string;
  status: string;
  score: number;
  risk_level: string;
  drop_date: string | null;
  expiry_date: string | null;
  created_at?: string | null;
  metrics?: {
    backlinks: number;
    referring_domains: number;
    archive_year: number | null;
    archive_count: number;
    tld_registered_count: number;
    seo_score?: number;
  } | null;
  da: number;
  pa: number;
  estimatedValue: number;
  estimatedRange: string;
  aiSummary: string;
  riskNote: string;
  scoreParts: ScoreParts;
  highPotential: boolean;
  aiRecommended: boolean;
  hasArchive: boolean;
  negativeHistory: boolean;
  source: "database" | "mock";
  trend: number[];
};

export type TerminalFilters = Omit<DiscoverFilters, "sortBy"> & {
  sortBy?: DiscoverFilters["sortBy"] | "backlinks" | "da" | "pa" | "value";
  view?: "cards" | "table" | "compact";
  minDa?: number;
  maxDa?: number;
  minPa?: number;
  maxPa?: number;
  scoreMax?: number;
  priceMin?: number;
  priceMax?: number;
  dropFrom?: string;
  dropTo?: string;
  highPotentialOnly?: boolean;
  aiRecommendedOnly?: boolean;
  archiveOnly?: boolean;
  excludeRisk?: boolean;
};

const NAMES = [
  "aiagenthub",
  "fintechsolutions",
  "web3launchpad",
  "smartcontract",
  "cryptoinsights",
  "onlinemarketing",
  "brandforge",
  "datapulse",
  "cloudledger",
  "rankpilot",
  "greencapital",
  "builderops",
  "trustmatrix",
  "marketnova",
  "growthradar",
  "codeatlas",
  "hostsignal",
  "salesorbit",
  "domainvault",
  "venturegrid",
  "searchdeck",
  "mintrocket",
  "devfoundry",
  "mediabridge",
  "saasrunner",
  "orbitpay",
  "stackmind",
  "linkharbor",
  "fleetdata",
  "pixeltrade",
];
const TLDS = ["com", "cn", "net", "org", "do", "io", "ai", "co", "dev", "app", "xyz", "shop"];
const TYPES = ["alpha", "alphanumeric", "hyphen"];
const STATUSES = ["available", "pending_delete", "auction", "registered", "unknown"];
const RISK = ["low", "low", "low", "medium", "high"];

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length];
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function scoreParts(score: number, risk: string, backlinks: number, tld: string): ScoreParts {
  const seo = clamp(Math.min(40, 12 + Math.log10(backlinks + 1) * 8), 0, 40);
  const brand = clamp(Math.min(30, score * 0.32), 0, 30);
  const scarcity = clamp(
    ["com", "io", "ai", "do"].includes(tld) ? 16 + score * 0.05 : 10 + score * 0.04,
    0,
    20,
  );
  const riskPenalty = risk === "high" ? 3 : risk === "medium" ? 6 : 9;
  return { seo, brand, scarcity, risk: riskPenalty };
}

function aiSummary(domain: string, score: number, risk: string, tld: string) {
  if (score >= 86)
    return `${domain} 语义集中，.${tld} 后缀匹配度高，适合 AI 工具、开发者社区或 SaaS 产品命名。`;
  if (score >= 72)
    return `${domain} 具备清晰行业联想和较好输入便利性，可作为垂直产品、内容站或增长项目候选。`;
  if (risk === "high")
    return `${domain} 指标可用但历史风险偏高，建议先核查 Archive 快照、跳转记录和安全浏览状态。`;
  return `${domain} 价值偏中等，适合放入观察列表，等待价格、外链和可注册状态进一步变化。`;
}

export function enrichTerminalRow(
  row: Partial<TerminalDomainRow> & { domain: string },
  index = 0,
): TerminalDomainRow {
  const parsed = parseDomain(row.domain);
  const name = row.name ?? parsed.name;
  const tld = row.tld ?? parsed.tld;
  const seed = hash(row.domain);
  const backlinks = row.metrics?.backlinks ?? seed % 14000;
  const referring =
    row.metrics?.referring_domains ?? Math.max(4, Math.round(backlinks / (8 + (seed % 10))));
  const archiveYear = row.metrics?.archive_year ?? (seed % 5 === 0 ? null : 2002 + (seed % 22));
  const archiveCount = row.metrics?.archive_count ?? (archiveYear ? 12 + (seed % 160) : 0);
  const da =
    row.da ??
    clamp((row.metrics?.seo_score ?? 20) + Math.log10(backlinks + 1) * 9 + (seed % 18), 1, 92);
  const pa = row.pa ?? clamp(da - 8 + (seed % 15), 1, 88);
  const score =
    row.score ??
    clamp(
      32 + da * 0.35 + pa * 0.22 + (archiveYear ? 9 : 0) - (row.risk_level === "high" ? 18 : 0),
    );
  const risk = row.risk_level ?? pick(RISK, seed);
  const estimatedValue =
    row.estimatedValue ??
    Math.max(
      180,
      Math.round(
        score * score * 0.78 +
          backlinks * 0.18 +
          (["com", "io", "ai", "do"].includes(tld) ? 1250 : 260),
      ),
    );
  const parts = row.scoreParts ?? scoreParts(score, risk, backlinks, tld);
  const status = row.status ?? pick(STATUSES, seed);
  const drop =
    row.drop_date ??
    row.expiry_date ??
    new Date(Date.now() + ((seed % 18) - 8) * 86400000).toISOString();
  const negativeHistory = row.negativeHistory ?? (risk === "high" || seed % 19 === 0);

  return {
    id: row.id ?? index + 1,
    domain: row.domain,
    name,
    tld,
    length: row.length ?? name.length,
    type: row.type ?? pick(TYPES, seed),
    status,
    score,
    risk_level: risk,
    drop_date: row.drop_date ?? drop,
    expiry_date: row.expiry_date ?? null,
    created_at: row.created_at ?? null,
    metrics: {
      backlinks,
      referring_domains: referring,
      archive_year: archiveYear,
      archive_count: archiveCount,
      tld_registered_count: row.metrics?.tld_registered_count ?? seed % 9,
      seo_score: row.metrics?.seo_score ?? score,
    },
    da,
    pa,
    estimatedValue,
    estimatedRange:
      row.estimatedRange ?? `${money(estimatedValue * 0.72)} - ${money(estimatedValue * 1.28)}`,
    aiSummary: row.aiSummary ?? aiSummary(row.domain, score, risk, tld),
    riskNote:
      row.riskNote ?? (negativeHistory ? "需复核历史跳转 / 垃圾站记录" : "未发现明显负面历史"),
    scoreParts: parts,
    highPotential: row.highPotential ?? score >= 82,
    aiRecommended: row.aiRecommended ?? (score >= 70 && risk !== "high"),
    hasArchive: row.hasArchive ?? archiveCount > 0,
    negativeHistory,
    source: row.source ?? "database",
    trend:
      row.trend ??
      Array.from({ length: 12 }, (_, i) =>
        clamp(da + Math.sin((i + (seed % 6)) / 2) * 7 + (seed % 9), 1, 100),
      ),
  };
}

export function generateMockDomains(count = 5000): TerminalDomainRow[] {
  return Array.from({ length: count }, (_, index) => {
    const base = NAMES[index % NAMES.length];
    const suffix = index < NAMES.length ? "" : String(Math.floor(index / NAMES.length));
    const tld = TLDS[(index * 7 + 3) % TLDS.length];
    const domain = `${base}${suffix}.${tld}`;
    const seed = hash(domain);
    const risk = pick(RISK, seed);
    const status = pick(STATUSES, seed + index);
    const score = clamp(48 + (seed % 51) - (risk === "high" ? 16 : risk === "medium" ? 6 : 0));
    return enrichTerminalRow(
      {
        id: index + 1,
        domain,
        status,
        score,
        risk_level: risk,
        source: "mock",
        drop_date: new Date(Date.now() + ((index % 21) - 6) * 86400000).toISOString(),
      },
      index,
    );
  });
}

export function applyTerminalFilters(rows: TerminalDomainRow[], filters: TerminalFilters) {
  let next = rows;
  const q = filters.q?.trim().toLowerCase();
  if (q)
    next = next.filter(
      (r) => r.domain.includes(q) || r.aiSummary.toLowerCase().includes(q.replace(/^\./, "")),
    );
  if (filters.tlds?.length) next = next.filter((r) => filters.tlds!.includes(r.tld));
  if (filters.statuses?.length) next = next.filter((r) => filters.statuses!.includes(r.status));
  if (filters.types?.length) next = next.filter((r) => filters.types!.includes(r.type));
  if (filters.riskLevels?.length)
    next = next.filter((r) => filters.riskLevels!.includes(r.risk_level));
  if (filters.minLength != null) next = next.filter((r) => r.length >= filters.minLength!);
  if (filters.maxLength != null) next = next.filter((r) => r.length <= filters.maxLength!);
  if (filters.minScore != null) next = next.filter((r) => r.score >= filters.minScore!);
  if (filters.scoreMax != null) next = next.filter((r) => r.score <= filters.scoreMax!);
  if (filters.minDa != null) next = next.filter((r) => r.da >= filters.minDa!);
  if (filters.maxDa != null) next = next.filter((r) => r.da <= filters.maxDa!);
  if (filters.minPa != null) next = next.filter((r) => r.pa >= filters.minPa!);
  if (filters.maxPa != null) next = next.filter((r) => r.pa <= filters.maxPa!);
  if (filters.priceMin != null) next = next.filter((r) => r.estimatedValue >= filters.priceMin!);
  if (filters.priceMax != null) next = next.filter((r) => r.estimatedValue <= filters.priceMax!);
  if (filters.backlinksMin != null)
    next = next.filter((r) => (r.metrics?.backlinks ?? 0) >= filters.backlinksMin!);
  if (filters.archiveYearMin != null)
    next = next.filter((r) => (r.metrics?.archive_year ?? 0) >= filters.archiveYearMin!);
  if (filters.startsWith)
    next = next.filter((r) => r.name.startsWith(filters.startsWith!.toLowerCase()));
  if (filters.endsWith) next = next.filter((r) => r.name.endsWith(filters.endsWith!.toLowerCase()));
  if (filters.contains) next = next.filter((r) => r.name.includes(filters.contains!.toLowerCase()));
  if (filters.dropFrom) next = next.filter((r) => (r.drop_date ?? "") >= filters.dropFrom!);
  if (filters.dropTo) next = next.filter((r) => (r.drop_date ?? "") <= filters.dropTo!);
  if (filters.highPotentialOnly) next = next.filter((r) => r.highPotential);
  if (filters.aiRecommendedOnly) next = next.filter((r) => r.aiRecommended);
  if (filters.archiveOnly) next = next.filter((r) => r.hasArchive);
  if (filters.excludeRisk) next = next.filter((r) => !r.negativeHistory && r.risk_level !== "high");
  if (filters.regex) {
    try {
      const re = new RegExp(filters.regex, "i");
      next = next.filter((r) => re.test(r.name));
    } catch {
      // Invalid user-supplied regex is ignored while other filters still apply.
    }
  }

  const dir = filters.sortDir === "asc" ? 1 : -1;
  const sortBy = filters.sortBy ?? "score";
  return [...next].sort((a, b) => {
    const av = sortValue(a, sortBy);
    const bv = sortValue(b, sortBy);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.domain.localeCompare(b.domain);
  });
}

export function pageRows<T>(rows: T[], page = 1, pageSize = 50) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function exportDomainsCsv(rows: TerminalDomainRow[]) {
  const head = [
    "domain",
    "tld",
    "length",
    "score",
    "da",
    "pa",
    "backlinks",
    "estimated_value",
    "risk",
    "drop_date",
    "ai_summary",
  ];
  const body = rows.map((r) =>
    [
      r.domain,
      `.${r.tld}`,
      r.length,
      r.score,
      r.da,
      r.pa,
      r.metrics?.backlinks ?? 0,
      r.estimatedValue,
      r.risk_level,
      formatDate(r.drop_date),
      r.aiSummary,
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sortValue(row: TerminalDomainRow, sortBy: string) {
  if (sortBy === "domain") return row.domain;
  if (sortBy === "length") return row.length;
  if (sortBy === "drop_date") return row.drop_date ?? "";
  if (sortBy === "created_at") return row.created_at ?? "";
  if (sortBy === "backlinks") return row.metrics?.backlinks ?? 0;
  if (sortBy === "da") return row.da;
  if (sortBy === "pa") return row.pa;
  if (sortBy === "value") return row.estimatedValue;
  return row.score;
}

export function formatDate(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function formatCurrency(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatCompactCurrency(value: number) {
  return `$${Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.round(value))}`;
}

function parseDomain(domain: string) {
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const dot = clean.indexOf(".");
  if (dot <= 0) return { name: clean, tld: "" };
  return { name: clean.slice(0, dot), tld: clean.slice(dot + 1) };
}
