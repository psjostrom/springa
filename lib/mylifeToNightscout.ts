import { createHash } from "crypto";
import type { MyLifeEvent } from "./mylife";
import type { Treatment } from "./treatmentsDb";

/**
 * Derive a treatment ID from the MyLife event.
 * Prefers the hidden GUID from the Telerik grid (stable across value edits).
 * Falls back to a SHA-256 hash of event properties if no GUID available.
 */
function treatmentId(event: MyLifeEvent): string {
  if (event.id) return event.id;
  const input = `${event.timestamp}|${event.type}|${event.value}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

/** Parse ISO 8601 timestamp to ms epoch. */
function toMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Extract UTC offset in minutes from an ISO 8601 timestamp. */
function utcOffsetMinutes(iso: string): number {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
}

/**
 * Find whether a bolus has a matching carb event within 15 minutes.
 * If so, it's a "Meal Bolus"; otherwise "Correction Bolus".
 */
function isMealBolus(bolus: MyLifeEvent, allEvents: MyLifeEvent[]): boolean {
  const bolusMs = toMs(bolus.timestamp);
  const WINDOW_MS = 15 * 60 * 1000;
  return allEvents.some(
    (e) =>
      (e.type === "Carbohydrates" || e.type === "Hypo Carbohydrates") &&
      Math.abs(toMs(e.timestamp) - bolusMs) <= WINDOW_MS,
  );
}

/**
 * Map MyLifeEvent[] to Nightscout-compatible Treatment[].
 *
 * Mapping:
 * - Bolus → "Meal Bolus" (if carb event within 15min) or "Correction Bolus"
 * - Carbohydrates → "Carb Correction"
 * - Hypo Carbohydrates → "Carb Correction" (entered_by notes hypo)
 * - Boost → "Temporary Target" with notes "CamAPS Boost"
 * - Ease-off → "Temporary Target" with notes "CamAPS Ease-off"
 *
 * Basal rate events are skipped — CamAPS loop micro-doses generate ~200+/day
 * and no consumer uses them (IOB uses bolus insulin only).
 */
export function mapMyLifeToTreatments(events: MyLifeEvent[]): Treatment[] {
  const treatments: Treatment[] = [];

  for (const event of events) {
    const ts = toMs(event.timestamp);

    switch (event.type) {
      case "Bolus": {
        const eventType = isMealBolus(event, events)
          ? "Meal Bolus"
          : "Correction Bolus";
        treatments.push({
          id: treatmentId(event),
          created_at: event.timestamp,
          event_type: eventType,
          insulin: event.value,
          carbs: null,
          basal_rate: null,
          duration: null,
          entered_by: "mylife/CamAPS",
          ts,
        });
        break;
      }

      case "Carbohydrates": {
        treatments.push({
          id: treatmentId(event),
          created_at: event.timestamp,
          event_type: "Carb Correction",
          insulin: null,
          carbs: event.value,
          basal_rate: null,
          duration: null,
          entered_by: "mylife/CamAPS",
          ts,
        });
        break;
      }

      case "Hypo Carbohydrates": {
        treatments.push({
          id: treatmentId(event),
          created_at: event.timestamp,
          event_type: "Carb Correction",
          insulin: null,
          carbs: event.value,
          basal_rate: null,
          duration: null,
          entered_by: "mylife/CamAPS (Hypo treatment)",
          ts,
        });
        break;
      }

      case "Boost": {
        treatments.push({
          id: treatmentId(event),
          created_at: event.timestamp,
          event_type: "Temporary Target",
          insulin: null,
          carbs: null,
          basal_rate: null,
          duration: Math.round(event.value * 60), // hours → minutes
          entered_by: "mylife/CamAPS (Boost)",
          ts,
        });
        break;
      }

      case "Ease-off": {
        treatments.push({
          id: treatmentId(event),
          created_at: event.timestamp,
          event_type: "Temporary Target",
          insulin: null,
          carbs: null,
          basal_rate: null,
          duration: Math.round(event.value * 60), // hours → minutes
          entered_by: "mylife/CamAPS (Ease-off)",
          ts,
        });
        break;
      }
    }
  }

  return treatments;
}

/**
 * Convert a Treatment row to Nightscout JSON response format.
 */
export function treatmentToNightscout(t: Treatment): Record<string, unknown> {
  const offset = utcOffsetMinutes(t.created_at);

  const obj: Record<string, unknown> = {
    _id: t.id,
    eventType: t.event_type,
    created_at: t.created_at,
    enteredBy: t.entered_by,
    utcOffset: offset,
  };

  if (t.insulin != null) obj.insulin = t.insulin;
  if (t.carbs != null) obj.carbs = t.carbs;
  if (t.basal_rate != null) obj.absolute = t.basal_rate;
  if (t.duration != null) obj.duration = t.duration;

  // Derive notes from entered_by annotations
  if (t.entered_by?.includes("Hypo treatment")) {
    obj.notes = "Hypo treatment";
  } else if (t.entered_by?.includes("Boost")) {
    obj.notes = "CamAPS Boost";
  } else if (t.entered_by?.includes("Ease-off")) {
    obj.notes = "CamAPS Ease-off";
  }

  return obj;
}
