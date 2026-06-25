import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ParamsSchema = z.object({
  keywords: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(80).optional(),
  useCase: z.string().trim().max(80).optional(),
  language: z.enum(["en", "zh", "pinyin", "mixed"]).optional(),
  minLen: z.number().int().min(2).max(30).optional(),
  maxLen: z.number().int().min(2).max(30).optional(),
  tlds: z.array(z.string().trim().min(1).max(20)).max(30).optional(),
  count: z.number().int().min(5).max(30).optional(),
});

export const generateIdeasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ParamsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { generateIdeas } = await import("./services/domain-generator.server");
    const ideas = await generateIdeas(data);
    // persist
    try {
      await context.supabase.from("domain_ideas").insert({
        user_id: context.userId,
        keywords: data.keywords,
        params: data as unknown as Record<string, unknown>,
        results: ideas as unknown as Record<string, unknown>[],
      });
    } catch {}
    return { ideas };
  });

export const listIdeasFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("domain_ideas")
      .select("id, keywords, params, results, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const deleteIdeaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("domain_ideas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
