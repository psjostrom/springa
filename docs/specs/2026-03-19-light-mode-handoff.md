# Light Mode — Handoff & Design Debt Analysis

## What Was Done

1. **Two-layer CSS variable system** for runtime theme switching:
   - `--theme-*` vars on `:root` (dark defaults) and `html.light` (light overrides)
   - `@theme inline` references them via `var()` so Tailwind utilities resolve at runtime
   - Required because Tailwind v4 inlines color values at build time — plain `@theme` overrides don't work

2. **Light mode token values defined** in `globals.css` under `html.light`

3. **Theme toggle** (Sun/Moon icon) added to header bar in `app/page.tsx` with localStorage persistence

4. **~160 `text-white` replaced with `text-text`** across all components (kept `text-white` only on solid-color buttons like `bg-brand`)

5. **Hardcoded hex migrated to `var()` references** in prose styles (`.prose-analysis`, `.prose-patterns`)

6. **Skeleton shimmer**, **splash background**, and **date input `color-scheme`** adapted for light mode

7. **New token added**: `--color-surface-alt` for nested card backgrounds

## The Core Problem: Dark Mode Design Debt

The dark mode has **5 background colors that are visually near-identical**:

| Token | Dark value | Light value | Delta from bg (dark) | Delta from bg (light) |
|-------|-----------|-------------|---------------------|----------------------|
| `bg` | `#13101c` | `#f5f3f8` | 0 (base) | 0 (base) |
| `surface` | `#1d1828` | `#ffffff` | ~10 lightness | ~5 lightness |
| `surface-alt` | `#241e30` | `#f0edf5` | ~14 lightness | ~3 lightness |
| `border` | `#2e293c` | `#ddd8e6` | ~20 lightness | ~15 lightness |
| `border-subtle` | `#4a4358` | `#ece8f2` | ~35 lightness | ~2 lightness |

In dark mode, `bg`, `surface`, `surface-alt`, and `border` are all dark purples within a narrow ~20-point lightness band. Components used them interchangeably for card backgrounds because they looked the same. In light mode, these spread across a wide range and the inconsistency is impossible to ignore.

## The Inconsistency Map

Components use background tokens for the SAME visual role (card background) with DIFFERENT tokens:

### "Nested card inside a section" role — uses 3 different tokens:
- `bg-surface-alt` — PacePBs inner cards, StatsWidget cards, ReadinessPanel metric cards, HRZoneBreakdown tracks
- `bg-border` — WorkoutCard notes section, ClothingRecommendation badges, EventModal stats grid, CalendarView day headers, PreRunCarbsInput container, FitnessInsightsPanel form zone banners
- `bg-bg` — FitnessChart toggle buttons, PreRunReadiness container, CarbsWidget inputs, various input fields

### "Top-level section card" role — uses 2 different tokens:
- `bg-surface` — most section cards (PhaseTracker, PacePBs outer, BGCompact outer, SettingsModal, etc.)
- `bg-border` — PreRunCarbsInput container (should be surface)
- `bg-bg` — PreRunReadiness container, BGGraphPopover (should be surface)

### "Button/interactive element" role — uses 3 different tokens:
- `bg-border` — secondary buttons, toggle active states, drag states
- `bg-bg` — toggle inactive states, some input fields
- `bg-surface` — some button containers

### "Progress bar track" role — uses 2 different tokens:
- `bg-surface-alt` — HRZoneBreakdown, PhaseTracker
- `bg-bg` — ReadinessPanel gradient bar
- `bg-surface` — VolumeCompact progress track

## What Needs to Happen

### Step 1: Establish strict background hierarchy (3 levels max)

Every background usage must map to exactly ONE of these roles:

| Role | Token | Dark | Light | Used for |
|------|-------|------|-------|----------|
| **Canvas** | `bg` | `#13101c` | `#f5f3f8` | Page backgrounds, screen containers |
| **Card** | `surface` | `#1d1828` | `#ffffff` | ALL top-level section cards, modals, popovers |
| **Inset** | `surface-alt` | `#241e30` | `#f0edf5` | ALL nested cards, input fields, progress bar tracks, code blocks, toggle inactive states |

The `border` token should ONLY be used for actual borders and grid gap fills — never as a card/panel/button background.

### Step 2: Audit every `bg-border` usage that isn't a grid gap

These are the violations — `bg-border` used as a background:

| File | Usage | Should be |
|------|-------|-----------|
| `WorkoutCard.tsx` | Notes section bg | `bg-surface-alt` |
| `ClothingRecommendation.tsx` | Clothing item badges | `bg-surface-alt` |
| `EventModal.tsx` | Stats grid, button bgs | `bg-surface-alt` (grid), keep for buttons |
| `PreRunCarbsInput.tsx` | Container bg | `bg-surface` (top-level) |
| `FeedbackWidget.tsx` | Button backgrounds | `bg-surface-alt` |
| `FitnessInsightsPanel.tsx` | Form zone "Grey" banner | `bg-surface-alt` |
| `WorkoutList.tsx` | Code block bg | `bg-surface-alt` |
| `WidgetList.tsx` | Dragging row state | `bg-surface-alt` |
| `IntelScreen.tsx` | Widget heading badge, buttons | `bg-surface-alt` |
| `AgendaView.tsx` | Planned event badge | `bg-surface-alt` |

Keep `bg-border` ONLY for:
- `CalendarView.tsx` grid gap fills (`gap-px bg-border`)
- `CalendarView.tsx` day header cells (these ARE the grid structure)
- `active:bg-border` press states (momentary, fine)

### Step 3: Audit every `bg-bg` usage that isn't a page canvas

| File | Usage | Should be |
|------|-------|-----------|
| `BGGraphPopover.tsx` | Modal container | `bg-surface` |
| `PreRunReadiness.tsx` | Container | `bg-surface` |
| `FitnessChart.tsx` | Toggle inactive | `bg-surface-alt` |
| `CarbsWidget.tsx` | Input bg | `bg-surface-alt` |
| `PreRunCarbsWidget.tsx` | Input bg | `bg-surface-alt` |
| `SettingsModal.tsx` | Input bgs | `bg-surface-alt` |
| `EventModal.tsx` | Input bg | `bg-surface-alt` |
| `ChatInput.tsx` | Textarea bg | `bg-surface-alt` |
| `BGScatterChart.tsx` | Tooltip bg | `bg-surface` |

Keep `bg-bg` ONLY for:
- Screen-level containers (`CalendarScreen`, `CoachScreen`, `IntelScreen`, `PlannerScreen`, `SimulateScreen`)
- The `ReadinessPanel` progress bar track (lowest visual level inside a card)

### Step 4: Verify `bg-surface` isn't used for nested elements

Some components use `bg-surface` for things inside other `bg-surface` cards — this creates zero contrast (white-on-white in light mode):

| File | Usage | Should be |
|------|-------|-----------|
| `ChatMessage.tsx` | Assistant message bubble (inside chat surface) | `bg-surface-alt` |
| `VolumeCompact.tsx` | Progress bar track (inside surface card) | `bg-surface-alt` |

### Step 5: Re-evaluate `border-subtle` light mode value

Currently `#ece8f2` — almost invisible on `#f5f3f8` canvas. Consider making it slightly more visible, around `#e0dae8`.

## Files Changed So Far

- `app/globals.css` — theme system, light mode values, prose/skeleton/splash fixes
- `app/page.tsx` — theme toggle, `text-text` on main container
- `app/components/*.tsx` — `text-white` -> `text-text` (bulk replace)
- `lib/eventStyles.ts` — `text-white` -> `text-text`
- `app/components/ReadinessPanel.tsx` — wrapped in surface card, TSB neutral -> surface-alt
- `app/components/BGCompact.tsx` — category cards -> surface-alt
- `app/components/PacePBs.tsx` — inner cards -> surface-alt, hardcoded #6b5f80 -> text-muted/70
- `app/components/FitnessInsightsPanel.tsx` — stat cards -> surface-alt
- Various components — `bg-border rounded` -> `bg-surface-alt rounded` (bulk sed)

## Token Reference (Current State)

### globals.css `:root` (dark)
```
--theme-bg: #13101c
--theme-surface: #1d1828
--theme-surface-alt: #241e30
--theme-border: #2e293c
--theme-border-subtle: #4a4358
--theme-muted: #af9ece
--theme-text: #ffffff
--theme-brand: #f23b94
--theme-brand-btn: #d42c85
--theme-brand-hover: #d42f7e
```

### globals.css `html.light`
```
--theme-bg: #f5f3f8
--theme-surface: #ffffff
--theme-surface-alt: #f0edf5
--theme-border: #ddd8e6
--theme-border-subtle: #ece8f2
--theme-muted: #6e5f85
--theme-text: #1a1525
--theme-brand: #e0287f
--theme-brand-btn: #c82275
--theme-brand-hover: #b51e6b
```
