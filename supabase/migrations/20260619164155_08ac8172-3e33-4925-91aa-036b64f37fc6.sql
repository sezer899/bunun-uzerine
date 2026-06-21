CREATE TABLE public.saved_designs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  design jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_designs_user_id_idx ON public.saved_designs(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_designs TO authenticated;
GRANT ALL ON public.saved_designs TO service_role;
ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own designs" ON public.saved_designs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER saved_designs_touch BEFORE UPDATE ON public.saved_designs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();