# Settings Redesign — PR 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 688-line SettingsModal with a `/settings` page route + four tab components.

**Architecture:** This is a decomposition — all UI already exists in SettingsModal. Extract each section into its own tab component, wire up a tabbed page route, replace the modal trigger with navigation, delete the modal.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest, Jotai, Tailwind CSS

**Spec:** `docs/specs/2026-04-12-settings-redesign.md`

---

### Task 1: Create settings page route + tab shell

**Files:**
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Create the page route**

Server component that checks auth, fetches settings, renders a client wrapper.

```tsx
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/apiHelpers";
import { getUserSettings } from "@/lib/settings";
import { getUserCredentials } from "@/lib/credentials";
import { fetchAthleteProfile } from "@/lib/intervalsApi";
import { SettingsPage } from "./SettingsPage";

export default async function Settings() {
  let email: string;
  try {
    email = await requireAuth();
  } catch {
    redirect("/api/auth/signin");
  }

  const settings = await getUserSettings(email);
  if (!settings.onboardingComplete) redirect("/setup");

  // Enrich with Intervals.icu data (same as GET /api/settings does)
  const creds = await getUserCredentials(email);
  if (creds?.intervalsApiKey) {
    try {
      const profile = await fetchAthleteProfile(creds.intervalsApiKey);
      settings.intervalsConnected = true;
      if (profile.maxHr) settings.maxHr = profile.maxHr;
      if (profile.hrZones) settings.hrZones = profile.hrZones;
      if (profile.restingHr) settings.restingHr = profile.restingHr;
      if (profile.sportSettingsId) settings.sportSettingsId = profile.sportSettingsId;
    } catch { /* intervals unavailable — proceed without */ }
  }

  return <SettingsPage email={email} initialSettings={settings} />;
}
```

Check how the existing `/api/settings` GET route enriches settings — match that logic. Read `app/api/settings/route.ts` first.

- [ ] **Step 2: Create the client tab wrapper**

Create `app/settings/SettingsPage.tsx` — client component with tab state and back button.

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/settings";
import { TrainingTab } from "./TrainingTab";
import { ZonesTab } from "./ZonesTab";
import { PlanTab } from "./PlanTab";
import { AccountTab } from "./AccountTab";

const TABS = ["Training", "Zones", "Plan", "Account"] as const;
type Tab = typeof TABS[number];

interface SettingsPageProps {
  email: string;
  initialSettings: UserSettings;
}

export function SettingsPage({ email, initialSettings }: SettingsPageProps) {
  const [tab, setTab] = useState<Tab>("Training");
  const [settings, setSettings] = useState(initialSettings);

  const handleSave = async (partial: Partial<UserSettings>) => {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) throw new Error("Save failed");
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Link href="/" className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-border transition">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); }}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${
                tab === t
                  ? "text-brand border-b-2 border-brand"
                  : "text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-4 py-4">
          {tab === "Training" && <TrainingTab settings={settings} onSave={handleSave} />}
          {tab === "Zones" && <ZonesTab settings={settings} onSave={handleSave} />}
          {tab === "Plan" && <PlanTab settings={settings} onSave={handleSave} />}
          {tab === "Account" && <AccountTab email={email} settings={settings} onSave={handleSave} />}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create stub tab components**

Create all four as minimal stubs so the page compiles:

`app/settings/TrainingTab.tsx`, `ZonesTab.tsx`, `PlanTab.tsx`, `AccountTab.tsx` — each exports a component that takes `{ settings, onSave }` and renders a placeholder `<div>TODO</div>`.

- [ ] **Step 4: Verify page renders**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```
feat: create /settings page route with tab shell
```

---

### Task 2: Extract TrainingTab

**Files:**
- Create: `app/settings/TrainingTab.tsx` (replace stub)
- Reference: `app/components/SettingsModal.tsx` lines 304-396

- [ ] **Step 1: Build TrainingTab from SettingsModal code**

Extract the Training section (ability picker + race goal + PacePreview) and its state/save logic into a standalone component. The modal already has all the UI — copy it, then adapt:

- Own state: `abilityDist`, `abilitySecs`, `goalDist`, `raceDate`
- Own save handler with threshold pace sync
- `syncError` state for Intervals.icu failure feedback
- Uses `PacePreview` component
- Race goal as a gold info card (option B from brainstorming): collapsed by default, "Edit" expands to distance picker + date input

**Interface:**
```ts
interface TrainingTabProps {
  settings: UserSettings;
  onSave: (partial: Partial<UserSettings>) => Promise<void>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```
feat: extract TrainingTab from SettingsModal
```

---

### Task 3: Extract ZonesTab

**Files:**
- Create: `app/settings/ZonesTab.tsx` (replace stub)
- Reference: `app/components/SettingsModal.tsx` lines 398-432

- [ ] **Step 1: Build ZonesTab**

Extract HR Zones section: maxHR input + computed zone display + Intervals.icu sync.

- Own state: `maxHr`
- On save: push HR zones + maxHR to `/api/intervals/hr-zones`
- `syncError` for feedback

- [ ] **Step 2: Verify + commit**

```
feat: extract ZonesTab from SettingsModal
```

---

### Task 4: Extract PlanTab

**Files:**
- Create: `app/settings/PlanTab.tsx` (replace stub)
- Reference: `app/components/SettingsModal.tsx` lines 434-558

- [ ] **Step 1: Build PlanTab**

Extract: total weeks, start km, base phase toggle, warmth preference. All existing UI, same state management pattern.

- [ ] **Step 2: Verify + commit**

```
feat: extract PlanTab from SettingsModal
```

---

### Task 5: Extract AccountTab

**Files:**
- Create: `app/settings/AccountTab.tsx` (replace stub)
- Reference: `app/components/SettingsModal.tsx` (Intervals.icu section, Sugar mode, Notifications, sign out)

- [ ] **Step 1: Build AccountTab**

Extract: Intervals.icu API key management, sugar mode toggle + nightscout URL/secret + test connection, notification permission, sign out button.

Takes extra `email` prop for sign out display.

- [ ] **Step 2: Verify + commit**

```
feat: extract AccountTab from SettingsModal
```

---

### Task 6: Replace modal trigger with navigation

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace gear icon**

In `app/page.tsx`:
- Remove `showSettings` state
- Remove `SettingsModal` import
- Remove the modal render block (`{showSettings && settings && (<SettingsModal .../>)}`)
- Change gear icon `onClick` from `setShowSettings(true)` to navigation: use `<Link href="/settings">` wrapping the gear icon

- [ ] **Step 2: Verify + commit**

```
feat: replace settings modal trigger with /settings navigation
```

---

### Task 7: Delete SettingsModal + migrate tests

**Files:**
- Delete: `app/components/SettingsModal.tsx`
- Modify: `app/components/__tests__/SettingsModal.integration.test.tsx` → move to `app/settings/__tests__/`
- Modify: `app/components/__tests__/clothing.integration.test.tsx` → warmth tests move to PlanTab

- [ ] **Step 1: Migrate SettingsModal tests**

Move the test file to `app/settings/__tests__/TrainingTab.integration.test.tsx`. Update imports to render `TrainingTab` instead of `SettingsModal`. Adapt prop shapes.

Move warmth preference tests from `clothing.integration.test.tsx` to a new `PlanTab.integration.test.tsx`. If clothing tests only test warmth in SettingsModal context, migrate them. If they test other things too, only extract the SettingsModal-dependent tests.

- [ ] **Step 2: Add ZonesTab test**

Create `app/settings/__tests__/ZonesTab.integration.test.tsx`:
- HR zones render when maxHr set
- maxHr change + save triggers Intervals.icu sync

- [ ] **Step 3: Delete SettingsModal**

```bash
rm app/components/SettingsModal.tsx
```

Verify no remaining imports:
```bash
grep -rn "SettingsModal" app/ lib/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`

- [ ] **Step 5: Commit**

```
refactor: delete SettingsModal, migrate tests to tab components
```

---

### Task 8: Final verification

- [ ] **Step 1: Full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`

- [ ] **Step 2: Verify no dead code**

```bash
grep -rn "SettingsModal\|showSettings" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".next" | grep -v docs/
```

Expected: zero results.

- [ ] **Step 3: Push + create PR**
