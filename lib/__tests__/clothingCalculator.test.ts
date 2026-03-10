import { describe, it, expect } from "vitest";
import { recommendClothing } from "../clothingCalculator";
import type { SMHIWeather } from "../smhi";

function weather(overrides: Partial<SMHIWeather> = {}): SMHIWeather {
  return {
    temp: 10,
    feelsLike: 10,
    windSpeed: 2,
    windGust: 4,
    precipitation: 0,
    precipCategory: 0,
    validTime: "2026-03-10T12:00:00Z",
    ...overrides,
  };
}

describe("recommendClothing", () => {
  describe("upper body thresholds", () => {
    it("recommends singlet above 18°C", () => {
      const r = recommendClothing(weather({ feelsLike: 20 }), "easy");
      expect(r.upper).toEqual(["Singlet"]);
    });

    it("recommends t-shirt at 10-18°C", () => {
      const r = recommendClothing(weather({ feelsLike: 15 }), "easy");
      expect(r.upper).toEqual(["T-shirt"]);
    });

    it("recommends long sleeve at 5-10°C", () => {
      const r = recommendClothing(weather({ feelsLike: 7 }), "easy");
      expect(r.upper).toEqual(["Long sleeve"]);
    });

    it("recommends long sleeve + light jacket at 0-5°C", () => {
      const r = recommendClothing(weather({ feelsLike: 3 }), "easy");
      expect(r.upper).toEqual(["Long sleeve", "Light jacket"]);
    });

    it("recommends thermal top + wind jacket at -5 to 0°C", () => {
      const r = recommendClothing(weather({ feelsLike: -2 }), "easy");
      expect(r.upper).toEqual(["Thermal top", "Wind jacket"]);
    });

    it("recommends thermal top + fleece + wind jacket below -5°C", () => {
      const r = recommendClothing(weather({ feelsLike: -8 }), "easy");
      expect(r.upper).toEqual(["Thermal top", "Fleece", "Wind jacket"]);
    });
  });

  describe("lower body thresholds", () => {
    it("recommends tights below 10°C", () => {
      const r = recommendClothing(weather({ feelsLike: 8 }), "easy");
      expect(r.lower).toEqual(["Tights"]);
    });

    it("recommends shorts at 10°C and above", () => {
      const r = recommendClothing(weather({ feelsLike: 10 }), "easy");
      expect(r.lower).toEqual(["Shorts"]);
    });
  });

  describe("accessories", () => {
    it("no accessories above 5°C", () => {
      const r = recommendClothing(weather({ feelsLike: 8 }), "easy");
      expect(r.accessories).toEqual([]);
    });

    it("thin gloves at 0-5°C", () => {
      const r = recommendClothing(weather({ feelsLike: 3 }), "easy");
      expect(r.accessories).toEqual(["Thin gloves"]);
    });

    it("buff + gloves at -5 to 0°C", () => {
      const r = recommendClothing(weather({ feelsLike: -2 }), "easy");
      expect(r.accessories).toEqual(["Buff", "Gloves"]);
    });

    it("beanie + buff + gloves below -5°C", () => {
      const r = recommendClothing(weather({ feelsLike: -8 }), "easy");
      expect(r.accessories).toEqual(["Beanie", "Buff", "Gloves"]);
    });
  });

  describe("intensity offset", () => {
    it("interval sessions shift effective temp +5°C", () => {
      // feelsLike 7, easy → fl=7 → long sleeve
      const easy = recommendClothing(weather({ feelsLike: 7 }), "easy");
      expect(easy.upper).toEqual(["Long sleeve"]);

      // feelsLike 7, interval → fl=12 → t-shirt
      const interval = recommendClothing(weather({ feelsLike: 7 }), "interval");
      expect(interval.upper).toEqual(["T-shirt"]);
    });

    it("interval at 5°C gets long sleeve instead of jacket", () => {
      // easy at 5°C → fl=5 → long sleeve
      const easy = recommendClothing(weather({ feelsLike: 5 }), "easy");
      expect(easy.upper).toEqual(["Long sleeve"]);

      // interval at 5°C → fl=10 → t-shirt
      const interval = recommendClothing(weather({ feelsLike: 5 }), "interval");
      expect(interval.upper).toEqual(["T-shirt"]);
    });

    it("only interval category gets high intensity offset", () => {
      // Hills, tempo, race pace are mapped to "interval" by getWorkoutCategory
      const w = weather({ feelsLike: 7 });
      expect(recommendClothing(w, "easy").upper).toEqual(["Long sleeve"]);
      expect(recommendClothing(w, "long").upper).toEqual(["Long sleeve"]);
      expect(recommendClothing(w, "club").upper).toEqual(["Long sleeve"]);
      expect(recommendClothing(w, "interval").upper).toEqual(["T-shirt"]);
    });
  });

  describe("warmth preference", () => {
    it("preference -2 (run warm) shifts effective temp +4°C", () => {
      // feelsLike 7, easy, pref -2 → fl = 7+0+4 = 11 → t-shirt
      const r = recommendClothing(weather({ feelsLike: 7 }), "easy", -2);
      expect(r.upper).toEqual(["T-shirt"]);
    });

    it("preference +2 (run cold) shifts effective temp -4°C", () => {
      // feelsLike 7, easy, pref +2 → fl = 7+0-4 = 3 → long sleeve + light jacket
      const r = recommendClothing(weather({ feelsLike: 7 }), "easy", 2);
      expect(r.upper).toEqual(["Long sleeve", "Light jacket"]);
    });

    it("preference 0 is neutral (no shift)", () => {
      const neutral = recommendClothing(weather({ feelsLike: 7 }), "easy", 0);
      const noArg = recommendClothing(weather({ feelsLike: 7 }), "easy");
      expect(neutral.upper).toEqual(noArg.upper);
      expect(neutral.lower).toEqual(noArg.lower);
      expect(neutral.accessories).toEqual(noArg.accessories);
    });

    it("warmth and intensity stack", () => {
      // feelsLike 3, interval (+5), pref -1 (+2) → fl = 3+5+2 = 10 → t-shirt
      const r = recommendClothing(weather({ feelsLike: 3 }), "interval", -1);
      expect(r.upper).toEqual(["T-shirt"]);
    });
  });

  describe("rain modifier", () => {
    it("adds cap when raining", () => {
      const r = recommendClothing(
        weather({ feelsLike: 12, precipCategory: 3, precipitation: 1.5 }),
        "easy",
      );
      expect(r.accessories).toContain("Cap");
    });

    it("adds rain jacket when raining and no jacket already", () => {
      const r = recommendClothing(
        weather({ feelsLike: 12, precipCategory: 3, precipitation: 1.5 }),
        "easy",
      );
      expect(r.upper).toContain("Light rain jacket");
    });

    it("does not double-add jacket when already wearing one", () => {
      // feelsLike 3 → long sleeve + light jacket; rain should not add another
      const r = recommendClothing(
        weather({ feelsLike: 3, precipCategory: 3, precipitation: 1.0 }),
        "easy",
      );
      expect(r.upper.filter((u) => u.includes("jacket"))).toHaveLength(1);
    });

    it("no rain effect when precipitation is 0", () => {
      const r = recommendClothing(
        weather({ feelsLike: 12, precipCategory: 3, precipitation: 0 }),
        "easy",
      );
      expect(r.accessories).not.toContain("Cap");
    });

    it("reports rain in weather summary", () => {
      const r = recommendClothing(
        weather({ feelsLike: 12, precipCategory: 4, precipitation: 0.5 }),
        "easy",
      );
      expect(r.weather.isRain).toBe(true);
      expect(r.weather.isSnow).toBe(false);
    });
  });

  describe("snow modifier", () => {
    it("adds beanie when snowing and not already wearing one", () => {
      const r = recommendClothing(
        weather({ feelsLike: 7, precipCategory: 1, precipitation: 1.0 }),
        "easy",
      );
      expect(r.accessories).toContain("Beanie");
    });

    it("does not duplicate beanie when already cold enough for one", () => {
      // feelsLike -8 already gets beanie from cold
      const r = recommendClothing(
        weather({ feelsLike: -8, precipCategory: 1, precipitation: 1.0 }),
        "easy",
      );
      expect(r.accessories.filter((a) => a === "Beanie")).toHaveLength(1);
    });

    it("reports snow in weather summary", () => {
      const r = recommendClothing(
        weather({ feelsLike: 0, precipCategory: 2, precipitation: 0.5 }),
        "easy",
      );
      expect(r.weather.isSnow).toBe(true);
    });
  });

  describe("weather passthrough", () => {
    it("passes raw weather values unchanged", () => {
      const w = weather({ temp: 8, feelsLike: 5, windSpeed: 6, precipitation: 2.1 });
      const r = recommendClothing(w, "easy");
      expect(r.weather.temp).toBe(8);
      expect(r.weather.feelsLike).toBe(5);
      expect(r.weather.windSpeed).toBe(6);
      expect(r.weather.precipitation).toBe(2.1);
    });
  });
});
