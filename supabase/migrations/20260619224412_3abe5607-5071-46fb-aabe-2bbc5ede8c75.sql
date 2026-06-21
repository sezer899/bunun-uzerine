CREATE TABLE public.saved_designs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  design jsonb NOT NULL,
  preview_image text,
  author_label text,
  is_public boolean NOT NULL DEFAULT false,
  order_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_designs_user_id_idx ON public.saved_designs(user_id, updated_at DESC);
CREATE INDEX saved_designs_public_idx
  ON public.saved_designs (is_public, order_count DESC, updated_at DESC)
  WHERE is_public = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_designs TO authenticated;
GRANT SELECT ON public.saved_designs TO anon;
GRANT ALL ON public.saved_designs TO service_role;

ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own designs" ON public.saved_designs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read public designs" ON public.saved_designs
  FOR SELECT TO anon, authenticated USING (is_public = true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER saved_designs_touch BEFORE UPDATE ON public.saved_designs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE VIEW public.public_designs
WITH (security_invoker = on) AS
  SELECT id, name, design, preview_image, author_label, order_count, updated_at
    FROM public.saved_designs
   WHERE is_public = true;

GRANT SELECT ON public.public_designs TO anon, authenticated;

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