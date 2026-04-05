"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetAtom } from "jotai";
import { generatedPlanAtom } from "../atoms";
import { generatePlan } from "@/lib/workoutGenerators";
import { DEFAULT_LTHR } from "@/lib/constants";
import { WelcomeStep } from "./WelcomeStep";
import { IntervalsStep } from "./IntervalsStep";
import { ScheduleStep } from "./ScheduleStep";
import { GoalStep } from "./GoalStep";
import { HRZonesStep } from "./HRZonesStep";
import { DiabetesStep } from "./DiabetesStep";
import { DoneStep } from "./DoneStep";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface WizardData {
  displayName: string;
  timezone: string;
  intervalsApiKey: string;
  runDays: number[];
  raceDate?: string;
  raceName?: string;
  raceDist?: number;
  totalWeeks?: number;
  startKm?: number;
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
  diabetesMode: boolean;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
}

export default function SetupPage() {
  const router = useRouter();
  const setGeneratedPlan = useSetAtom(generatedPlanAtom);
  const [step, setStep] = useState<Step>(1);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<WizardData>({
    displayName: "",
    timezone: "Europe/Stockholm",
    intervalsApiKey: "",
    runDays: [],
    diabetesMode: false,
  });

  const updateData = (partial: Partial<WizardData>) => {
    setData({ ...data, ...partial });
  };

  const handleComplete = async () => {
    try {
      const hrZones = data.hrZones;
      if (hrZones?.length === 5) {
        setGenerating(true);
        // Yield to event loop so React can render the spinner before sync generatePlan blocks
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        const events = generatePlan(
          null,
          data.raceDate ?? "2026-06-13",
          data.raceDist ?? 16,
          data.totalWeeks ?? 18,
          data.startKm ?? 8,
          data.lthr ?? DEFAULT_LTHR,
          hrZones,
          false,
          data.diabetesMode,
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setGeneratedPlan(events.filter((e) => e.start_date_local >= today));
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingComplete: true }),
      });
      if (!res.ok) {
        setGenerating(false);
        return;
      }
      router.push("/?tab=planner");
    } catch {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6, 7].map((s) => (
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
          <ScheduleStep
            runDays={data.runDays}
            onNext={(runDays) => {
              updateData({ runDays });
              setStep(4);
            }}
            onBack={() => { setStep(2); }}
          />
        )}
        {step === 4 && (
          <GoalStep
            raceDate={data.raceDate}
            raceName={data.raceName}
            raceDist={data.raceDist}
            onNext={(goal) => {
              updateData(goal);
              setStep(5);
            }}
            onSkip={() => { setStep(5); }}
            onBack={() => { setStep(3); }}
          />
        )}
        {step === 5 && (
          <HRZonesStep
            lthr={data.lthr}
            maxHr={data.maxHr}
            hrZones={data.hrZones}
            onNext={(zones) => {
              updateData(zones);
              setStep(6);
            }}
            onSkip={() => { setStep(6); }}
            onBack={() => { setStep(4); }}
          />
        )}
        {step === 6 && (
          <DiabetesStep
            diabetesMode={data.diabetesMode}
            nightscoutUrl={data.nightscoutUrl}
            nightscoutSecret={data.nightscoutSecret}
            onNext={(diabetesData) => {
              updateData(diabetesData);
              setStep(7);
            }}
            onBack={() => { setStep(5); }}
          />
        )}
        {step === 7 && (
          <DoneStep
            onComplete={handleComplete}
            generating={generating}
          />
        )}

        {/* Step counter */}
        <p className="text-center text-xs text-muted mt-6">
          Step {step} of 7
        </p>
      </div>
    </div>
  );
}
