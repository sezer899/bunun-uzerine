import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const designSchema = z.object({
  placed: z.array(z.any()),
  chainDip: z.number(),
  chainLeftX: z.number(),
  chainRightX: z.number(),
  chainY: z.number(),
  chainColor: z.enum(["silver", "gold"]),
  chainStyle: z.enum(["rope", "paperclip"]).optional(),
});

function deriveAuthorLabel(email: string | null | undefined): string {
  if (!email) return "anonim";
  const at = email.indexOf("@");
  const base = at > 0 ? email.slice(0, at) : email;
  return base.slice(0, 24);
}

export const listMyDesigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_designs")
      .select("id, name, design, preview_image, is_public, order_count, author_label, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        design: designSchema,
        isPublic: z.boolean().optional(),
        preview: z.string().max(200_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const isPublic = data.isPublic === true;
    const authorLabel = isPublic
      ? deriveAuthorLabel(context.claims?.email as string | undefined)
      : null;
    const { count: existingCount, error: countError } = await context.supabase
      .from("saved_designs")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((existingCount ?? 0) >= 30) {
      throw new Error(
        "En fazla 30 tasarım kaydedebilirsiniz. Yenisini eklemek için diğerlerinden bazılarını silin.",
      );
    }
    const { data: row, error } = await context.supabase
      .from("saved_designs")
      .insert({
        user_id: context.userId,
        name: data.name,
        design: data.design,
        is_public: isPublic,
        author_label: authorLabel,
        preview_image: data.preview ?? null,
      })
      .select("id, name, design, preview_image, is_public, order_count, author_label, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setDesignVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), isPublic: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const authorLabel = data.isPublic
      ? deriveAuthorLabel(context.claims?.email as string | undefined)
      : null;
    const { data: row, error } = await context.supabase
      .from("saved_designs")
      .update({ is_public: data.isPublic, author_label: authorLabel })
      .eq("id", data.id)
      .select("id, is_public, author_label")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_designs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const migrateLocalDesigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z
          .array(z.object({ name: z.string().min(1).max(120), design: designSchema }))
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.items.length === 0) return { inserted: 0 };
    const { count: existingCount, error: countError } = await context.supabase
      .from("saved_designs")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    const remaining = Math.max(0, 30 - (existingCount ?? 0));
    if (remaining === 0) return { inserted: 0 };
    const slice = data.items.slice(0, remaining);
    const rows = slice.map((it) => ({
      user_id: context.userId,
      name: it.name,
      design: it.design,
    }));
    const { error, count } = await context.supabase
      .from("saved_designs")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? rows.length };
  });

// Public read — no auth required. Uses publishable key + view.
export const listPublicDesigns = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const supabasePublic = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await supabasePublic
      .from("public_designs")
      .select("id, name, design, preview_image, author_label, order_count, updated_at")
      .order("order_count", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Public RPC — called from successful payment page. Narrowly scoped: RPC only
// touches order_count and only for is_public = true rows.
export const incrementPublicDesignOrders = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabasePublic = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await supabasePublic.rpc("increment_design_order_count", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
