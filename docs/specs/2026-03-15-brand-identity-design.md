# Brand Identity Design

## Summary

Establish a distinctive brand identity for Springa that can compete visually with Strava and Runna. Replace the current retrowave-gradient treatment with a mature, ownable visual identity built on strong typography and a signature color.

## Decisions

### Visual Direction

**Move away from retrowave as an identity.** Keep what works (dark UI, high-contrast accents, energetic feel), lose the trend label (neon glow, gradient-on-everything, synthwave excess). The result doesn't scream "retrowave" — it screams "Springa."

- Dark backgrounds stay — not because retrowave, because it's ours
- Cyan + pink accent range used with restraint, not sprayed on everything
- No glow effects or `drop-shadow` neon treatments
- Gradients become a special treatment for emphasis, not the baseline

### Brand Color

**Sport Magenta: `#e8368f`**

Primary brand color replacing `#ff2d95` (hot pink). Slightly less neon, more athletic. Used for:
- Wordmark
- Primary buttons
- Card accents and active states
- Outline button borders

Cyan (`#00ffff`) remains as a secondary accent (active nav items, data highlights) but is not the brand color.

### Wordmark

**Font:** Sora 800 (Google Fonts)
**Case:** Lowercase — `springa`
**Treatment:** Solid sport magenta (`#e8368f`). No gradient by default.
**Tracking:** Tight, `letter-spacing: -0.5px` at header size

The wordmark must work in:
- Sport magenta on dark (`#1e1535`) — primary usage
- White on dark — secondary/monochrome
- Dark on light — print/external contexts

### Logo Mark

**Blocked — separate task.** Two candidate directions exist as Gemini raster outputs. Neither has been chosen as final. Vectorization and final selection happen in a follow-up task.

Candidates:
1. **Speed Blade** — abstract forward-leaning shape, maximum forward energy, doesn't read as an S
2. **Swooping S** — two crescent strokes with negative space, reads as an S, enables S→wordmark animation

The mark will be used for: favicon, app icon, loading states, social avatars. Until the mark is finalized, use a simple text "s" (lowercase) in Sora 800 as the favicon.

### Color System Update

| Role | Old | New |
|------|-----|-----|
| Brand primary | `#ff2d95` (hot pink) | `#e8368f` (sport magenta) |
| Secondary accent | `#00ffff` (cyan) | `#00ffff` (cyan) — unchanged |
| Dark background | `#0d0a1a` | `#0d0a1a` — unchanged |
| Surface | `#1e1535` | `#1e1535` — unchanged |
| Border | `#3d2b5a` | `#3d2b5a` — unchanged |
| Muted text | `#b8a5d4` | `#b8a5d4` — unchanged |
| Glow/neon effects | Various `drop-shadow` + `box-shadow` with color spreads | Remove entirely |

### What Gets Removed

- Gradient text treatment on the wordmark (`bg-[linear-gradient(135deg,#00ffff,#d946ef,#ff2d95)]`)
- `drop-shadow` neon glow effects on interactive elements
- Neon `box-shadow` spreads (e.g. `shadow-[0_0_12px_rgba(255,107,138,0.4)]`)
- `retro-scanline-static` CSS class and any scanline effects
- The rabbit emoji on the login page (replaced by "s" in Sora until mark is ready)

## Implementation Scope

This spec covers **wordmark + color swap + glow removal** only. Logo mark is a separate follow-up task.

### 1. Wordmark

- Add Sora font to `app/layout.tsx` via `next/font/google` (only used for wordmark, not body text)
- Update header in `app/page.tsx` — replace gradient+glow classes with Sora 800, solid `#e8368f`
- Update login page in `app/login/page.tsx` — same treatment, replace rabbit emoji with "S" in Sora

### 2. Brand color swap (`#ff2d95` → `#e8368f`)

29 files reference the old color. Find with: `grep -r "#ff2d95\|rgba(255,45,149" app/`

Files to update (exhaustive list):
- `app/page.tsx`
- `app/login/page.tsx`
- `app/feedback/page.tsx`
- `app/components/ActionBar.tsx`
- `app/components/CalendarView.tsx`
- `app/components/CarbsWidget.tsx`
- `app/components/ChatInput.tsx`
- `app/components/ChatMessage.tsx`
- `app/components/DayCell.tsx`
- `app/components/ErrorCard.tsx`
- `app/components/EventModal.tsx`
- `app/components/FeedbackWidget.tsx`
- `app/components/FitnessChart.tsx`
- `app/components/PhaseTracker.tsx`
- `app/components/PreRunCarbsInput.tsx`
- `app/components/PreRunCarbsWidget.tsx`
- `app/components/ReadinessPanel.tsx`
- `app/components/RouteMap.tsx`
- `app/components/SettingsModal.tsx`
- `app/components/TabBar.tsx`
- `app/components/TabNavigation.tsx`
- `app/components/VolumeTrendChart.tsx`
- `app/components/WeeklyVolumeChart.tsx`
- `app/components/WidgetList.tsx`
- `app/components/WorkoutCard.tsx`
- `app/components/WorkoutList.tsx`
- `app/screens/CoachScreen.tsx`
- `app/screens/IntelScreen.tsx`
- `app/screens/PlannerScreen.tsx`

### 3. Glow removal

Remove neon glow effects. These patterns appear in the codebase:

| Pattern | Replacement | Where |
|---------|-------------|-------|
| `drop-shadow-[0_0_Npx_rgba(...)]` | Remove entirely | `app/page.tsx` wordmark hover |
| `shadow-[0_0_Npx_rgba(255,107,138,...)]` | Remove or replace with subtle `shadow-md` | `app/components/ActionBar.tsx` buttons |
| `shadow-[0_2px_12px_rgba(255,45,149,0.15)]` | Replace with `shadow-sm` or remove | `app/page.tsx` header bar |
| `retro-scanline-static` class | Remove class usage and CSS definition | `app/components/ActionBar.tsx` |

Rule: if the shadow provides depth/elevation, replace with a standard Tailwind shadow (`shadow-sm`, `shadow-md`). If it's purely a glow effect, remove entirely.

## Out of Scope

- Logo mark vectorization and implementation (separate task)
- Full app-wide color system refactor / Tailwind theme tokenization (separate task)
- Body text font change (Geist Sans stays)
- Marketing/landing page design
