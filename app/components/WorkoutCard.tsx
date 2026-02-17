import type { PaceTable, HRZoneName } from "@/lib/types";
import {
  extractFuelStatus,
  extractNotes,
  parseWorkoutStructure,
  parseWorkoutZones,
  getPaceForZone,
  getZoneLabel,
  formatPace,
  estimateWorkoutDuration,
} from "@/lib/utils";
import type { WorkoutSection, WorkoutStep } from "@/lib/utils";

interface WorkoutCardProps {
  description: string;
  paceTable: PaceTable;
}

const ZONE_STYLES: Record<HRZoneName, string> = {
  easy: "bg-[#39ff14] text-[#0d0a1a]",
  steady: "bg-[#ffb800] text-[#0d0a1a]",
  tempo: "bg-[#ff8c00] text-[#0d0a1a]",
  hard: "bg-[#ff3366] text-white",
};

function StepRow({ step }: { step: WorkoutStep }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      {step.label && (
        <span className="text-sm font-medium text-[#c4b5fd] w-20 shrink-0">
          {step.label}
        </span>
      )}
      <span className="font-mono text-base font-semibold text-white w-12 shrink-0">
        {step.duration}
      </span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ZONE_STYLES[step.zone]}`}>
        {getZoneLabel(step.zone)}
      </span>
      <span className="text-sm text-[#8b7aaa]">{step.bpmRange}</span>
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
          <span className="text-xs font-bold bg-[#ff2d95] text-white px-2 py-0.5 rounded-full">
            {section.repeats}x
          </span>
        )}
      </div>
      <div className="pl-3 border-l-2 border-[#3d2b5a]">
        {section.steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
      </div>
    </div>
  );
}

export function WorkoutCard({ description, paceTable }: WorkoutCardProps) {
  const fuel = extractFuelStatus(description);
  const sections = parseWorkoutStructure(description);

  // Fall back to raw text if parsing fails
  if (sections.length === 0) {
    return (
      <div className="bg-[#2a1f3d] rounded-lg p-3 sm:p-4 mb-4">
        <div className="text-sm whitespace-pre-wrap text-[#c4b5fd]">{description}</div>
      </div>
    );
  }

  const estDuration = estimateWorkoutDuration(description);
  const zones = parseWorkoutZones(description);
  const notes = extractNotes(description);

  return (
    <div className="rounded-xl overflow-hidden mb-4 border border-[#3d2b5a] shadow-sm">
      {/* Duration + Fuel Strip */}
      <div className="px-4 py-3 bg-[#3d2b1a] border-b border-[#ffb800]/30">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {estDuration != null && (
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-[#ffb800]" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="8" cy="8" r="6.5" strokeWidth="2" />
                <line x1="8" y1="4.5" x2="8" y2="8.5" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="8.5" x2="10.5" y2="10.5" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-base font-bold text-[#ffb800]">
                ~{estDuration} min
              </span>
            </div>
          )}
          {fuel.fuelRate != null && (
            <span className="text-sm font-semibold text-[#ffb800]/80">
              {fuel.fuelRate}g / 10 min
            </span>
          )}
          {fuel.totalCarbs != null && (
            <span className="text-sm font-bold text-[#ffb800]">
              {fuel.totalCarbs}g total
            </span>
          )}
        </div>
      </div>

      {/* Workout Structure */}
      <div className="bg-[#1e1535] px-4 py-4">
        {sections.map((section, i) => (
          <SectionBlock key={i} section={section} />
        ))}

        {/* Zone Paces */}
        {zones.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#3d2b5a]">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {zones.map((zone) => {
                const entry = getPaceForZone(paceTable, zone);
                return (
                  <span key={zone} className="text-sm text-[#c4b5fd]">
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
        <div className="bg-[#2a1f3d] px-4 py-3 border-t border-[#3d2b5a]">
          <p className="text-sm text-[#a78bca] leading-relaxed">{notes}</p>
        </div>
      )}
    </div>
  );
}
