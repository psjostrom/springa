// Phase boundary logic — pure functions shared by UI and workout generators.

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
 * With base phase (18 weeks):
 *   Base 1-3, Build 4-12, Race Test 13-14, Taper 15-16, Race Week 17-18... wait
 *
 * Actually, the structure is:
 *   Without base: Build 1-13, Race Test 14-15, Taper 16-17, Race Week 18
 *   With base:    Base 1-3, Build 4-13, Race Test 14-15, Taper 16-17, Race Week 18
 *
 * Race test is always 2 weeks (T1D needs two shots at dress rehearsal).
 * Taper is always 2 weeks.
 */
export function getPhaseBoundaries(totalWeeks: number, includeBasePhase = false): PhaseBoundaries {
  const raceWeek = totalWeeks;
  const taperEnd = totalWeeks - 1;
  const taperStart = totalWeeks - 2;
  const raceTestEnd = taperStart - 1;
  const raceTestStart = raceTestEnd - 1;

  let baseEnd: number;
  if (includeBasePhase) {
    baseEnd = Math.min(3, Math.max(2, Math.floor(totalWeeks * 0.17)));
  } else {
    baseEnd = 0; // no base phase
  }

  const buildStart = baseEnd + 1;
  const buildEnd = raceTestStart - 1;

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

/** Get the phase name for a given week number. */
export function getPhaseForWeek(weekNum: number, totalWeeks: number, includeBasePhase = false): PhaseName {
  const b = getPhaseBoundaries(totalWeeks, includeBasePhase);
  if (includeBasePhase && weekNum <= b.baseEnd) return "Base";
  if (weekNum <= b.buildEnd) return "Build";
  if (weekNum >= b.raceTestStart && weekNum <= b.raceTestEnd) return "Race Test";
  if (weekNum >= b.taperStart && weekNum <= b.taperEnd) return "Taper";
  return "Race Week";
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
        "Progressive long runs",
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
        "Progressive long runs",
        "3:1 build/recovery cycle",
        "Race-pace long run variants",
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
