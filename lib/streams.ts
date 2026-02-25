import type { IntervalsStream, DataPoint } from "./types";

// --- Raw stream extraction (single source of truth) ---

export interface RawStreams {
  time: number[];
  heartrate: number[];
  glucose: number[];
  velocity: number[];
  cadence: number[];
  altitude: number[];
}

/** Extract raw data arrays from IntervalsStream[]. Single place for stream type mapping. */
export function extractRawStreams(streams: IntervalsStream[]): RawStreams {
  const raw: RawStreams = {
    time: [], heartrate: [], glucose: [],
    velocity: [], cadence: [], altitude: [],
  };
  for (const s of streams) {
    if (s.type === "time") raw.time = s.data;
    if (s.type === "heartrate") raw.heartrate = s.data;
    if (["bloodglucose", "glucose", "ga_smooth"].includes(s.type)) raw.glucose = s.data;
    if (s.type === "velocity_smooth") raw.velocity = s.data;
    if (s.type === "cadence") raw.cadence = s.data;
    if (s.type === "altitude") raw.altitude = s.data;
  }
  return raw;
}

// --- Minute-indexed stream conversion ---

/** Extract minute-indexed pace/cadence/altitude DataPoints from raw streams. */
export function extractExtraStreams(streams: IntervalsStream[]): {
  pace: DataPoint[];
  cadence: DataPoint[];
  altitude: DataPoint[];
} {
  const { time: timeData, velocity: velocityRaw, cadence: cadenceRaw, altitude: altitudeRaw } = extractRawStreams(streams);

  const pace: DataPoint[] = [];
  const cadence: DataPoint[] = [];
  const altitude: DataPoint[] = [];

  if (timeData.length === 0) return { pace, cadence, altitude };

  // Build minute-indexed maps (same pattern as alignStreams)
  const paceByMin = new Map<number, number[]>();
  const cadByMin = new Map<number, number[]>();
  const altByMin = new Map<number, number[]>();

  for (let i = 0; i < timeData.length; i++) {
    const minute = Math.round(timeData[i] / 60);

    if (i < velocityRaw.length && velocityRaw[i] > 0) {
      const p = 1000 / (velocityRaw[i] * 60); // m/s → min/km
      if (p >= 2.0 && p <= 12.0) {
        const arr = paceByMin.get(minute) ?? [];
        arr.push(p);
        paceByMin.set(minute, arr);
      }
    }

    if (i < cadenceRaw.length && cadenceRaw[i] > 0) {
      const arr = cadByMin.get(minute) ?? [];
      arr.push(cadenceRaw[i] * 2); // half-cadence → SPM
      cadByMin.set(minute, arr);
    }

    if (i < altitudeRaw.length) {
      const arr = altByMin.get(minute) ?? [];
      arr.push(altitudeRaw[i]);
      altByMin.set(minute, arr);
    }
  }

  // Average per minute
  for (const [min, vals] of paceByMin) {
    pace.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  for (const [min, vals] of cadByMin) {
    cadence.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  for (const [min, vals] of altByMin) {
    altitude.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }

  pace.sort((a, b) => a.time - b.time);
  cadence.sort((a, b) => a.time - b.time);
  altitude.sort((a, b) => a.time - b.time);

  return { pace, cadence, altitude };
}
