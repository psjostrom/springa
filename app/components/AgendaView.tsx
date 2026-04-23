import { useEffect, useState } from "react";
import { format, isSameDay } from "date-fns";
import { enGB } from "date-fns/locale";
import { ChevronLeft, History, Plus } from "lucide-react";
import type { CalendarEvent, PaceTable } from "@/lib/types";
import { formatPace, formatDuration } from "@/lib/format";
import { estimateWorkoutDuration, estimateWorkoutDescriptionDistance } from "@/lib/workoutMath";
import { getEventIcon, isMissedEvent } from "@/lib/eventStyles";
import type { ClothingRecommendation as ClothingRec } from "@/lib/clothingCalculator";
import { HRMiniChart } from "./HRMiniChart";
import { WorkoutStructureBar } from "./WorkoutStructureBar";
import { ClothingRecommendation } from "./ClothingRecommendation";

interface AgendaViewProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onGenerateWorkout?: (date: Date) => void;
  paceTable?: PaceTable;
  hrZones?: number[];
  lthr?: number;
  thresholdPace?: number;
  clothingMap?: Map<string, ClothingRec>;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function msUntilNextMidnight(): number {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime() - now.getTime();
}

function getLeftBorderColor(event: CalendarEvent, isMissed: boolean): string {
  if (isMissed) return "border-l-error";
  if (event.type === "completed") return "border-l-success";
  if (event.type === "race") return "border-l-brand";
  if (/bonus|optional/i.test(event.name)) return "border-l-border-subtle";
  return "border-l-brand";
}

function EventCard({ event, isMissed, onSelect, paceTable, hrZones, lthr, thresholdPace, clothing }: { event: CalendarEvent; isMissed: boolean; onSelect: () => void; paceTable?: PaceTable; hrZones?: number[]; lthr?: number; thresholdPace?: number; clothing?: ClothingRec }) {
  return (
    <div
      data-event-id={event.id}
      onClick={onSelect}
      className={`flex gap-1.5 sm:gap-4 p-1.5 sm:p-4 hover:bg-border cursor-pointer rounded-lg transition border border-l-[3px] overflow-hidden ${
        isMissed
          ? "border-error/30 bg-tint-error/30 opacity-60"
          : "border-border"
      } ${getLeftBorderColor(event, isMissed)}`}
    >
      {/* Date */}
      <div className="flex-shrink-0 text-center w-10 sm:w-20">
        <div className="text-sm text-muted uppercase">
          {format(event.date, "EEE", { locale: enGB })}
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-text">
          {format(event.date, "d", { locale: enGB })}
        </div>
        <div className="text-sm text-muted">
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
                  ? "bg-tint-error text-text border-error/30 sm:bg-transparent sm:text-error sm:border-transparent sm:px-0 sm:py-0 line-through"
                  : event.type === "completed"
                    ? "bg-tint-success text-text border-success/30 sm:bg-transparent sm:text-text sm:border-transparent sm:px-0 sm:py-0"
                    : event.type === "race"
                      ? "bg-tint-error text-text border-error/30 sm:bg-transparent sm:text-text sm:border-transparent sm:px-0 sm:py-0"
                      : "bg-surface-alt text-text border-border sm:bg-transparent sm:text-text sm:border-transparent sm:px-0 sm:py-0"
              }`}
            >
              {event.name}
            </h3>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-sm font-medium flex-shrink-0 ${
              isMissed
                ? "hidden sm:inline-block bg-tint-error text-text"
                : event.type === "completed"
                  ? "hidden sm:inline-block bg-tint-success text-text"
                  : event.type === "race"
                    ? "hidden sm:inline-block bg-tint-error text-text"
                    : "hidden sm:inline-block bg-surface-alt text-muted"
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
            <div className="flex flex-wrap gap-x-3 text-sm text-muted mb-2">
              {event.duration != null && (
                <span className="font-semibold text-text">
                  {formatDuration(event.duration)}
                </span>
              )}
              {event.distance && (
                <span>
                  <span className="font-semibold text-text">
                    {(event.distance / 1000).toFixed(2)} km
                  </span>
                </span>
              )}
              {event.pace && (
                <span>
                  <span className="font-semibold text-text">
                    {formatPace(event.pace)}
                  </span>{" "}
                  /km
                </span>
              )}
              {event.avgHr && (
                <span>
                  <span className="font-semibold text-text">
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
                thresholdPace={thresholdPace}
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
                  <div className="text-sm font-medium text-text bg-surface-alt border border-border rounded px-2 py-0.5">
                    {parts.join(" · ")}
                  </div>
                );
              })()}
              {(() => {
                const fuelRate = event.fuelRate;
                if (fuelRate == null) return null;
                const parts = [
                  `${fuelRate}g/h`,
                  event.totalCarbs != null ? `${event.totalCarbs}g total` : null,
                ].filter(Boolean);
                return (
                  <div className="text-sm font-medium text-text bg-tint-warning border border-warning/30 rounded px-2 py-0.5">
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
  onGenerateWorkout,
  paceTable,
  hrZones,
  lthr,
  thresholdPace,
  clothingMap,
}: AgendaViewProps) {
  const [view, setView] = useState<"upcoming" | "history">("upcoming");
  const [today, setToday] = useState(() => startOfToday());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextDayRefresh = () => {
      timeoutId = setTimeout(() => {
        setToday(startOfToday());
        scheduleNextDayRefresh();
      }, msUntilNextMidnight());
    };

    scheduleNextDayRefresh();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const splitIndex = events.findIndex((e) => e.date >= today);
  const hasEarlier = splitIndex > 0;
  const earlierEvents = hasEarlier ? events.slice(0, splitIndex) : [];
  const upcomingEvents = splitIndex === -1 ? events : events.slice(Math.max(0, splitIndex));

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        No workouts scheduled
      </div>
    );
  }

  if (view === "history") {
    return (
      <div className="space-y-2">
        <button
          onClick={() => { setView("upcoming"); }}
          className="flex items-center gap-1.5 py-2 text-sm text-muted hover:text-text transition"
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
            thresholdPace={thresholdPace}
          />
        ))}
      </div>
    );
  }

  const todayHasEvent = events.some((e) => isSameDay(e.date, today));

  return (
    <div className="space-y-1 sm:space-y-2">
      {hasEarlier && (
        <button
          onClick={() => { setView("history"); }}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted hover:text-text transition"
        >
          <History size={16} />
          {earlierEvents.length} earlier {earlierEvents.length === 1 ? "workout" : "workouts"}
        </button>
      )}
      {!todayHasEvent && onGenerateWorkout && (
        <button
          onClick={() => { onGenerateWorkout(today); }}
          className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed border-border hover:border-brand hover:bg-tint-brand cursor-pointer transition text-muted hover:text-text"
        >
          <Plus size={16} />
          <span className="text-sm">Generate workout for today</span>
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
          thresholdPace={thresholdPace}
          clothing={clothingMap?.get(event.id)}
        />
      ))}
    </div>
  );
}
