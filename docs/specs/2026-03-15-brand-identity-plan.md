# Brand Identity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retrowave wordmark and color treatment with a clean brand identity — Sora 800 wordmark in sport magenta, consistent color swap, and glow removal.

**Architecture:** Three sequential passes: (1) add the Sora font and update the two wordmark locations, (2) global find-replace of the old brand color, (3) remove neon glow effects and scanline CSS. Each pass is independently committable and verifiable.

**Tech Stack:** Next.js (Google Fonts via `next/font/google`), Tailwind CSS

**Spec:** `docs/specs/2026-03-15-brand-identity-design.md`

---

## Chunk 1: Wordmark + Color Swap + Glow Removal

### Task 1: Add Sora Font and Update Wordmark

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Add Sora font to layout**

In `app/layout.tsx`, add the Sora import and CSS variable:

```tsx
import { Geist, Geist_Mono, Sora } from "next/font/google";

const sora = Sora({
	variable: "--font-sora",
	subsets: ["latin"],
	weight: ["800"],
});
```

Add `${sora.variable}` to the body className:

```tsx
className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} antialiased`}
```

- [ ] **Step 2: Update header wordmark in `app/page.tsx`**

Replace the wordmark button className (line ~131). Change:

```tsx
className="text-xl md:text-2xl font-bold bg-[linear-gradient(135deg,#00ffff,#d946ef,#ff2d95)] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(0,255,255,0.4)] hover:drop-shadow-[0_0_16px_rgba(0,255,255,0.8)] hover:scale-105 active:scale-95 transition-all"
```

To:

```tsx
className="text-xl md:text-2xl font-[family-name:var(--font-sora)] font-extrabold text-[#e8368f] tracking-tight hover:scale-105 active:scale-95 transition-all"
```

Also change the text content from "Springa" to "springa" (lowercase — this is the brand wordmark, not prose).

- [ ] **Step 3: Remove header bar neon glow**

In `app/page.tsx` (line ~127), change the header wrapper:

```tsx
// From:
className="bg-[#1e1535] border-b border-[#3d2b5a] flex-shrink-0 z-30 shadow-[0_2px_12px_rgba(255,45,149,0.15)]"

// To:
className="bg-[#1e1535] border-b border-[#3d2b5a] flex-shrink-0 z-30 shadow-sm"
```

- [ ] **Step 4: Update login page wordmark**

In `app/login/page.tsx`:

Change the h1 (line 7):
```tsx
// From:
<h1 className="text-2xl font-bold text-white mb-2">Springa</h1>

// To:
<h1 className="text-2xl font-[family-name:var(--font-sora)] font-extrabold text-[#e8368f] tracking-tight mb-2">springa</h1>
```

Replace the rabbit emoji (line 11):
```tsx
// From:
<p className="text-4xl mb-6">🐇</p>

// To:
<p className="text-4xl font-[family-name:var(--font-sora)] font-extrabold text-[#e8368f] mb-6">s</p>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds, no errors.

- [ ] **Step 6: Commit**

```
feat: add Sora wordmark and update brand treatment

Replace gradient+glow wordmark with Sora 800 in sport magenta.
Update header and login page. Remove header neon glow.
```

### Task 2: Brand Color Swap

Global replacement of `#ff2d95` → `#e8368f` and `#e0207a` → `#c52e7a` (hover state).

**Files (29 files, 70 occurrences of `#ff2d95` + associated hover colors):**

All files in `app/` matching `#ff2d95` or `#e0207a`:
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

**Note:** `#ff6b8a` is a separate semantic color used for warnings/errors/destructive states — do NOT change it. Only change `#ff2d95` (brand primary) and `#e0207a` (its hover dark variant).

**Dependency:** Task 1 already removes some `#ff2d95` references in `page.tsx` and `login/page.tsx` (replaced with explicit `#e8368f`). The sed commands below are safe to run after Task 1 — they'll match the remaining occurrences across the other 27 files.

- [ ] **Step 1: Run the replacements**

```bash
# Replace brand primary
find app -name '*.tsx' -o -name '*.ts' | xargs sed -i '' 's/#ff2d95/#e8368f/g'

# Replace hover dark variant
find app -name '*.tsx' -o -name '*.ts' | xargs sed -i '' 's/#e0207a/#c52e7a/g'

# Replace rgba references to old pink (button shadows etc)
find app -name '*.tsx' -o -name '*.ts' | xargs sed -i '' 's/rgba(255,45,149/rgba(232,54,143/g'
```

- [ ] **Step 2: Verify no old references remain**

Run: `grep -r "#ff2d95\|#e0207a\|rgba(255,45,149" app/`
Expected: No output (zero matches).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds, no errors.

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: No new errors.

- [ ] **Step 5: Commit**

```
style: swap brand color #ff2d95 → #e8368f (sport magenta)

Replace hot pink with sport magenta across 29 files.
Includes hover variant #e0207a → #c52e7a.
```

### Task 3: Glow and Scanline Removal

Remove neon glow effects (`shadow-[0_0_*]` patterns) and the retro-scanline CSS.

**Dependency:** Runs after Task 2 (color swap). The "from" classNames below assume `#ff2d95` has already been replaced with `#e8368f` by the sed commands.

**Files:**
- Modify: `app/components/ActionBar.tsx` (lines ~58, ~101)
- Modify: `app/globals.css` (scanline keyframes + `.retro-scanline-static` class)

**Note:** The header bar neon glow (`shadow-[0_2px_12px_rgba(...)]`) is already handled in Task 1 Step 3.

- [ ] **Step 1: Simplify ActionBar buttons**

In `app/components/ActionBar.tsx`, line ~58 — the warning action button. Change:

```tsx
className="relative overflow-hidden flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[linear-gradient(135deg,#ff6b8a,#e8368f)] shadow-[0_0_12px_rgba(255,107,138,0.4)] hover:shadow-[0_0_18px_rgba(255,107,138,0.6)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 retro-scanline-static"
```

To:

```tsx
className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[#e8368f] hover:bg-[#c52e7a] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
```

Line ~101 — the primary action button. Change:

```tsx
className="relative overflow-hidden flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[linear-gradient(135deg,#e8368f,#d946ef)] shadow-[0_0_12px_rgba(232,54,143,0.4),0_0_24px_rgba(232,54,143,0.15)] hover:shadow-[0_0_18px_rgba(232,54,143,0.6),0_0_36px_rgba(217,70,239,0.3)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 retro-scanline-static"
```

To:

```tsx
className="flex items-center gap-2 text-white px-4 py-2 md:px-6 md:py-2 rounded-md font-bold text-sm md:text-base bg-[#e8368f] hover:bg-[#c52e7a] hover:scale-[1.03] active:scale-[0.97] transition-all duration-300"
```

- [ ] **Step 2: Remove scanline CSS from globals.css**

Delete the `@keyframes retro-scanline` block (line ~220-223) and the `.retro-scanline-static` ruleset (line ~265 onward, including the `@media (prefers-reduced-motion)` variant). Search for `retro-scanline` in the file and remove all matches and their containing blocks.

- [ ] **Step 3: Verify no remaining retro-scanline references**

Run: `grep -r "retro-scanline" app/`
Expected: No output (zero matches).

- [ ] **Step 4: Verify no remaining neon glow shadows**

Run: `grep -r "shadow-\[0_0_" app/`
Expected: No output. If matches remain, inspect manually — standard depth shadows (e.g. `shadow-[0_2px_4px_...]`) are fine, only neon glow patterns (`shadow-[0_0_12px_rgba(...)]`) need removal.

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: Both pass.

- [ ] **Step 6: Commit**

```
style: remove neon glow effects and scanline CSS

Simplify ActionBar buttons to solid bg with hover.
Remove retro-scanline keyframes and class from globals.css.
```

### Task 4: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass. These are visual changes so no test logic should break.

- [ ] **Step 2: Start dev server and visually verify**

Run: `npm run dev`

Check:
- Header shows "springa" (lowercase) in Sora 800, sport magenta, no gradient, no glow
- Login page shows "springa" (lowercase) in Sora 800 and "s" placeholder mark
- Buttons across the app use sport magenta, no neon glow
- No scanline effects on any buttons
- Overall dark UI look is preserved, just cleaner

- [ ] **Step 3: Contrast check**

Verify sport magenta `#e8368f` on `#1e1535` surface passes WCAG AA. Check at https://webaim.org/resources/contrastchecker/ or similar. If it fails, flag for Per — do not unilaterally change the color.
