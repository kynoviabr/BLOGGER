-- Supabase owns scheduling and execution. Vercel is not part of this path.
ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE public.content_items ADD CONSTRAINT content_items_status_check
  CHECK (status IN ('draft', 'reviewing', 'ready', 'scheduled', 'publishing', 'published', 'archived'));

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_original_status text,
  ADD COLUMN IF NOT EXISTS last_publish_error text,
  ADD COLUMN IF NOT EXISTS external_post_id text,
  ADD COLUMN IF NOT EXISTS external_post_url text;

CREATE INDEX IF NOT EXISTS idx_content_items_publish_queue
  ON public.content_items (status, created_at)
  WHERE status IN ('ready', 'scheduled', 'publishing');
