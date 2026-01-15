import { useEffect, useState } from "react";
import { getLiveFrame } from "./api";

export function useLiveFrame(deviceId: string, intervalMs = 1000) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [thermalUrl, setThermalUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true,
      timer: any;
    const tick = async () => {
      try {
        console.log("useLiveFrame fetching", deviceId);
        const { frameUrl: fUrl, thermalUrl: tUrl } = await getLiveFrame(
          deviceId,
          10
        );
        console.log("useLiveFrame urls", fUrl, tUrl);
        setFrameUrl(fUrl);
        setThermalUrl(tUrl);
        setErr(null);
      } catch (e: any) {
        console.error("useLiveFrame error", e);
        setErr(String(e?.message ?? e));
      } finally {
        if (alive) timer = setTimeout(tick, intervalMs);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [deviceId, intervalMs]);

  return { frameUrl, thermalUrl, err };
}
