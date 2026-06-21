-- 1) Yeni kolonlar
ALTER TABLE public.saved_designs
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS author_label text;

CREATE INDEX IF NOT EXISTS saved_designs_public_idx
  ON public.saved_designs (is_public, order_count DESC, updated_at DESC)
  WHERE is_public = true;

-- 2) Public view (sadece güvenli kolonlar)
DROP VIEW IF EXISTS public.public_designs;
CREATE VIEW public.public_designs
WITH (security_invoker = on) AS
  SELECT id, name, design, author_label, order_count, updated_at
    FROM public.saved_designs
   WHERE is_public = true;

GRANT SELECT ON public.public_designs TO anon, authenticated;

-- 3) Base tablo için herkese açık satırları okumayı izinleyen ek RLS policy
-- (security_invoker view, çağıranın haklarıyla okuduğu için gerekli)
DROP POLICY IF EXISTS "Anyone can read public designs" ON public.saved_designs;
CREATE POLICY "Anyone can read public designs"
  ON public.saved_designs
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- anon rolü base tablodaki satıra view üzerinden ulaşabilsin diye SELECT grant gerek
GRANT SELECT ON public.saved_designs TO anon;

-- 4) Sipariş sayacını artıran security definer RPC
CREATE OR REPLACE FUNCTION public.increment_design_order_count(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.saved_designs
     SET order_count = order_count + 1
   WHERE id = _id AND is_public = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_design_order_count(uuid) TO anon, authenticated;
