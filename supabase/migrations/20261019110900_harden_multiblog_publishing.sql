-- Generic queue hardening for every CMS/blog integration.
ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE public.content_items ADD CONSTRAINT content_items_status_check
  CHECK (status IN (
    'draft', 'reviewing', 'ready', 'scheduled', 'publishing',
    'publish_failed', 'published', 'archived'
  ));

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS next_publish_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_failure_code text;

ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_publish_attempts_nonnegative;
ALTER TABLE public.content_items ADD CONSTRAINT content_items_publish_attempts_nonnegative
  CHECK (publish_attempts >= 0);

-- Existing exhausted items become explicitly actionable instead of looking ready forever.
UPDATE public.content_items
SET status = 'publish_failed',
    publish_failure_code = COALESCE(publish_failure_code, 'MAX_ATTEMPTS_EXCEEDED'),
    next_publish_attempt_at = NULL
WHERE status IN ('ready', 'scheduled')
  AND publish_attempts >= 5
  AND last_publish_error IS NOT NULL;

DROP INDEX IF EXISTS public.idx_content_items_publish_queue;
CREATE INDEX idx_content_items_publish_queue
  ON public.content_items (status, next_publish_attempt_at, created_at)
  WHERE status IN ('ready', 'scheduled', 'publishing');
