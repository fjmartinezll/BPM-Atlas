
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_bpm(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_any_bpm_role(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_bpm(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_bpm_role(uuid) TO authenticated;
