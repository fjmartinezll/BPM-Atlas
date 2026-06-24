ALTER TABLE public.process_variables DROP CONSTRAINT IF EXISTS process_variables_var_type_check;

UPDATE public.process_variables
SET var_type = CASE var_type
  WHEN 'string' THEN 'text'
  WHEN 'number' THEN 'integer'
  WHEN 'money'  THEN 'numeric'
  ELSE var_type
END
WHERE var_type IN ('string','number','money');

ALTER TABLE public.process_variables
  ADD CONSTRAINT process_variables_var_type_check
  CHECK (var_type IN ('text','integer','numeric','boolean','date','timestamp','uuid','json','entity'));