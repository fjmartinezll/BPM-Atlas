import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { PlatformExecutionMatrix } from "./modeling-panel";

export function PlatformExecutionPanel() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["platform-execution-overview"],
    queryFn: async () => {
      const [instancesQ, tasksQ] = await Promise.all([
        supabase.from("process_instances").select("id,status"),
        supabase.from("process_tasks").select("id,status"),
      ]);
      const instancesByStatus: Record<string, number> = {};
      (instancesQ.data ?? []).forEach((i: any) => {
        const k = i.status ?? "—";
        instancesByStatus[k] = (instancesByStatus[k] ?? 0) + 1;
      });
      const tasksByStatus: Record<string, number> = {};
      (tasksQ.data ?? []).forEach((t: any) => {
        const k = t.status ?? "—";
        tasksByStatus[k] = (tasksByStatus[k] ?? 0) + 1;
      });
      return { instancesByStatus, tasksByStatus };
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("adminExecution.instancesByStatus")}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={Object.entries(data?.instancesByStatus ?? {}).map(([k, v]) => ({ status: k, total: v }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="status" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="total" fill="hsl(35 90% 55%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("adminExecution.tasksByStatus")}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={Object.entries(data?.tasksByStatus ?? {}).map(([k, v]) => ({ status: k, total: v }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="status" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <RTooltip />
                  <Bar dataKey="total" fill="hsl(160 70% 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <PlatformExecutionMatrix />
    </div>
  );
}
