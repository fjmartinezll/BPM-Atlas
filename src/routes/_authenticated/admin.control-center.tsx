import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route — fusionada en /admin (Fase 5).
export const Route = createFileRoute("/_authenticated/admin/control-center")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", search: { tab: "modeling" } });
  },
});
