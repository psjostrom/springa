import { useState } from "react";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import { ChevronLeft, History } from "lucide-react";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import { formatPace, formatDuration } from "@/lib/format";
import { estimateWorkoutDuration, estimateWorkoutDescriptionDistance, calculateWorkoutCarbs } from "@/lib/workoutMath";
import { getEventIcon, isMissedEvent } from "@/lib/eventStyles";
import type { ClothingRecommendation as ClothingRec } from "@/lib/clothingCalculator";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";
import { ClothingRecommendation } from "./ClothingRecommendation";

interface AgendaViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  paceTable?: PaceTable;
  hrZones?: number[];
  lthr?: number;
  clothingMap?: Map<string, ClothingRec>;
}

function getLeftBorderColor(event: CalendarEvent, isMissed: boolean): string {
  if (isMissed) return "border-l-[#ff4d6a]";
  if (event.type === "completed") return "border-l-[#4ade80]";
  if (event.type === "race") return "border-l-[#f23b94]";
  if (/bonus|optional/i.test(event.name)) return "border-l-[#4a4358]";
  return "border-l-[#f23b94]";
}

function EventCard({ event, isMissed, onSelect, paceTable, hrZones, lthr, clothing }: { event: CalendarEvent; isMissed: boolean; onSelect: () => void; paceTable?: PaceTable; hrZones?: number[]; lthr?: number; clothing?: ClothingRec }) {
  return (
    <div
      data-event-id={event.id}
      onClick={onSelect}
      className={`flex gap-1.5 sm:gap-4 p-1.5 sm:p-4 hover:bg-[#2e293c] cursor-pointer rounded-lg transition border border-l-[3px] overflow-hidden ${
        isMissed
          ? "border-[#ff4d6a]/30 bg-[#3d1525]/30 opacity-60"
          : "border-[#2e293c]"
      } ${getLeftBorderColor(event, isMissed)}`}
    >
      {/* Date */}
      <div className="flex-shrink-0 text-center w-10 sm:w-20">
        <div className="text-sm text-[#af9ece] uppercase">
          {format(event.date, "EEE", { locale: enGB })}
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-white">
          {format(event.date, "d", { locale: enGB })}
        </div>
        <div className="text-sm text-[#af9ece]">
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
                  ? "bg-[#3d1525] text-white border-[#ff4d6a]/30 sm:bg-transparent sm:text-[#ff4d6a] sm:border-transparent sm:px-0 sm:py-0 line-through"
                  : event.type === "completed"
                    ? "bg-[#1a3d25] text-white border-[#4ade80]/30 sm:bg-transparent sm:text-white sm:border-transparent sm:px-0 sm:py-0"
                    : event.type === "race"
                      ? "bg-[#3d1525] text-white border-[#ff4d6a]/30 sm:bg-transparent sm:text-white sm:border-transparent sm:px-0 sm:py-0"
                      : "bg-[#2e293c] text-white border-[#2e293c] sm:bg-transparent sm:text-white sm:border-transparent sm:px-0 sm:py-0"
              }`}
            >
              {event.name}
            </h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-sm font-medium flex-shrink-0 ${
              isMissed
                ? "hidden sm:inline-block bg-[#3d1525] text-white"
                : event.type === "completed"
                  ? "hidden sm:inline-block bg-[#1a3d25] text-white"
                  : event.type === "race"
                    ? "hidden sm:inline-block bg-[#3d1525] text-white"
                    : "hidden sm:inline-block bg-[#2e293c] text-[#af9ece]"
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
            <div className="flex flex-wrap gap-x-3 text-sm text-[#af9ece] mb-2">
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

            {event.zoneTimes && (
              <HRMiniChart
                z1={event.zoneTimes.z1}
                z2={event.zoneTimes.z2}
                z3={event.zoneTimes.z3}
                z4={event.zoneTimes.z4}
                z5={event.zoneTimes.z5}
                maxHeight={40}
                hrData={event.streamData?.heartrate}
                hrZones={hrZones}
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
                hrZones={hrZones}
                lthr={lthr}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const est = estimateWorkoutDuration(event.description, paceTable);
                const dist = estimateWorkoutDescriptionDistance(event.description, paceTable);
                if (!est && !dist) return null;
                const parts = [
                  est ? `${est.estimated ? "~" : ""}${est.minutes} min` : null,
                  dist ? `${dist.estimated ? "~" : ""}${dist.km} km` : null,
                ].filter(Boolean);
                return (
                  <div className="text-sm font-medium text-white bg-[#2e293c] border border-[#2e293c] rounded px-2 py-0.5">
                    {parts.join(" · ")}
                  </div>
                );
              })()}
              {(() => {
                const fuelRate = event.fuelRate;
                if (fuelRate == null) return null;
                const est = estimateWorkoutDuration(event.description, paceTable);
                const totalCarbs = (est != null)
                  ? calculateWorkoutCarbs(est.minutes, fuelRate)
                  : event.totalCarbs;
                const parts = [
                  `${fuelRate}g/h`,
                  totalCarbs != null ? `${totalCarbs}g total` : null,
                ].filter(Boolean);
                return (
                  <div className="text-sm font-medium text-white bg-[#3d2b1a] border border-[#ffb800]/30 rounded px-2 py-0.5">
                    {parts.join(" · ")}
                  </div>
                );
              })()}
            </div>
            {clothing && (
              <div className="mt-2">
                <ClothingRecommendation recommendation={clothing} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AgendaView({
  events,
  onSelectEvent,
  paceTable,
  hrZones,
  lthr,
  clothingMap,
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
      <div className="text-center py-12 text-[#af9ece]">
        No workouts scheduled
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => { setView("upcoming"); }}
          className="flex items-center gap-1.5 py-2 text-sm text-[#af9ece] hover:text-[#af9ece] transition"
        >
          <ChevronLeft size={16} />
          Back to upcoming
        </button>
        {[...earlierEvents].reverse().map((event) => (
          <EventCard
            key={event.id}
            event={event}
            isMissed={isMissedEvent(event)}
            onSelect={() => { onSelectEvent(event); }}
            paceTable={paceTable}
            hrZones={hrZones}
            lthr={lthr}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1 sm:space-y-2">
      {hasEarlier && (
        <button
          onClick={() => { setView("history"); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-[#af9ece] hover:text-[#af9ece] transition"
        >
          <History size={16} />
          {earlierEvents.length} earlier {earlierEvents.length === 1 ? "workout" : "workouts"}
        </button>
      )}
      {upcomingEvents.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          isMissed={isMissedEvent(event)}
          onSelect={() => { onSelectEvent(event); }}
          paceTable={paceTable}
          hrZones={hrZones}
          lthr={lthr}
          clothing={clothingMap?.get(event.id)}
        />
      ))}
    </div>
  );
}
