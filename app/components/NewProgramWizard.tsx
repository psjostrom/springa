"use client";

import type { NewProgramDraft } from "@/lib/programs";
import { getProgramWeeks } from "@/lib/programs";
import {
  DISTANCE_OPTIONS,
  getDefaultGoalTime,
  getSliderRange,
} from "@/lib/paceTable";
import { formatGoalTime } from "@/lib/format";

interface NewProgramWizardProps {
  draft: NewProgramDraft;
  validationError: string | null;
  onDraftChange: (draft: NewProgramDraft) => void;
  onCancel: () => void;
  onPreview: () => void;
}

const DAYS = [
  { index: 1, label: "Mon" },
  { index: 2, label: "Tue" },
  { index: 3, label: "Wed" },
  { index: 4, label: "Thu" },
  { index: 5, label: "Fri" },
  { index: 6, label: "Sat" },
  { index: 0, label: "Sun" },
];

const CLUB_TYPES = [
  { value: "long", label: "Long run" },
  { value: "speed", label: "Speed work" },
  { value: "varies", label: "Varies" },
] as const;

function numberFromInput(value: string): number {
  return value === "" ? 0 : Number(value);
}

export function NewProgramWizard({
  draft,
  validationError,
  onDraftChange,
  onCancel,
  onPreview,
}: NewProgramWizardProps) {
  const abilityRange = draft.currentAbilityDist > 0
    ? getSliderRange(draft.currentAbilityDist)
    : null;
  const hasClub = draft.clubDay != null;

  const update = (patch: Partial<NewProgramDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  const toggleDay = (day: number) => {
    const nextRunDays = draft.runDays.includes(day)
      ? draft.runDays.filter((d) => d !== day)
      : [...draft.runDays, day].sort((a, b) => a - b);

    if (nextRunDays.length === 0) return;

    const next: Partial<NewProgramDraft> = { runDays: nextRunDays };
    if (draft.longRunDay != null && !nextRunDays.includes(draft.longRunDay)) {
      next.longRunDay = nextRunDays.includes(0)
        ? 0
        : nextRunDays[nextRunDays.length - 1];
    }
    if (draft.clubDay != null && !nextRunDays.includes(draft.clubDay)) {
      next.clubDay = undefined;
      next.clubType = undefined;
    }
    update(next);
  };

  const toggleClub = () => {
    if (hasClub) {
      update({ clubDay: undefined, clubType: undefined });
      return;
    }
    const firstNonLong = draft.runDays.find((day) => day !== draft.longRunDay);
    update({ clubDay: firstNonLong ?? draft.runDays[0], clubType: "varies" });
  };

  const updateClubType = (clubType: string) => {
    const patch: Partial<NewProgramDraft> = { clubType };
    if (clubType === "long" && draft.clubDay != null) {
      patch.longRunDay = draft.clubDay;
    } else if (draft.clubType === "long" && clubType !== "long") {
      patch.longRunDay = draft.runDays.find((day) => day !== draft.clubDay);
    }
    update(patch);
  };

  return (
    <section className="bg-surface border border-brand rounded-xl p-4 md:p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">Start new program</h2>
          <p className="text-sm text-muted mt-1">
            Set the next race, check your current fitness, preview the plan, then choose when to replace future workouts.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-text transition"
        >
          Cancel
        </button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Race goal</h3>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_7rem_10rem] gap-3">
          <div>
            <label htmlFor="new-program-race-name" className="block text-xs text-muted mb-1">
              Race name
            </label>
            <input
              id="new-program-race-name"
              value={draft.raceName}
              onChange={(e) => { update({ raceName: e.target.value }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Stockholm Half"
            />
          </div>
          <div>
            <label htmlFor="new-program-race-distance" className="block text-xs text-muted mb-1">
              km
            </label>
            <input
              id="new-program-race-distance"
              type="number"
              min={1}
              max={100}
              value={draft.raceDist || ""}
              onChange={(e) => { update({ raceDist: numberFromInput(e.target.value) }); }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="new-program-race-date" className="block text-xs text-muted mb-1">
              Race date
            </label>
            <input
              id="new-program-race-date"
              type="date"
              value={draft.raceDate}
              onChange={(e) => {
                update({
                  raceDate: e.target.value,
                  totalWeeks: getProgramWeeks(e.target.value),
                });
              }}
              className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Current fitness</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {DISTANCE_OPTIONS.map(({ label, km }) => (
            <button
              key={km}
              type="button"
              onClick={() => {
                update({
                  currentAbilityDist: km,
                  currentAbilitySecs: getDefaultGoalTime(km, "intermediate"),
                });
              }}
              className={`py-1.5 rounded-lg border text-xs font-semibold transition ${
                draft.currentAbilityDist === km
                  ? "border-brand-btn bg-brand-btn text-white"
                  : "border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {abilityRange && (
          <div>
            <p className="text-sm text-text font-semibold text-center">
              {formatGoalTime(draft.currentAbilitySecs)}
            </p>
            <input
              aria-label="Current fitness time"
              type="range"
              min={abilityRange.min}
              max={abilityRange.max}
              step={abilityRange.step}
              value={draft.currentAbilitySecs}
              onChange={(e) => { update({ currentAbilitySecs: Number(e.target.value) }); }}
              className="w-full accent-brand"
            />
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Schedule</h3>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map(({ index, label }) => (
            <button
              key={index}
              type="button"
              onClick={() => { toggleDay(index); }}
              className={`py-2 rounded-lg text-xs font-semibold transition ${
                draft.runDays.includes(index)
                  ? "bg-brand-btn text-white"
                  : "border border-border text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <p className="text-xs text-muted mb-1">Long run day</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.filter(({ index }) => draft.runDays.includes(index)).map(({ index, label }) => (
              <button
                key={index}
                type="button"
                onClick={() => { update({ longRunDay: index }); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  draft.longRunDay === index
                    ? "bg-brand-btn text-white"
                    : "border border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Club run</p>
            <button
              type="button"
              role="switch"
              aria-label="Club run"
              aria-checked={hasClub}
              onClick={toggleClub}
              className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors ${
                hasClub ? "bg-brand" : "bg-surface-alt"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  hasClub ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {hasClub && (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.filter(({ index }) => draft.runDays.includes(index)).map(({ index, label }) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => { update({ clubDay: index }); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      draft.clubDay === index
                        ? "bg-brand-btn text-white"
                        : "border border-border text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CLUB_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { updateClubType(value); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      draft.clubType === value
                        ? "bg-brand-btn text-white"
                        : "border border-border text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Plan options</h3>
        <div>
          <label htmlFor="new-program-start-km" className="block text-xs text-muted mb-1">
            Start km
          </label>
          <input
            id="new-program-start-km"
            type="number"
            min={2}
            max={30}
            value={draft.startKm || ""}
            onChange={(e) => { update({ startKm: numberFromInput(e.target.value) }); }}
            className="w-full px-3 py-2 border border-border rounded-lg text-text bg-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.includeBasePhase}
            onChange={(e) => { update({ includeBasePhase: e.target.checked }); }}
            className="mt-1 accent-brand"
          />
          <span>
            <span className="block text-sm font-semibold text-text">Include base phase</span>
            <span className="block text-xs text-muted">Adds easy-only weeks before the build phase.</span>
          </span>
        </label>
      </div>

      {validationError && (
        <div className="bg-tint-error border border-error/20 rounded-lg px-3 py-2">
          <p className="text-sm text-error">{validationError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="flex-1 py-2 bg-brand-btn text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20"
        >
          Preview plan
        </button>
      </div>
    </section>
  );
}
