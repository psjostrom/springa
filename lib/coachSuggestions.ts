export interface SuggestionContext {
  hasPlan: boolean;
  hasRuns: boolean;
  hasBGData: boolean;
  hasBGModel: boolean;
  hasRace: boolean;
  diabetesMode: boolean;
}

interface CoachSuggestion {
  text: string;
  requires: ("plan" | "runs" | "bgData" | "bgModel" | "race")[];
  diabetesOnly?: boolean;
  weight: number;
}

const POOL: CoachSuggestion[] = [
  // Always available
  { text: "What can Springa do for me?", requires: [], weight: 10 },
  { text: "Explain how the training plan works", requires: [], weight: 8 },
  { text: "How does workout generation work?", requires: [], weight: 6 },
  { text: "What data do you use to personalize my plan?", requires: [], weight: 5 },

  // Requires plan
  { text: "Walk me through this week's workouts", requires: ["plan"], weight: 9 },
  { text: "Why is tomorrow's run structured this way?", requires: ["plan"], weight: 7 },
  { text: "What's the thinking behind the cooldown length?", requires: ["plan"], weight: 6 },
  { text: "How does the weekly volume progress over time?", requires: ["plan"], weight: 5 },
  { text: "What should I focus on for my first run?", requires: ["plan"], weight: 8 },

  // Requires race
  { text: "How am I tracking for my race?", requires: ["race"], weight: 9 },
  { text: "Am I on pace to hit my race goal?", requires: ["race"], weight: 7 },
  { text: "How many weeks until race day?", requires: ["race"], weight: 5 },
  { text: "What does the taper look like?", requires: ["race"], weight: 6 },

  // Requires runs
  { text: "How's my training load looking?", requires: ["runs"], weight: 9 },
  { text: "Analyze my last run", requires: ["runs"], weight: 8 },
  { text: "Am I recovering well between sessions?", requires: ["runs"], weight: 7 },
  { text: "How's my pace trending?", requires: ["runs"], weight: 7 },
  { text: "Which run went best this week?", requires: ["runs"], weight: 6 },
  { text: "How does my HR compare across recent runs?", requires: ["runs"], weight: 5 },
  { text: "Am I hitting my target zones?", requires: ["runs"], weight: 6 },
  { text: "What should I adjust this week?", requires: ["runs"], weight: 8 },

  // Requires runs + BG data (diabetes only)
  { text: "How are my fuel rates working?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 9 },
  { text: "Analyze my BG trends during runs", requires: ["runs", "bgData"], diabetesOnly: true, weight: 8 },
  { text: "Am I spiking after runs?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 7 },
  { text: "What's my BG like in the first 20 minutes?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 6 },
  { text: "Compare my BG on easy vs long runs", requires: ["runs", "bgData"], diabetesOnly: true, weight: 6 },
  { text: "How does starting BG affect my runs?", requires: ["runs", "bgData"], diabetesOnly: true, weight: 5 },

  // Requires BG model (diabetes only)
  { text: "Should I adjust my fuel rates?", requires: ["bgModel"], diabetesOnly: true, weight: 8 },
  { text: "How confident is the BG model right now?", requires: ["bgModel"], diabetesOnly: true, weight: 5 },
  { text: "What does the BG model say about long runs?", requires: ["bgModel"], diabetesOnly: true, weight: 6 },
];

const CONDITION_MAP: Record<string, keyof SuggestionContext> = {
  plan: "hasPlan",
  runs: "hasRuns",
  bgData: "hasBGData",
  bgModel: "hasBGModel",
  race: "hasRace",
};

function isEligible(suggestion: CoachSuggestion, ctx: SuggestionContext): boolean {
  if (suggestion.diabetesOnly && !ctx.diabetesMode) return false;
  return suggestion.requires.every((req) => ctx[CONDITION_MAP[req]]);
}

export function getCoachSuggestions(ctx: SuggestionContext, count = 4): string[] {
  const eligible = POOL.filter((s) => isEligible(s, ctx));
  if (eligible.length <= count) return eligible.map((s) => s.text);

  const selected: CoachSuggestion[] = [];
  const remaining = [...eligible];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;
    let picked = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      rand -= remaining[j].weight;
      if (rand <= 0) { picked = j; break; }
    }
    selected.push(remaining[picked]);
    remaining.splice(picked, 1);
  }

  return selected.map((s) => s.text);
}
