CREATE OR REPLACE FUNCTION public.can_access_client(_user_id uuid, _client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _client_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_clients
    WHERE user_id = _user_id AND client_id = _client_id
  )
$function$;