// Self-hosted shim: replaces the Supabase service-role client with a
// PostgREST-compatible adapter over the local Postgres pool.
// The exported name `supabaseAdmin` is kept so existing serverFns work unchanged.
import { pgShim } from "@/lib/pg-shim.server";

export const supabaseAdmin = pgShim as any;
