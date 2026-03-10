export interface KmSplit {
  km: number; // 1-indexed
  paceMinPerKm: number; // decimal minutes, e.g. 6.95 = 6:57/km
  startTimeSec: number; // for downstream HR/elev lookup
  endTimeSec: number;
}

interface SplitInput {
  distance: number[]; // cumulative meters, per-second
  time: number[]; // seconds, per-second
}

/**
 * Compute per-km pace splits from raw distance + time arrays.
 * Returns one entry per full km the runner crosses. Partial tail is dropped.
 */
export function computeKmSplits(input: SplitInput): KmSplit[] {
  const { distance, time } = input;
  if (distance.length === 0 || time.length === 0) return [];

  const totalDistance = distance[distance.length - 1];
  const fullKms = Math.floor(totalDistance / 1000);
  if (fullKms === 0) return [];

  const boundaries: number[] = [0];
  let nextBoundary = 1000;
  for (let i = 0; i < distance.length; i++) {
    if (distance[i] >= nextBoundary) {
      boundaries.push(i);
      nextBoundary += 1000;
      if (boundaries.length > fullKms) break;
    }
  }

  const splits: KmSplit[] = [];
  for (let k = 1; k < boundaries.length; k++) {
    const startIdx = boundaries[k - 1];
    const endIdx = boundaries[k];
    const timeDeltaSec = time[endIdx] - time[startIdx];

    splits.push({
      km: k,
      paceMinPerKm: timeDeltaSec / 60,
      startTimeSec: time[startIdx],
      endTimeSec: time[endIdx],
    });
  }

  return splits;
}
