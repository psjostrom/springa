import type { PaceTable, HRZoneName } from "@/lib/types";
import {
  extractPumpStatus,
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
  easy: "bg-emerald-500 text-white",
  steady: "bg-yellow-500 text-white",
  tempo: "bg-orange-500 text-white",
  hard: "bg-red-500 text-white",
};

function StepRow({ step }: { step: WorkoutStep }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5">
      {step.label && (
        <span className="text-sm font-medium text-black w-20 shrink-0">
          {step.label}
        </span>
      )}
      <span className="font-mono text-base font-semibold text-black w-12 shrink-0">
        {step.duration}
      </span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ZONE_STYLES[step.zone]}`}>
        {getZoneLabel(step.zone)}
      </span>
      <span className="text-sm text-slate-600">{step.bpmRange}</span>
    </div>
  );
}

function SectionBlock({ section }: { section: WorkoutSection }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold text-black">
          {section.name}
        </span>
        {section.repeats && (
          <span className="text-xs font-bold bg-slate-700 text-white px-2 py-0.5 rounded-full">
            {section.repeats}x
          </span>
        )}
      </div>
      <div className="pl-3 border-l-2 border-slate-300">
        {section.steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
      </div>
    </div>
  );
}

export function WorkoutCard({ description, paceTable }: WorkoutCardProps) {
  const status = extractPumpStatus(description);
  const sections = parseWorkoutStructure(description);

  // Fall back to raw text if parsing fails
  if (sections.length === 0) {
    return (
      <div className="bg-slate-50 rounded-lg p-3 sm:p-4 mb-4">
        <div className="text-sm whitespace-pre-wrap">{description}</div>
      </div>
    );
  }

  const isPumpOff = status.pump.toUpperCase().includes("OFF");
  const estDuration = estimateWorkoutDuration(description);
  const zones = parseWorkoutZones(description);
  const notes = extractNotes(description);

  return (
    <div className="rounded-xl overflow-hidden mb-4 border border-slate-200 shadow-sm">
      {/* Duration + T1D Protocol Strip */}
      <div
        className={`px-4 py-3 ${
          isPumpOff
            ? "bg-amber-100 border-b border-amber-300"
            : "bg-emerald-100 border-b border-emerald-300"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {estDuration != null && (
            <div className="flex items-center gap-2">
              <svg className={`w-3.5 h-3.5 shrink-0 ${isPumpOff ? "text-amber-600" : "text-emerald-600"}`} viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="8" cy="8" r="6.5" strokeWidth="2" />
                <line x1="8" y1="4.5" x2="8" y2="8.5" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="8.5" x2="10.5" y2="10.5" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className={`text-base font-bold ${isPumpOff ? "text-amber-900" : "text-emerald-900"}`}>
                ~{estDuration} min
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                isPumpOff ? "bg-amber-600" : "bg-emerald-600"
              }`}
            />
            <span className={`text-base font-bold ${isPumpOff ? "text-amber-900" : "text-emerald-900"}`}>
              {isPumpOff ? "Pump OFF" : status.pump.replace(/^PUMP\s+/i, "Pump ")}
            </span>
          </div>
          {status.fuelRate != null && (
            <span className={`text-sm font-semibold ${isPumpOff ? "text-amber-800" : "text-emerald-800"}`}>
              {status.fuelRate}g / 10 min
            </span>
          )}
          {status.totalCarbs != null && (
            <span className={`text-sm font-bold ${isPumpOff ? "text-amber-900" : "text-emerald-900"}`}>
              {status.totalCarbs}g total
            </span>
          )}
        </div>
      </div>

      {/* Workout Structure */}
      <div className="bg-white px-4 py-4">
        {sections.map((section, i) => (
          <SectionBlock key={i} section={section} />
        ))}

        {/* Zone Paces */}
        {zones.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {zones.map((zone) => {
                const entry = getPaceForZone(paceTable, zone);
                return (
                  <span key={zone} className="text-sm text-black">
                    <span className="font-semibold">{getZoneLabel(zone)}</span>{" "}
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
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
          <p className="text-sm text-slate-700 leading-relaxed">{notes}</p>
        </div>
      )}
    </div>
  );
}
