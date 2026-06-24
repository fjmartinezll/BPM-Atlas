import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route — auditoría unificada en /admin?tab=audit (Fase 4).
export const Route = createFileRoute("/_authenticated/changelog")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", search: { tab: "audit" } });
  },
});
