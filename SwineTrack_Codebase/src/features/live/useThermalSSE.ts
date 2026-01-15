import { useState, useEffect, useRef } from 'react';
import EventSource from "react-native-sse";

type ThermalPayload = {
  w: number;
  h: number;
  data: number[];
  tMin: number;
  tMax: number;
  tAvg: number;
};

export function useThermalSSE(url: string) {
  const [data, setData] = useState<ThermalPayload | null>(null);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error' | 'reconnecting'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<ThermalPayload | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (!url) return;

    console.log(`Connecting to SSE (Attempt ${retryCount + 1}):`, url);
    if (retryCount > 0) setStatus('reconnecting');

    const es = new EventSource<"thermal">(url, {
      pollingInterval: 0,
    });

    es.addEventListener("open", () => {
      console.log("SSE Connected");
      setStatus('connected');
      setError(null);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    });

    es.addEventListener("thermal", (event) => {
      try {
        const rawData = (event.data as string)
          .replace(/: ?NaN/g, ": 0")
          .replace(/: ?Infinity/g, ": 0")
          .replace(/: ?-Infinity/g, ": 0");

        const parsed = JSON.parse(rawData);
        let payload: ThermalPayload | null = null;

        if (parsed.thermal && parsed.thermal.data && Array.isArray(parsed.thermal.data)) {
          payload = {
            w: parsed.thermal.w || 32,
            h: parsed.thermal.h || 24,
            data: parsed.thermal.data,
            tMin: parsed.tMin,
            tMax: parsed.tMax,
            tAvg: parsed.tAvg
          };
        } else if (Array.isArray(parsed.thermal)) {
          payload = {
            w: 32,
            h: 24,
            data: parsed.thermal,
            tMin: parsed.tMin,
            tMax: parsed.tMax,
            tAvg: parsed.tAvg
          };
        }

        if (payload) {
          latestDataRef.current = payload;
          if (animationFrameId.current === null) {
            animationFrameId.current = requestAnimationFrame(() => {
              if (latestDataRef.current) {
                setData(latestDataRef.current);
              }
              animationFrameId.current = null;
            });
          }
        }

      } catch (e) {
        console.error("JSON Parse Error", e);
        console.log("Raw payload causing error:", event.data);
      }
    });

    es.addEventListener("error", (event) => {
      const msg = (event as any).message || "Connection failed";
      console.log("SSE Connection Lost, retrying in 3s...");
      
      setStatus('error');
      setError(msg);
      es.close();

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, 3000);
    });

    return () => {
      es.removeAllEventListeners();
      es.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [url, retryCount]); 

  return { data, status, error };
}