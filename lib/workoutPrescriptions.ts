import { db } from "./db";
import type { CalendarEvent } from "./types";
import {
  calculateWorkoutCarbs,
  resolveWorkoutMetrics,
  type WorkoutEstimationContext,
} from "./workoutMath";

export interface WorkoutEventPrescriptionRow {
  eventId: string;
  plannedDurationSeconds: number | null;
  prescribedCarbsG: number | null;
}

interface StoredWorkoutEventPrescription {
  plannedDurationSeconds: number | null;
  prescribedCarbsG: number | null;
}

function rawPlannedEventId(event: CalendarEvent): string | null {
  return event.id.startsWith("event-") ? event.id.slice(6) : null;
}

function linkedPlannedEventId(event: CalendarEvent): string | null {
  if (event.type === "completed") {
    return event.pairedEventId != null ? String(event.pairedEventId) : null;
  }
  return rawPlannedEventId(event);
}

export function calculateCanonicalPlannedPrescription(
  description: string | undefined,
  fuelRateGPerHour: number | null | undefined,
  plannedDurationSeconds: number | null | undefined,
  context: WorkoutEstimationContext = {},
): number | null {
  if (fuelRateGPerHour == null) return null;
  // Description is the prescription source of truth — even for km-based steps
  // where duration is estimated from pace. The pace table gives a better estimate
  // than whatever Intervals.icu stores as event.duration, and it stays consistent
  // with the duration shown in the UI.
  const fromDescription = resolveWorkoutMetrics(description, fuelRateGPerHour, context).prescribedCarbsG;
  if (fromDescription != null) return fromDescription;
  // Only fall back to the stored planned duration when the description can't be
  // parsed (missing, empty, or unrecognized format).
  if (plannedDurationSeconds != null && plannedDurationSeconds > 0) {
    return calculateWorkoutCarbs(plannedDurationSeconds / 60, fuelRateGPerHour);
  }
  return null;
}

export function calculateExactDescriptionPrescription(
  description: string | undefined,
  fuelRateGPerHour: number | null | undefined,
  context: WorkoutEstimationContext = {},
): number | null {
  if (fuelRateGPerHour == null) return null;
  const resolved = resolveWorkoutMetrics(description, fuelRateGPerHour, context);
  if (!resolved.duration || resolved.duration.estimated) return null;
  return resolved.prescribedCarbsG;
}

export async function loadWorkoutEventPrescriptions(
  email: string,
  eventIds: readonly string[],
): Promise<Map<string, StoredWorkoutEventPrescription>> {
  const uniqueEventIds = Array.from(new Set(eventIds.filter((eventId) => eventId.length > 0)));
  if (uniqueEventIds.length === 0) return new Map();

  const placeholders = uniqueEventIds.map(() => "?").join(", ");
  const result = await db().execute({
    sql: `SELECT event_id, planned_duration_sec, prescribed_carbs_g
          FROM workout_event_prescriptions
          WHERE email = ? AND event_id IN (${placeholders})`,
    args: [email, ...uniqueEventIds],
  });

  return new Map(
    result.rows.map((row) => [
      row.event_id as string,
      {
        plannedDurationSeconds: row.planned_duration_sec as number | null,
        prescribedCarbsG: row.prescribed_carbs_g as number | null,
      },
    ]),
  );
}

function prescriptionRowChanged(
  stored: StoredWorkoutEventPrescription | undefined,
  next: WorkoutEventPrescriptionRow,
): boolean {
  if (!stored) return true;
  return stored.plannedDurationSeconds !== next.plannedDurationSeconds
    || stored.prescribedCarbsG !== next.prescribedCarbsG;
}

export async function upsertWorkoutEventPrescriptions(
  email: string,
  rows: readonly WorkoutEventPrescriptionRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const createdAt = Date.now();
  for (const row of rows) {
    await db().execute({
      sql: `INSERT INTO workout_event_prescriptions (email, event_id, planned_duration_sec, prescribed_carbs_g, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (email, event_id) DO UPDATE SET
              planned_duration_sec = excluded.planned_duration_sec,
              prescribed_carbs_g = excluded.prescribed_carbs_g,
              created_at = excluded.created_at`,
      args: [
        email,
        row.eventId,
        row.plannedDurationSeconds,
        row.prescribedCarbsG,
        createdAt,
      ],
    });
  }
}

export async function applyWorkoutEventPrescriptions(
  email: string,
  events: CalendarEvent[],
  context: WorkoutEstimationContext = {},
): Promise<CalendarEvent[]> {
  const linkedEventIds = Array.from(new Set(
    events
      .map((event) => linkedPlannedEventId(event))
      .filter((eventId): eventId is string => eventId != null),
  ));
  const stored = await loadWorkoutEventPrescriptions(email, linkedEventIds);

  const plannedRows = events.flatMap((event) => {
    if (event.type === "completed") return [];
    const eventId = rawPlannedEventId(event);
    if (!eventId) return [];
    return [{
      eventId,
      plannedDurationSeconds: event.duration ?? null,
      prescribedCarbsG: calculateCanonicalPlannedPrescription(
        event.description,
        event.fuelRate,
        event.duration ?? null,
        context,
      ),
    }];
  });

  const rowsToUpsert = plannedRows.filter((row) => {
    const existing = stored.get(row.eventId);
    if (row.prescribedCarbsG == null && !existing) return false;
    return prescriptionRowChanged(existing, row);
  });
  const repairRows: WorkoutEventPrescriptionRow[] = [];
  const plannedRowsById = new Map(plannedRows.map((row) => [row.eventId, row]));

  const enrichedEvents = events.map((event) => {
    const eventId = linkedPlannedEventId(event);
    if (!eventId) return event;

    let prescribedCarbsG: number | null;
    if (event.type === "completed") {
      if (stored.has(eventId)) {
        prescribedCarbsG = stored.get(eventId)?.prescribedCarbsG ?? null;
      } else {
        prescribedCarbsG = calculateExactDescriptionPrescription(
          event.description,
          event.fuelRate,
          context,
        );
        if (prescribedCarbsG != null) {
          repairRows.push({
            eventId,
            plannedDurationSeconds: null,
            prescribedCarbsG,
          });
        }
      }
    } else {
      const plannedRow = plannedRowsById.get(eventId);
      prescribedCarbsG = plannedRow
        ? plannedRow.prescribedCarbsG
        : (stored.get(eventId)?.prescribedCarbsG ?? null);
    }

    if (prescribedCarbsG == null) return event;
    return { ...event, prescribedCarbsG };
  });

  const repairRowsToUpsert = repairRows.filter((row) => prescriptionRowChanged(stored.get(row.eventId), row));

  if (rowsToUpsert.length > 0 || repairRowsToUpsert.length > 0) {
    await upsertWorkoutEventPrescriptions(email, [...rowsToUpsert, ...repairRowsToUpsert]);
  }

  return enrichedEvents;
}