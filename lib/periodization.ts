// Phase boundary logic — pure functions shared by UI and workout generators.

/** Minimum total weeks for a valid plan. Ensures at least 4 build weeks (one full 3:1 cycle). */
export const MIN_PLAN_WEEKS = 10;


export type PhaseName = "Base" | "Build" | "Race Test" | "Taper" | "Race Week";

export interface PhaseBoundaries {
  baseEnd: number;
  buildStart: number;
  buildEnd: number;
  raceTestStart: number;
  raceTestEnd: number;
  taperStart: number;
  taperEnd: number;
  raceWeek: number;
}

export interface PhaseDefinition {
  name: PhaseName;
  displayName: string;
  startWeek: number;
  endWeek: number;
  description: string;
  focus: string[];
}

/**
 * Compute phase boundaries for a plan of `totalWeeks` length.
 *
 * Structure (18 weeks, no base): Build 1-13, Race Test 14-15, Taper 16-17, Race Week 18
 * Structure (18 weeks, with base): Base 1-3, Build 4-13, Race Test 14-15, Taper 16-17, Race Week 18
 *
 * Race test is always 2 weeks (T1D needs two shots at dress rehearsal).
 * Taper is always 2 weeks.
 * Build phase must be at least 4 weeks (one full 3:1 cycle).
 */
export function getPhaseBoundaries(totalWeeks: number, includeBasePhase = false): PhaseBoundaries {
  if (totalWeeks < MIN_PLAN_WEEKS) {
    throw new Error(`Plan must be at least ${MIN_PLAN_WEEKS} weeks (got ${totalWeeks})`);
  }

  const raceWeek = totalWeeks;
  const taperEnd = totalWeeks - 1;
  const taperStart = totalWeeks - 2;
  const raceTestEnd = taperStart - 1;
  const raceTestStart = raceTestEnd - 1;

  let baseEnd: number;
  if (includeBasePhase) {
    baseEnd = Math.min(3, Math.max(2, Math.floor(totalWeeks * 0.17)));
  } else {
    baseEnd = 0;
  }

  const buildStart = baseEnd + 1;
  const buildEnd = raceTestStart - 1;

  if (buildEnd - buildStart + 1 < 4) {
    throw new Error(`Build phase too short (${buildEnd - buildStart + 1} weeks). Need at least 4. Increase total weeks or disable base phase.`);
  }


  return { baseEnd, buildStart, buildEnd, raceTestStart, raceTestEnd, taperStart, taperEnd, raceWeek };
}

/**
 * Determine if a given week is a recovery week.
 * Recovery follows a 3:1 pattern within the build phase only.
 * (Build for 3 weeks, recover for 1.)
 */
export function isRecoveryWeek(weekNum: number, totalWeeks: number, includeBasePhase = false): boolean {
  const b = getPhaseBoundaries(totalWeeks, includeBasePhase);
  if (weekNum < b.buildStart || weekNum > b.buildEnd) return false;
  const buildWeekIndex = weekNum - b.buildStart; // 0-based
  return buildWeekIndex > 0 && (buildWeekIndex + 1) % 4 === 0;
}

/** Build the full list of phase definitions for the popover UI. */
export function getPhaseDefinitions(totalWeeks: number, includeBasePhase = false): PhaseDefinition[] {
  const b = getPhaseBoundaries(totalWeeks, includeBasePhase);

  const phases: PhaseDefinition[] = [];

  if (includeBasePhase && b.baseEnd > 0) {
    phases.push({
      name: "Base",
      displayName: "Base Phase",
      startWeek: 1,
      endWeek: b.baseEnd,
      description: "Building a foundation of easy running. No speed work yet — consistency and BG management practice come first.",
      focus: [
        "Easy runs only",
        "Long runs growing in distance",
        "BG management practice",
        "Build running habit",
      ],
    });
  }

  phases.push(
    {
      name: "Build",
      displayName: "Build Phase",
      startWeek: b.buildStart,
      endWeek: b.buildEnd,
      description: "Increasing volume with weekly speed sessions. Recovery week every 4th build week.",
      focus: [
        "Weekly speed sessions",
        "Long runs growing in distance",
        "3:1 build/recovery cycle",
        "Race-pace long run blocks",
      ],
    },
    {
      name: "Race Test",
      displayName: "Race Test Phase",
      startWeek: b.raceTestStart,
      endWeek: b.raceTestEnd,
      description: "Two shots at race distance. Same kit, same fuel, same pump setup as race day. If the first one goes sideways, you get another attempt.",
      focus: [
        "Full race distance at easy pace",
        "Fueling strategy validation",
        "BG protocol rehearsal (x2)",
        "Gear and logistics check",
      ],
    },
  );

  phases.push(
    {
      name: "Taper",
      displayName: "Taper Phase",
      startWeek: b.taperStart,
      endWeek: b.taperEnd,
      description: "Volume drops to absorb training. Maintain some intensity to stay sharp.",
      focus: [
        "Volume drops ~40-50%",
        "Race-pace sharpening",
        "Extra rest and sleep",
        "Nutrition and BG focus",
      ],
    },
    {
      name: "Race Week",
      displayName: "Race Week",
      startWeek: b.raceWeek,
      endWeek: b.raceWeek,
      description: "Final preparation and race execution.",
      focus: [
        "Light shakeout run only",
        "Pre-race carb loading",
        "BG stability priority",
        "Race day!",
      ],
    },
  );

  return phases;
}
