# Design System

## Summary

Replace Springa's retrowave visual identity with a clean, professional design system that keeps 10% of the original DNA (subtle purple-tinted backgrounds) while adopting modern athletic app conventions (structured typography, restrained color, semantic state communication). Mobile-first, desktop-clean.

## Palette

### Core Colors

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#13101c` | Page/app background |
| Surface | `#1d1828` | Cards, popups, header, tab bar |
| Border | `#2e293c` | Card borders, dividers, inactive elements |
| Muted text | `#af9ece` | Labels, secondary text, dates, units, descriptions |
| Primary text | `#ffffff` | Titles, values, headings |
| Brand primary | `#f23b94` | Wordmark, active tab, card left borders, accent text |
| Brand button | `#d42c85` | CTA button backgrounds (ensures white text passes AA at 4.67:1) |
| Brand hover | `#d42f7e` | Button hover/pressed states |

### Semantic Colors

| Role | Hex | Usage |
|------|-----|-------|
| BG/glucose data | `#00ffff` | BG pill, BG chart line, BG values — and NOTHING else |
| Success | `#4ade80` | Completed workout borders, sync success, BG in range, readiness "ready," enabled state |
| Warning | `#ffb800` | BG rising/falling, moderate readiness, monitor state, caution indicators |
| Error | `#ff4d6a` | Error borders, failed sync, BG out of range, low readiness, destructive actions |

One set of semantic colors used everywhere — card borders, status text, tinted pills, data values. No two-tier split.

### Status Tinted Backgrounds

Dark fills paired with status indicator text. Used for pills, badges, and status banners. Always combined with a matching `/30` opacity border.

| Role | Background | Border |
|------|-----------|--------|
| Success | `#1a3d25` | `#4ade80/30` |
| Warning | `#3d2b1a` | `#ffb800/30` |
| Error | `#3d1525` | `#ff4d6a/30` |
| Brand | `#2d1a35` | `#f23b94/30` |

**Text on tinted backgrounds is always `#ffffff` (titles) or `#af9ece` (subtitles).** Never use a semantic color as text on its own tint — the background + border already communicates the state. This keeps every tint combo above WCAG AAA (15:1+).

These are the ONLY tinted backgrounds. Do not invent new tints — if it doesn't fit one of these four, use surface (`#1d1828`).

### HR Zone Colors

Fixed 5-color ramp for heart rate zones. Defined in `lib/constants.ts` as `ZONE_COLORS`. Used in zone bars, badges, HR breakdown charts, and workout stream graphs. Not used for anything else.

| Zone | Hex | Tailwind origin |
|------|-----|-----------------|
| Z1 | `#6ee7b7` | emerald-300 |
| Z2 | `#06b6d4` | cyan-600 |
| Z3 | `#fbbf24` | amber-400 |
| Z4 | `#fb923c` | orange-400 |
| Z5 | `#ef4444` | red-500 |

These overlap with semantic colors (`#fbbf24` ~ warning, `#ef4444` ~ error) but are a separate system. HR zone colors are never used outside HR context; semantic colors are never used for HR zones.

### Chart Series Colors

For multi-series data visualizations where HR zones and status colors don't apply (fitness trends, pace curves, volume breakdowns).

| Series | Hex | Typical use |
|--------|-----|-------------|
| Primary series | `#8b5cf6` | ATL, fitness load, pace trend line |
| Secondary series | `#06b6d4` | CTL, secondary metric, comparison line |

When a chart needs more than 2 non-zone series, pull from the semantic colors (`#4ade80`, `#ffb800`, `#ff4d6a`) before inventing new colors.

### Removed Colors

| Old Color | Was Used For | Replacement |
|-----------|-------------|-------------|
| `#00ffff` as nav accent | Active tabs, hover states, data labels | `#f23b94` for active states, `#af9ece` for labels |
| `#d946ef` (purple) | Gradients, secondary accent, labels | Removed entirely |
| `#b8a5d4` (light purple) | Muted text | `#af9ece` |
| `#0d0a1a` (deep purple bg) | Page background | `#13101c` |
| `#1e1535` (purple surface) | Cards, header | `#1d1828` |
| `#3d2b5a` (purple border) | Borders, dividers | `#2e293c` |
| `#2a1f3d` (purple hover) | Hover backgrounds | `#2e293c` or `#1d1828` |
| `#8b7ba8` | Darker muted text | `#af9ece` — one muted text color, no variants |
| `#7a6899` | Even darker muted | `#af9ece` |
| `#6b5b8a` | Darkest muted | `#af9ece` |
| `#e0d0f0`, `#f0e6ff`, `#e2d9f3` | Light purple text | `#af9ece` or `#ffffff` depending on context |
| `#ff69b4` | Hot pink (TabNav) | `#f23b94` (brand) |
| `#ff6b8a` | Old soft error pink | `#ff4d6a` (error) |
| `#ff3366` | Old vivid danger red | `#ff4d6a` (error) |
| `#39ff14` | Old neon green | `#4ade80` (success) |
| `#2dd610` | Alt neon green | `#4ade80` (success) |
| `#22c55e` | Tailwind green-500 | `#4ade80` (success) |
| `#fbbf24` (non-zone usage) | Yellow used outside HR zones | `#ffb800` (warning) |
| `#3b82f6`, `#2563eb`, `#1d4ed8` | Tailwind blues | Not in palette — replace per context |
| `#e0294f`, `#5a1f3a` | Ad-hoc reds/pinks | `#ff4d6a` (error) / `#3d1525` (error tint) |
| `#2a1f45` | Dark purple fill | `#1d1828` (surface) |
| `#1a2e1a` | Alt dark green tint | `#1a3d25` (success tint) |
| `#4a4458`, `#6b5f7d` | Ad-hoc grays | `#4a4358` (border-subtle) or `#2e293c` (border) |
| `#f0f0f0` | Light gray (debug page) | Exempt (debug-only) |

## Typography

### Hierarchy

| Level | Style | Color | Example |
|-------|-------|-------|---------|
| Labels | 9-10px, uppercase, letter-spacing 0.5-1px, font-weight 600 | `#af9ece` | `ZONE`, `FUEL`, `READINESS` |
| Values | 14-22px, font-weight 700-800 | `#ffffff` (or semantic color) | `Z2`, `45 g/h`, `6.02 km` |
| Titles | 14-16px, font-weight 700 | `#ffffff` | `Sun Long eco16`, `Monitor recovery` |
| Secondary | 11-12px, font-weight 400 | `#af9ece` | `Sun, Mar 16`, `Based on HRV, HR, sleep, form` |
| Wordmark | Sora 800, tracking -0.5px | `#f23b94` | `springa` |

### Rules

- Labels are ALWAYS gray uppercase. Never colored.
- Values are ALWAYS white bold. Only colored for: BG data (cyan), semantic states (green=good, red=bad), or the one focal-point number per card (magenta, e.g. readiness score).
- Titles are ALWAYS white. Never colored.
- Body font stays as Geist Sans. Sora is wordmark only.

## Card Design

### Structure

- Background: `#1d1828`
- Border: `1px solid #2e293c`
- Border-radius: 10px
- Padding: 14-16px
- Left border accent: `3px solid` in semantic color

### Left Border Encoding

| State | Border Color |
|-------|-------------|
| Upcoming/active workout | `#f23b94` (brand) |
| Completed workout | `#4ade80` (success) |
| Optional/bonus | `#4a4358` (midpoint between surface and muted text — visible but de-emphasized) |
| Actionable (sync available) | `#f23b94` (brand) |
| Failed (sync error, API error) | `#ff4d6a` (error) |
| Neutral/loading | `#2e293c` (border color) |

### What Cards Don't Have

- No gradient backgrounds
- No glow shadows
- No colored labels
- No multiple accent colors per card — one focal point max

## State Communication

### Action Popup (Sync, Adapt)

- Surface background with left border accent
- White bold title, gray description
- Solid magenta button

### In-Progress

- Same popup layout
- Button at 60% opacity with `cursor-not-allowed`
- Spinner (CSS border animation) inside button
- No animated borders, no flickering text

### Error

- Left border: `#ff4d6a`
- Title in `#ff4d6a`
- Solid `#ff4d6a` retry button

### Success

- Left border: `#4ade80`
- Title in `#4ade80`
- Auto-dismisses after 3 seconds

### Loading Content

- Skeleton shimmer matching the card layout shape
- Shimmer: `linear-gradient(90deg, #2e293c 25%, #3a3448 50%, #2e293c 75%)` animated
- No "Loading..." text, no spinners for content areas

### Active Tab (Mobile Bottom Bar)

- Active: icon + label in `#f23b94`
- Inactive: icon + label in `#af9ece`
- No glow, no drop-shadow, no background highlight

## Splash Screen

Mark + wordmark lockup centered on `#13101c` background. The mark (when finalized) sits above "springa" in Sora 800. Mark has a gentle pulse animation (opacity 0.85→1). Wordmark below at reduced opacity (0.7).

Until the mark is vectorized, use "s" in Sora 800 at 64px as placeholder.

### What Gets Removed

- Synthwave perspective grid (`.splash-grid`, `.splash-floor`)
- Radial glow (`.splash-glow`)
- Neon SVG gradients and filters (`#sp-neon`, `#sp-gc`, `#sp-gb`, `#sp-gm`)
- The entire `S_PATH` SVG data and related transforms

## Retrowave Removal — Full Inventory

### globals.css

Remove entirely:
- `--neon-glow` CSS variable
- `--color-border-neon` CSS variable
- `.splash-glow`, `.splash-floor`, `.splash-grid` classes and keyframes
- `@keyframes splash-grid-flow`, `@keyframes splash-logo-pulse`
- `@keyframes retro-border-flow`
- `@keyframes retro-glow-pulse`
- `@keyframes retro-adapt-glow`
- `@keyframes retro-text-flicker`
- `.retro-error-border`, `.retro-success-border`, `.retro-adapt-border`, `.retro-upload-border`
- `.retro-text-flicker`
- `.retro-btn-uploading`, `.retro-btn-adapting` (and their `::after` pseudo-elements)
- Any `@media (prefers-reduced-motion)` blocks that reference retro classes

Replace `.splash` class with minimal centered flexbox for the new splash.

### Component Files

| File | What to Change |
|------|---------------|
| `app/page.tsx` | Replace `splashFallback` — remove SVG/grid/glow, replace with mark+wordmark lockup. Remove `S_PATH`, `S_TRANSFORM` constants. |
| `app/components/ActionBar.tsx` | Remove `retro-upload-border`, `retro-error-border`, `retro-success-border` classes. Replace with left border accent cards. Remove `retro-text-flicker` from syncing text. Replace `retro-btn-uploading` with spinner+opacity pattern. |
| `app/components/TabNavigation.tsx` | Remove `drop-shadow` filter on active tab icons. Active state = magenta color only. |
| `app/components/BGGraphPopover.tsx` | Remove triple-layer neon glow filters (`bg-glow-wide`, `bg-glow-mid`). Keep one subtle `feGaussianBlur` (stdDeviation ~3-4) for line visibility. |
| `app/screens/PlannerScreen.tsx` | Remove `retro-adapt-border`, `retro-text-flicker`, `retro-btn-adapting`, `retro-btn-uploading` classes. Replace with solid borders and spinner pattern. |
| `app/components/RouteMap.tsx` | Remove `route-glow` filter. |

### Palette Swap

Global replacement across all component files:
- `#0d0a1a` → `#13101c` (background)
- `#1e1535` → `#1d1828` (surface)
- `#3d2b5a` → `#2e293c` (border)
- `#b8a5d4` → `#af9ece` (muted text)
- `#2a1f3d` → `#2e293c` (hover bg)
- `#c4b5fd` → `#af9ece` (light purple text — used across many components, not just login)
- `#6c3aed` → remove (purple used in gradients/animations — replaced by solid `#f23b94` or removed with retro effects)

Ad-hoc dark backgrounds that appear in specific components:
- `#1a2040`, `#0d1a2a` → `#1d1828` (surface) or `#13101c` (background)
- `#0d4a5a` → `#2e293c` (border) — this was a teal-tinted border, normalize to standard

### Cyan (`#00ffff`) Case-by-Case Review

Cyan stays ONLY on blood sugar data. Every other usage changes.

| File | Current Cyan Usage | Decision |
|------|--------------------|----------|
| `app/components/CurrentBGPill.tsx` | BG value display | **Keep** — this is glucose data |
| `app/components/BGGraphPopover.tsx` | Chart line color | **Keep** — glucose chart |
| `app/components/RunReportCard.tsx` | BG-related values | **Keep** — glucose context |
| `app/components/TabNavigation.tsx` | Active tab color, inactive text | **Change** → `#f23b94` active, `#af9ece` inactive |
| `app/components/DayCell.tsx` | Today ring highlight, today's date | **Change** → `#f23b94` (today is brand-highlighted, not BG) |
| `app/screens/SimulateScreen.tsx` | Range slider accent | **Change** → `#f23b94` |
| `app/components/ActionBar.tsx` | Syncing title text | **Change** → `#ffffff` (white, it's a title) |
| `app/screens/PlannerScreen.tsx` | Adapting title text | **Change** → `#ffffff` |
| `lib/eventStyles.ts` | Event pill styling | **Review** — if BG-related keep, otherwise change to `#f23b94` or `#af9ece` |
| `app/components/AgendaView.tsx` | BG pill color | **Keep** (BG data); change any non-BG cyan uses |
| All other files | Labels, hover states, misc accent | **Change** → `#f23b94` or `#af9ece` per context |

### Additional Files

| File | What to Change |
|------|---------------|
| `app/manifest.ts` | Update `theme_color` and `background_color` from `#0d0a1a` to `#13101c` |
| `lib/eventStyles.ts` | Normalize colors to new palette. Review cyan usage for BG vs non-BG semantics. |
| `app/icon.svg` | Update gradient stops to new palette (already partially done in brand identity work) |

## CSS Custom Properties

Define the 7 core palette colors as CSS custom properties in `globals.css` `:root`. Components still use raw hex during the initial swap (mechanical find-replace), but new code and future changes use the variables. This prevents the next design tweak from requiring another 50-file sweep.

```css
:root {
  /* Core */
  --color-bg: #13101c;
  --color-surface: #1d1828;
  --color-border: #2e293c;
  --color-muted: #af9ece;
  --color-text: #ffffff;
  --color-brand: #f23b94;
  --color-brand-btn: #d42c85;
  --color-brand-hover: #d42f7e;
  --color-border-subtle: #4a4358;

  /* Semantic */
  --color-glucose: #00ffff;
  --color-success: #4ade80;
  --color-warning: #ffb800;
  --color-error: #ff4d6a;

  /* Tinted backgrounds */
  --color-tint-success: #1a3d25;
  --color-tint-warning: #3d2b1a;
  --color-tint-error: #3d1525;
  --color-tint-brand: #2d1a35;

  /* Chart series */
  --color-chart-primary: #8b5cf6;
  --color-chart-secondary: #06b6d4;
}
```

HR zone colors are NOT CSS variables — they're defined in `lib/constants.ts` as `ZONE_COLORS` because they're consumed by chart libraries and JS logic, not CSS.

Migration to variables is incremental — not every file needs to switch in the first pass.

## Closed Palette Rule

The palette defined in this spec is exhaustive. No hex color may appear in source files (`*.ts`, `*.tsx`, `*.css`) unless it is one of:

1. A **core color** (9 values: 5 layout + 3 brand + border-subtle)
2. A **semantic color** (4 values: glucose, success, warning, error)
3. A **tinted background** (4 values: success, warning, error, brand)
4. An **HR zone color** (5 values in `ZONE_COLORS`)
5. A **chart series color** (2 values)
6. A **shimmer gradient midpoint** (`#3a3448` — loading skeleton only)

Any other hex color is a violation. Fix it by mapping to the nearest palette color, not by adding a new one.

Exceptions: `app/debug/` pages are exempt.

## Out of Scope

- Logo mark vectorization (in progress separately)
- Full Tailwind theme tokenization (the CSS variables above are the pragmatic first step)
- Marketing/landing page
- Garmin watch face theming
