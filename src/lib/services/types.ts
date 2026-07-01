// Unified service-layer types shared by domain-availability / generator / pricing.

export type DomainStatus = "available" | "taken" | "premium" | "reserved" | "invalid" | "unknown";

export interface DomainCheckResult {
  domain: string;
  status: DomainStatus;
  source: string;
  checkedAt: string;
  registrar?: string;
  price?: number;
  renewalPrice?: number;
  currency?: string;
  reason?: string;
  raw?: unknown;
}

export interface DomainIdea {
  domain: string;
  name: string;
  tld: string;
  length: number;
  reason: string;
  useCase: string;
  memorability: number; // 0-100
  brandability: number; // 0-100
  recommend: boolean;
  strategy: string;
}

export interface IdeaGenParams {
  keywords: string;
  industry?: string;
  useCase?: string;
  language?: "en" | "zh" | "pinyin" | "mixed";
  minLen?: number;
  maxLen?: number;
  tlds?: string[];
  count?: number;
}
