// src/features/alerts/api.ts
import { supabase } from "@/lib/supabase";

export async function listAlerts(deviceId: string, page = 0, pageSize = 50) {
  console.log("listAlerts params", { deviceId, page, pageSize });
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("device_id", deviceId)
    .order("ts", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) {
    console.error("listAlerts error", error);
    throw error;
  }
  console.log("listAlerts result", data?.length ?? 0);
  return data;
}
