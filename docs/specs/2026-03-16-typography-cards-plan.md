# Typography, Card Accents & AgendaView Cleanup — Implementation Plan

**Goal:** Apply the typography hierarchy and card left-border patterns from the design system spec. Fix remaining AgendaView cyan violations. Replace splash text with SVG brand mark.

**Spec:** `docs/specs/2026-03-15-design-system.md` — Typography and Card Design sections.

---

## Task 1: Splash — Replace Text with SVG Brand Mark

**Files:** `app/page.tsx`

- [ ] Replace the text "s" + "springa" splash with an inline SVG using the mark from `public/springa-mark.svg`
- [ ] Update fill from `#e8368f` → `#f23b94` (current brand color)
- [ ] Keep the `gentle-pulse` animation on the mark, keep "springa" wordmark below
- [ ] Verify build
- [ ] Commit: `style: use SVG brand mark in splash screen`

## Task 2: AgendaView Cyan Cleanup

**Files:** `app/components/AgendaView.tsx`

- [ ] **Planned workout name** (line ~62): Change mobile pill from `bg-[#1d1828] text-[#00ffff] border-[#00ffff]/30` → `bg-[#2e293c] text-white border-[#2e293c]`
- [ ] **Planned badge** (line ~76): Change from `bg-[#1d1828] text-[#00ffff]` → `bg-[#2e293c] text-[#af9ece]`
- [ ] **Estimated duration/distance pill** (line ~157): Change from `text-[#00ffff] bg-[#13101c] border border-[#00ffff]/30` → `text-white bg-[#2e293c] border border-[#2e293c]`
- [ ] Verify no `#00ffff` remains in AgendaView except if BG pills are shown (they aren't — BG data comes from CurrentBGPill)
- [ ] Verify build
- [ ] Commit: `style: remove cyan from AgendaView workout display`

## Task 3: Card Left-Border Accents — AgendaView

**Files:** `app/components/AgendaView.tsx`

Apply `border-l-[3px]` to EventCard based on event state:

- [ ] Planned/upcoming: `border-l-[#f23b94]` (brand)
- [ ] Completed: `border-l-[#4ade80]` (success)
- [ ] Optional/bonus (name contains "bonus" case-insensitive): `border-l-[#4a4358]` (subtle)
- [ ] Race: `border-l-[#f23b94]` (brand)
- [ ] Missed: keep existing `border-[#ff3366]/30` styling (already has error treatment)
- [ ] Verify build
- [ ] Commit: `style: add semantic left-border accents to event cards`

## Task 4: Typography — Labels to Uppercase

Apply the spec's label pattern (`text-xs uppercase tracking-wider font-semibold text-[#af9ece]`) to labels that name what a value is. Do NOT apply to secondary text, descriptions, or status messages.

**Label pattern:** A short word/phrase followed by a value (number, stat, metric). Examples: "Distance", "Fuel rate", "HRV", "Resting HR", "Sleep", "End BG", "Min BG".

**NOT labels:** Descriptions, explanations, units after values, status messages, dates, notes.

**Files and changes:**

- [ ] **SimulateScreen.tsx**: "Duration", "Start BG", "Fuel rate", "End BG", "Min BG", "Hypo risk" — add `uppercase tracking-wider font-semibold`
- [ ] **ReadinessPanel.tsx**: MetricCard label (line ~341 `text-xs text-[#af9ece]`) — add `uppercase tracking-wider font-semibold`; TSBGauge "Form (TSB)" label — same
- [ ] **StatsWidget.tsx**: label in stat card (line ~110) — add `uppercase tracking-wider font-semibold`
- [ ] **RunReportCard.tsx**: labels (lines ~74, ~97) — add `uppercase tracking-wider font-semibold`
- [ ] **PacePBs.tsx**: already has `uppercase` — add `tracking-wider font-semibold` where missing
- [ ] **BGCompact.tsx**: category labels (line ~99) — add `uppercase tracking-wider font-semibold`
- [ ] **FitnessInsightsPanel.tsx**: StatCard label (line ~246 `text-sm` → `text-xs`) — make `text-xs uppercase tracking-wider font-semibold`; "Fitness Trend", "Ramp Rate", "Last 7 days", "Last 28 days" labels — same
- [ ] **EventModal.tsx**: section labels — add `uppercase tracking-wider font-semibold` where acting as labels
- [ ] **PlannerScreen.tsx**: "Fuel rates" label already has the pattern — verify consistent
- [ ] **feedback/page.tsx**: "Distance", "Time", "Avg HR", "Carbs ingested", "Pre-run carbs" — add `uppercase tracking-wider font-semibold`
- [ ] Verify build and lint
- [ ] Commit: `style: apply uppercase label typography across components`

## Task 5: Final Verification

- [ ] Run `npm test`
- [ ] Run `npm run build && npm run lint`
- [ ] Grep for any remaining `text-xs text-[#af9ece]` without uppercase that should be labels (manual review)
- [ ] Commit any fixups
