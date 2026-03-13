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

interface GroupByMinuteOpts {
  preFilter?: (raw: number) => boolean;
  transform?: (raw: number) => number;
  postFilter?: (transformed: number) => boolean;
}

/** Group raw values by minute, average within each bucket. Sorted by time. */
export function groupByMinute(
  timeData: number[],
  values: number[],
  opts?: GroupByMinuteOpts,
): DataPoint[] {
  const { preFilter, transform, postFilter } = opts ?? {};
  const byMin = new Map<number, number[]>();
  const len = Math.min(timeData.length, values.length);

  for (let i = 0; i < len; i++) {
    const raw = values[i];
    if (preFilter && !preFilter(raw)) continue;
    const val = transform ? transform(raw) : raw;
    if (postFilter && !postFilter(val)) continue;
    const minute = Math.round(timeData[i] / 60);
    const arr = byMin.get(minute) ?? [];
    arr.push(val);
    byMin.set(minute, arr);
  }

  const result: DataPoint[] = [];
  for (const [min, vals] of byMin) {
    result.push({ time: min, value: vals.reduce((a, b) => a + b, 0) / vals.length });
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

/** Extract minute-indexed pace/cadence/altitude DataPoints from raw streams. */
export function extractExtraStreams(streams: IntervalsStream[]): {
  pace: DataPoint[];
  cadence: DataPoint[];
  altitude: DataPoint[];
} {
  const { time: timeData, velocity: velocityRaw, cadence: cadenceRaw, altitude: altitudeRaw } = extractRawStreams(streams);
  if (timeData.length === 0) return { pace: [], cadence: [], altitude: [] };

  return {
    pace: groupByMinute(timeData, velocityRaw, {
      preFilter: (v) => v > 0,
      transform: (v) => 1000 / (v * 60),
      postFilter: (p) => p >= 2.0 && p <= 12.0,
    }),
    cadence: groupByMinute(timeData, cadenceRaw, {
      preFilter: (v) => v > 0,
      transform: (v) => v * 2,
    }),
    altitude: groupByMinute(timeData, altitudeRaw),
  };
}

/** Extract minute-indexed HR DataPoints from streams. */
export function extractHRStream(streams: IntervalsStream[]): DataPoint[] {
  const { time: timeData, heartrate: hrRaw } = extractRawStreams(streams);
  if (timeData.length === 0 || hrRaw.length === 0) return [];
  return groupByMinute(timeData, hrRaw, { preFilter: (v) => v > 0 });
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
