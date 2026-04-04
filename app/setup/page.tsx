"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { WelcomeStep } from "./WelcomeStep";
import { IntervalsStep } from "./IntervalsStep";
import { ScheduleStep } from "./ScheduleStep";
import { GoalStep } from "./GoalStep";
import { HRZonesStep } from "./HRZonesStep";
import { SugarModeStep } from "./SugarModeStep";
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
  lthr?: number;
  maxHr?: number;
  hrZones?: number[];
  sugarMode: boolean;
  nightscoutUrl?: string;
  nightscoutSecret?: string;
}

export default function SetupPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>({
    displayName: "",
    timezone: "Europe/Stockholm",
    intervalsApiKey: "",
    runDays: [],
    sugarMode: false,
  });

  const updateData = (partial: Partial<WizardData>) => {
    setData({ ...data, ...partial });
  };

  const handleComplete = async () => {
    // Mark onboarding complete
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingComplete: true }),
    });
    router.push("/");
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
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <ScheduleStep
            runDays={data.runDays}
            onNext={(runDays) => {
              updateData({ runDays });
              setStep(4);
            }}
            onBack={() => setStep(2)}
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
            onSkip={() => setStep(5)}
            onBack={() => setStep(3)}
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
            onSkip={() => setStep(6)}
            onBack={() => setStep(4)}
          />
        )}
        {step === 6 && (
          <SugarModeStep
            sugarMode={data.sugarMode}
            nightscoutUrl={data.nightscoutUrl}
            nightscoutSecret={data.nightscoutSecret}
            onNext={(sugarData) => {
              updateData(sugarData);
              setStep(7);
            }}
            onSkip={() => {
              updateData({ sugarMode: false });
              setStep(7);
            }}
            onBack={() => setStep(5)}
          />
        )}
        {step === 7 && (
          <DoneStep
            onComplete={handleComplete}
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
