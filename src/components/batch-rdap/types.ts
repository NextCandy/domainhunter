export type AutoEnrichScope = "available" | "registered" | "all";

export type BatchJob = {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "stopped" | string;
  created_at?: string | null;
  total: number;
  checked: number;
  available: number;
  registered: number;
  unsupported: number;
  errors: number;
  params?: {
    concurrency?: number;
    timeout?: number;
    retries?: number;
  } & Record<string, unknown>;
};

export type RecentJob = BatchJob;

export type RecentJobItem = {
  domain: string;
  error?: string | null;
};
