
DO $$ BEGIN
  CREATE TYPE public.macroprocess_category AS ENUM ('estrategico','misional','transversal','apoyo','control');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.macroprocesses
  ADD COLUMN IF NOT EXISTS category public.macroprocess_category NOT NULL DEFAULT 'misional',
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS stakeholder_inputs text,
  ADD COLUMN IF NOT EXISTS stakeholder_outputs text;
