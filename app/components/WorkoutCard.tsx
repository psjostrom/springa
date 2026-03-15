import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HRZoneName, PaceTable } from "@/lib/types";
import { FALLBACK_PACE_TABLE, ZONE_COLORS, DEFAULT_LTHR } from "@/lib/constants";
import {
  extractNotes,
  parseWorkoutStructure,
  parseWorkoutZones,
} from "@/lib/descriptionParser";
import type { WorkoutSection, WorkoutStep } from "@/lib/descriptionParser";
import { getPaceForZone, getZoneLabel, formatPace } from "@/lib/format";
import { estimateWorkoutDuration, estimateWorkoutDescriptionDistance, calculateWorkoutCarbs } from "@/lib/workoutMath";

interface WorkoutCardProps {
  description: string;
  fuelRate?: number | null;
  /** When set, dims the fuel rate and shows this label in parentheses (e.g. "plan"). */
  fuelRateNote?: string;
  totalCarbs?: number | null;
  paceTable?: PaceTable;
  children?: React.ReactNode;
  hrZones?: number[];
  lthr?: number;
}

const ZONE_BADGE: Record<HRZoneName, { bg: string; text: string }> = {
  easy: { bg: ZONE_COLORS.z1, text: "#13101c" },
  steady: { bg: ZONE_COLORS.z3, text: "#13101c" },
  tempo: { bg: ZONE_COLORS.z4, text: "#13101c" },
  hard: { bg: ZONE_COLORS.z5, text: "#ffffff" },
};

function StepRow({ step }: { step: WorkoutStep }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      {step.label && (
        <span className="text-sm font-medium text-[#af9ece] w-20 shrink-0">
          {step.label}
        </span>
      )}
      <span className="font-mono text-base font-semibold text-white w-12 shrink-0">
        {step.duration}
      </span>
      <span
        className="px-2 py-0.5 rounded-full text-sm font-bold whitespace-nowrap"
        style={{ backgroundColor: ZONE_BADGE[step.zone].bg, color: ZONE_BADGE[step.zone].text }}
      >
        {getZoneLabel(step.zone)}
      </span>
      <span className="text-sm text-[#af9ece]">{step.bpmRange}</span>
    </div>
  );
}

function SectionBlock({ section }: { section: WorkoutSection }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold text-white">
          {section.name}
        </span>
        {section.repeats && (
          <span className="text-sm font-bold bg-[#f23b94] text-white px-2 py-0.5 rounded-full">
            {section.repeats}x
          </span>
        )}
      </div>
      <div className="pl-3 border-l-2 border-[#2e293c]">
        {section.steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
      </div>
    </div>
  );
}

export function WorkoutCard({ description, fuelRate: propFuelRate, fuelRateNote, totalCarbs: propTotalCarbs, paceTable, children, hrZones, lthr = DEFAULT_LTHR }: WorkoutCardProps) {
  const fuelRate = propFuelRate;
  const sections = hrZones?.length === 5 ? parseWorkoutStructure(description, lthr, hrZones) : [];

  // Fall back to raw text if parsing fails
  if (sections.length === 0) {
    return (
      <div className="bg-[#2e293c] rounded-lg p-3 sm:p-4">
        <div className="text-sm whitespace-pre-wrap text-[#af9ece]">{description}</div>
      </div>
    );
  }

  const estDuration = estimateWorkoutDuration(description, paceTable);
  const estDistance = estimateWorkoutDescriptionDistance(description, paceTable);

  // Recompute totalCarbs from calibrated duration when possible
  const totalCarbs = (fuelRate != null && estDuration != null)
    ? calculateWorkoutCarbs(estDuration.minutes, fuelRate)
    : propTotalCarbs;
  const zones = hrZones?.length === 5 ? parseWorkoutZones(description, lthr, hrZones) : [];
  const notes = extractNotes(description);

  return (
    <div>
      {/* Duration + Fuel Strip */}
      <div className="px-3 py-2.5 bg-[#2d1a35] border-b border-[#f23b94]/30">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {estDuration != null && (
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-[#ffb800]" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="8" cy="8" r="6.5" strokeWidth="2" />
                <line x1="8" y1="4.5" x2="8" y2="8.5" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="8.5" x2="10.5" y2="10.5" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-base font-bold text-[#ffb800]">
                {estDuration.estimated ? "~" : ""}{estDuration.minutes} min
              </span>
            </div>
          )}
          {estDistance != null && (
            <span className="text-base font-bold text-[#ffb800]">
              {estDistance.estimated ? "~" : ""}{estDistance.km} km
            </span>
          )}
          {fuelRate != null && (
            <span className={`text-sm font-semibold ${fuelRateNote ? "text-[#ffb800]/40" : "text-[#ffb800]/80"}`}>
              {fuelRate}g/h{fuelRateNote && ` (${fuelRateNote})`}
            </span>
          )}
          {totalCarbs != null && (
            <span className="text-sm font-bold text-[#ffb800]">
              {totalCarbs}g total
            </span>
          )}
        </div>
      </div>

      {/* Workout Structure */}
      <div className="bg-[#1d1828] px-3 py-3">
        {sections.map((section, i) => (
          <SectionBlock key={i} section={section} />
        ))}

        {children && <div className="mt-3 pt-3 border-t border-[#2e293c]">{children}</div>}

        {/* Zone Paces */}
        {zones.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#2e293c]">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {zones.map((zone) => {
                const entry = getPaceForZone(paceTable ?? FALLBACK_PACE_TABLE, zone);
                return (
                  <span key={zone} className="text-sm text-[#af9ece]">
                    <span className="font-semibold text-white">{getZoneLabel(zone)}</span>{" "}
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
        <div className="bg-[#2e293c] px-3 py-2.5 border-t border-[#2e293c] text-sm text-[#af9ece] leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
              em: ({ children }) => <em className="text-[#af9ece]">{children}</em>,
            }}
          >
            {notes}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
