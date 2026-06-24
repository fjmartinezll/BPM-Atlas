
ALTER TABLE public.macroprocesses DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.process_types DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.processes DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.subprocesses DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.task_types DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.tasks DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.executable_elements DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.entities DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.entity_process_links DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.process_diagrams DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.process_indicators DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.process_risks DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.process_documents DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.profiles DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.user_roles DROP COLUMN IF EXISTS "NombreDeTabla";
ALTER TABLE public.change_log DROP COLUMN IF EXISTS "NombreDeTabla";
