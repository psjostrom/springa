import { useState } from "react";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { ChevronLeft, History } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { estimateWorkoutDuration, estimateWorkoutDescriptionDistance, extractFuelRate, extractTotalCarbs, formatPace, formatDuration } from "@/lib/utils";
import { getEventIcon } from "@/lib/eventStyles";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";

interface AgendaViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}

function EventCard({ event, isMissed, onSelect }: { event: CalendarEvent; isMissed: boolean; onSelect: () => void }) {
  return (
    <div
      data-event-id={event.id}
      onClick={onSelect}
      className={`flex gap-1.5 sm:gap-4 p-1.5 sm:p-4 hover:bg-[#2a1f3d] cursor-pointer rounded-lg transition border overflow-hidden ${
        isMissed
          ? "border-[#ff3366]/30 bg-[#3d1525]/30 opacity-60"
          : "border-[#3d2b5a]"
      }`}
    >
      {/* Date */}
      <div className="flex-shrink-0 text-center w-10 sm:w-20">
        <div className="text-sm text-[#b8a5d4] uppercase">
          {format(event.date, "EEE", { locale: enGB })}
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-white">
          {format(event.date, "d", { locale: enGB })}
        </div>
        <div className="text-sm text-[#b8a5d4]">
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
                isMissed
                  ? "bg-[#3d1525] text-[#ff6b8a] border-[#ff3366]/30 sm:bg-transparent sm:text-[#ff6b8a] sm:border-transparent sm:px-0 sm:py-0 line-through"
                  : event.type === "completed"
                    ? "bg-[#1a3d25] text-[#39ff14] border-[#39ff14]/30 sm:bg-transparent sm:text-white sm:border-transparent sm:px-0 sm:py-0"
                    : event.type === "race"
                      ? "bg-[#3d1525] text-[#ff6b8a] border-[#ff3366]/30 sm:bg-transparent sm:text-white sm:border-transparent sm:px-0 sm:py-0"
                      : "bg-[#1a2040] text-[#00ffff] border-[#00ffff]/30 sm:bg-transparent sm:text-white sm:border-transparent sm:px-0 sm:py-0"
              }`}
            >
              {event.name}
            </h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-sm font-medium flex-shrink-0 ${
              isMissed
                ? "hidden sm:inline-block bg-[#3d1525] text-[#ff6b8a]"
                : event.type === "completed"
                  ? "hidden sm:inline-block bg-[#1a3d25] text-[#39ff14]"
                  : event.type === "race"
                    ? "hidden sm:inline-block bg-[#3d1525] text-[#ff6b8a]"
                    : "hidden sm:inline-block bg-[#1a2040] text-[#00ffff]"
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
            <div className="flex flex-wrap gap-x-3 text-sm text-[#c4b5fd] mb-2">
              {event.duration != null && (
                <span className="font-semibold text-white">
                  {formatDuration(event.duration)}
                </span>
              )}
              {event.distance && (
                <span>
                  <span className="font-semibold text-white">
                    {(event.distance / 1000).toFixed(2)} km
                  </span>
                </span>
              )}
              {event.pace && (
                <span>
                  <span className="font-semibold text-white">
                    {formatPace(event.pace)}
                  </span>{" "}
                  /km
                </span>
              )}
              {event.avgHr && (
                <span>
                  <span className="font-semibold text-white">
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
            <div className="flex flex-wrap gap-2">
              {(() => {
                const est = estimateWorkoutDuration(event.description);
                const dist = estimateWorkoutDescriptionDistance(event.description);
                if (!est && !dist) return null;
                const parts = [
                  est ? `${est.estimated ? "~" : ""}${est.minutes} min` : null,
                  dist ? `${dist.estimated ? "~" : ""}${dist.km} km` : null,
                ].filter(Boolean);
                return (
                  <div className="text-sm font-medium text-[#00ffff] bg-[#0d1a2a] border border-[#00ffff]/30 rounded px-2 py-0.5">
                    {parts.join(" · ")}
                  </div>
                );
              })()}
              {(() => {
                const fuelRate = event.fuelRate ?? extractFuelRate(event.description);
                if (fuelRate == null) return null;
                const totalCarbs = event.totalCarbs ?? extractTotalCarbs(event.description);
                const parts = [
                  `${fuelRate}g/h`,
                  totalCarbs != null ? `${totalCarbs}g total` : null,
                ].filter(Boolean);
                return (
                  <div className="text-sm font-medium text-[#ffb800] bg-[#2d1a35] border border-[#ffb800]/30 rounded px-2 py-0.5">
                    {parts.join(" · ")}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AgendaView({
  events,
  onSelectEvent,
}: AgendaViewProps) {
  const [view, setView] = useState<"upcoming" | "history">("upcoming");

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const splitIndex = events.findIndex((e) => e.date >= now);
  const hasEarlier = splitIndex > 0;
  const earlierEvents = hasEarlier ? events.slice(0, splitIndex) : [];
  const upcomingEvents = splitIndex === -1 ? events : events.slice(Math.max(0, splitIndex));

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-[#b8a5d4]">
        No workouts scheduled
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setView("upcoming")}
          className="flex items-center gap-1.5 py-2 text-sm text-[#b8a5d4] hover:text-[#c4b5fd] transition"
        >
          <ChevronLeft size={16} />
          Back to upcoming
        </button>
        {[...earlierEvents].reverse().map((event) => (
          <EventCard
            key={event.id}
            event={event}
            isMissed={event.type === "planned" && event.date < now}
            onSelect={() => onSelectEvent(event)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1 sm:space-y-2">
      {hasEarlier && (
        <button
          onClick={() => setView("history")}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-[#b8a5d4] hover:text-[#c4b5fd] transition"
        >
          <History size={16} />
          {earlierEvents.length} earlier {earlierEvents.length === 1 ? "workout" : "workouts"}
        </button>
      )}
      {upcomingEvents.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          isMissed={event.type === "planned" && event.date < now}
          onSelect={() => onSelectEvent(event)}
        />
      ))}
    </div>
  );
}
