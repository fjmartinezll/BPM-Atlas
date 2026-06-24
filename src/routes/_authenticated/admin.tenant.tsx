import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route — fusionada en /admin (Fase 5). Se mantiene como redirect
// para no romper bookmarks/emails. Se eliminará en una release posterior.
export const Route = createFileRoute("/_authenticated/admin/tenant")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", search: { tab: "general" } });
  },
});
