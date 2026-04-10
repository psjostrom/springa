# Workout Types & Examples

Reference documentation for workout generation. Read this when working on `lib/workoutGenerators.ts`, `lib/descriptionBuilder.ts`, or the BG model fuel rate system.

## Training Philosophy

Inspired by **Ben Parkes' half marathon plan** — pace-based training with workout variety, progressive long runs, and a strong emphasis on keeping easy runs truly easy.

## Workout Types

The plan uses rotating workout types to keep training varied and engaging. Every quality session is different.

### Easy Day Variants

#### Easy Run

Pure easy pace. Conversational. The foundation of the plan. Duration follows the Ben Parkes progression: starts at ~5k and builds to ~8k during peak weeks, then drops back for taper/race prep. Recovery weeks also use a shorter duration.

- **Pace:** Easy (30-94% pace)
- **HR:** Z2
- **T1D:** Pump off, moderate fuel
- **Duration formula:** Total = `20 + Math.round(progress * 25) + 15` min, split as WU 10m + main + CD 15m. Main step = total − 25. Recovery/taper/race-test: 35m total (10m main). Race week shakeout: 30m total (10m main, 10m CD).

#### Easy Run + Strides

Easy run with 4–6x 20-second bursts at 95% effort, 45–60 seconds easy jog between each. Add strides in the second half of the run. Great for form, neuromuscular activation, and breaking up monotony.

- **Base pace:** Easy (30-94% pace)
- **Strides:** Hard effort — short enough that BG impact is minimal
- **T1D:** Same as easy run — the strides are too short to trigger significant adrenaline response

### Speed / Quality Session Variants (Thursday)

All speed sessions follow the structure: **10m easy warmup → main set → 5m easy cooldown**. The main set format rotates week to week. **Recovery between reps is always a walk** (Z1), not an easy jog — this follows Ben Parkes' approach and is easier on BG.

#### Short Intervals

High turnover, shorter reps. Good for speed and form.

- **Example:** 6x 2m at interval pace, 2m walk recovery
- **Pace:** Interval (106-111% pace)
- **HR:** Z4
- **Progression:** Increase reps (6x → 8x) or reduce recovery

#### Long Intervals

Sustained harder efforts. Builds lactate tolerance.

- **Example:** 4x 5m at interval pace, 2m walk recovery
- **Pace:** Interval (106-111% pace)
- **HR:** Z4
- **Progression:** Increase rep duration (4m → 5m → 6m) or add reps

#### Distance Intervals

Measured reps for pacing practice.

- **Example:** 8x 800m at interval pace, 200m walk recovery
- **Pace:** Interval (106-111% pace)
- **HR:** Z4
- **Progression:** Increase distance (600m → 800m → 1km) or add reps

#### Hills

Trail-specific strength work. Uphill hard, downhill easy.

- **Example:** 6x 2m uphill at hard effort, 3m easy downhill jog recovery
- **Pace:** Hard effort uphill — pace is slow but effort is high
- **HR:** Z5 on the way up, Z2 on the way down
- **Progression:** Increase reps or hill duration
- **Note:** Pace targets don't apply uphill — use effort only

#### Race Pace Intervals

Practice goal race pace in a structured session. Used closer to race day.

- **Example:** 5x 5m at race pace, 2m walk recovery
- **Pace:** Race Pace (99-102% pace)
- **HR:** Z3
- **Progression:** Increase rep duration or reduce recovery

### Club Run (On-Demand Only)

Trail running club session. Not part of the weekly plan — generate on-demand via the workout generator when attending club.

- **Time:** 18:30 (club meeting time)
- **Duration:** 60 min
- **Pace:** Variable — let the club workout dictate (easy, intervals, hills, etc.)
- **HR:** No fixed target — intensity varies week to week
- **Fuel:** Uses interval fuel rate from plan context
- **T1D:** Pump off, fuel based on expected workout type


### Long Run Variants (Sunday)

#### Long Run — All Easy

The default. Build distance safely at easy pace. Used in early weeks, recovery weeks, and taper.

- **Pace:** Easy (30-94% pace) for the entire run
- **HR:** Z2
- **T1D:** Pump off, high fuel (60 g/h)

#### Long Run — Race Pace Sandwich

Easy warm-up → race pace block → easy cool-down. The race pace block grows as the plan progresses (2km → 3km → 5km). Used in build weeks to practice race effort within a long run.

- **Structure:** e.g., 3km easy → 3km race pace → 3km easy
- **Easy sections:** Z2
- **Race pace section:** Z3
- **T1D:** Pump off, high fuel — the race pace block may stabilize BG slightly compared to all-easy

### Speed Session Rotation (Example)

To keep things varied, rotate through the formats across the plan:

| Week | Thursday Session                    |
| ---- | ----------------------------------- |
| 1    | Short Intervals (6x 2m)             |
| 2    | Hills (6x 2m)                       |
| 3    | Long Intervals (4x 4m)              |
| 4    | Recovery week — no speed            |
| 5    | Distance Intervals (8x 800m)        |
| 6    | Short Intervals (8x 2m)             |
| 7    | Hills (8x 2m)                       |
| 8    | Recovery week — no speed            |
| 9    | Long Intervals (4x 5m)              |
| 10   | Distance Intervals (6x 1km)         |
| 11   | Race Pace Intervals (5x 5m) — taper |
| 12   | Race week — shakeout only           |

## Full Workout Examples

The generator MUST output descriptions matching these patterns exactly. Descriptions contain only notes and structured workout steps — no fuel data. Fuel is sent via `carbs_per_hour` on the API event and stored as `fuelRate` (g/h) on `WorkoutEvent`.

### Example A: Short Intervals

**Name:** `W01 Short Intervals eco16`
**fuelRate:** `30` (g/h → `carbs_per_hour: 30`)
**Description:**

```text
Short, punchy efforts to build leg speed and running economy.

Warmup
- 10m 30-94% pace

Main set 6x
- 2m 106-111% pace
- Walk 2m

Cooldown
- 5m 30-94% pace
```

### Example B: Hills

**Name:** `W02 Hills eco16`
**fuelRate:** `30` (g/h → `carbs_per_hour: 30`)
**Description:**

```text
Hill reps build strength and power that translates directly to EcoTrail's terrain.

Warmup
- 10m 30-94% pace

Main set 6x
- Uphill 2m hard effort
- Downhill 3m easy jog

Cooldown
- 5m 30-94% pace
```

### Example C: Long Run — All Easy

**Name:** `W01 Long (8km) eco16`
**fuelRate:** `60` (g/h → `carbs_per_hour: 60`)
**Description:**

```text
Long run at easy pace. This is the most important run of the week.

Warmup
- 1km 30-94% pace

Main set
- 5km 30-94% pace

Cooldown
- 2km 30-94% pace
```

Note: Long runs keep the warmup/cooldown structure even when all-easy for psychological bookends and consistency with sandwich/progressive variants. The 2km cooldown serves as a "stop fueling" signal — Garmin vibrates on the step change.

### Example D: Long Run — Race Pace Sandwich

**Name:** `W05 Long (12km) eco16`
**fuelRate:** `60` (g/h → `carbs_per_hour: 60`)
**Description:**

```text
Long run with a 3km race pace block sandwiched in the middle.

Warmup
- 1km 30-94% pace

Main set
- 3km 30-94% pace
- 3km 99-102% pace
- 3km 30-94% pace

Cooldown
- 2km 30-94% pace
```

### Example E: Easy Run

**Name:** `W01 Easy eco16`
**fuelRate:** `48` (g/h → `carbs_per_hour: 48`)
**Description:**

```text
Steady easy running to build your aerobic base. This should feel comfortable and conversational the entire way. If you can't chat in full sentences, slow down. Easy days make hard days possible.

Warmup
- 10m 30-94% pace

Main set
- 10m 30-94% pace

Cooldown
- 15m 30-94% pace
```

Note: Easy runs use WU/main/CD structure even though all zones are the same. The extended 15m cooldown serves as a "stop fueling" signal — Garmin vibrates on the step change, cueing the runner to stop eating.

### Example F: Easy Run + Strides

**Name:** `W02 Easy + Strides eco16`
**fuelRate:** `48` (g/h → `carbs_per_hour: 48`)
**Description:**

```text
Easy run with strides at the end.

Warmup
- 10m 30-94% pace

Main set
- 11m 30-94% pace

Strides 4x
- 20s hard effort
- 1m easy jog

Cooldown
- 15m 30-94% pace
```

Note: Easy + Strides keeps the warmup/cooldown structure because strides are in a different HR zone (Z5). The 15m cooldown is the fuel taper signal.

### Example G: Bonus Easy

**Name:** `W03 Bonus Easy eco16`
**fuelRate:** `48` (g/h → `carbs_per_hour: 48`)
**Description:**

```text
The Saturday bonus. Let's be honest — there's maybe a 20% chance this actually happens. If your legs say no, listen to them. If they say yes, enjoy 20 easy minutes with zero expectations. No pace, no plan. Just a gift to future you.

Warmup
- 10m 30-94% pace

Main set
- 20m 30-94% pace

Cooldown
- 15m 30-94% pace
```
