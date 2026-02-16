import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import type { CalendarEvent } from "@/lib/types";
import { estimateWorkoutDuration, extractPumpStatus } from "@/lib/utils";
import { getEventIcon } from "@/lib/eventStyles";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";

interface AgendaViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  nextUpcomingRef: React.RefObject<HTMLDivElement | null>;
}

export function AgendaView({
  events,
  onSelectEvent,
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
        const isMissed = event.type === "planned" && event.date < now;
        return (
          <div
            key={event.id}
            data-event-id={event.id}
            ref={isNextUpcoming ? nextUpcomingRef : null}
            onClick={() => onSelectEvent(event)}
            className={`flex gap-1.5 sm:gap-4 p-1.5 sm:p-4 hover:bg-slate-50 cursor-pointer rounded-lg transition border overflow-hidden ${
              isMissed
                ? "border-red-200 bg-red-50/50 opacity-60"
                : "border-slate-100"
            }`}
          >
            {/* Date */}
            <div className="flex-shrink-0 text-center w-10 sm:w-20">
              <div className="text-xs sm:text-sm text-slate-600 uppercase">
                {format(event.date, "EEE", { locale: enGB })}
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-900">
                {format(event.date, "d", { locale: enGB })}
              </div>
              <div className="text-xs text-slate-600">
                {format(event.date, "MMM", { locale: enGB })}
              </div>
              {event.type === "completed" &&
                event.duration &&
                (() => {
                  const mins = Math.floor(event.duration / 60);
                  const hours = Math.floor(mins / 60);
                  const remainMins = mins % 60;
                  return (
                    <div className="text-sm text-slate-900 mt-4">
                      {hours > 0
                        ? `${hours}h${remainMins > 0 ? ` ${remainMins}m` : ""}`
                        : `${remainMins}m`}
                    </div>
                  );
                })()}
              {event.type === "planned" &&
                event.description &&
                (() => {
                  const est = estimateWorkoutDuration(event.description);
                  if (!est) return null;
                  const hours = Math.floor(est / 60);
                  const mins = est % 60;
                  return (
                    <div className="text-sm text-slate-900 mt-4">
                      {hours > 0
                        ? `${hours}h${mins > 0 ? ` ${mins}m` : ""}`
                        : `${mins}m`}
                    </div>
                  );
                })()}
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
                      isMissed
                        ? "bg-red-50 text-red-700 border-red-200 sm:bg-transparent sm:text-red-400 sm:border-transparent sm:px-0 sm:py-0 line-through"
                        : event.type === "completed"
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
                  className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                    isMissed
                      ? "hidden sm:inline-block bg-red-100 text-red-700"
                      : event.type === "completed"
                        ? "hidden sm:inline-block bg-green-100 text-green-700"
                        : event.type === "race"
                          ? "hidden sm:inline-block bg-red-100 text-red-700"
                          : "hidden sm:inline-block bg-blue-100 text-blue-700"
                  }`}
                >
                  {isMissed
                    ? "Missed"
                    : event.type === "completed"
                      ? "Completed"
                      : event.type === "race"
                        ? "Race"
                        : "Planned"}
                </span>
              </div>

              {event.type === "completed" && (
                <>
                  <div className="flex flex-wrap gap-x-3 text-xs sm:text-sm text-slate-600 mb-2">
                    {event.distance && (
                      <span>
                        <span className="font-semibold text-slate-900">
                          {(event.distance / 1000).toFixed(2)} km
                        </span>
                      </span>
                    )}
                    {event.pace && (
                      <span>
                        <span className="font-semibold text-slate-900">
                          {Math.floor(event.pace)}:
                          {String(Math.round((event.pace % 1) * 60)).padStart(
                            2,
                            "0",
                          )}
                        </span>{" "}
                        /km
                      </span>
                    )}
                    {event.avgHr && (
                      <span>
                        <span className="font-semibold text-slate-900">
                          {event.avgHr}
                        </span>{" "}
                        bpm
                      </span>
                    )}
                  </div>

                  {event.hrZones && (
                    <HRMiniChart
                      z1={event.hrZones.z1}
                      z2={event.hrZones.z2}
                      z3={event.hrZones.z3}
                      z4={event.hrZones.z4}
                      z5={event.hrZones.z5}
                      maxHeight={40}
                      hrData={event.streamData?.heartrate}
                    />
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
                    const status = extractPumpStatus(event.description);
                    if (!status.pump) return null;
                    const pumpLabel = status.pump.replace(/^PUMP\s+/i, "");
                    const parts = [
                      `Pump ${pumpLabel}`,
                      status.fuelRate != null
                        ? `${status.fuelRate}g/10min`
                        : null,
                      status.totalCarbs != null
                        ? `${status.totalCarbs}g total`
                        : null,
                    ].filter(Boolean);
                    return (
                      <div className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">
                        {parts.join(" · ")}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
