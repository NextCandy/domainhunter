// SEO enrichment via Semrush connector (gateway-backed). Returns null when
// unavailable so callers can mark the item as skipped.

export type SeoSummary = {
  rank: number | null;
  organic_traffic: number | null;
  organic_keywords: number | null;
  backlinks: number | null;
  referring_domains: number | null;
  authority_score: number | null;
};

export async function fetchSeo(domain: string): Promise<SeoSummary | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const semrushKey = process.env.SEMRUSH_API_KEY;
  if (!lovableKey || !semrushKey) return null;
  try {
    const url = `https://connector-gateway.lovable.dev/semrush/analytics/v1/?type=domain_rank&key=&domain=${encodeURIComponent(domain)}&database=us&export_columns=Db,Dn,Rk,Or,Ot,Oc,Ad,At,Ac`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": semrushKey,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    // Semrush returns CSV. Quick parse of first data line.
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      return { rank: null, organic_traffic: 0, organic_keywords: 0, backlinks: null, referring_domains: null, authority_score: null };
    }
    const cols = lines[1].split(";");
    const num = (v: string | undefined) => {
      const n = parseInt(String(v ?? "").trim(), 10);
      return Number.isFinite(n) ? n : null;
    };
    return {
      rank: num(cols[2]),
      organic_keywords: num(cols[3]),
      organic_traffic: num(cols[4]),
      backlinks: null,
      referring_domains: null,
      authority_score: null,
    };
  } catch {
    return null;
  }
}
