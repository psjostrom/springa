"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { addWeeks, differenceInWeeks, format } from "date-fns";
import { settingsAtom } from "../atoms";
import { generatePlan } from "@/lib/workoutGenerators";
import { uploadPlan } from "@/lib/intervalsClient";
import { DEFAULT_MAX_HR, computeMaxHRZones } from "@/lib/constants";
import { getPaceTable } from "@/lib/paceTable";
import type { ExperienceLevel } from "@/lib/paceTable";
import { WelcomeStep } from "./WelcomeStep";
import { IntervalsStep } from "./IntervalsStep";
import { WatchStep } from "./WatchStep";
import { ScheduleStep } from "./ScheduleStep";
import { GoalStep } from "./GoalStep";
import { AbilityStep } from "./AbilityStep";
import { DiabetesStep } from "./DiabetesStep";
import { DoneStep } from "./DoneStep";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface WizardData {
  displayName: string;
  timezone: string;
  intervalsApiKey: string;
  runDays: number[];
  longRunDay?: number;
  clubDay?: number;
  clubType?: string;
  raceDate?: string;
  raceDist: number;
  experience?: ExperienceLevel;
  goalTime?: number;
  maxHr?: number;
  sportSettingsId?: number;
  currentAbilitySecs?: number;
  currentAbilityDist?: number;
  diabetesMode: boolean;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
}

export default function SetupPage() {
  const router = useRouter();
  const setSettings = useSetAtom(settingsAtom);
  const [step, setStep] = useState<Step>(1);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<WizardData>({
    displayName: "",
    timezone: "Europe/Stockholm",
    intervalsApiKey: "",
    runDays: [],
    raceDist: 21.0975,
    diabetesMode: false,
  });

  const updateData = (partial: Partial<WizardData>) => {
    setData({ ...data, ...partial });
  };

  const handleComplete = async () => {
    try {
      setGenerating(true);
      // Yield to event loop so React can render the spinner before sync generatePlan blocks
      await new Promise((resolve) => { setTimeout(resolve, 0); });

      // Compute HR zones from maxHR (Runna model: 65/81/89/97%)
      const maxHr = data.maxHr ?? DEFAULT_MAX_HR;
      const hrZones = computeMaxHRZones(maxHr);
      const lthr = Math.round(maxHr * 0.89); // Z3/Z4 boundary ≈ LTHR

      // Push HR zones to Intervals.icu
      if (data.sportSettingsId) {
        try {
          await fetch("/api/intervals/hr-zones", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sportSettingsId: data.sportSettingsId, hrZones }),
          });
        } catch {
          console.warn("HR zone sync failed — can retry from settings");
        }
      }

      const defaultWeeks = 18;
      const raceDate = data.raceDate ?? format(addWeeks(new Date(), defaultWeeks), "yyyy-MM-dd");
      const totalWeeks = data.raceDate
        ? Math.max(12, differenceInWeeks(new Date(data.raceDate), new Date()))
        : defaultWeeks;

      const events = generatePlan({
        bgModel: null,
        raceDateStr: raceDate,
        raceDist: data.raceDist,
        totalWeeks,
        startKm: 8,
        lthr,
        hrZones,
        diabetesMode: data.diabetesMode,
        runDays: data.runDays,
        longRunDay: data.longRunDay ?? 0,
        clubDay: data.clubDay,
        clubType: data.clubType,
        currentAbilitySecs: data.currentAbilitySecs,
        currentAbilityDist: data.currentAbilityDist,
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureEvents = events.filter((e) => e.start_date_local >= today);
      await uploadPlan(futureEvents);

      // Push threshold pace from current ability (not goal time)
      if (data.currentAbilitySecs && data.currentAbilityDist) {
        const table = getPaceTable(data.currentAbilityDist, data.currentAbilitySecs);
        try {
          await fetch("/api/intervals/threshold-pace", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paceMinPerKm: table.hmEquivalentPacePerKm }),
          });
        } catch {
          console.warn("Threshold pace sync failed — can retry from Planner settings");
        }
      }

      // Mark onboarding complete (currentAbility already saved by AbilityStep)
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingComplete: true }),
      });
      if (!res.ok) {
        setGenerating(false);
        return;
      }
      // Update atom so page.tsx doesn't redirect back to /setup
      setSettings((prev) => ({ ...(prev ?? {}), onboardingComplete: true }));
      router.push("/");
    } catch {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-all ${
                s === step ? "bg-brand w-6" : s < step ? "bg-brand/50" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 1 && (
          <WelcomeStep
            displayName={data.displayName}
            timezone={data.timezone}
            onNext={(displayName, timezone) => {
              updateData({ displayName, timezone });
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <IntervalsStep
            onNext={(intervalsApiKey, profile) => {
              updateData({ intervalsApiKey, ...profile });
              setStep(3);
            }}
            onBack={() => { setStep(1); }}
          />
        )}
        {step === 3 && (
          <WatchStep
            onNext={() => { setStep(4); }}
            onBack={() => { setStep(2); }}
          />
        )}
        {step === 4 && (
          <ScheduleStep
            runDays={data.runDays}
            longRunDay={data.longRunDay}
            onNext={(schedule) => {
              updateData(schedule);
              setStep(5);
            }}
            onBack={() => { setStep(3); }}
          />
        )}
        {step === 5 && (
          <GoalStep
            raceDist={data.raceDist}
            experience={data.experience}
            raceDate={data.raceDate}
            onNext={(goal) => {
              updateData({
                raceDist: goal.raceDist,
                experience: goal.experience,
                raceDate: goal.raceDate,
              });
              setStep(6);
            }}
            onBack={() => { setStep(4); }}
          />
        )}
        {step === 6 && data.experience && (
          <AbilityStep
            raceDist={data.raceDist}
            experience={data.experience}
            raceDate={data.raceDate}
            currentAbilitySecs={data.currentAbilitySecs}
            currentAbilityDist={data.currentAbilityDist}
            goalTime={data.goalTime}
            onNext={(ability) => {
              updateData({
                currentAbilitySecs: ability.currentAbilitySecs,
                currentAbilityDist: ability.currentAbilityDist,
                goalTime: ability.goalTime,
                raceDate: ability.raceDate,
              });
              setStep(7);
            }}
            onBack={() => { setStep(5); }}
          />
        )}
        {step === 7 && (
          <DiabetesStep
            diabetesMode={data.diabetesMode}
            nightscoutUrl={data.nightscoutUrl}
            nightscoutSecret={data.nightscoutSecret}
            onNext={(diabetesData) => {
              updateData(diabetesData);
              setStep(8);
            }}
            onBack={() => { setStep(6); }}
          />
        )}
        {step === 8 && (
          <DoneStep
            onComplete={handleComplete}
            generating={generating}
          />
        )}

        {/* Step counter */}
        <p className="text-center text-xs text-muted mt-6">
          Step {step} of 8
        </p>
      </div>
    </div>
  );
}
