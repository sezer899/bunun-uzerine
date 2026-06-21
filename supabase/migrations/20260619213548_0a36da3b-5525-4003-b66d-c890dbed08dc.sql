ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS preview_image text;

DROP VIEW IF EXISTS public.public_designs;
CREATE VIEW public.public_designs
WITH (security_invoker = true)
AS
SELECT id, name, design, preview_image, author_label, order_count, updated_at
FROM public.saved_designs
WHERE is_public = true;

GRANT SELECT ON public.public_designs TO anon, authenticated;