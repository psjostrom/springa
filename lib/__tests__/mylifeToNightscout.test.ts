import { describe, it, expect } from "vitest";
import { mapMyLifeToTreatments, treatmentToNightscout } from "../mylifeToNightscout";
import type { MyLifeEvent } from "../mylife";

// --- Helpers ---

function bolus(timestamp: string, units: number): MyLifeEvent {
  return { timestamp, type: "Bolus", value: units, unit: "U", id: crypto.randomUUID() };
}

function carbs(timestamp: string, grams: number): MyLifeEvent {
  return { timestamp, type: "Carbohydrates", value: grams, unit: "g carb", id: crypto.randomUUID() };
}

function hypoCarbs(timestamp: string, grams: number): MyLifeEvent {
  return { timestamp, type: "Hypo Carbohydrates", value: grams, unit: "g carb", id: crypto.randomUUID() };
}

function basalRate(timestamp: string, rate: number): MyLifeEvent {
  return { timestamp, type: "Basal rate", value: rate, unit: "U/h", id: crypto.randomUUID() };
}

function boost(timestamp: string, hours: number): MyLifeEvent {
  return { timestamp, type: "Boost", value: hours, unit: "h", id: crypto.randomUUID() };
}

function easeOff(timestamp: string, hours: number): MyLifeEvent {
  return { timestamp, type: "Ease-off", value: hours, unit: "h", id: crypto.randomUUID() };
}

// --- mapMyLifeToTreatments ---

describe("mapMyLifeToTreatments", () => {
  it("maps a standalone bolus to Correction Bolus", () => {
    const treatments = mapMyLifeToTreatments([bolus("2026-03-19T08:42:00+01:00", 5.0)]);
    expect(treatments).toHaveLength(1);
    expect(treatments[0].event_type).toBe("Correction Bolus");
    expect(treatments[0].insulin).toBe(5.0);
    expect(treatments[0].carbs).toBeNull();
    expect(treatments[0].entered_by).toBe("mylife/CamAPS");
  });

  it("maps a bolus with nearby carbs to Meal Bolus", () => {
    const treatments = mapMyLifeToTreatments([
      bolus("2026-03-19T08:42:00+01:00", 5.0),
      carbs("2026-03-19T08:40:00+01:00", 60),
    ]);
    const bolusT = treatments.find((t) => t.insulin != null);
    expect(bolusT!.event_type).toBe("Meal Bolus");
  });

  it("treats bolus as Correction when carbs are >15 min away", () => {
    const treatments = mapMyLifeToTreatments([
      bolus("2026-03-19T09:00:00+01:00", 3.0),
      carbs("2026-03-19T08:30:00+01:00", 40),
    ]);
    const bolusT = treatments.find((t) => t.insulin != null);
    expect(bolusT!.event_type).toBe("Correction Bolus");
  });

  it("maps Carbohydrates to Carb Correction", () => {
    const treatments = mapMyLifeToTreatments([carbs("2026-03-19T12:00:00+01:00", 45)]);
    expect(treatments).toHaveLength(1);
    expect(treatments[0].event_type).toBe("Carb Correction");
    expect(treatments[0].carbs).toBe(45);
    expect(treatments[0].insulin).toBeNull();
  });

  it("maps Hypo Carbohydrates to Carb Correction with hypo entered_by", () => {
    const treatments = mapMyLifeToTreatments([hypoCarbs("2026-03-19T15:00:00+01:00", 15)]);
    expect(treatments).toHaveLength(1);
    expect(treatments[0].event_type).toBe("Carb Correction");
    expect(treatments[0].carbs).toBe(15);
    expect(treatments[0].entered_by).toContain("Hypo treatment");
  });

  it("maps Basal rate to Temp Basal with duration to next entry", () => {
    const treatments = mapMyLifeToTreatments([
      basalRate("2026-03-19T08:00:00+01:00", 0.8),
      basalRate("2026-03-19T08:10:00+01:00", 1.2),
    ]);
    const first = treatments.find((t) => t.basal_rate === 0.8);
    expect(first!.event_type).toBe("Temp Basal");
    expect(first!.duration).toBe(10); // 10 min until next entry
    expect(first!.basal_rate).toBe(0.8);
  });

  it("caps last basal entry duration at 120 min", () => {
    const treatments = mapMyLifeToTreatments([
      basalRate("2026-03-19T08:00:00+01:00", 0.8),
    ]);
    expect(treatments[0].duration).toBe(120);
  });

  it("maps Boost to Temporary Target with duration in minutes", () => {
    const treatments = mapMyLifeToTreatments([boost("2026-03-19T10:00:00+01:00", 2)]);
    expect(treatments).toHaveLength(1);
    expect(treatments[0].event_type).toBe("Temporary Target");
    expect(treatments[0].duration).toBe(120); // 2h → 120 min
    expect(treatments[0].entered_by).toContain("Boost");
  });

  it("maps Ease-off to Temporary Target with duration in minutes", () => {
    const treatments = mapMyLifeToTreatments([easeOff("2026-03-19T10:00:00+01:00", 3)]);
    expect(treatments).toHaveLength(1);
    expect(treatments[0].event_type).toBe("Temporary Target");
    expect(treatments[0].duration).toBe(180); // 3h → 180 min
    expect(treatments[0].entered_by).toContain("Ease-off");
  });

  it("generates stable deterministic IDs", () => {
    const events = [bolus("2026-03-19T08:42:00+01:00", 5.0)];
    const first = mapMyLifeToTreatments(events);
    const second = mapMyLifeToTreatments(events);
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id).toHaveLength(24);
  });

  it("generates different IDs for different events", () => {
    const treatments = mapMyLifeToTreatments([
      bolus("2026-03-19T08:42:00+01:00", 5.0),
      bolus("2026-03-19T09:00:00+01:00", 3.0),
    ]);
    expect(treatments[0].id).not.toBe(treatments[1].id);
  });

  it("sets ts as ms epoch from created_at", () => {
    const treatments = mapMyLifeToTreatments([bolus("2026-03-19T08:42:00+01:00", 5.0)]);
    expect(treatments[0].ts).toBe(new Date("2026-03-19T08:42:00+01:00").getTime());
  });

  it("handles mixed event types in a single batch", () => {
    const treatments = mapMyLifeToTreatments([
      bolus("2026-03-19T08:42:00+01:00", 5.0),
      carbs("2026-03-19T08:40:00+01:00", 60),
      basalRate("2026-03-19T08:00:00+01:00", 0.8),
      boost("2026-03-19T06:00:00+01:00", 2),
      easeOff("2026-03-19T12:00:00+01:00", 3),
      hypoCarbs("2026-03-19T15:00:00+01:00", 15),
    ]);
    expect(treatments).toHaveLength(6);

    const types = treatments.map((t) => t.event_type);
    expect(types).toContain("Meal Bolus"); // bolus near carbs
    expect(types).toContain("Carb Correction");
    expect(types).toContain("Temp Basal");
    expect(types).toContain("Temporary Target");
  });

  it("returns empty array for empty input", () => {
    expect(mapMyLifeToTreatments([])).toEqual([]);
  });
});

// --- treatmentToNightscout ---

describe("treatmentToNightscout", () => {
  it("converts a bolus treatment to NS format", () => {
    const treatments = mapMyLifeToTreatments([bolus("2026-03-19T08:42:00+01:00", 5.0)]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns._id).toBe(treatments[0].id);
    expect(ns.eventType).toBe("Correction Bolus");
    expect(ns.created_at).toBe("2026-03-19T08:42:00+01:00");
    expect(ns.insulin).toBe(5.0);
    expect(ns.enteredBy).toBe("mylife/CamAPS");
    expect(ns.utcOffset).toBe(60);
    expect(ns).not.toHaveProperty("carbs");
    expect(ns).not.toHaveProperty("absolute");
    expect(ns).not.toHaveProperty("duration");
  });

  it("converts a Temp Basal to NS format with absolute field", () => {
    const treatments = mapMyLifeToTreatments([
      basalRate("2026-03-19T08:00:00+01:00", 0.8),
    ]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns.eventType).toBe("Temp Basal");
    expect(ns.absolute).toBe(0.8);
    expect(ns.duration).toBe(120);
    expect(ns).not.toHaveProperty("insulin");
    expect(ns).not.toHaveProperty("carbs");
  });

  it("adds notes for hypo treatment", () => {
    const treatments = mapMyLifeToTreatments([hypoCarbs("2026-03-19T15:00:00+01:00", 15)]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns.notes).toBe("Hypo treatment");
    expect(ns.carbs).toBe(15);
  });

  it("adds notes for Boost", () => {
    const treatments = mapMyLifeToTreatments([boost("2026-03-19T10:00:00+01:00", 2)]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns.notes).toBe("CamAPS Boost");
    expect(ns.duration).toBe(120);
  });

  it("adds notes for Ease-off", () => {
    const treatments = mapMyLifeToTreatments([easeOff("2026-03-19T10:00:00+01:00", 3)]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns.notes).toBe("CamAPS Ease-off");
    expect(ns.duration).toBe(180);
  });

  it("computes correct utcOffset from timestamp", () => {
    const treatments = mapMyLifeToTreatments([bolus("2026-06-19T08:42:00+02:00", 5.0)]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns.utcOffset).toBe(120); // CEST = +02:00 = 120 min
  });

  it("handles UTC timestamp", () => {
    const treatments = mapMyLifeToTreatments([bolus("2026-03-19T08:42:00+00:00", 5.0)]);
    const ns = treatmentToNightscout(treatments[0]);
    expect(ns.utcOffset).toBe(0);
  });
});
