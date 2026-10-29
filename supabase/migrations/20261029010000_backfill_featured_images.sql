-- Artigos já escritos que estão em revisão sem imagem de destaque ganham a
-- imagem automaticamente, como os próximos artigos (ver content_pipeline).
INSERT INTO public.background_jobs (organization_id, blog_id, job_type, payload, priority, max_attempts, idempotency_key)
SELECT blog.organization_id, item.blog_id, 'image_generation',
       jsonb_build_object('contentId', item.id, 'requestedBy', 'backfill-20261029'),
       35, 3, 'image-generation:auto:' || item.id
FROM public.content_items item
JOIN public.blogs blog ON blog.id = item.blog_id
WHERE item.status = 'reviewing'
  AND item.featured_image_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.background_jobs job
    WHERE job.job_type = 'image_generation'
      AND job.payload->>'contentId' = item.id::text
      AND job.status IN ('queued', 'running', 'retrying')
  )
ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
