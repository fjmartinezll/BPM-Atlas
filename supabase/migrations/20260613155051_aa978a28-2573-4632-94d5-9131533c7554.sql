-- Taxonomía de nodos BPM
CREATE TABLE public.node_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.node_categories TO authenticated;
GRANT ALL ON public.node_categories TO service_role;
ALTER TABLE public.node_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_categories read auth" ON public.node_categories FOR SELECT TO authenticated USING (true);

CREATE TABLE public.node_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.node_categories(id) ON DELETE RESTRICT,
  is_container boolean NOT NULL DEFAULT false,
  acts_as_action boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_node_kinds_category ON public.node_kinds(category_id);
GRANT SELECT ON public.node_kinds TO authenticated;
GRANT ALL ON public.node_kinds TO service_role;
ALTER TABLE public.node_kinds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_kinds read auth" ON public.node_kinds FOR SELECT TO authenticated USING (true);

CREATE TABLE public.node_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id uuid NOT NULL REFERENCES public.node_kinds(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind_id, name)
);
CREATE INDEX idx_node_types_kind ON public.node_types(kind_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_types TO authenticated;
GRANT ALL ON public.node_types TO service_role;
ALTER TABLE public.node_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_types read auth" ON public.node_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "node_types admin write" ON public.node_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_node_types_updated BEFORE UPDATE ON public.node_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.node_subtypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL REFERENCES public.node_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type_id, name)
);
CREATE INDEX idx_node_subtypes_type ON public.node_subtypes(type_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_subtypes TO authenticated;
GRANT ALL ON public.node_subtypes TO service_role;
ALTER TABLE public.node_subtypes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "node_subtypes read auth" ON public.node_subtypes FOR SELECT TO authenticated USING (true);
CREATE POLICY "node_subtypes admin write" ON public.node_subtypes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_node_subtypes_updated BEFORE UPDATE ON public.node_subtypes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seeds
INSERT INTO public.node_categories (code, name, description) VALUES
  ('eventos','Eventos','Eventos del proceso (inicio, intermedio, fin)'),
  ('acciones','Acciones','Nodos que realizan trabajo'),
  ('decisiones','Decisiones','Nodos de bifurcación'),
  ('contenedores','Contenedores','Agrupan otros nodos');

INSERT INTO public.node_kinds (code, name, category_id, is_container, acts_as_action)
SELECT v.code, v.name, c.id, v.is_container, v.acts_as_action
FROM (VALUES
  ('start','Evento de inicio','eventos',false,false),
  ('intermediate','Evento intermedio','eventos',false,false),
  ('end','Evento fin','eventos',false,false),
  ('task','Tarea ejecutable','acciones',false,false),
  ('gateway','Decisión','decisiones',false,false),
  ('subprocess','Subproceso','contenedores',true,true),
  ('pool','Entidad','contenedores',true,false),
  ('lane','Calle','contenedores',true,false)
) AS v(code,name,cat_code,is_container,acts_as_action)
JOIN public.node_categories c ON c.code = v.cat_code;