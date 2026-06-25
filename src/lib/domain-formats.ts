// Pure utilities for parsing domain format patterns and generating candidates.
// L=letter (a-z), N=digit (0-9), A=alphanumeric, lowercase letter or digit = fixed.

export type FormatPreset = "LLLL" | "LLL" | "NNNN" | "NNN" | "mixed3" | "custom" | "list";

export interface ParsedFormat {
  // Each position is either a set of allowed chars (string) or a fixed literal char
  positions: string[];
  count: number; // total combinations
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALNUM = LETTERS + DIGITS;

export function parseFormat(pattern: string): ParsedFormat | null {
  if (!pattern) return null;
  const positions: string[] = [];
  let count = 1;
  for (const ch of pattern) {
    if (ch === "L") {
      positions.push(LETTERS);
      count *= 26;
    } else if (ch === "N") {
      positions.push(DIGITS);
      count *= 10;
    } else if (ch === "A") {
      positions.push(ALNUM);
      count *= 36;
    } else if (/[a-z0-9]/.test(ch)) {
      positions.push(ch);
    } else {
      return null;
    }
    if (count > 1e10) return null;
  }
  return { positions, count };
}

export function presetToPattern(preset: FormatPreset): string {
  switch (preset) {
    case "LLLL":
      return "LLLL";
    case "LLL":
      return "LLL";
    case "NNNN":
      return "NNNN";
    case "NNN":
      return "NNN";
    case "mixed3":
      return "AAA";
    default:
      return "";
  }
}

export function isMixed3(preset: FormatPreset) {
  return preset === "mixed3";
}

/** Generator that yields all candidates for the given parsed format. */
export function* generateCandidates(parsed: ParsedFormat): Generator<string> {
  const { positions } = parsed;
  const idx = new Array(positions.length).fill(0);
  const buf: string[] = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) buf[i] = positions[i][0];

  while (true) {
    yield buf.join("");
    let p = positions.length - 1;
    while (p >= 0) {
      const pool = positions[p];
      if (pool.length === 1) {
        p--;
        continue;
      }
      idx[p]++;
      if (idx[p] < pool.length) {
        buf[p] = pool[idx[p]];
        break;
      } else {
        idx[p] = 0;
        buf[p] = pool[0];
        p--;
      }
    }
    if (p < 0) return;
  }
}

export interface CandidateFilter {
  prefix?: string;
  suffix?: string;
  contains?: string;
  regex?: RegExp;
  mustHaveLetter?: boolean;
  mustHaveDigit?: boolean;
  excludeAllLetters?: boolean;
  excludeAllDigits?: boolean;
}

export function makeFilter(opts: {
  filterType?: "prefix" | "suffix" | "contains" | "regex" | "none";
  filterValue?: string;
  mustHaveLetter?: boolean;
  mustHaveDigit?: boolean;
  // For mixed3: exclude pure-letter and pure-digit candidates
  excludePureForMixed?: boolean;
}): (s: string) => boolean {
  const { filterType, filterValue } = opts;
  let regex: RegExp | null = null;
  if (filterType === "regex" && filterValue) {
    try {
      regex = new RegExp(filterValue);
    } catch {
      regex = null;
    }
  }
  return (s: string) => {
    if (filterValue) {
      if (filterType === "prefix" && !s.startsWith(filterValue)) return false;
      if (filterType === "suffix" && !s.endsWith(filterValue)) return false;
      if (filterType === "contains" && !s.includes(filterValue)) return false;
      if (filterType === "regex" && regex && !regex.test(s)) return false;
    }
    if (opts.mustHaveLetter && !/[a-z]/.test(s)) return false;
    if (opts.mustHaveDigit && !/[0-9]/.test(s)) return false;
    if (opts.excludePureForMixed) {
      // mixed3 keeps only candidates that contain BOTH a letter and a digit
      if (!/[a-z]/.test(s) || !/[0-9]/.test(s)) return false;
    }
    return true;
  };
}

/** Estimate total count by walking the generator (capped). */
export function estimateCombined(
  parsed: ParsedFormat,
  tldCount: number,
  filter: (s: string) => boolean,
  cap = 5_000_000,
): { candidates: number; total: number; capped: boolean } {
  let candidates = 0;
  let scanned = 0;
  for (const c of generateCandidates(parsed)) {
    scanned++;
    if (filter(c)) candidates++;
    if (scanned >= cap) {
      // Extrapolate
      const ratio = candidates / scanned;
      const projected = Math.round(parsed.count * ratio);
      return { candidates: projected, total: projected * Math.max(1, tldCount), capped: true };
    }
  }
  return { candidates, total: candidates * Math.max(1, tldCount), capped: false };
}

export const COMMON_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "co",
  "ai",
  "app",
  "dev",
  "xyz",
  "me",
  "cc",
  "tv",
  "info",
  "biz",
  "cn",
  "us",
  "uk",
  "de",
  "fr",
  "jp",
];

export function normalizeTlds(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,，]+/)
        .map((t) => t.trim().toLowerCase().replace(/^\./, ""))
        .filter((t) => /^[a-z0-9-]+$/.test(t)),
    ),
  );
}

export function parseList(input: string): { candidates: string[]; fullDomains: string[] } {
  const candidates: string[] = [];
  const fullDomains: string[] = [];
  for (const raw of input.split(/[\s,，]+/)) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (t.includes(".")) fullDomains.push(t);
    else candidates.push(t);
  }
  return { candidates, fullDomains };
}
