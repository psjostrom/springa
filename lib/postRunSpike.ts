import type { WorkoutCategory } from "./types";
import type { CachedActivity } from "./activityStreamsDb";

export interface PostRunSpikeData {
  activityId: string;
  category: WorkoutCategory;
  fuelRate: number | null;
  spike30m: number;
}

export function extractPostRunSpikes(
  activities: CachedActivity[],
): PostRunSpikeData[] {
  const results: PostRunSpikeData[] = [];

  for (const a of activities) {
    const post = a.runBGContext?.post;
    if (!post) continue;
    // Skip activities cached before the spike30m extension
    if (typeof post.spike30m !== "number") continue;

    results.push({
      activityId: a.activityId,
      category: a.category,
      fuelRate: a.fuelRate,
      spike30m: post.spike30m,
    });
  }

  return results;
}
