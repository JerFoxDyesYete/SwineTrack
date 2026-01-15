import { supabase } from "../../lib/supabase";

export type SnapshotRow = {
  id: number;
  device_id: string;
  ts: string;
  overlay_path: string;
  reading_id: number | null;
  imageUrl: string | null;
  thermalUrl: string | null;
  reading?: {
    temp_c: number | null;
    humidity_rh: number | null;
    pressure_hpa: number | null;
    gas_res_ohm: number | null;
    iaq: number | null;
    t_min_c: number | null;
    t_max_c: number | null;
    t_avg_c: number | null;
  } | null;
};

export async function listSnapshots(deviceId: string, page = 0, pageSize = 20) {
  try {
    console.log("Fetching snapshots for device:", deviceId);

    const { data, error } = await supabase
      .from("snapshots")
      .select(
        `
        id, device_id, ts, overlay_path, reading_id,
        reading:readings ( temp_c, humidity_rh, pressure_hpa, gas_res_ohm, iaq, t_min_c, t_max_c, t_avg_c )
      `
      )
      .eq("device_id", deviceId)
      .order("ts", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      console.error("Database error:", error);
      throw error;
    }

    console.log("Found", data?.length, "snapshots");

    const snapshotsWithUrls = await Promise.all(
      (data ?? []).map(async (row: any) => {
        try {
          if (!row.overlay_path) {
            console.log("No overlay path for snapshot", row.id);
            return { ...row, imageUrl: null, thermalUrl: null };
          }

          const { data: urlData } = supabase.storage
            .from("snapshots")
            .getPublicUrl(row.overlay_path);

          const thermalPath = row.overlay_path.replace(/\.jpg$/i, ".json");
          const { data: thermalData } = supabase.storage
            .from("snapshots")
            .getPublicUrl(thermalPath);

          if (!urlData?.publicUrl || !thermalData?.publicUrl) {
            console.error("Missing snapshot files for", row.overlay_path);
            return { ...row, imageUrl: null, thermalUrl: null };
          }

          return {
            ...row,
            imageUrl: urlData.publicUrl,
            thermalUrl: thermalData.publicUrl,
          };
        } catch (urlErr) {
          console.error("Error retrieving public URL:", urlErr);
          return { ...row, imageUrl: null, thermalUrl: null };
        }
      })
    );

    return snapshotsWithUrls;
  } catch (err) {
    console.error("Error in listSnapshots:", err);
    throw err;
  }
}

export async function testSnapshotsConnection(deviceId: string) {
  try {
    const { error } = await supabase
      .from("snapshots")
      .select("count")
      .eq("device_id", deviceId);

    if (error) {
      console.error("Test connection error:", error);
      return false;
    }

    console.log("Test connection successful");
    return true;
  } catch (err) {
    console.error("Test connection failed:", err);
    return false;
  }
}
