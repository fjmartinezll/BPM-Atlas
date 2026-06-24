
-- Limpia datos actuales (no hay FKs externas)
DELETE FROM public.node_subtypes;
DELETE FROM public.node_types;

-- Helper inline: insertamos tipos y luego subtipos buscando por (kind_code, type_name)

-- ===== START =====
INSERT INTO public.node_types (kind_id, name, description)
SELECT id, x.name, x.description FROM public.node_kinds, (VALUES
  ('Manual','Inicio iniciado manualmente por un usuario'),
  ('Mensaje','Inicio al recibir un mensaje externo'),
  ('Temporizador','Inicio basado en tiempo (fecha, ciclo o duración)'),
  ('Señal','Inicio al recibir una señal broadcast'),
  ('Condicional','Inicio cuando se cumple una condición de datos'),
  ('Trigger / Webhook','Inicio por webhook entrante o trigger de BD')
) AS x(name, description) WHERE code='start';

-- ===== INTERMEDIATE =====
INSERT INTO public.node_types (kind_id, name, description)
SELECT id, x.name, x.description FROM public.node_kinds, (VALUES
  ('Mensaje','Esperar o enviar un mensaje'),
  ('Temporizador','Esperar duración o hasta una fecha'),
  ('Señal','Esperar o lanzar una señal'),
  ('Condicional','Esperar a que se cumpla una condición'),
  ('Enlace','Link throw / catch para conectar partes del diagrama')
) AS x(name, description) WHERE code='intermediate';

-- ===== END =====
INSERT INTO public.node_types (kind_id, name, description)
SELECT id, x.name, x.description FROM public.node_kinds, (VALUES
  ('Fin simple','Terminación normal del flujo'),
  ('Fin con mensaje','Envía un mensaje al terminar'),
  ('Fin con señal','Lanza una señal al terminar'),
  ('Fin con error','Termina con error de proceso'),
  ('Fin con terminación','Termina todas las instancias del proceso')
) AS x(name, description) WHERE code='end';

-- ===== GATEWAY =====
INSERT INTO public.node_types (kind_id, name, description)
SELECT id, x.name, x.description FROM public.node_kinds, (VALUES
  ('Exclusivo (XOR)','Toma exactamente una salida según los datos'),
  ('Inclusivo (OR)','Puede tomar varias salidas según condiciones'),
  ('Paralelo (AND)','Bifurca o sincroniza ramas en paralelo'),
  ('Basado en eventos','Espera al primero de varios eventos'),
  ('Complejo','Regla de decisión compleja')
) AS x(name, description) WHERE code='gateway';

-- ===== TASK =====
INSERT INTO public.node_types (kind_id, name, description)
SELECT id, x.name, x.description FROM public.node_kinds, (VALUES
  ('Tarea de usuario','Tarea realizada por una persona en la bandeja'),
  ('Tarea de servicio','Llamada a un servicio externo o función de backend'),
  ('Tarea de script','Ejecuta un script inline'),
  ('Tarea de regla de negocio','Evalúa reglas de negocio'),
  ('Tarea de envío','Envía un mensaje / email / notificación'),
  ('Tarea de recepción','Espera y recibe un mensaje'),
  ('Tarea manual','Acción realizada fuera del sistema'),
  ('Tarea automática (workflow)','Ejecuta un workflow automatizado'),
  ('Tarea agéntica IA','Tarea ejecutada por un agente de IA')
) AS x(name, description) WHERE code='task';

-- ===== SUBTYPES =====
-- start
INSERT INTO public.node_subtypes (type_id, name, description)
SELECT nt.id, x.name, x.description
FROM public.node_types nt JOIN public.node_kinds nk ON nk.id = nt.kind_id, (VALUES
  ('start','Manual','Inicio manual','Inicio manual estándar')
) AS x(kc, tn, name, description)
WHERE nk.code = x.kc AND nt.name = x.tn;

INSERT INTO public.node_subtypes (type_id, name, description)
SELECT nt.id, x.name, x.description
FROM public.node_types nt JOIN public.node_kinds nk ON nk.id = nt.kind_id, (VALUES
  ('start','Mensaje','Recepción de mensaje',NULL),
  ('start','Temporizador','Fecha/hora fija','Dispara en una fecha/hora concreta'),
  ('start','Temporizador','Ciclo recurrente','Dispara según una expresión cron'),
  ('start','Temporizador','Duración','Dispara tras una duración'),
  ('start','Señal','Señal broadcast',NULL),
  ('start','Condicional','Condición de datos cumplida',NULL),
  ('start','Trigger / Webhook','Webhook entrante',NULL),
  ('start','Trigger / Webhook','Trigger de BD',NULL)
) AS x(kc, tn, name, description)
WHERE nk.code = x.kc AND nt.name = x.tn;

-- intermediate
INSERT INTO public.node_subtypes (type_id, name, description)
SELECT nt.id, x.name, x.description
FROM public.node_types nt JOIN public.node_kinds nk ON nk.id = nt.kind_id, (VALUES
  ('intermediate','Mensaje','Esperar mensaje',NULL),
  ('intermediate','Mensaje','Enviar mensaje',NULL),
  ('intermediate','Temporizador','Esperar duración',NULL),
  ('intermediate','Temporizador','Esperar hasta fecha',NULL),
  ('intermediate','Señal','Esperar señal',NULL),
  ('intermediate','Señal','Lanzar señal',NULL),
  ('intermediate','Condicional','Esperar condición',NULL),
  ('intermediate','Enlace','Link throw',NULL),
  ('intermediate','Enlace','Link catch',NULL)
) AS x(kc, tn, name, description)
WHERE nk.code = x.kc AND nt.name = x.tn;

-- end
INSERT INTO public.node_subtypes (type_id, name, description)
SELECT nt.id, x.name, x.description
FROM public.node_types nt JOIN public.node_kinds nk ON nk.id = nt.kind_id, (VALUES
  ('end','Fin simple','Terminación normal',NULL),
  ('end','Fin con mensaje','Enviar mensaje al terminar',NULL),
  ('end','Fin con señal','Lanzar señal al terminar',NULL),
  ('end','Fin con error','Error de proceso',NULL),
  ('end','Fin con terminación','Terminar todas las instancias',NULL)
) AS x(kc, tn, name, description)
WHERE nk.code = x.kc AND nt.name = x.tn;

-- gateway
INSERT INTO public.node_subtypes (type_id, name, description)
SELECT nt.id, x.name, x.description
FROM public.node_types nt JOIN public.node_kinds nk ON nk.id = nt.kind_id, (VALUES
  ('gateway','Exclusivo (XOR)','Decisión por datos',NULL),
  ('gateway','Inclusivo (OR)','Decisión múltiple',NULL),
  ('gateway','Paralelo (AND)','Bifurcar paralelo',NULL),
  ('gateway','Paralelo (AND)','Sincronizar paralelo',NULL),
  ('gateway','Basado en eventos','Espera al primer evento',NULL),
  ('gateway','Complejo','Regla compleja',NULL)
) AS x(kc, tn, name, description)
WHERE nk.code = x.kc AND nt.name = x.tn;

-- task
INSERT INTO public.node_subtypes (type_id, name, description)
SELECT nt.id, x.name, x.description
FROM public.node_types nt JOIN public.node_kinds nk ON nk.id = nt.kind_id, (VALUES
  ('task','Tarea de usuario','Tarea Humana',NULL),
  ('task','Tarea de servicio','Llamada HTTP/API',NULL),
  ('task','Tarea de servicio','Función de backend',NULL),
  ('task','Tarea de script','Script inline',NULL),
  ('task','Tarea de regla de negocio','Evaluación de reglas',NULL),
  ('task','Tarea de envío','Enviar mensaje/email',NULL),
  ('task','Tarea de recepción','Recibir mensaje',NULL),
  ('task','Tarea manual','Acción fuera del sistema',NULL),
  ('task','Tarea automática (workflow)','Tarea Automática (workflow)',NULL),
  ('task','Tarea agéntica IA','Tarea Agentica con IA',NULL)
) AS x(kc, tn, name, description)
WHERE nk.code = x.kc AND nt.name = x.tn;
