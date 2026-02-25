/** Format a single workout step line with LTHR zone and BPM range. */
export function formatStep(
  duration: string,
  minPct: number,
  maxPct: number,
  lthr: number,
  note?: string,
): string {
  const minBpm = Math.floor(lthr * minPct);
  const maxBpm = Math.ceil(lthr * maxPct);
  const core = `${duration} ${Math.floor(minPct * 100)}-${Math.ceil(maxPct * 100)}% LTHR (${minBpm}-${maxBpm} bpm)`;
  return note ? `${note} ${core}` : core;
}

/** Build a workout description from warmup, main steps, and cooldown. */
export function createWorkoutText(
  warmup: string,
  mainSteps: string[],
  cooldown: string,
  repeats: number = 1,
  notes?: string,
): string {
  const lines: string[] = [];

  if (notes) {
    lines.push(notes, "");
  }

  lines.push(
    "Warmup",
    `- ${warmup}`,
    "",
    repeats > 1 ? `Main set ${repeats}x` : "Main set",
    ...mainSteps.map((s) => `- ${s}`),
    "",
    "Cooldown",
    `- ${cooldown}`,
    "",
  );

  return lines.join("\n");
}
