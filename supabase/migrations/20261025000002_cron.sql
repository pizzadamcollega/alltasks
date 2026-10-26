-- =============================================================================
-- Scheduled jobs (Supabase: Database → Extensions → enable pg_cron first,
-- or let this migration enable it).
-- Every 10 minutes:
--   * make sure the current and next two schedule weeks exist for each branch
--   * close weeks whose request deadline has passed and build their drafts
-- =============================================================================

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'pizzadam-schedule-jobs';

select cron.schedule(
  'pizzadam-schedule-jobs',
  '*/10 * * * *',
  $$ select public.run_schedule_jobs(); $$
);
