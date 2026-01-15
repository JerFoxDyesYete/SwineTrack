import React, { useEffect, useState, useMemo } from 'react';
import { Image, StyleSheet, View, Text, ViewStyle, TextStyle } from 'react-native';
import Svg, { Rect, Line, G } from 'react-native-svg';

// --- CALIBRATION SETTINGS ---
const TEMP_OFFSET = 0;

type ThermalPayload = {
  w: number;
  h: number;
  data?: number[];
  pixelData?: number[]; // Support both naming conventions
  tMin: number;
  tMax: number;
  tAvg: number;
};

type Props = {
  frameUrl: string;
  thermalUrl?: string; // URL to fetch JSON data (for snapshots)
  thermalData?: ThermalPayload | null; // Direct data object (for live feed)
  style?: ViewStyle;
  overlayOpacity?: number;
  refreshInterval?: number;
  interpolationFactor?: number; // Set to 1 for high performance lists
};

// Normalize value between 0 and 1
function normalise(v: number, min: number, max: number): number {
  const t = (v - min) / (max - min + 1e-6);
  return Math.min(1, Math.max(0, t));
}

// Map 0-1 value to RGB color (Blue -> Green -> Red)
function mapColour(t: number) {
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.7 * t)));
  const g = Math.round(255 * Math.min(1, Math.max(0, t * t)));
  const b = Math.round(255 * Math.min(1, Math.max(0, (1 - t) * (1 - t))));
  return `rgb(${r},${g},${b})`;
}

// Bi-linear interpolation to upscale low-res thermal data
function interpolateData(data: number[], sourceW: number, sourceH: number, targetW: number, targetH: number): number[] {
  const interpolated = new Array(targetW * targetH);
  const xRatio = (sourceW - 1) / (targetW - 1);
  const yRatio = (sourceH - 1) / (targetH - 1);

  for (let y = 0; y < targetH; y++) {
    const srcY = y * yRatio;
    const y1 = Math.floor(srcY);
    const y2 = Math.min(y1 + 1, sourceH - 1);
    const wy = srcY - y1;

    for (let x = 0; x < targetW; x++) {
      const srcX = x * xRatio;
      const x1 = Math.floor(srcX);
      const x2 = Math.min(x1 + 1, sourceW - 1);
      const wx = srcX - x1;

      const v11 = data[y1 * sourceW + x1] ?? 0;
      const v12 = data[y1 * sourceW + x2] ?? 0;
      const v21 = data[y2 * sourceW + x1] ?? 0;
      const v22 = data[y2 * sourceW + x2] ?? 0;

      interpolated[y * targetW + x] =
        v11 * (1 - wx) * (1 - wy) +
        v12 * wx * (1 - wy) +
        v21 * (1 - wx) * wy +
        v22 * wx * wy;
    }
  }
  return interpolated;
}

// Simple box blur to reduce noise
function smoothData(data: number[], w: number, h: number): number[] {
  const smoothed = new Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const value = data[ny * w + nx];
            if (Number.isFinite(value)) {
              sum += value;
              count++;
            }
          }
        }
      }
      smoothed[y * w + x] = count > 0 ? sum / count : data[y * w + x];
    }
  }
  return smoothed;
}

export function ThermalImage({
  frameUrl,
  thermalUrl,
  thermalData,
  style,
  overlayOpacity = 0.7, 
  interpolationFactor = 2, 
}: Props) {
  const [payload, setPayload] = useState<ThermalPayload | null>(null);

  // --- DATA LOADING EFFECT ---
  useEffect(() => {
    // 1. Priority: Direct Data (Live Stream)
    if (thermalData) {
      setPayload(thermalData);
      return;
    }

    // 2. Secondary: Fetch from URL (Snapshots)
    if (thermalUrl) {
      let isMounted = true;
      const fetchPayload = async () => {
        try {
          const response = await fetch(thermalUrl);
          if (!response.ok) throw new Error('Failed to load thermal JSON');
          const json = await response.json();
          if (isMounted) setPayload(json);
        } catch (err) {
          console.error("Error fetching thermal snapshot data:", err);
        }
      };
      fetchPayload();
      return () => { isMounted = false; };
    }
  }, [thermalData, thermalUrl]);

  // --- MEMOIZED DATA PROCESSING ---
  const { processedData, displayW, displayH, tMin, tMax, hottestX, hottestY } = useMemo(() => {
    const dataArray = payload?.data ?? payload?.pixelData;
    const sourceW = payload?.w ?? 32;
    const sourceH = payload?.h ?? 24;

    let finalData: number[] = [];
    let dw = sourceW;
    let dh = sourceH;
    let min = Infinity;
    let max = -Infinity;
    let hIdx = -1;

    if (Array.isArray(dataArray) && sourceW > 0 && sourceH > 0) {
      // Apply offset
      const correctedData = dataArray.map(v => v + TEMP_OFFSET);

      // PERFORMANCE OPTIMIZATION: 
      // If interpolationFactor is 1 (Snapshot List), skip smoothing and interpolation.
      if (interpolationFactor > 1) {
        // High quality mode (Live view)
        const pass1 = smoothData(correctedData, sourceW, sourceH);
        const pass2 = smoothData(pass1, sourceW, sourceH);
        
        dw = Math.round(sourceW * interpolationFactor);
        dh = Math.round(sourceH * interpolationFactor);
        finalData = interpolateData(pass2, sourceW, sourceH, dw, dh);
      } else {
        // Performance mode (List view)
        // Use raw data directly
        finalData = correctedData;
        dw = sourceW;
        dh = sourceH;
      }

      const margin = Math.round(3 * Math.max(1, interpolationFactor));
      
      // Calculate min/max and hotspot
      for (let i = 0; i < finalData.length; i++) {
        const v = finalData[i];
        if (!Number.isFinite(v)) continue;
        
        if (v < min) min = v;
        if (v > max) {
          // Check margins to avoid edge noise being the "hottest" spot
          const y = Math.floor(i / dw);
          const x = i % dw;
          if (x > margin && x < dw - margin && y > margin && y < dh - margin) {
            max = v;
            hIdx = i;
          }
        }
      }
    }

    return {
      processedData: finalData,
      displayW: dw,
      displayH: dh,
      tMin: min === Infinity ? 0 : min,
      tMax: max === -Infinity ? 0 : max,
      hottestX: hIdx >= 0 ? hIdx % dw : -1,
      hottestY: hIdx >= 0 ? Math.floor(hIdx / dw) : -1,
    };
  }, [payload, interpolationFactor]);

  // --- MEMOIZED SVG RENDERING ---
  const svgElements = useMemo(() => {
    if (!processedData.length) return null;

    const elements = [];
    // Slight overlap (1.1 instead of 1.0) prevents thin lines between rects
    const pixelSize = 1.1; 

    for (let y = 0; y < displayH; y++) {
      for (let x = 0; x < displayW; x++) {
        const i = y * displayW + x;
        const v = processedData[i];
        const t = normalise(v, tMin, tMax);
        
        // Using numeric key (index) is slightly faster for React to reconcile than string templates
        elements.push(
          <Rect 
            key={i} 
            x={x} 
            y={y} 
            width={pixelSize} 
            height={pixelSize} 
            fill={mapColour(t)} 
          />
        );
      }
    }
    return elements;
  }, [processedData, displayW, displayH, tMin, tMax]);

  // Crosshair styling
  const strokeBg = 0.3;  
  const strokeFg = 0.15; 
  const gap = 0.6;       
  const len = 1.5;       

  return (
    <View style={[styles.container, style]}>
      {/* 1. Optical Image (Bottom Layer) */}
      <Image 
        source={{ uri: frameUrl }} 
        style={[StyleSheet.absoluteFill, styles.image]} 
        resizeMode="contain" 
      />
      
      {/* 2. Thermal Overlay (Middle Layer) */}
      {processedData.length > 0 && (
        <Svg 
          style={[StyleSheet.absoluteFill, styles.overlay]} 
          viewBox={`0 0 ${displayW} ${displayH}`} 
          preserveAspectRatio="none"
        >
          <G opacity={overlayOpacity}>{svgElements}</G>
          
          {/* Hottest Spot Crosshair */}
          {hottestX >= 0 && (
            <G>
              {/* Black outline for contrast */}
              <Line x1={hottestX - (gap + len)} y1={hottestY + 0.5} x2={hottestX - gap} y2={hottestY + 0.5} stroke="black" strokeWidth={strokeBg} strokeLinecap="round" opacity={0.8} />
              <Line x1={hottestX + 1 + gap} y1={hottestY + 0.5} x2={hottestX + 1 + gap + len} y2={hottestY + 0.5} stroke="black" strokeWidth={strokeBg} strokeLinecap="round" opacity={0.8} />
              <Line x1={hottestX + 0.5} y1={hottestY - (gap + len)} x2={hottestX + 0.5} y2={hottestY - gap} stroke="black" strokeWidth={strokeBg} strokeLinecap="round" opacity={0.8} />
              <Line x1={hottestX + 0.5} y1={hottestY + 1 + gap} x2={hottestX + 0.5} y2={hottestY + 1 + gap + len} stroke="black" strokeWidth={strokeBg} strokeLinecap="round" opacity={0.8} />
              
              {/* White foreground */}
              <Line x1={hottestX - (gap + len)} y1={hottestY + 0.5} x2={hottestX - gap} y2={hottestY + 0.5} stroke="white" strokeWidth={strokeFg} strokeLinecap="round" />
              <Line x1={hottestX + 1 + gap} y1={hottestY + 0.5} x2={hottestX + 1 + gap + len} y2={hottestY + 0.5} stroke="white" strokeWidth={strokeFg} strokeLinecap="round" />
              <Line x1={hottestX + 0.5} y1={hottestY - (gap + len)} x2={hottestX + 0.5} y2={hottestY - gap} stroke="white" strokeWidth={strokeFg} strokeLinecap="round" />
              <Line x1={hottestX + 0.5} y1={hottestY + 1 + gap} x2={hottestX + 0.5} y2={hottestY + 1 + gap + len} stroke="white" strokeWidth={strokeFg} strokeLinecap="round" />
            </G>
          )}
        </Svg>
      )}
      
      {/* 3. Max Temp Label (Top Layer) */}
      {hottestX >= 0 && (
        <Text style={styles.tempLabel}>Max: {tMax.toFixed(1)}°C</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    position: 'relative', 
    alignItems: 'center', 
    justifyContent: 'center', 
    width: '100%', 
    height: '100%' 
  },
  image: { width: '100%', height: '100%' },
  overlay: { width: '100%', height: '100%' },
  tempLabel: { 
    position: 'absolute', 
    color: 'white', 
    fontSize: 12, 
    fontWeight: 'bold', 
    top: 8, 
    right: 8, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    paddingHorizontal: 6, 
    paddingVertical: 3, 
    borderRadius: 4, 
    overflow: 'hidden' 
  } as TextStyle,
});

export default ThermalImage;