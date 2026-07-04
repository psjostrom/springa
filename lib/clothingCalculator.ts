import type { SMHIWeather } from "./smhi";

export interface ClothingRecommendation {
  upper: string[];
  lower: string[];
  accessories: string[];
  weather: {
    temp: number;
    feelsLike: number;
    windSpeed: number;
    precipitation: number;
    isRain: boolean;
    isSnow: boolean;
  };
}

type Intensity = "low" | "high";

function getIntensity(category: string): Intensity {
  return category === "interval" || category === "hills" ? "high" : "low";
}

function isRain(precipCategory: number): boolean {
  // SMHI SNOW1g: 1=rain, 2=thunderstorm, 3=freezing rain,
  // 11=drizzle, 12=freezing drizzle.
  return [1, 2, 3, 11, 12].includes(precipCategory);
}

function isSnow(precipCategory: number): boolean {
  // SMHI SNOW1g frozen/winter precipitation:
  // 4=mixed/ice, 5=snow, 6=wet snow, 7=rain and snow,
  // 8=ice pellets, 9=graupel, 10=hail.
  return [4, 5, 6, 7, 8, 9, 10].includes(precipCategory);
}

/**
 * Recommend running clothes based on weather and workout intensity.
 *
 * The table is calibrated for a male runner in Stockholm.
 *
 * Three offsets shift the effective "feels like" temperature:
 * - Intensity: +5°C for interval/hills sessions (you generate more heat)
 * - Warmth preference: -2 to +2 steps, each step = 2°C
 *   (-2 = "I run very warm" → +4°C, +2 = "I run very cold" → -4°C)
 *
 * Sources: Tina Muir winter running guide, Finnish Nordic running guide,
 * RunHive gear picker logic, dressmyrun.com approach.
 */
export function recommendClothing(
  weather: SMHIWeather,
  category: string,
  warmthPreference = 0,
): ClothingRecommendation {
  const intensity = getIntensity(category);
  const intensityOffset = intensity === "high" ? 5 : 0;
  // warmthPreference: -2 (run warm, dress lighter) to +2 (run cold, dress warmer)
  // Negative preference = "I run warm" = higher effective temp = dress lighter
  const warmthOffset = -(warmthPreference * 2);
  const fl = weather.feelsLike + intensityOffset + warmthOffset;
  const raining = isRain(weather.precipCategory) && weather.precipitation > 0;
  const snowing = isSnow(weather.precipCategory) && weather.precipitation > 0;

  const upper: string[] = [];
  const lower: string[] = [];
  const accessories: string[] = [];

  // --- Lower body ---
  if (fl < 10) {
    lower.push("Tights");
  } else {
    lower.push("Shorts");
  }

  // --- Upper body ---
  if (fl < -5) {
    upper.push("Thermal top", "Fleece", "Wind jacket");
  } else if (fl < 0) {
    upper.push("Thermal top", "Wind jacket");
  } else if (fl < 5) {
    upper.push("Long sleeve", "Light jacket");
  } else if (fl < 10) {
    upper.push("Long sleeve");
  } else if (fl < 18) {
    upper.push("T-shirt");
  } else {
    upper.push("Singlet");
  }

  // --- Accessories ---
  if (fl < -5) {
    accessories.push("Beanie", "Buff", "Gloves");
  } else if (fl < 0) {
    accessories.push("Buff", "Gloves");
  } else if (fl < 5) {
    accessories.push("Thin gloves");
  }

  // --- Rain/snow modifiers ---
  if (raining) {
    accessories.push("Cap");
    if (!upper.some((u) => u.includes("jacket"))) {
      upper.push("Light rain jacket");
    }
  }
  if (snowing && !accessories.includes("Beanie")) {
    accessories.push("Beanie");
  }

  return {
    upper,
    lower,
    accessories,
    weather: {
      temp: weather.temp,
      feelsLike: weather.feelsLike,
      windSpeed: weather.windSpeed,
      precipitation: weather.precipitation,
      isRain: raining,
      isSnow: snowing,
    },
  };
}
