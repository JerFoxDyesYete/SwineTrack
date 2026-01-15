import { supabase } from "@/lib/supabase";

export type ReadingRow = {
  id: number;
  device_id: string;
  ts: string;
  temp_c: number | null;
  humidity_rh: number | null;
  pressure_hpa: number | null;
  gas_res_ohm: number | null;
  iaq: number | null;
  t_min_c: number | null;
  t_max_c: number | null;
  t_avg_c: number | null;
};

export async function fetchReadings(
  deviceId: string,
  fromISO: string,
  toISO: string,
  limit = 10,
  offset = 0 
) {
  
  const { data, error } = await supabase
    .from("readings")
    .select(
      "id, device_id, ts, temp_c, humidity_rh, pressure_hpa, gas_res_ohm, iaq, t_min_c, t_max_c, t_avg_c"
    )
    .eq("device_id", deviceId)
    .gte("ts", fromISO)
    .lte("ts", toISO)
    .order("ts", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("fetchReadings error", error);
    throw error;
  }
  
  return data as ReadingRow[];
}