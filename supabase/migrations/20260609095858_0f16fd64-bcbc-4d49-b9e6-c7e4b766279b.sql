
ALTER TABLE public.process_tokens REPLICA IDENTITY FULL;
ALTER TABLE public.process_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.process_instances REPLICA IDENTITY FULL;
ALTER TABLE public.process_events_log REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.process_tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.process_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.process_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.process_events_log;
