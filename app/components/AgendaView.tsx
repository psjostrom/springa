import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import {
  parseWorkoutZones,
  getPaceForZone,
  getZoneLabel,
  formatPace,
} from "@/lib/utils";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";

interface AgendaViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  paceTable: PaceTable;
  nextUpcomingRef: React.RefObject<HTMLDivElement | null>;
}

const getEventIcon = (event: CalendarEvent) => {
  if (event.type === "race") return "🏁";
  if (event.category === "long") return "🏃";
  if (event.category === "interval") return "⚡";
  return "✓";
};

export function AgendaView({
  events,
  onSelectEvent,
  paceTable,
  nextUpcomingRef,
}: AgendaViewProps) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nextUpcomingIndex = events.findIndex((e) => e.date >= now);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No workouts scheduled
      </div>
    );
  }

  return (
    <>
      {events.map((event, index) => {
        const isNextUpcoming = index === nextUpcomingIndex;
        return (
          <div
            key={event.id}
            data-event-id={event.id}
            ref={isNextUpcoming ? nextUpcomingRef : null}
            onClick={() => onSelectEvent(event)}
            className="flex gap-4 p-4 hover:bg-slate-50 cursor-pointer rounded-lg transition border border-slate-100 overflow-hidden"
          >
            {/* Date */}
            <div className="flex-shrink-0 text-center w-16 sm:w-20">
              <div className="text-xs sm:text-sm text-slate-600 uppercase">
                {format(event.date, "EEE", { locale: enGB })}
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900">
                {format(event.date, "d", { locale: enGB })}
              </div>
              <div className="text-xs text-slate-600">
                {format(event.date, "MMM", { locale: enGB })}
              </div>
            </div>

            {/* Event Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-lg flex-shrink-0">
                    {getEventIcon(event)}
                  </span>
                  <h3
                    className={`font-semibold truncate px-2 py-0.5 rounded text-sm border ${
                      event.type === "completed"
                        ? "bg-green-50 text-green-700 border-green-200 sm:bg-transparent sm:text-slate-900 sm:border-transparent sm:px-0 sm:py-0"
                        : event.type === "race"
                          ? "bg-red-50 text-red-700 border-red-200 sm:bg-transparent sm:text-slate-900 sm:border-transparent sm:px-0 sm:py-0"
                          : "bg-blue-50 text-blue-700 border-blue-200 sm:bg-transparent sm:text-slate-900 sm:border-transparent sm:px-0 sm:py-0"
                    }`}
                  >
                    {event.name}
                  </h3>
                </div>
                <span
                  className={`hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                    event.type === "completed"
                      ? "bg-green-100 text-green-700"
                      : event.type === "race"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {event.type === "completed"
                    ? "Completed"
                    : event.type === "race"
                      ? "Race"
                      : "Planned"}
                </span>
              </div>

              {event.type === "completed" && (
                <>
                  {event.description && (
                    <div className="bg-slate-50 rounded-lg p-2 mb-2 text-xs whitespace-pre-wrap">
                      {event.description}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs sm:text-sm mb-2">
                    {event.distance && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {(event.distance / 1000).toFixed(2)} km
                        </span>
                      </div>
                    )}
                    {event.duration && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {Math.floor(event.duration / 60)} min
                        </span>
                      </div>
                    )}
                    {event.pace && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {Math.floor(event.pace)}:
                          {String(
                            Math.round((event.pace % 1) * 60),
                          ).padStart(2, "0")}
                        </span>{" "}
                        /km
                      </div>
                    )}
                    {event.avgHr && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {event.avgHr}
                        </span>{" "}
                        bpm
                      </div>
                    )}
                    {event.load && (
                      <div className="text-slate-600">
                        Load:{" "}
                        <span className="font-semibold text-slate-900">
                          {Math.round(event.load)}
                        </span>
                      </div>
                    )}
                    {event.intensity !== undefined && (
                      <div className="text-slate-600">
                        IF:{" "}
                        <span className="font-semibold text-slate-900">
                          {Math.round(event.intensity)}%
                        </span>
                      </div>
                    )}
                    {event.calories && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {event.calories}
                        </span>{" "}
                        kcal
                      </div>
                    )}
                    {event.cadence && (
                      <div className="text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {Math.round(event.cadence)}
                        </span>{" "}
                        spm
                      </div>
                    )}
                  </div>

                  {event.hrZones && (
                    <div className="mt-2">
                      <HRMiniChart
                        z1={event.hrZones.z1}
                        z2={event.hrZones.z2}
                        z3={event.hrZones.z3}
                        z4={event.hrZones.z4}
                        z5={event.hrZones.z5}
                        maxHeight={40}
                        hrData={event.streamData?.heartrate}
                      />
                    </div>
                  )}
                </>
              )}

              {event.type === "planned" && event.description && (
                <>
                  <div className="mb-2">
                    <WorkoutStructureBar
                      description={event.description}
                      maxHeight={40}
                    />
                  </div>
                  {(() => {
                    const zones = parseWorkoutZones(event.description);
                    if (zones.length === 0) return null;
                    return (
                      <div className="text-xs text-slate-500 mb-1 flex flex-wrap gap-x-3">
                        {zones.map((zone) => {
                          const entry = getPaceForZone(paceTable, zone);
                          return (
                            <span key={zone}>
                              {getZoneLabel(zone)} ~{formatPace(entry.avgPace)}/km{entry.avgHr ? ` (${entry.avgHr} bpm)` : ""}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div className="text-sm text-slate-600 line-clamp-2">
                    {event.description}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
