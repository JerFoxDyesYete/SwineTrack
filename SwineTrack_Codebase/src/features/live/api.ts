import { supabase } from "@/lib/supabase";

export async function getLiveFrame(deviceId: string, _ttlSec = 10) {
  console.log("getLiveFrame params", { deviceId });
  const frame = supabase.storage
    .from("frames-live")
    .getPublicUrl(`${deviceId}/current.jpg`);
  const thermal = supabase.storage
    .from("frames-live")
    .getPublicUrl(`${deviceId}/current.json`);
  console.log("getLiveFrame jpg", frame.data?.publicUrl);
  console.log("getLiveFrame json", thermal.data?.publicUrl);
  if (frame.data?.publicUrl && thermal.data?.publicUrl) {
    const frameUrl = frame.data.publicUrl;
    const thermalUrl = thermal.data.publicUrl;
    const cb = `cb=${Date.now()}`;
    return {
      frameUrl: `${frameUrl}${frameUrl.includes("?") ? "&" : "?"}${cb}`,
      thermalUrl: `${thermalUrl}${thermalUrl.includes("?") ? "&" : "?"}${cb}`,
    };
  }
  console.error("getLiveFrame no_live_frame for", deviceId);
  throw new Error("no_live_frame");
}
