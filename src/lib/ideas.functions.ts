import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guards";
import { query } from "@/lib/db.server";

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
  .middleware([requireAuth])
  .inputValidator((input: unknown) => ParamsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { generateIdeas } = await import("./services/domain-generator.server");
    const ideas = await generateIdeas(data);
    await query(
      `INSERT INTO public.domain_ideas (user_id, keywords, params, results)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [context.userId, data.keywords, JSON.stringify(data), JSON.stringify(ideas)],
    );
    return { ideas };
  });

export const listIdeasFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { rows } = await query(
      `SELECT id, keywords, params, results, created_at
       FROM public.domain_ideas
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [context.userId],
    );
    return { items: rows };
  });

export const deleteIdeaFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ data, context }) => {
    await query(`DELETE FROM public.domain_ideas WHERE id = $1 AND user_id = $2`, [data.id, context.userId]);
    return { ok: true };
  });
