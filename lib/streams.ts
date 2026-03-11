import type { IntervalsStream, DataPoint } from "./types";

// --- Raw stream extraction (single source of truth) ---

export interface RawStreams {
  time: number[];
  heartrate: number[];
  velocity: number[];
  cadence: number[];
  altitude: number[];
  distance: number[];
}

/** Extract raw data arrays from IntervalsStream[]. Single place for stream type mapping. */
export function extractRawStreams(streams: IntervalsStream[]): RawStreams {
  const raw: RawStreams = {
    time: [], heartrate: [],
    velocity: [], cadence: [], altitude: [],
    distance: [],
  };
  for (const s of streams) {
    if (s.type === "time") raw.time = s.data;
    if (s.type === "heartrate") raw.heartrate = s.data;
    if (s.type === "velocity_smooth") raw.velocity = s.data;
    if (s.type === "cadence") raw.cadence = s.data;
    if (s.type === "altitude") raw.altitude = s.data;
    if (s.type === "distance") raw.distance = s.data;
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

/** Extract minute-indexed HR DataPoints from streams. */
export function extractHRStream(streams: IntervalsStream[]): DataPoint[] {
  const { time: timeData, heartrate: hrRaw } = extractRawStreams(streams);
  if (timeData.length === 0 || hrRaw.length === 0) return [];

  const hrByMin = new Map<number, number[]>();

  for (let i = 0; i < timeData.length && i < hrRaw.length; i++) {
    if (hrRaw[i] <= 0) continue;
    const minute = Math.round(timeData[i] / 60);
    const arr = hrByMin.get(minute) ?? [];
    arr.push(hrRaw[i]);
    hrByMin.set(minute, arr);
  }

  const result: DataPoint[] = [];
  for (const [min, vals] of hrByMin) {
    result.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }

  result.sort((a, b) => a.time - b.time);
  return result;
}

/** Extract latlng coordinates from streams. Returns [lat, lng][] or empty array.
 * Intervals.icu stores lat in data[] and lng in data2[] for the latlng stream. */
export function extractLatlng(streams: IntervalsStream[]): [number, number][] {
  const latlngStream = streams.find((s) => s.type === "latlng");
  if (!latlngStream?.data2) return [];

  const latitudes = latlngStream.data;
  const longitudes = latlngStream.data2;
  const len = Math.min(latitudes.length, longitudes.length);

  const result: [number, number][] = [];
  for (let i = 0; i < len; i++) {
    const lat = latitudes[i];
    const lng = longitudes[i];
    // Filter invalid coordinates (0,0 or missing values)
    if (lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng)) {
      result.push([lat, lng]);
    }
  }
  return result;
}
