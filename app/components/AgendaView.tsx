import { useState } from "react";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { ChevronLeft, History } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import { estimateWorkoutDuration, extractPumpStatus } from "@/lib/utils";
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
        <div className="text-xs sm:text-sm text-[#8b7aaa] uppercase">
          {format(event.date, "EEE", { locale: enGB })}
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-white">
          {format(event.date, "d", { locale: enGB })}
        </div>
        <div className="text-xs text-[#8b7aaa]">
          {format(event.date, "MMM", { locale: enGB })}
        </div>
        {event.type === "completed" &&
          event.duration &&
          (() => {
            const mins = Math.floor(event.duration / 60);
            const hours = Math.floor(mins / 60);
            const remainMins = mins % 60;
            return (
              <div className="text-sm text-white mt-4">
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
              <div className="text-sm text-white mt-4">
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
            className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
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
            <div className="flex flex-wrap gap-x-3 text-xs sm:text-sm text-[#a78bca] mb-2">
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
                <div className="text-sm font-medium text-[#ffb800] bg-[#3d2b1a] border border-[#ffb800]/30 rounded px-2 py-0.5 inline-block">
                  {parts.join(" · ")}
                </div>
              );
            })()}
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
      <div className="text-center py-12 text-[#6b5a8a]">
        No workouts scheduled
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setView("upcoming")}
          className="flex items-center gap-1.5 py-2 text-sm text-[#8b7aaa] hover:text-[#c4b5fd] transition"
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
    <div className="space-y-2">
      {hasEarlier && (
        <button
          onClick={() => setView("history")}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-[#8b7aaa] hover:text-[#c4b5fd] transition"
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
