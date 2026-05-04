import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import type { ZoneName, PaceTable } from "@/lib/types";
import {
  FALLBACK_PACE_TABLE,
  ZONE_COLORS,
  DEFAULT_LTHR,
} from "@/lib/constants";
import {
  extractNotes,
  parseWorkoutStructure,
  parseWorkoutZones,
} from "@/lib/descriptionParser";
import type { WorkoutSection, WorkoutStep } from "@/lib/descriptionParser";
import {
  getPaceForZone,
  getZoneLabel,
  formatPace,
  formatHrMin,
} from "@/lib/format";
import {
  createWorkoutEstimationContext,
  resolveWorkoutMetrics,
} from "@/lib/workoutMath";

interface WorkoutCardProps {
  description: string;
  fuelRate?: number | null;
  prescribedCarbsG?: number | null;
  /** When set, dims the fuel rate and shows this label in parentheses (e.g. "plan"). */
  fuelRateNote?: string;
  paceTable?: PaceTable;
  children?: React.ReactNode;
  hrZones?: number[];
  lthr?: number;
  /** Race pace in min/km — used to resolve % pace to actual paces in workout display
   *  AND to compute prescribed total carbs from the description. */
  racePacePerKm?: number;
}

const ZONE_BADGE: Record<ZoneName, { bg: string; text: string }> = {
  z1: { bg: ZONE_COLORS.z1, text: "var(--color-bg)" },
  z2: { bg: ZONE_COLORS.z2, text: "var(--color-bg)" },
  z3: { bg: ZONE_COLORS.z3, text: "var(--color-bg)" },
  z4: { bg: ZONE_COLORS.z4, text: "var(--color-bg)" },
  z5: { bg: ZONE_COLORS.z5, text: "var(--color-text)" },
};

function StepRow({ step }: { step: WorkoutStep }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      {step.label && (
        <span className="text-sm font-medium text-muted w-20 shrink-0">
          {step.label}
        </span>
      )}
      <span className="font-mono text-base font-semibold text-text w-12 shrink-0">
        {step.duration}
      </span>
      <span
        className="px-2 py-0.5 rounded-full text-sm font-bold whitespace-nowrap"
        style={{
          backgroundColor: ZONE_BADGE[step.zone].bg,
          color: ZONE_BADGE[step.zone].text,
        }}
      >
        {getZoneLabel(step.zone)}
      </span>
      <span className="text-sm text-muted">{step.bpmRange}</span>
    </div>
  );
}

function SectionBlock({ section }: { section: WorkoutSection }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold text-text">{section.name}</span>
        {section.repeats && (
          <span className="text-sm font-bold bg-brand text-white px-2 py-0.5 rounded-full">
            {section.repeats}x
          </span>
        )}
      </div>
      <div className="pl-3 border-l-2 border-border">
        {section.steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
      </div>
    </div>
  );
}

export function WorkoutCard({
  description,
  fuelRate,
  prescribedCarbsG,
  fuelRateNote,
  paceTable,
  children,
  hrZones,
  lthr = DEFAULT_LTHR,
  racePacePerKm,
}: WorkoutCardProps) {
  const workoutContext = useMemo(
    () =>
      createWorkoutEstimationContext({
        paceTable,
        thresholdPace: racePacePerKm,
      }),
    [paceTable, racePacePerKm],
  );
  const metrics = useMemo(
    () => resolveWorkoutMetrics(description, fuelRate, workoutContext),
    [description, fuelRate, workoutContext],
  );
  const estDuration = metrics.duration;
  const estDistance = metrics.distance;
  // Use provided prescribedCarbsG if available (frozen from plan time), otherwise use computed value.
  const totalCarbs = prescribedCarbsG ?? metrics.prescribedCarbsG ?? null;
  const sections = useMemo(
    () =>
      parseWorkoutStructure(description, lthr, hrZones ?? [], racePacePerKm),
    [description, hrZones, lthr, racePacePerKm],
  );
  const zones = useMemo(
    () =>
      hrZones?.length === 5 || racePacePerKm
        ? parseWorkoutZones(description, lthr, hrZones ?? [], racePacePerKm)
        : [],
    [description, hrZones, lthr, racePacePerKm],
  );
  const notes = useMemo(() => extractNotes(description), [description]);

  // Fall back to raw text if parsing fails
  if (sections.length === 0) {
    const hasStripData =
      estDuration != null ||
      estDistance != null ||
      fuelRate != null ||
      totalCarbs != null;
    return (
      <div>
        {hasStripData && (
          <div className="px-3 py-2.5 bg-tint-brand border-b border-brand/30">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {estDuration != null && (
                <div className="flex items-center gap-2">
                  <svg
                    className="w-3.5 h-3.5 shrink-0 text-warning"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                  >
                    <circle cx="8" cy="8" r="6.5" strokeWidth="2" />
                    <line
                      x1="8"
                      y1="4.5"
                      x2="8"
                      y2="8.5"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <line
                      x1="8"
                      y1="8.5"
                      x2="10.5"
                      y2="10.5"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-base font-bold text-warning">
                    {estDuration.estimated ? "~" : ""}
                    {formatHrMin(estDuration.minutes)}
                  </span>
                </div>
              )}
              {estDistance != null && (
                <span className="text-base font-bold text-warning">
                  {estDistance.estimated ? "~" : ""}
                  {estDistance.km} km
                </span>
              )}
              {fuelRate != null && (
                <span
                  className={`text-sm font-semibold ${fuelRateNote ? "text-warning/40" : "text-warning/80"}`}
                >
                  {fuelRate}g/h{fuelRateNote && ` (${fuelRateNote})`}
                </span>
              )}
              {totalCarbs != null && (
                <span className="text-sm font-bold text-warning">
                  {totalCarbs}g total
                </span>
              )}
            </div>
          </div>
        )}
        <div className="bg-surface-alt rounded-lg p-3 sm:p-4">
          <div className="text-sm whitespace-pre-wrap text-muted">
            {description}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Duration + Fuel Strip */}
      <div className="px-3 py-2.5 bg-tint-brand border-b border-brand/30">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {estDuration != null && (
            <div className="flex items-center gap-2">
              <svg
                className="w-3.5 h-3.5 shrink-0 text-warning"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="8" cy="8" r="6.5" strokeWidth="2" />
                <line
                  x1="8"
                  y1="4.5"
                  x2="8"
                  y2="8.5"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <line
                  x1="8"
                  y1="8.5"
                  x2="10.5"
                  y2="10.5"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-base font-bold text-warning">
                {estDuration.estimated ? "~" : ""}
                {formatHrMin(estDuration.minutes)}
              </span>
            </div>
          )}
          {estDistance != null && (
            <span className="text-base font-bold text-warning">
              {estDistance.estimated ? "~" : ""}
              {estDistance.km} km
            </span>
          )}
          {fuelRate != null && (
            <span
              className={`text-sm font-semibold ${fuelRateNote ? "text-warning/40" : "text-warning/80"}`}
            >
              {fuelRate}g/h{fuelRateNote && ` (${fuelRateNote})`}
            </span>
          )}
          {totalCarbs != null && (
            <span className="text-sm font-bold text-warning">
              {totalCarbs}g total
            </span>
          )}
        </div>
      </div>

      {/* Workout Structure */}
      <div className="bg-surface px-3 py-3">
        {sections.map((section, i) => (
          <SectionBlock key={i} section={section} />
        ))}

        {children && (
          <div className="mt-3 pt-3 border-t border-border">{children}</div>
        )}

        {/* Zone Paces */}
        {zones.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {zones.map((zone) => {
                const entry = getPaceForZone(
                  paceTable ?? FALLBACK_PACE_TABLE,
                  zone,
                );
                return (
                  <span key={zone} className="text-sm text-muted">
                    <span className="font-semibold text-text">
                      {getZoneLabel(zone)}
                    </span>{" "}
                    ~{formatPace(entry.avgPace)}/km
                    {entry.avgHr ? ` (${entry.avgHr} bpm)` : ""}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {notes && (
        <div className="bg-surface-alt px-3 py-2.5 border-t border-border text-sm text-muted leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              strong: ({ children }) => (
                <strong className="font-bold text-text">{children}</strong>
              ),
              em: ({ children }) => <em className="text-muted">{children}</em>,
            }}
          >
            {notes}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
