"use client";

import { useState } from "react";
import { getPaceTable, getDefaultGoalTime, getSliderRange, type ExperienceLevel } from "@/lib/paceTable";
import { formatGoalTime } from "@/lib/format";
import { PacePreview } from "@/app/components/PacePreview";

interface AbilityStepProps {
  raceDist: number;
  experience: ExperienceLevel;
  currentAbilitySecs?: number;
  currentAbilityDist?: number;
  onNext: (data: {
    currentAbilitySecs: number;
    currentAbilityDist: number;
  }) => void;
  onBack: () => void;
}

const ABILITY_DISTANCES = [
  { label: "5km", km: 5 },
  { label: "10km", km: 10 },
  { label: "Half Marathon", km: 21.0975 },
  { label: "Marathon", km: 42.195 },
];

function distLabel(km: number): string {
  const match = ABILITY_DISTANCES.find((d) => d.km === km);
  return match ? match.label : `${km}km`;
}

export function AbilityStep({ raceDist, experience, currentAbilitySecs: initialAbility, currentAbilityDist: initialAbilityDist, onNext, onBack }: AbilityStepProps) {
  const [abilityDist, setAbilityDist] = useState<number>(initialAbilityDist ?? 5);
  const [abilitySecs, setAbilitySecs] = useState<number>(initialAbility ?? getDefaultGoalTime(initialAbilityDist ?? 5, experience));

  const handleAbilityDist = (km: number) => {
    setAbilityDist(km);
    setAbilitySecs(getDefaultGoalTime(km, experience));
  };

  const abilitySliderRange = getSliderRange(abilityDist);

  const pacePreview = getPaceTable(abilityDist, abilitySecs);

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-lg">
      <h2 className="text-2xl font-bold text-text mb-2">Current Fitness</h2>
      <p className="text-muted mb-6">
        Pick the distance you know best. This isn&apos;t a goal — it&apos;s where you are today.
      </p>

      <div className="space-y-6">
        {/* Ability distance picker */}
        <div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {ABILITY_DISTANCES.map(({ label, km }) => (
              <button
                key={km}
                onClick={() => { handleAbilityDist(km); }}
                className={`py-2.5 rounded-lg border-2 font-semibold text-xs transition ${
                  abilityDist === km
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-sm text-muted text-center mb-2">
            I can currently run a <span className="text-brand font-semibold">{distLabel(abilityDist)}</span> in
          </p>
          <p className="text-4xl font-bold text-text text-center mb-4">
            {formatGoalTime(abilitySecs)}
          </p>
          <input
            type="range"
            min={abilitySliderRange.min}
            max={abilitySliderRange.max}
            step={abilitySliderRange.step}
            value={abilitySecs}
            onChange={(e) => { setAbilitySecs(Number(e.target.value)); }}
            className="w-full accent-brand"
          />

          <div className="mt-4">
            <p className="text-text font-semibold text-sm mb-2">Your training paces</p>
            <PacePreview paceTable={pacePreview} />
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-border rounded-lg text-muted hover:text-text hover:bg-border transition"
        >
          Back
        </button>
        <button
          onClick={() => {
            onNext({
              currentAbilitySecs: abilitySecs,
              currentAbilityDist: abilityDist,
            });
          }}
          className="flex-1 py-3 bg-brand text-white rounded-lg font-bold hover:bg-brand-hover transition shadow-lg shadow-brand/20"
        >
          Next
        </button>
      </div>
    </div>
  );
}
