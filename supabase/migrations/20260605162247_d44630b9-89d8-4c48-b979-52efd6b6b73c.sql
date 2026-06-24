
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_bpm(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_any_bpm_role(uuid) TO authenticated, anon;
