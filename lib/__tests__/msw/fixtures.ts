import type { IntervalsActivity } from "../../types";

// --- ACTIVITIES ---

export const sampleActivities: IntervalsActivity[] = [
  {
    id: "act-long-1",
    start_date: "2026-02-08T10:00:00Z",
    start_date_local: "2026-02-08T10:00:00",
    name: "W03 Sun Long (10km) eco16",
    description:
      "Long run at easy pace. This is the most important run of the week.\n\nWarmup\n- 1km 66-78% LTHR (112-132 bpm)\n\nMain set\n- 8km 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 1km 66-78% LTHR (112-132 bpm)\n",
    type: "Run",
    distance: 10000,
    moving_time: 4020,
    average_heartrate: 138,
    max_heartrate: 155,
    icu_training_load: 65,
    icu_intensity: 78,
    icu_hr_zone_times: [120, 1800, 1500, 500, 100],
    pace: 2.49, // m/s
  },
  {
    id: "act-easy-1",
    start_date: "2026-02-10T12:00:00Z",
    start_date_local: "2026-02-10T12:00:00",
    name: "W04 Tue Easy eco16",
    description:
      "Steady easy running to build your aerobic base.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 40m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
    type: "Run",
    distance: 6500,
    moving_time: 2700,
    average_heartrate: 125,
    max_heartrate: 140,
    icu_training_load: 35,
    icu_intensity: 65,
    icu_hr_zone_times: [300, 2100, 250, 50, 0],
    pace: 2.41,
  },
  {
    id: "act-interval-1",
    start_date: "2026-02-12T12:00:00Z",
    start_date_local: "2026-02-12T12:00:00",
    name: "W04 Thu Short Intervals eco16",
    description:
      "Short, punchy efforts to build leg speed and running economy.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set 6x\n- 2m 89-99% LTHR (150-167 bpm)\n- 2m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
    type: "Run",
    distance: 7200,
    moving_time: 2400,
    average_heartrate: 152,
    max_heartrate: 178,
    icu_training_load: 55,
    icu_intensity: 92,
    icu_hr_zone_times: [60, 600, 480, 960, 300],
    pace: 3.0,
  },
];

// --- EVENTS (planned workouts) ---

export const sampleEvents = [
  {
    id: 1001,
    category: "WORKOUT",
    start_date_local: "2026-02-10T12:00:00",
    name: "W04 Tue Easy eco16",
    description:
      "Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 40m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
    paired_activity_id: "act-easy-1",
    carbs_per_hour: 48,
  },
  {
    id: 1002,
    category: "WORKOUT",
    start_date_local: "2026-02-17T12:00:00",
    name: "W05 Tue Easy + Strides eco16",
    description:
      "Easy run with strides at the end. The main run should be fully conversational — save your energy. After the easy portion, do 4 short strides: accelerate smoothly to near-sprint over 20 seconds, then walk/jog back. Strides build neuromuscular speed without creating fatigue.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set\n- 40m 66-78% LTHR (112-132 bpm)\n\nStrides 4x\n- 20s 99-111% LTHR (167-188 bpm)\n- 1m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
    carbs_per_hour: 48,
  },
  {
    id: 1003,
    category: "WORKOUT",
    start_date_local: "2026-02-19T12:00:00",
    name: "W05 Thu Hills eco16",
    description:
      "Hill reps build strength and power that translates directly to EcoTrail's terrain. Outdoors: find a steady hill with a moderate gradient.\n\nWarmup\n- 10m 66-78% LTHR (112-132 bpm)\n\nMain set 6x\n- Uphill 2m 99-111% LTHR (167-188 bpm)\n- Downhill 3m 66-78% LTHR (112-132 bpm)\n\nCooldown\n- 5m 66-78% LTHR (112-132 bpm)\n",
    carbs_per_hour: 30,
  },
];

// --- STREAMS ---

// Time span: 0 to 900 seconds (15 min) — must exceed 0.2 hours (720s)
// so analyzeRun's trend calculation fires.
export const sampleStreams = [
  {
    type: "time",
    data: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    type: "heartrate",
    data: [110, 120, 130, 140, 150, 155, 148, 135, 125, 118],
  },
  {
    type: "velocity_smooth",
    data: [2.5, 2.6, 2.7, 2.8, 2.9, 3.0, 2.8, 2.6, 2.5, 2.4],
  },
  {
    // glucose in mg/dL (will be auto-converted to mmol/L)
    type: "bloodglucose",
    data: [180, 170, 162, 155, 148, 142, 138, 135, 130, 126],
  },
];
