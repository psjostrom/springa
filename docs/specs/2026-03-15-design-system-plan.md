# Design System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retrowave visual identity with a clean, WCAG AAA-compliant design system — new palette, typography hierarchy, state patterns, and splash screen.

**Architecture:** Six sequential tasks: (1) CSS custom properties foundation, (2) mechanical palette swap via sed, (3) cyan case-by-case review, (4) retrowave effect removal + state pattern replacements, (5) splash screen replacement, (6) ad-hoc color normalization + final verification. Each task is independently committable.

**Tech Stack:** Next.js, Tailwind CSS, CSS custom properties

**Spec:** `docs/specs/2026-03-15-design-system.md`

**Note:** The brand identity work (Sora wordmark, `#ff2d95` → `#e8368f` swap) was already shipped in a prior session. This plan builds on top of that — it swaps `#e8368f` → `#f23b94` among other changes.

---

## Chunk 1: Foundation + Mechanical Swap

### Task 1: CSS Custom Properties + globals.css Cleanup

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add CSS custom properties to `:root`**

Add to the existing `:root` block in `globals.css`:

```css
--color-bg: #13101c;
--color-surface: #1d1828;
--color-border: #2e293c;
--color-muted: #af9ece;
--color-text: #ffffff;
--color-brand: #f23b94;
--color-brand-btn: #d42c85;
--color-brand-hover: #d42f7e;
--color-border-subtle: #4a4358;
```

- [ ] **Step 2: Remove all retro CSS from globals.css**

Delete the following blocks entirely (search by name, remove the full rule/keyframe):
- `--neon-glow` and `--color-border-neon` CSS variables
- `.splash-glow` class
- `.splash-floor` class
- `.splash-grid` class
- `@keyframes splash-grid-flow`
- `@keyframes splash-logo-pulse`
- `@keyframes retro-border-flow`
- `@keyframes retro-glow-pulse`
- `@keyframes retro-adapt-glow`
- `@keyframes retro-text-flicker`
- `.retro-error-border` class
- `.retro-success-border` class
- `.retro-adapt-border` class
- `.retro-upload-border` class
- `.retro-text-flicker` class
- `.retro-btn-uploading` class and its `::after` pseudo-element
- `.retro-btn-adapting` class and its `::after` pseudo-element
- Any `@media (prefers-reduced-motion)` blocks that reference retro classes

Keep the `.splash` class but simplify it to a centered flexbox on `#13101c` background (no gradient):

```css
.splash {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #13101c;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 3: Add new utility animations**

Add to globals.css (replacements for retro effects):

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes gentle-pulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}
```

- [ ] **Step 4: Verify no retro references remain in globals.css**

Run: `grep -n "retro\|neon\|splash-glow\|splash-floor\|splash-grid" app/globals.css`
Expected: Only the simplified `.splash` class remains. Zero retro/neon matches.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds (CSS-only changes, components still reference old classes but they're now undefined — harmless until Task 4 cleans them up).

- [ ] **Step 6: Commit**

```
refactor: add CSS custom properties and remove retro CSS

Add design system color tokens to :root.
Remove all retro-* keyframes, classes, and neon variables.
Simplify splash class. Add shimmer/spin/pulse utilities.
```

### Task 2: Mechanical Palette Swap

Global find-replace of old palette colors → new palette colors. This is a sed-only task — no judgment calls.

**All files in `app/` matching the old colors.**

- [ ] **Step 1: Run palette replacements**

```bash
# Background
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#0d0a1a/#13101c/g'

# Surface
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#1e1535/#1d1828/g'

# Border
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#3d2b5a/#2e293c/g'

# Muted text (old purple)
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#b8a5d4/#af9ece/g'

# Hover background
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#2a1f3d/#2e293c/g'

# Light purple text
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#c4b5fd/#af9ece/g'

# Brand color update (from prior session's value to new AAA value)
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#e8368f/#f23b94/g'

# Brand hover update
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#c52e7a/#d42f7e/g'

# rgba references to old brand
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/rgba(232,54,143/rgba(242,59,148/g'
```

- [ ] **Step 2: Verify manifest.ts was updated**

Run: `grep -n "color" app/manifest.ts`
Expected: `theme_color: "#13101c"` and `background_color: "#13101c"`.

- [ ] **Step 3: Verify no old palette colors remain**

Run: `grep -rn "#0d0a1a\|#1e1535\|#3d2b5a\|#b8a5d4\|#2a1f3d\|#c4b5fd\|#e8368f\|#c52e7a" app/ --include='*.tsx' --include='*.ts' --include='*.css'`
Expected: No output (zero matches).

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: Both pass.

- [ ] **Step 5: Commit**

```
style: swap palette to design system colors

Background #0d0a1a → #13101c, surface #1e1535 → #1d1828,
border #3d2b5a → #2e293c, muted #b8a5d4 → #af9ece,
brand #e8368f → #f23b94. All WCAG AAA compliant.
```

### Task 3: Cyan Case-by-Case Review

Cyan (`#00ffff`) stays ONLY on blood sugar data. Every other usage changes to brand (`#f23b94`) or muted (`#af9ece`).

**Files (22 files have cyan references):**

- [ ] **Step 1: Change non-BG cyan to brand/muted**

These files use cyan for non-BG purposes. Change each reference:

**`app/components/TabNavigation.tsx`:**
- `hover:text-[#00ffff]` → `hover:text-[#f23b94]` (hover state)
- Remove `drop-shadow` filter on active tab icons (line ~71, `style={...filter: "drop-shadow(...)"}` → remove the `style` prop entirely)

**`app/components/DayCell.tsx`:**
- `ring-[#00ffff]` → `ring-[#f23b94]` (today ring)
- `text-[#00ffff]` → `text-[#f23b94]` (today date number)

**`app/screens/SimulateScreen.tsx`:**
- `accent-[#00ffff]` → `accent-[#f23b94]` (range slider, 3 occurrences)

**`app/components/ActionBar.tsx`:**
- `text-[#00ffff]` on syncing title → `text-white` (it's a title, should be white per typography rules)
- `text-[#00ffff]` on sync-ready title → `text-white`

**`app/screens/PlannerScreen.tsx`:**
- `text-[#00ffff]` on adapting text → `text-white`
- `text-[#00ffff]` on adapt status → `text-[#af9ece]` (secondary text)
- `bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30` on adapt pills → `bg-[#f23b94]/20 text-[#f23b94] border border-[#f23b94]/30`
- `bg-[#00ffff]/10 text-[#00ffff] border border-[#00ffff]/30 hover:bg-[#00ffff]/20` on adapt button → `bg-[#f23b94]/10 text-[#f23b94] border border-[#f23b94]/30 hover:bg-[#f23b94]/20`
- Remove `from-[#6c3aed]/5 via-transparent to-[#00ffff]/5` gradient overlay

**`app/feedback/page.tsx`:**
- All `text-[#00ffff]` → `text-[#f23b94]`
- All `border-[#00ffff]/30` → `border-[#f23b94]/30`
- All `bg-[#00ffff]/10` → `bg-[#f23b94]/10`
- All `bg-[#00ffff]/20` → `bg-[#f23b94]/20`

**`app/page.tsx`:**
- `hover:text-[#00ffff]` on settings button → `hover:text-[#f23b94]`
- Splash SVG cyan references will be removed entirely in Task 5

**`app/components/ChatMessage.tsx`:**
- `text-[#00ffff]` on inline code → `text-[#f23b94]`
- `text-[#00ffff]` on links → `text-[#f23b94]`

**`app/components/PhaseTracker.tsx`:**
- `bg-[#00ffff]` on dot → `bg-[#f23b94]`

**`app/globals.css`:**
- `--accent-cyan: #00ffff` → keep (it's a named token, consumers will be updated individually)
- `.prose-patterns h2 { color: #00ffff }` → `color: #f23b94`
- `.prose-patterns code { color: #00ffff }` → `color: #f23b94`
- Retro animation gradients referencing `#00ffff` should already be removed by Task 1. Verify none remain.

**`app/components/FitnessChart.tsx`:**
- `ctl: { label: "Fitness", color: "#00ffff" }` — this is a fitness (CTL) chart line, NOT BG data. Change `#00ffff` → `#8b5cf6` (purple, distinguishable from BG cyan and brand magenta)

**`app/components/ReadinessPanel.tsx`:**
- `text-[#00ffff]` / `bg-[#0d4a5a]` on "Good to go" state → `text-[#4ade80]` / `bg-[#1a2e1a]` (this is a positive readiness state — use success green, not cyan)
- `text-[#00ffff]` on "Fresh" zone label → `text-[#4ade80]` (same — positive state)
- Gradient bar — update `#c4b5fd` (removed by Task 2 sed) to `#af9ece`: `from-[#ff3366] via-[#ffb800] via-[#af9ece] via-[#00ffff] to-[#39ff14]`. The cyan in this gradient is part of a multi-color scale, not a brand element — keep it.
- HRV sparkline `color="#00ffff"` → `#8b5cf6` (chart data, not BG)
- HRV tap handler `"#00ffff"` → `#8b5cf6`

**`app/components/VolumeTrendChart.tsx`:**
- `text-[#00ffff]` on "Planned" label → `text-[#af9ece]` (it's a label, should be muted)
- `fill="#00ffff"` on planned bars → `fill="#8b5cf6"` (chart data, not BG)
- `bg-[#00ffff]/40` on legend swatch → `bg-[#8b5cf6]/40`

**`app/components/WeeklyVolumeChart.tsx`:**
- `"#00ffff"` as bar fill for past weeks → `#8b5cf6` (chart data)

**`app/components/WorkoutStreamGraph.tsx`:**
- `color: "#00ffff"` on stream data → `color: "#8b5cf6"` (chart data)

**`app/components/PaceCurvesWidget.tsx`:**
- `stroke="#00ffff"` on pace line → `stroke="#8b5cf6"` (chart data)
- `fill="#00ffff"` on data point → `fill="#8b5cf6"`

**`app/components/FitnessInsightsPanel.tsx`:**
- `text-[#00ffff]` on fitness insight values → `text-[#8b5cf6]` (fitness data, not BG)
- `border-[#00ffff]/30` → `border-[#8b5cf6]/30`
- `text-[#00ffff]` on TrendingUp icon → `text-[#8b5cf6]`
- `text-[#00ffff]` on CTL/ramp rate values (positive state) → `text-[#8b5cf6]`

**`app/components/BGResponsePanel.tsx`:**
- `hover:text-[#00ffff]` on toggle buttons → `hover:text-[#f23b94]` (interactive hover, not BG data)
- BG chart lines within this component → **keep** cyan (this IS BG data)

**`app/components/AgendaView.tsx`:**
- BG pill cyan → **keep** (BG data display)
- Any non-BG cyan (if present) → change to brand

**`app/components/BGGraphPopover.tsx`:**
- All cyan → **keep** (BG chart)

**`app/components/BGSimChart.tsx`:**
- All cyan → **keep** (BG simulation chart)

**Chart color summary:** Non-BG chart data lines change from `#00ffff` → `#8b5cf6` (Tailwind violet-500, a muted purple that's distinguishable from both BG cyan and brand magenta, 5.2:1 contrast on `#13101c` — passes AA). This is a chart-specific data color, not a brand color. It does not need to be in the design system spec palette — it's a visualization concern.

- [ ] **Step 2: Verify cyan usage is correct**

Run: `grep -rn "#00ffff" app/ --include='*.tsx' --include='*.ts' --include='*.css' | grep -v node_modules`

Every remaining match should be in a BG-related file: `BGGraphPopover`, `BGSimChart`, `AgendaView` (BG pills), `ReadinessPanel` (TSB gradient only). If any non-BG usage remains, trace and fix.

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: Both pass.

- [ ] **Step 4: Commit**

```
style: restrict cyan to BG data only

Change non-BG cyan (#00ffff) to brand (#f23b94) or muted (#af9ece).
Cyan now exclusively indicates blood sugar data.
```

## Chunk 2: Retrowave Removal + Polish

### Task 4: Retrowave Effect Removal + State Patterns

Replace retro animated borders, flickering text, and neon effects with clean state communication patterns.

**Files:**
- Modify: `app/components/ActionBar.tsx`
- Modify: `app/screens/PlannerScreen.tsx`
- Modify: `app/components/BGGraphPopover.tsx`
- Modify: `app/components/RouteMap.tsx`

- [ ] **Step 1: Rewrite ActionBar popups**

Read `app/components/ActionBar.tsx`. Replace the three popup states:

**Uploading/syncing popup** (currently uses `retro-upload-border`, `retro-text-flicker`, `retro-btn-uploading`):
- Remove `retro-upload-border` from wrapper div
- Replace wrapper class with: `bg-[#1d1828] border border-[#2e293c] border-l-[3px] border-l-[#f23b94] rounded-lg`
- Replace `retro-text-flicker` on title with no animation class, keep `text-white font-bold`
- Replace `retro-btn-uploading` on button with: `bg-[#d42c85] text-white font-bold rounded-md opacity-60 cursor-not-allowed` and add a spinner element inside

**Error popup** (currently uses `retro-error-border`):
- Remove `retro-error-border` from wrapper div
- Replace wrapper class with: `bg-[#1d1828] border border-[#2e293c] border-l-[3px] border-l-[#ff6b8a] rounded-lg`

**Success popup** (currently uses `retro-success-border`):
- Remove `retro-success-border` from wrapper div
- Replace wrapper class with: `bg-[#1d1828] border border-[#2e293c] border-l-[3px] border-l-[#4ade80] rounded-lg`

For the spinner, add this inline element inside the button, before the text label:
```tsx
<span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
```

Example full button with spinner:
```tsx
<button className="flex items-center gap-2 text-white px-4 py-2 rounded-md font-bold text-sm bg-[#d42c85] opacity-60 cursor-not-allowed">
  <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  Syncing
</button>
```

- [ ] **Step 2: Rewrite PlannerScreen retro effects**

Read `app/screens/PlannerScreen.tsx`. Replace:
- `retro-adapt-border` → `border border-[#2e293c] border-l-[3px] border-l-[#f23b94]`
- `retro-text-flicker` → remove (text is already styled)
- `retro-btn-adapting` → `bg-[#d42c85] text-white font-bold rounded-md opacity-60 cursor-not-allowed` + spinner
- `retro-btn-uploading` → same pattern
- Remove the gradient overlay div (`from-[#6c3aed]/5 via-transparent to-[#00ffff]/5`) — this is a purely decorative background gradient, safe to delete the entire `<div>` element

- [ ] **Step 3: Simplify BGGraphPopover glow**

Read `app/components/BGGraphPopover.tsx`. Replace the triple-layer neon glow:
- Remove `filter id="bg-glow-wide"` (stdDeviation 30)
- Keep `filter id="bg-glow-mid"` but reduce to `stdDeviation="3"` and rename to `bg-blur`
- Remove the wide-glow `<path>` element (opacity 0.4)
- Keep the mid-glow `<path>` but update filter reference to `bg-blur`, set opacity to 0.3
- Keep the main `<path>` (no filter) as-is
- Remove the "Neon glow filter — 3 layers" comment

- [ ] **Step 4: Remove RouteMap glow**

Read `app/components/RouteMap.tsx`. Remove the `route-glow` filter definition and any references to it.

- [ ] **Step 5: Verify no retro class references remain**

Run: `grep -rn "retro-\|route-glow\|neon\|bg-glow" app/ --include='*.tsx' --include='*.ts' | grep -v node_modules`
Expected: No output (zero matches).

- [ ] **Step 6: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: Both pass.

- [ ] **Step 7: Commit**

```
style: replace retro effects with clean state patterns

ActionBar: left-border popups with spinner.
PlannerScreen: remove retro borders and gradient overlay.
BGGraphPopover: single subtle blur instead of triple neon glow.
RouteMap: remove route-glow filter.
```

### Task 5: Splash Screen Replacement

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace splashFallback**

Read `app/page.tsx`. Remove the entire `splashFallback` const and replace with:

```tsx
const splashFallback = (
  <div className="splash">
    <div className="text-center">
      <p className="text-6xl font-[family-name:var(--font-sora)] font-extrabold text-[#f23b94] animate-[gentle-pulse_2.5s_ease-in-out_infinite]">
        s
      </p>
      <p className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-[#f23b94] opacity-70 tracking-tight mt-2">
        springa
      </p>
    </div>
  </div>
);
```

- [ ] **Step 2: Remove dead constants**

Remove `S_PATH` and `S_TRANSFORM` constants from the top of the file (they were only used by the old splash SVG).

Verify: `grep -n "S_PATH\|S_TRANSFORM" app/page.tsx` → Expected: no output.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```
style: replace synthwave splash with mark+wordmark lockup

Remove perspective grid, neon gradients, and SVG logo.
Clean splash: "s" mark + "springa" wordmark on dark bg.
```

### Task 6: Ad-hoc Colors + Final Verification

Normalize remaining ad-hoc colors and run full verification.

**Files:**
- Modify: `app/components/AgendaView.tsx`
- Modify: `app/components/FitnessInsightsPanel.tsx`
- Modify: `app/components/PaceCalibrationCard.tsx`
- Modify: `app/components/ReadinessPanel.tsx`
- Modify: `app/manifest.ts`
- Modify: `lib/eventStyles.ts`

- [ ] **Step 1: Normalize ad-hoc dark backgrounds**

```bash
# Dark blue backgrounds → surface or background
find app -name '*.tsx' -o -name '*.ts' | xargs sed -i '' 's/#1a2040/#1d1828/g'
find app -name '*.tsx' -o -name '*.ts' | xargs sed -i '' 's/#0d1a2a/#13101c/g'
find app -name '*.tsx' -o -name '*.ts' | xargs sed -i '' 's/#0d4a5a/#2e293c/g'
```

- [ ] **Step 2: Remove `#d946ef` purple accent**

```bash
find app -name '*.tsx' -o -name '*.ts' -o -name '*.css' | xargs sed -i '' 's/#d946ef/#f23b94/g'
```

- [ ] **Step 3: Remove `#6c3aed` purple**

Search for `#6c3aed` in `app/` — it's used in PlannerScreen gradient overlays and globals.css animations. These should have been removed in Task 4 (retro removal). Verify they're gone:

Run: `grep -rn "#6c3aed" app/`
Expected: No output. If matches remain in retro CSS that should have been deleted in Task 1, delete the containing block. If in a component, replace with `#f23b94`.

- [ ] **Step 4: Review `lib/eventStyles.ts`**

Read the file. Apply these rules:
- Old palette colors (`#0d0a1a`, `#1e1535`, `#3d2b5a`, `#b8a5d4`, `#c4b5fd`, `#2a1f3d`) → should already be replaced by Task 2's sed. Verify none remain.
- `#00ffff` → if used for BG-related event styling, keep. If used as generic accent, change to `#f23b94`.
- `#0d4a5a` → `#2e293c` (should be handled by Task 6 Step 1 sed)
- Colors that encode workout type (e.g., different colors for Easy vs Long vs Interval) → keep, these are semantic data encoding.

Verify: `grep -n "#0d0a1a\|#1e1535\|#3d2b5a\|#b8a5d4\|#c4b5fd\|#2a1f3d\|#0d4a5a" lib/eventStyles.ts` → Expected: no old palette matches. Cyan is OK if BG-related.

- [ ] **Step 5: Verify manifest.ts**

Run: `grep -n "color" app/manifest.ts`
Expected: `theme_color: "#13101c"` and `background_color: "#13101c"`.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Run build and lint**

Run: `npm run build && npm run lint`
Expected: Both pass.

- [ ] **Step 8: Final color audit**

Run: `grep -rn "#0d0a1a\|#1e1535\|#3d2b5a\|#b8a5d4\|#2a1f3d\|#c4b5fd\|#e8368f\|#c52e7a\|#d946ef\|#6c3aed\|#1a2040\|#0d1a2a\|#0d4a5a" app/ lib/ --include='*.tsx' --include='*.ts' --include='*.css'`
Expected: No output (zero matches of any old palette color).

- [ ] **Step 9: Visual verification**

Run: `npm run dev`

Check:
- Splash: "s" + "springa" centered on dark bg, gentle pulse
- Header: "springa" in Sora 800, `#f23b94`
- Cards: surface bg, border, left accent borders
- Labels: gray uppercase `#af9ece`
- Values: white bold
- BG pill: cyan
- Active tab: magenta, no glow
- Sync popup: left border accent, solid button, no neon
- Overall: dark with subtle purple tint, professional, no retrowave
- Chart data lines: purple (#8b5cf6), not cyan

If any visual element doesn't match the spec, trace to source file and fix before committing.

- [ ] **Step 10: Commit**

```
style: normalize ad-hoc colors and complete design system

Remove remaining purple accents and dark blue backgrounds.
Normalize all colors to design system palette.
```
