import {
  addWeeks,
  differenceInWeeks,
  format,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";
import type { UserSettings } from "./settings";
import type { CalendarEvent } from "./types";

export interface NewProgramDraft {
  raceName: string;
  raceDist: number;
  raceDate: string;
  currentAbilityDist: number;
  currentAbilitySecs: number;
  runDays: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
  totalWeeks: number;
  startKm: number;
  includeBasePhase: boolean;
}

export const MIN_NEW_PROGRAM_WEEKS = 12;

function sortDays(days: number[]): number[] {
  return [...days].sort((a, b) => a - b);
}

type ProgramConfigSource = Pick<
  UserSettings,
  | "raceName"
  | "raceDist"
  | "raceDate"
  | "currentAbilityDist"
  | "currentAbilitySecs"
  | "runDays"
  | "longRunDay"
  | "clubDay"
  | "clubType"
  | "totalWeeks"
  | "startKm"
  | "includeBasePhase"
>;

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizeOptional<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function buildCanonicalProgramConfigKey(source: ProgramConfigSource): string {
  return JSON.stringify({
    raceName: normalizeString(source.raceName),
    raceDist: normalizeOptional(source.raceDist),
    raceDate: normalizeOptional(source.raceDate),
    currentAbilityDist: normalizeOptional(source.currentAbilityDist),
    currentAbilitySecs: normalizeOptional(source.currentAbilitySecs),
    runDays: sortDays(source.runDays ?? []),
    longRunDay: normalizeOptional(source.longRunDay),
    clubDay: normalizeOptional(source.clubDay),
    clubType: normalizeString(source.clubType),
    totalWeeks: normalizeOptional(source.totalWeeks),
    startKm: normalizeOptional(source.startKm),
    includeBasePhase: source.includeBasePhase ?? false,
  });
}

export function isProgramFinished(
  settings: Pick<UserSettings, "raceDate"> | null | undefined,
  events: CalendarEvent[],
  now = new Date(),
): boolean {
  if (!settings?.raceDate) return false;

  const today = startOfDay(now);
  const raceDate = startOfDay(parseISO(settings.raceDate));
  if (!isBefore(raceDate, today)) return false;

  return !events.some((event) => event.type === "planned" && event.date >= today);
}

export function getProgramWeeks(raceDate: string, now = new Date()): number {
  return Math.max(MIN_NEW_PROGRAM_WEEKS, differenceInWeeks(parseISO(raceDate), now));
}

function getWeeksUntilRace(raceDate: string, now = new Date()): number {
  return differenceInWeeks(startOfDay(parseISO(raceDate)), startOfDay(now));
}

export function buildDefaultNewProgramDraft(
  settings: UserSettings,
  now = new Date(),
): NewProgramDraft {
  const totalWeeks = Math.max(MIN_NEW_PROGRAM_WEEKS, settings.totalWeeks ?? 18);
  const runDays = settings.runDays?.length ? settings.runDays : [2, 4, 6, 0];
  const fallbackLongRunDay = runDays.includes(settings.longRunDay ?? -1)
    ? settings.longRunDay
    : runDays.includes(0)
      ? 0
      : runDays[runDays.length - 1];

  return {
    raceName: "",
    raceDist: settings.raceDist ?? 16,
    raceDate: format(addWeeks(now, totalWeeks), "yyyy-MM-dd"),
    currentAbilityDist: settings.currentAbilityDist ?? settings.raceDist ?? 10,
    currentAbilitySecs: settings.currentAbilitySecs ?? 0,
    runDays,
    longRunDay: fallbackLongRunDay,
    clubDay: settings.clubDay,
    clubType: settings.clubType,
    totalWeeks,
    startKm: settings.startKm ?? 8,
    includeBasePhase: settings.includeBasePhase ?? false,
  };
}

export function validateNewProgramDraft(
  draft: NewProgramDraft,
  now = new Date(),
): string | null {
  if (!draft.raceDist || draft.raceDist < 1 || draft.raceDist > 100) {
    return "Race distance must be between 1 and 100 km.";
  }
  if (!draft.raceDate) {
    return "Pick a race date.";
  }
  if (getWeeksUntilRace(draft.raceDate, now) < MIN_NEW_PROGRAM_WEEKS) {
    return `Race date must be at least ${MIN_NEW_PROGRAM_WEEKS} weeks away.`;
  }
  if (!draft.currentAbilityDist || draft.currentAbilityDist <= 0) {
    return "Pick your current fitness distance.";
  }
  if (!draft.currentAbilitySecs || draft.currentAbilitySecs <= 0) {
    return "Set your current fitness time.";
  }
  if (draft.runDays.length < 2) {
    return "Pick at least two run days.";
  }
  if (draft.longRunDay == null) {
    return "Pick a long run day.";
  }
  if (!draft.runDays.includes(draft.longRunDay)) {
    return "Long run day must be one of your run days.";
  }
  if (draft.clubDay != null && !draft.runDays.includes(draft.clubDay)) {
    return "Club run day must be one of your run days.";
  }
  if (!draft.totalWeeks || draft.totalWeeks < MIN_NEW_PROGRAM_WEEKS) {
    return `Plan length must be at least ${MIN_NEW_PROGRAM_WEEKS} weeks.`;
  }
  if (!draft.startKm || draft.startKm < 2 || draft.startKm > 30) {
    return "Start distance must be between 2 and 30 km.";
  }

  return null;
}

export function buildProgramConfigKey(draft: NewProgramDraft): string {
  return buildCanonicalProgramConfigKey(draft);
}

export function buildProgramConfigKeyFromSettings(settings: ProgramConfigSource): string {
  return buildCanonicalProgramConfigKey(settings);
}

export function toSettingsUpdate(draft: NewProgramDraft): Partial<UserSettings> {
  return {
    raceName: draft.raceName.trim() || undefined,
    raceDist: draft.raceDist,
    raceDate: draft.raceDate,
    currentAbilityDist: draft.currentAbilityDist,
    currentAbilitySecs: draft.currentAbilitySecs,
    runDays: sortDays(draft.runDays),
    longRunDay: draft.longRunDay,
    clubDay: draft.clubDay,
    clubType: draft.clubType,
    totalWeeks: draft.totalWeeks,
    startKm: draft.startKm,
    includeBasePhase: draft.includeBasePhase,
  };
}
