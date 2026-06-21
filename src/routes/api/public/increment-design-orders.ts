import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

async function handle(request: Request) {
  let id: string | null = null;
  if (request.method === "POST") {
    try {
      const body = await request.json();
      if (body && typeof body.id === "string") id = body.id;
    } catch {
      /* ignore */
    }
  }
  if (!id) {
    const url = new URL(request.url);
    id = url.searchParams.get("id");
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response(JSON.stringify({ error: "missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await supabase.rpc("increment_design_order_count", { _id: id });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/increment-design-orders")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
