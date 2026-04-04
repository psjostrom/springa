/**
 * Insulin context type definition.
 *
 * MyLife scraper has been removed — this type is kept for backward
 * compatibility but buildInsulinContext is no longer available.
 * All insulin context values will be null.
 */
export interface InsulinContext {
  lastBolusTime: string;
  lastBolusUnits: number;
  lastMealTime: string;
  lastMealCarbs: number;
  iobAtStart: number;
  basalIOBAtStart: number;
  totalIOBAtStart: number;
  actionableIOB: number;
  timeSinceLastMeal: number;
  timeSinceLastBolus: number;
  expectedBGImpact: number;
  lastBasalRate: number;
  easeOffStartMin: number | null;
  easeOffDurationH: number | null;
  boostStartMin: number | null;
  boostDurationH: number | null;
}
